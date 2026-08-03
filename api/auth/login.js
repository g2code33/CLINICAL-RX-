const { redis } = require('../_lib/redis.js');
const { verifyPassword, signToken } = require('../_lib/auth.js');
const { guard, fail, ok } = require('../_lib/errors.js');

async function handler(req, res) {
  if (req.method !== 'POST') return fail(res, 405, 'Method not allowed');

  const { email, password } = req.body || {};
  if (!email || !password) return fail(res, 400, 'Email and password are required.');

  const e = String(email).trim().toLowerCase();
  const raw = await redis.hget('users', e);
  if (!raw) return fail(res, 401, 'Invalid email or password.');

  const user = JSON.parse(raw);
  if (!verifyPassword(String(password), user.password)) {
    return fail(res, 401, 'Invalid email or password.');
  }

  const token = signToken(user.id);
  return ok(res, 200, { token, user: { id: user.id, name: user.name, email: e } });
}

module.exports = guard(handler);
