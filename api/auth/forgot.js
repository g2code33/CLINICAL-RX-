const crypto = require('crypto');
const { redis } = require('../_lib/redis.js');
const { guard, fail, ok } = require('../_lib/errors.js');

async function handler(req, res) {
  if (req.method !== 'POST') return fail(res, 405, 'Method not allowed');

  const { email } = req.body || {};
  if (!email) return fail(res, 400, 'Email is required.');

  const e = String(email).trim().toLowerCase();
  const raw = await redis.hget('users', e);

  // Always respond 200 with the same generic message whether or not the
  // account exists, so the endpoint can't be used to enumerate accounts.
  if (!raw) return ok(res, 200, { message: 'If an account exists for that email, a reset link has been sent.' });

  const token = crypto.randomBytes(32).toString('hex');
  const expires = Date.now() + 30 * 60 * 1000;
  await redis.set(`reset:${token}`, JSON.stringify({ email: e, expires }));

  const appUrl = process.env.APP_URL || 'https://clinicalrx30.vercel.app';
  // Include the email in the link — the reset endpoint needs it to find the user.
  const resetUrl = `${appUrl}/#/reset?token=${encodeURIComponent(token)}&email=${encodeURIComponent(e)}`;

  if (process.env.RESEND_API_KEY) {
    try {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: process.env.FROM_EMAIL || 'noreply@clinicalrx.app',
          to: e,
          subject: 'CLINICAL Rx — Password reset',
          html: `<p>Click below to reset your password (expires in 30 min):</p><a href="${resetUrl}">Reset password</a>`,
        }),
      });
      return ok(res, 200, { message: 'If an account exists for that email, a reset link has been sent.' });
    } catch {
      // Never leak the token in the response when mail is configured.
      return fail(res, 502, 'Reset email could not be sent. Please try again shortly, or use the security-question reset.');
    }
  }

  // No mail service configured: dev fallback — hand back the link directly.
  return ok(res, 200, { message: `Reset token (dev — no mail configured): ${token}`, resetUrl });
}

module.exports = guard(handler);
