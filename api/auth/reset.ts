import type { VercelRequest, VercelResponse } from '@vercel/node';
import { redis } from '../_lib/redis';
import { hashPassword, verifyHash } from '../_lib/auth';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { method, email, password, token, securityQuestion, securityAnswer } = req.body || {};

  // ---- Reset via emailed token ----
  if (method === 'token') {
    if (!token || !password) return res.status(400).json({ error: 'token and password are required.' });
    if (String(password).length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters.' });
    const entry = await redis.hget('reset_tokens', token);
    if (!entry) return res.status(400).json({ error: 'Invalid or expired reset token.' });
    const data = JSON.parse(entry as string);
    if (data.expires < Date.now()) {
      await redis.hdel('reset_tokens', token);
      return res.status(400).json({ error: 'Reset token has expired.' });
    }
    const raw = await redis.hget('users', data.email);
    if (!raw) return res.status(400).json({ error: 'Account not found.' });
    const user = JSON.parse(raw as string);
    user.password = hashPassword(password);
    await redis.hset('users', { [user.email]: JSON.stringify(user) });
    await redis.hdel('reset_tokens', token);
    return res.status(200).json({ ok: true, message: 'Password reset successfully. You can now sign in.' });
  }

  // ---- Reset via security question ----
  if (method === 'security') {
    if (!email || !password || !securityQuestion || !securityAnswer) {
      return res.status(400).json({ error: 'email, password, securityQuestion and securityAnswer are required.' });
    }
    if (String(password).length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters.' });
    const e = String(email).trim().toLowerCase();
    const raw = await redis.hget('users', e);
    if (!raw) return res.status(404).json({ error: 'Account not found.' });
    const user = JSON.parse(raw as string);
    if (!user.securityQuestion || !user.securityAnswer) {
      return res.status(400).json({ error: 'This account has no security question set.' });
    }
    if (String(securityQuestion).trim().toLowerCase() !== String(user.securityQuestion).trim().toLowerCase()) {
      return res.status(400).json({ error: 'Security question does not match.' });
    }
    if (!verifyHash(String(securityAnswer), user.securityAnswer)) {
      return res.status(400).json({ error: 'Security answer is incorrect.' });
    }
    user.password = hashPassword(password);
    await redis.hset('users', { [e]: JSON.stringify(user) });
    return res.status(200).json({ ok: true, message: 'Password reset successfully.' });
  }

  // ---- Manual admin reset (resets a user's password to a given value) ----
  if (method === 'admin') {
    const adminToken = req.headers['x-admin-token'];
    if (adminToken !== process.env.ADMIN_RESET_TOKEN) {
      return res.status(403).json({ error: 'Unauthorized.' });
    }
    if (!email || !password) return res.status(400).json({ error: 'email and password are required.' });
    const e = String(email).trim().toLowerCase();
    const raw = await redis.hget('users', e);
    if (!raw) return res.status(404).json({ error: 'Account not found.' });
    const user = JSON.parse(raw as string);
    user.password = hashPassword(String(password));
    await redis.hset('users', { [e]: JSON.stringify(user) });
    return res.status(200).json({ ok: true, message: 'Password reset by admin.' });
  }

  return res.status(400).json({ error: 'Unknown reset method.' });
}
