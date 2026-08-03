const crypto = require('crypto');
const { redis } = require('../_lib/redis.js');
const { guard, fail, ok } = require('../_lib/errors.js');

async function handler(req, res) {
  if (req.method !== 'POST') return fail(res, 405, 'Method not allowed');

  const { email } = req.body || {};
  if (!email) return fail(res, 400, 'Email is required.');

  const e = String(email).trim().toLowerCase();
  const raw = await redis.hget('users', e);
  if (!raw) return fail(res, 404, 'No account with this email.');

  const token = crypto.randomBytes(32).toString('hex');
  const expires = Date.now() + 30 * 60 * 1000;
  await redis.set(`reset:${token}`, JSON.stringify({ email: e, expires }));

  const appUrl = process.env.APP_URL || 'https://clinicalrx30.vercel.app';
  const resetUrl = `${appUrl}/#/reset?token=${token}`;

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
      return ok(res, 200, { message: 'Reset link sent to your email.' });
    } catch {
      return ok(res, 200, { message: `Reset token (dev): ${token}`, resetUrl });
    }
  }

  return ok(res, 200, { message: `Reset token (dev — no mail configured): ${token}`, resetUrl });
}

module.exports = guard(handler);
