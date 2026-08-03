const { redis } = require('../_lib/redis.js');
const { verifyToken } = require('../_lib/auth.js');
const { guard, fail, ok } = require('../_lib/errors.js');

module.exports = guard(async function handler(req, res) {
  if (req.method !== 'DELETE' && req.method !== 'POST') return fail(res, 405, 'Method not allowed');

  const auth = req.headers.authorization;
  if (!auth) return fail(res, 401, 'No token provided');
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : auth;
  const userId = verifyToken(token);
  if (!userId) return fail(res, 401, 'Invalid token');

  const adminEmail = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const { email } = req.body || {};
  if (!email) return fail(res, 400, 'Email required.');

  const users = await redis.hgetall('users');
  if (!users) return fail(res, 404, 'User not found.');

  const e = String(email).trim().toLowerCase();
  const raw = users[e];
  if (!raw) return fail(res, 404, 'User not found.');

  const user = JSON.parse(raw);

  // Verify admin
  const adminUser = Object.values(users).find(u => JSON.parse(u).id === userId);
  if (!adminUser || JSON.parse(adminUser).email?.toLowerCase() !== adminEmail) {
    return fail(res, 403, 'Admin access required.');
  }

  // Don't let admin delete themselves via this endpoint
  if (user.id === userId) return fail(res, 400, 'Cannot delete your own account here.');

  await redis.hdel('users', e);
  try { await redis.hdel('sync:' + user.id); } catch {}
  try { await redis.set('aiConfig:' + user.id, ''); } catch {}

  return ok(res, 200, { message: `User ${e} deleted` });
});
