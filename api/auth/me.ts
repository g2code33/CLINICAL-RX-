import type { VercelRequest, VercelResponse } from '@vercel/node';
import { redis } from '../_lib/redis.js';
import { extractToken, verifyToken } from '../_lib/auth.js';
import { guard, fail, ok } from '../_lib/errors.js';

async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return fail(res, 405, 'Method not allowed');

  const token = extractToken(req);
  const userId = token ? verifyToken(token) : null;
  if (!userId) return fail(res, 401, 'Not authenticated');

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
  if (!user) return fail(res, 404, 'User not found');
  return ok(res, 200, { user });
}

export default guard(handler);
