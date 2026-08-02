import type { VercelRequest, VercelResponse } from '@vercel/node';
import { redis } from './_lib/redis';
import { extractToken, verifyToken } from './_lib/auth';

// Store/retrieve the user's AI configuration (provider keys + models) in the
// cloud, keyed per user, so multiple devices can use the same AI setup.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const token = extractToken(req);
  const userId = token ? verifyToken(token) : null;
  if (!userId) return res.status(401).json({ error: 'Not authenticated' });

  const key = `user:${userId}:aiConfig`;

  // GET -> retrieve the AI config
  if (req.method === 'GET') {
    const raw = await redis.get(key);
    return res.status(200).json({ aiConfig: raw ? JSON.parse(raw as string) : null });
  }

  // POST -> save the AI config
  if (req.method === 'POST') {
    const { aiConfig } = req.body || {};
    if (!aiConfig || typeof aiConfig !== 'object') {
      return res.status(400).json({ error: 'aiConfig is required.' });
    }
    await redis.set(key, JSON.stringify(aiConfig));
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
