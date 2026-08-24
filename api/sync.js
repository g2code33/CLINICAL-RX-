const { redis } = require('./_lib/redis.js');
const { verifyToken } = require('./_lib/auth.js');
const { guard, fail, ok } = require('./_lib/errors.js');
const { rateLimit } = require('./_lib/rateLimit.js');

const MAX_RECORDS_PER_PUSH = 5000;

async function handler(req, res) {
  const auth = req.headers.authorization;
  if (!auth) return fail(res, 401, 'No token provided');
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : auth;
  const userId = verifyToken(token);
  if (!userId) return fail(res, 401, 'Invalid token');

  if (req.method === 'GET') {
    const rawSince = parseInt(req.query.since, 10);
    const since = Number.isFinite(rawSince) && rawSince > 0 ? rawSince : 0;
    const records = [];
    const keys = await redis.hgetall(`sync:${userId}`);
    if (keys) {
      for (const value of Object.values(keys)) {
        let rec;
        try { rec = JSON.parse(value); } catch { continue; }
        if (rec && typeof rec.updatedAt === 'number' && rec.updatedAt >= since) records.push(rec);
      }
    }
    return ok(res, 200, { records });
  }

  if (req.method === 'POST') {
    const { records } = req.body || {};
    if (!Array.isArray(records)) return fail(res, 400, 'records must be an array');
    if (records.length > MAX_RECORDS_PER_PUSH) return fail(res, 413, `Too many records (max ${MAX_RECORDS_PER_PUSH} per push).`);

    for (const rec of records) {
      if (!rec || typeof rec.module !== 'string' || !rec.module || typeof rec.id !== 'string' || !rec.id) {
        return fail(res, 400, 'Each record needs a string module and id.');
      }
      // Keep the client's updatedAt — the client is the source of truth for
      // its own writes. Rewriting it here would make every pull look newer
      // than every local copy, so syncs would never converge.
      const safe = {
        ...rec,
        module: rec.module,
        id: rec.id,
        createdAt: typeof rec.createdAt === 'number' ? rec.createdAt : Date.now(),
        updatedAt: typeof rec.updatedAt === 'number' ? rec.updatedAt : Date.now(),
      };

      const key = `${rec.module}:${rec.id}`;

      // LAST-WRITER-WINS PROTECTION (Phase 7 §21).
      //
      // A blind overwrite here would let a slow device silently destroy a
      // newer edit made on another device — and the client could never even
      // detect it, because the push response would echo back its own data.
      //
      // If the stored copy is NEWER than the incoming one, keep the stored
      // copy. The client sees the newer record in the response and raises a
      // conflict for the user instead of losing anyone's work.
      //
      // Deletions are exempt: a tombstone must always win so a delete can
      // propagate (§24).
      if (!safe.deleted) {
        const existingRaw = await redis.hget(`sync:${userId}`, key);
        if (existingRaw) {
          let existing = null;
          try { existing = JSON.parse(existingRaw); } catch { existing = null; }
          if (existing && !existing.deleted && typeof existing.updatedAt === 'number' && existing.updatedAt > safe.updatedAt) {
            continue; // keep the newer server copy; client resolves the conflict
          }
        }
      }

      await redis.hset(`sync:${userId}`, { [key]: JSON.stringify(safe) });
    }
    const all = await redis.hgetall(`sync:${userId}`);
    const result = all ? Object.values(all).map((v) => { try { return JSON.parse(v); } catch { return null; } }).filter(Boolean) : [];
    return ok(res, 200, { records: result });
  }

  return fail(res, 405, 'Method not allowed');
}

// Phase 8 §36: sync is authenticated but still rate-limited, so a stolen or
// scripted token cannot hammer the store. Generous enough for real use.
module.exports = guard(rateLimit({ route: 'sync', max: 120, windowMs: 5 * 60 * 1000 })(handler));
