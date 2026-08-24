const { redis } = require('./_lib/redis.js');
const { verifyToken } = require('./_lib/auth.js');
const { guard, fail, ok } = require('./_lib/errors.js');
const { rateLimit } = require('./_lib/rateLimit.js');

async function handler(req, res) {
  const auth = req.headers.authorization;
  if (!auth) return fail(res, 401, 'No token provided');
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : auth;
  const userId = verifyToken(token);
  if (!userId) return fail(res, 401, 'Invalid token');

  if (req.method === 'GET') {
    const config = await redis.get(`aiConfig:${userId}`);
    let parsed = null;
    if (config) { try { parsed = JSON.parse(config); } catch { parsed = null; } }
    return ok(res, 200, { aiConfig: parsed });
  }

  if (req.method === 'POST') {
    const { aiConfig } = req.body || {};
    if (!aiConfig || typeof aiConfig !== 'object' || Array.isArray(aiConfig)) {
      return fail(res, 400, 'aiConfig must be an object');
    }

    // Phase 8 §6, §37: defence in depth. The client already strips secrets
    // before upload, but the server must not rely on a well-behaved client —
    // a modified client must not be able to park credentials in the cloud.
    const SECRET_FIELDS = ['apiKey', 'api_key', 'key', 'secret', 'token', 'password', 'localModel'];
    const sanitized = {};
    let stripped = 0;
    for (const [moduleKey, cfg] of Object.entries(aiConfig)) {
      if (typeof moduleKey !== 'string' || moduleKey.length > 64) continue;
      if (!cfg || typeof cfg !== 'object' || Array.isArray(cfg)) continue;
      const clean = {};
      for (const [k, v] of Object.entries(cfg)) {
        if (k === '__proto__' || k === 'constructor' || k === 'prototype') continue;
        if (SECRET_FIELDS.includes(k)) { stripped++; continue; }
        if (typeof v === 'string' && v.length > 4000) continue;
        clean[k] = v;
      }
      sanitized[moduleKey] = clean;
    }
    if (stripped) console.warn(`[clinical-rx] stripped ${stripped} secret field(s) from an aiConfig upload`);

    const payload = JSON.stringify(sanitized);
    if (payload.length > 128 * 1024) return fail(res, 413, 'AI config is too large.');
    await redis.set(`aiConfig:${userId}`, payload);
    return ok(res, 200, { message: 'AI config saved' });
  }

  return fail(res, 405, 'Method not allowed');
}

module.exports = guard(rateLimit({ route: 'aiConfig', max: 60, windowMs: 5 * 60 * 1000 })(handler));
