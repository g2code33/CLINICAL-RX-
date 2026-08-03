const { redis } = require('../_lib/redis.js');
const { verifyToken, hashPassword } = require('../_lib/auth.js');
const { guard, fail, ok } = require('../_lib/errors.js');

module.exports = guard(async function handler(req, res) {
  if (req.method !== 'POST') return fail(res, 405, 'Method not allowed');

  const auth = req.headers.authorization;
  if (!auth) return fail(res, 401, 'No token provided');
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : auth;
  const userId = verifyToken(token);
  if (!userId) return fail(res, 401, 'Invalid token');

  const adminEmail = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const { email, newPassword } = req.body || {};
  if (!email || !newPassword) return fail(res, 400, 'Email and new password required.');
  if (String(newPassword).length < 6) return fail(res, 400, 'Password must be at least 6 characters.');

  const users = await redis.hgetall('users');
  if (!users) return fail(res, 404, 'User not found.');

  const e = String(email).trim().toLowerCase();
  const raw = users[e];
  if (!raw) return fail(res, 404, 'User not found.');

  const user = JSON.parse(raw);

  // Verify requester is admin
  if (user.id !== userId) {
    const adminUser = Object.values(users).find(u => JSON.parse(u).id === userId);
    if (!adminUser || JSON.parse(adminUser).email?.toLowerCase() !== adminEmail) {
      return fail(res, 403, 'Admin access required.');
    }
  }

  user.password = hashPassword(newPassword);
  await redis.hset('users', { [e]: JSON.stringify(user) });
  return ok(res, 200, { message: `Password reset for ${e}` });
});
