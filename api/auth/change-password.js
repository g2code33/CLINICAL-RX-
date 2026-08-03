const { redis } = require('../_lib/redis.js');
const { verifyToken, hashPassword, verifyPassword } = require('../_lib/auth.js');
const { guard, fail, ok } = require('../_lib/errors.js');

module.exports = guard(async function handler(req, res) {
  if (req.method !== 'POST') return fail(res, 405, 'Method not allowed');

  const auth = req.headers.authorization;
  if (!auth) return fail(res, 401, 'No token provided');
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : auth;
  const userId = verifyToken(token);
  if (!userId) return fail(res, 401, 'Invalid token');

  const { currentPassword, newPassword } = req.body || {};
  if (!currentPassword || !newPassword) return fail(res, 400, 'Current and new password required.');
  if (String(newPassword).length < 6) return fail(res, 400, 'New password must be at least 6 characters.');

  const users = await redis.hgetall('users');
  if (!users) return fail(res, 404, 'User not found.');

  let userEmail = null, userData = null;
  for (const [email, data] of Object.entries(users)) {
    const user = JSON.parse(data);
    if (user.id === userId) { userEmail = email; userData = user; break; }
  }
  if (!userEmail || !userData) return fail(res, 404, 'User not found.');

  if (!verifyPassword(currentPassword, userData.password)) {
    return fail(res, 401, 'Current password is incorrect.');
  }

  userData.password = hashPassword(newPassword);
  await redis.hset('users', { [userEmail]: JSON.stringify(userData) });
  return ok(res, 200, { message: 'Password changed successfully.' });
});
