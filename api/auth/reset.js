const { redis } = require('../_lib/redis.js');
const { hashPassword, verifyHash } = require('../_lib/auth.js');
const { guard, fail, ok } = require('../_lib/errors.js');
const { rateLimit } = require('../_lib/rateLimit.js');

async function handler(req, res) {
  if (req.method !== 'POST') return fail(res, 405, 'Method not allowed');

  const { method, email, password, token, securityQuestion, securityAnswer, adminToken } = req.body || {};

  if (method === 'admin') {
    if (adminToken !== process.env.ADMIN_RESET_TOKEN) return fail(res, 403, 'Invalid admin token.');
    if (!email || !password) return fail(res, 400, 'Email and password required.');
    const e = String(email).trim().toLowerCase();
    const raw = await redis.hget('users', e);
    if (!raw) return fail(res, 404, 'User not found.');
    const user = JSON.parse(raw);
    user.password = hashPassword(password);
    await redis.hset('users', { [e]: JSON.stringify(user) });
    return ok(res, 200, { message: 'Password reset by admin.' });
  }

  if (method === 'token') {
    if (!token || !email || !password) return fail(res, 400, 'Token, email, and password required.');
    const raw = await redis.get(`reset:${token}`);
    if (!raw) return fail(res, 400, 'Invalid or expired token.');
    const data = JSON.parse(raw);
    if (data.expires < Date.now()) return fail(res, 400, 'Token expired.');
    const e = String(email).trim().toLowerCase();
    if (data.email !== e) return fail(res, 400, 'Email mismatch.');
    const userRaw = await redis.hget('users', e);
    if (!userRaw) return fail(res, 404, 'User not found.');
    const user = JSON.parse(userRaw);
    user.password = hashPassword(password);
    await redis.hset('users', { [e]: JSON.stringify(user) });
    // Tokens are stored as plain scalar keys (redis.set), so delete the key —
    // hdel only works on hashes and would silently leave the token reusable.
    await redis.del(`reset:${token}`);
    return ok(res, 200, { message: 'Password reset successfully.' });
  }

  if (method === 'security') {
    if (!email || !password || !securityAnswer) return fail(res, 400, 'Email, new password and security answer are required.');
    const e = String(email).trim().toLowerCase();
    const raw = await redis.hget('users', e);
    if (!raw) return fail(res, 404, 'User not found.');
    const user = JSON.parse(raw);
    if (!user.securityQuestion || !user.securityAnswer) return fail(res, 400, 'No security question set.');
    // The client already fetched & displayed the question; the server checks
    // the answer against the stored hash (case-insensitive to be forgiving).
    if (!verifyHash(String(securityAnswer).trim().toLowerCase(), user.securityAnswer)) {
      return fail(res, 400, 'Security answer incorrect.');
    }
    user.password = hashPassword(password);
    await redis.hset('users', { [e]: JSON.stringify(user) });
    return ok(res, 200, { message: 'Password reset via security question.' });
  }

  return fail(res, 400, 'Invalid reset method.');
}

module.exports = guard(rateLimit({ route: 'reset', max: 10, windowMs: 15 * 60 * 1000 })(handler));
