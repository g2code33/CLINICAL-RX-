import type { VercelRequest, VercelResponse } from '@vercel/node';
import { redis } from '../_lib/redis.js';
import { hashPassword, verifyHash } from '../_lib/auth.js';
import { guard, fail, ok } from '../_lib/errors.js';

async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return fail(res, 405, 'Method not allowed');

  const { method, email, password, token, securityQuestion, securityAnswer } = req.body || {};

  // ---- Reset via emailed token ----
  if (method === 'token') {
    if (!token || !password) return fail(res, 400, 'Reset token and new password are required.');
    if (String(password).length < 6) return fail(res, 400, 'Password must be at least 6 characters.');
    const entry = await redis.hget('reset_tokens', token);
    if (!entry) return fail(res, 400, 'Invalid or expired reset token.');
    const data = JSON.parse(entry as string);
    if (data.expires < Date.now()) {
      await redis.hdel('reset_tokens', token);
      return fail(res, 400, 'This reset link has expired. Request a new one.');
    }
    const raw = await redis.hget('users', data.email);
    if (!raw) return fail(res, 400, 'Account not found.');
    const user = JSON.parse(raw as string);
    user.password = hashPassword(password);
    await redis.hset('users', { [user.email]: JSON.stringify(user) });
    await redis.hdel('reset_tokens', token);
    return ok(res, 200, { ok: true, message: 'Password reset successfully. You can now sign in.' });
  }

  // ---- Reset via security question ----
  if (method === 'security') {
    if (!email || !password || !securityQuestion || !securityAnswer) {
      return fail(res, 400, 'Email, new password, security question and answer are required.');
    }
    if (String(password).length < 6) return fail(res, 400, 'Password must be at least 6 characters.');
    const e = String(email).trim().toLowerCase();
    const raw = await redis.hget('users', e);
    if (!raw) return fail(res, 404, 'Account not found.');
    const user = JSON.parse(raw as string);
    if (!user.securityQuestion || !user.securityAnswer) {
      return fail(res, 400, 'This account has no security question set.');
    }
    if (String(securityQuestion).trim().toLowerCase() !== String(user.securityQuestion).trim().toLowerCase()) {
      return fail(res, 400, 'Security question does not match.');
    }
    if (!verifyHash(String(securityAnswer), user.securityAnswer)) {
      return fail(res, 400, 'Security answer is incorrect.');
    }
    user.password = hashPassword(password);
    await redis.hset('users', { [e]: JSON.stringify(user) });
    return ok(res, 200, { ok: true, message: 'Password reset successfully.' });
  }

  // ---- Manual admin reset ----
  if (method === 'admin') {
    const adminToken = req.headers['x-admin-token'];
    if (adminToken !== process.env.ADMIN_RESET_TOKEN) {
      return fail(res, 403, 'Unauthorized.');
    }
    if (!email || !password) return fail(res, 400, 'Email and new password are required.');
    const e = String(email).trim().toLowerCase();
    const raw = await redis.hget('users', e);
    if (!raw) return fail(res, 404, 'Account not found.');
    const user = JSON.parse(raw as string);
    user.password = hashPassword(String(password));
    await redis.hset('users', { [e]: JSON.stringify(user) });
    return ok(res, 200, { ok: true, message: 'Password reset by admin.' });
  }

  return fail(res, 400, 'Unknown reset method.');
}

export default guard(handler);
