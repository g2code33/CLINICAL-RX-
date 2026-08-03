const { verifyToken } = require('../_lib/auth.js');
const { redis } = require('../_lib/redis.js');
const { guard, fail, ok } = require('../_lib/errors.js');

async function handler(req, res) {
  const auth = req.headers.authorization;
  if (!auth) return fail(res, 401, 'No token provided');

  const token = auth.startsWith('Bearer ') ? auth.slice(7) : auth;
  const userId = verifyToken(token);
  if (!userId) return fail(res, 401, 'Invalid token');

  const users = await redis.hgetall('users');
  const user = users ? Object.values(users).find(u => JSON.parse(u).id === userId) : null;
  if (!user) return fail(res, 404, 'User not found');

  const parsed = JSON.parse(user);
  return ok(res, 200, { user: { id: parsed.id, name: parsed.name, email: parsed.email } });
}

module.exports = guard(handler);
