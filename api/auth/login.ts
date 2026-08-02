import type { VercelRequest, VercelResponse } from '@vercel/node';
import { redis } from '../_lib/redis';
import { verifyPassword, signToken } from '../_lib/auth';
import type { User } from '../_lib/auth';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Email and password are required.' });

  const e = String(email).trim().toLowerCase();
  const raw = await redis.hget('users', e);
  if (!raw) return res.status(401).json({ error: 'Invalid email or password.' });

  const user = JSON.parse(raw as string) as User;
  if (!verifyPassword(String(password), user.password)) {
    return res.status(401).json({ error: 'Invalid email or password.' });
  }

  const token = signToken(user.id);
  return res.status(200).json({ token, user: { id: user.id, name: user.name, email: e } });
}
