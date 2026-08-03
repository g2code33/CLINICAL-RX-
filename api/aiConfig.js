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
    await redis.set(`aiConfig:${userId}`, JSON.stringify(aiConfig));
    return ok(res, 200, { message: 'AI config saved' });
  }

  return fail(res, 405, 'Method not allowed');
}

module.exports = guard(handler);
