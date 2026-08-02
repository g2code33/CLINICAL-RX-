import type { VercelRequest, VercelResponse } from '@vercel/node';
import crypto from 'crypto';
import { redis } from '../_lib/redis';
import { hashPassword, signToken } from '../_lib/auth';
import { guard, fail, ok } from '../_lib/errors';

async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return fail(res, 405, 'Method not allowed');

  const { email, password, name, securityQuestion, securityAnswer } = req.body || {};
  if (!email || !password) return fail(res, 400, 'Email and password are required.');
  if (String(password).length < 6) return fail(res, 400, 'Password must be at least 6 characters.');

  const e = String(email).trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return fail(res, 400, 'Invalid email address.');

  const existing = await redis.hget('users', e);
  if (existing) return fail(res, 409, 'An account with this email already exists. Try signing in instead.');

  const id = crypto.randomUUID();
  const user = {
    id,
    name: (name || e.split('@')[0]).trim(),
    email: e,
    password: hashPassword(password),
    createdAt: Date.now(),
    ...(securityQuestion && securityAnswer ? { securityQuestion, securityAnswer: hashPassword(securityAnswer) } : {}),
  };
  await redis.hset('users', { [e]: JSON.stringify(user) });

  const token = signToken(id);
  return ok(res, 201, { token, user: { id, name: user.name, email: e } });
}

export default guard(handler);
