import type { VercelRequest, VercelResponse } from '@vercel/node';
import { redis } from './_lib/redis.js';
import { extractToken, verifyToken } from './_lib/auth.js';
import { guard, fail, ok } from './_lib/errors.js';

async function handler(req: VercelRequest, res: VercelResponse) {
  const token = extractToken(req);
  const userId = token ? verifyToken(token) : null;
  if (!userId) return fail(res, 401, 'Not authenticated');

  const key = `user:${userId}:aiConfig`;

  if (req.method === 'GET') {
    const raw = await redis.get(key);
    return ok(res, 200, { aiConfig: raw ? JSON.parse(raw as string) : null });
  }

  if (req.method === 'POST') {
    const { aiConfig } = req.body || {};
    if (!aiConfig || typeof aiConfig !== 'object') {
      return fail(res, 400, 'aiConfig is required.');
    }
    await redis.set(key, JSON.stringify(aiConfig));
    return ok(res, 200, { ok: true });
  }

  return fail(res, 405, 'Method not allowed');
}

export default guard(handler);
