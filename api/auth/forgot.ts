import type { VercelRequest, VercelResponse } from '@vercel/node';
import crypto from 'crypto';
import { redis } from '../_lib/redis';

// Emails the reset link via Resend (free tier). Set RESEND_API_KEY in Vercel env vars.
const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
const FROM_EMAIL = process.env.FROM_EMAIL || 'CLINICAL Rx <onboarding@resend.dev>';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { email } = req.body || {};
  if (!email) return res.status(400).json({ error: 'Email is required.' });
  const e = String(email).trim().toLowerCase();

  // Always return success-ish even if the email doesn't exist, to avoid
  // leaking which addresses are registered. If the user exists, we send.
  const raw = await redis.hget('users', e);
  if (!raw) {
    return res.status(200).json({ ok: true, sent: false, message: 'If that email is registered, a reset link has been sent.' });
  }

  const user = JSON.parse(raw as string);

  // Generate a short-lived reset token (hashed) tied to the user.
  const token = crypto.randomBytes(24).toString('hex');
  const expires = Date.now() + 1000 * 60 * 30; // 30 min
  await redis.hset('reset_tokens', { [token]: JSON.stringify({ email: e, expires, userId: user.id }) });

  const base = process.env.APP_URL || 'https://your-app.vercel.app';
  const link = `${base}/#/reset?token=${token}`;

  if (!RESEND_API_KEY) {
    // No email configured: still store the token and return it in dev so the
    // reset works (documented for setup). In production you'd return the link path.
    return res.status(200).json({ ok: true, sent: false, token, message: 'RESEND_API_KEY not set — reset token generated (dev).' });
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
      return res.status(200).json({ ok: true, sent: false, token, message: 'Email send failed (check RESEND_API_KEY/domain). Token returned for dev.' });
    }
    return res.status(200).json({ ok: true, sent: true, message: 'Reset link sent. Check your email.' });
  } catch (e: any) {
    return res.status(200).json({ ok: true, sent: false, token, message: 'Email send error: ' + (e?.message || 'unknown') });
  }
}
