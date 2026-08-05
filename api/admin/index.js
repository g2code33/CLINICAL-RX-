const { redis } = require('../_lib/redis.js');
const { verifyToken, hashPassword } = require('../_lib/auth.js');
const { guard, fail, ok } = require('../_lib/errors.js');

async function isAdmin(userId) {
  const adminEmail = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  if (!adminEmail) return false;
  const users = await redis.hgetall('users');
  if (!users) return false;
  for (const data of Object.values(users)) {
    const user = JSON.parse(data);
    if (user.id === userId && user.email?.toLowerCase() === adminEmail) return true;
  }
  return false;
}

async function getUserByEmail(email) {
  const users = await redis.hgetall('users');
  if (!users) return null;
  const e = String(email).trim().toLowerCase();
  const raw = users[e];
  return raw ? { email: e, data: JSON.parse(raw) } : null;
}

module.exports = guard(async function handler(req, res) {
  const auth = req.headers.authorization;
  if (!auth) return fail(res, 401, 'No token provided');
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : auth;
  const userId = verifyToken(token);
  if (!userId) return fail(res, 401, 'Invalid token');
  if (!(await isAdmin(userId))) return fail(res, 403, 'Admin access required.');

  const action = req.body?.action || (req.method === 'GET' ? 'list' : '');

  // LIST users
  if (req.method === 'GET' || action === 'list') {
    const adminEmail = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
    const users = await redis.hgetall('users');
    if (!users) return ok(res, 200, { users: [], adminEmail, total: 0 });
    const userList = Object.entries(users).map(([email, data]) => {
      const user = JSON.parse(data);
      return {
        id: user.id,
        name: user.name,
        email,
        createdAt: user.createdAt,
        hasSecurityQuestion: !!user.securityQuestion,
        securityQuestion: user.securityQuestion || null, // masked hint for admin
        isAdmin: email.toLowerCase() === adminEmail,
        hasPassword: !!user.password,
      };
    });
    return ok(res, 200, { users: userList, adminEmail, total: userList.length });
  }

  // RESET password
  if (action === 'reset') {
    const { email, newPassword } = req.body || {};
    if (!email || !newPassword) return fail(res, 400, 'Email and new password required.');
    if (String(newPassword).length < 6) return fail(res, 400, 'Password must be at least 6 characters.');
    const found = await getUserByEmail(email);
    if (!found) return fail(res, 404, 'User not found.');
    found.data.password = hashPassword(newPassword);
    await redis.hset('users', { [found.email]: JSON.stringify(found.data) });
    return ok(res, 200, { message: `Password reset for ${found.email}` });
  }

  // CHANGE EMAIL
  if (action === 'changeEmail') {
    const { email, newEmail } = req.body || {};
    if (!email || !newEmail) return fail(res, 400, 'Current and new email required.');
    const found = await getUserByEmail(email);
    if (!found) return fail(res, 404, 'User not found.');
    if (found.data.id === userId) return fail(res, 400, 'Cannot change your own email here.');
    const ne = String(newEmail).trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ne)) return fail(res, 400, 'Invalid new email.');
    if (ne === found.email) return fail(res, 400, 'New email is the same as current.');
    const exists = await redis.hget('users', ne);
    if (exists) return fail(res, 409, 'An account with that email already exists.');
    // Move the user record to the new email key.
    found.data.email = ne;
    await redis.hdel('users', found.email);
    await redis.hset('users', { [ne]: JSON.stringify(found.data) });
    return ok(res, 200, { message: `Email changed from ${found.email} to ${ne}` });
  }

  // UPDATE NAME
  if (action === 'updateName') {
    const { email, name } = req.body || {};
    if (!email || !name) return fail(res, 400, 'Email and name required.');
    const found = await getUserByEmail(email);
    if (!found) return fail(res, 404, 'User not found.');
    found.data.name = String(name).trim();
    await redis.hset('users', { [found.email]: JSON.stringify(found.data) });
    return ok(res, 200, { message: `Name updated for ${found.email}` });
  }

  // CLEAR SECURITY QUESTION
  if (action === 'clearSecurity') {
    const { email } = req.body || {};
    if (!email) return fail(res, 400, 'Email required.');
    const found = await getUserByEmail(email);
    if (!found) return fail(res, 404, 'User not found.');
    delete found.data.securityQuestion;
    delete found.data.securityAnswer;
    await redis.hset('users', { [found.email]: JSON.stringify(found.data) });
    return ok(res, 200, { message: `Security question cleared for ${found.email}` });
  }

  // DELETE user
  if (action === 'delete') {
    const { email } = req.body || {};
    if (!email) return fail(res, 400, 'Email required.');
    const found = await getUserByEmail(email);
    if (!found) return fail(res, 404, 'User not found.');
    if (found.data.id === userId) return fail(res, 400, 'Cannot delete your own account here.');
    await redis.hdel('users', found.email);
    try { await redis.hdel('sync:' + found.data.id); } catch {}
    try { await redis.del('aiConfig:' + found.data.id); } catch {}
    return ok(res, 200, { message: `User ${found.email} deleted` });
  }

  return fail(res, 400, 'Unknown action. Use: list, reset, changeEmail, updateName, clearSecurity, delete');
});
