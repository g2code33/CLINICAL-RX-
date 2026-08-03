const { redis } = require('./_lib/redis.js');
const { verifyToken } = require('./_lib/auth.js');
const { guard, fail, ok } = require('./_lib/errors.js');

async function handler(req, res) {
  const auth = req.headers.authorization;
  if (!auth) return fail(res, 401, 'No token provided');
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : auth;
  const userId = verifyToken(token);
  if (!userId) return fail(res, 401, 'Invalid token');

  if (req.method === 'GET') {
    const since = req.query.since ? parseInt(req.query.since) : 0;
    const records = [];
    const keys = await redis.hgetall(`sync:${userId}`);
    if (keys) {
      for (const [key, value] of Object.entries(keys)) {
        const rec = JSON.parse(value);
        if (rec.updatedAt >= since) records.push(rec);
      }
    }
    return ok(res, 200, { records });
  }

  if (req.method === 'POST') {
    const { records } = req.body || {};
    if (!Array.isArray(records)) return fail(res, 400, 'records must be an array');
    for (const rec of records) {
      await redis.hset(`sync:${userId}`, { [`${rec.module}:${rec.id}`]: JSON.stringify({ ...rec, updatedAt: Date.now() }) });
    }
    const all = await redis.hgetall(`sync:${userId}`);
    const result = all ? Object.values(all).map(v => JSON.parse(v)) : [];
    return ok(res, 200, { records: result });
  }

  return fail(res, 405, 'Method not allowed');
}

module.exports = guard(handler);
