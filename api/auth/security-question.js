const { redis } = require('../_lib/redis.js');
const { guard, ok, fail } = require('../_lib/errors.js');

// Returns the user's security question for the given email (so the forgot-
// password UI can show it and only ask for the answer). Never reveals the
// answer. Unknown emails get the same generic response (no enumeration).
async function handler(req, res) {
  if (req.method !== 'POST') return fail(res, 405, 'Method not allowed');

  const { email } = req.body || {};
  if (!email) return fail(res, 400, 'Email is required.');

  const e = String(email).trim().toLowerCase();
  const raw = await redis.hget('users', e);
  if (!raw) return ok(res, 200, { securityQuestion: null });

  const user = JSON.parse(raw);
  if (!user.securityQuestion) return ok(res, 200, { securityQuestion: null });

  return ok(res, 200, { securityQuestion: user.securityQuestion });
}

module.exports = guard(handler);
