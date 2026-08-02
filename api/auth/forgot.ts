import type { VercelRequest, VercelResponse } from '@vercel/node';
import crypto from 'crypto';
import { redis } from '../_lib/redis';
import { guard, fail, ok } from '../_lib/errors';

const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
const FROM_EMAIL = process.env.FROM_EMAIL || 'CLINICAL Rx <onboarding@resend.dev>';

async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return fail(res, 405, 'Method not allowed');

  const { email } = req.body || {};
  if (!email) return fail(res, 400, 'Email is required.');
  const e = String(email).trim().toLowerCase();

  const raw = await redis.hget('users', e);
  if (!raw) {
    return ok(res, 200, { ok: true, sent: false, message: 'If that email is registered, a reset link has been sent.' });
  }

  const user = JSON.parse(raw as string);
  const token = crypto.randomBytes(24).toString('hex');
  const expires = Date.now() + 1000 * 60 * 30; // 30 min
  await redis.hset('reset_tokens', { [token]: JSON.stringify({ email: e, expires, userId: user.id }) });

  const base = process.env.APP_URL || 'https://your-app.vercel.app';
  const link = `${base}/#/reset?token=${token}`;

  if (!RESEND_API_KEY) {
    return ok(res, 200, { ok: true, sent: false, token, message: 'Email service not configured (RESEND_API_KEY missing). Use the reset link returned, or the security-question option.' });
  }

  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${RESEND_API_KEY}` },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: [e],
        subject: 'Reset your CLINICAL Rx password',
        html: `<p>Hello,</p><p>Click the link below to reset your CLINICAL Rx password. This link expires in 30 minutes.</p><p><a href="${link}">${link}</a></p><p>If you didn't request this, you can ignore this email.</p>`,
      }),
    });
    if (!r.ok) {
      const text = await r.text();
      return ok(res, 200, { ok: true, sent: false, token, message: 'Email send failed (' + (text || 'unknown') + '). Use the returned link instead.' });
    }
    return ok(res, 200, { ok: true, sent: true, message: 'Reset link sent. Check your email.' });
  } catch (e: any) {
    return ok(res, 200, { ok: true, sent: false, token, message: 'Email error: ' + (e?.message || 'unknown') + '. Use the returned link instead.' });
  }
}

export default guard(handler);
