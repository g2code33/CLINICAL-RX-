import type { VercelRequest, VercelResponse } from '@vercel/node';
import { redis } from '../_lib/redis';
import { extractToken, verifyToken } from '../_lib/auth';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const token = extractToken(req);
  const userId = token ? verifyToken(token) : null;
  if (!userId) return res.status(401).json({ error: 'Not authenticated' });

  // Find the user by scanning (fine for a personal app's scale).
  const users = await redis.hgetall('users');
  let user = null;
  if (users) {
    for (const v of Object.values(users)) {
      const u = JSON.parse(v as string);
      if (u.id === userId) {
        user = { id: u.id, name: u.name, email: u.email };
        break;
      }
    }
  }
  if (!user) return res.status(404).json({ error: 'User not found' });
  return res.status(200).json({ user });
}
