import type { VercelRequest, VercelResponse } from '@vercel/node';
import { redis } from '../_lib/redis';
import { verifyPassword, signToken } from '../_lib/auth';
import type { User } from '../_lib/auth';
import { guard, fail, ok } from '../_lib/errors';

async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return fail(res, 405, 'Method not allowed');

  const { email, password } = req.body || {};
  if (!email || !password) return fail(res, 400, 'Email and password are required.');

  const e = String(email).trim().toLowerCase();
  const raw = await redis.hget('users', e);
  if (!raw) return fail(res, 401, 'Invalid email or password.');

  const user = JSON.parse(raw as string) as User;
  if (!verifyPassword(String(password), user.password)) {
    return fail(res, 401, 'Invalid email or password.');
  }

  const token = signToken(user.id);
  return ok(res, 200, { token, user: { id: user.id, name: user.name, email: e } });
}

export default guard(handler);
