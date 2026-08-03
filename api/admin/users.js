const { redis } = require('../_lib/redis.js');
const { verifyToken } = require('../_lib/auth.js');
const { guard, fail, ok } = require('../_lib/errors.js');

module.exports = guard(async function handler(req, res) {
  if (req.method !== 'GET') return fail(res, 405, 'Method not allowed');

  const auth = req.headers.authorization;
  if (!auth) return fail(res, 401, 'No token provided');
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : auth;
  const userId = verifyToken(token);
  if (!userId) return fail(res, 401, 'Invalid token');

  // Check if user is admin
  const adminEmail = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  if (!adminEmail) return fail(res, 403, 'Admin not configured.');

  const users = await redis.hgetall('users');
  if (!users) return ok(res, 200, { users: [], adminEmail });

  const userList = Object.entries(users).map(([email, data]) => {
    const user = JSON.parse(data);
    return {
      id: user.id,
      name: user.name,
      email,
      createdAt: user.createdAt,
      hasSecurityQuestion: !!user.securityQuestion,
      isAdmin: email.toLowerCase() === adminEmail,
    };
  });

  // Only admins can see the full list
  const isAdmin = userList.some(u => u.id === userId && u.isAdmin);
  if (!isAdmin) return fail(res, 403, 'Admin access required.');

  return ok(res, 200, { users: userList, adminEmail, total: userList.length });
});
