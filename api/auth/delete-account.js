const { redis } = require('../_lib/redis.js');
const { verifyToken, verifyPassword } = require('../_lib/auth.js');
const { guard, fail, ok } = require('../_lib/errors.js');

module.exports = guard(async function handler(req, res) {
  if (req.method !== 'DELETE' && req.method !== 'POST') return fail(res, 405, 'Method not allowed');

  const auth = req.headers.authorization;
  if (!auth) return fail(res, 401, 'No token provided');
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : auth;
  const userId = verifyToken(token);
  if (!userId) return fail(res, 401, 'Invalid token');

  const { password } = req.body || {};
  if (!password) return fail(res, 400, 'Password required to confirm deletion.');

  const users = await redis.hgetall('users');
  if (!users) return fail(res, 404, 'User not found.');

  let userEmail = null, userData = null;
  for (const [email, data] of Object.entries(users)) {
    const user = JSON.parse(data);
    if (user.id === userId) { userEmail = email; userData = user; break; }
  }
  if (!userEmail || !userData) return fail(res, 404, 'User not found.');

  if (!verifyPassword(password, userData.password)) {
    return fail(res, 401, 'Password is incorrect.');
  }

  await redis.hdel('users', userEmail);
  try { await redis.hdel('sync:' + userId); } catch {}
  try { await redis.del('aiConfig:' + userId); } catch {}

  return ok(res, 200, { message: 'Account deleted successfully.' });
});
