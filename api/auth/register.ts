import type { VercelRequest, VercelResponse } from '@vercel/node';
import crypto from 'crypto';
import { redis } from '../_lib/redis';
import { hashPassword, signToken } from '../_lib/auth';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { email, password, name } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Email and password are required.' });
  if (String(password).length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters.' });

  const e = String(email).trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return res.status(400).json({ error: 'Invalid email address.' });

  const existing = await redis.hget('users', e);
  if (existing) return res.status(409).json({ error: 'An account with this email already exists.' });

  const id = crypto.randomUUID();
  const user = { id, name: (name || e.split('@')[0]).trim(), email: e, password: hashPassword(password) };
  await redis.hset('users', { [e]: JSON.stringify(user) });

  const token = signToken(id);
  return res.status(201).json({ token, user: { id, name: user.name, email: e } });
}
