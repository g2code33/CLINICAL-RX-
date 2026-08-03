import type { VercelRequest, VercelResponse } from '@vercel/node';
import { extractToken, verifyToken } from './_lib/auth.js';
import { getAll, putRecords, type SyncRecord } from './_lib/records.js';
import { guard, fail, ok } from './_lib/errors.js';

async function handler(req: VercelRequest, res: VercelResponse) {
  const token = extractToken(req);
  const userId = token ? verifyToken(token) : null;
  if (!userId) return fail(res, 401, 'Not authenticated');

  // GET -> pull records (optionally incremental via ?since=<ms>)
  if (req.method === 'GET') {
    const sinceParam = typeof req.query.since === 'string' ? Number(req.query.since) : NaN;
    const since = Number.isFinite(sinceParam) ? sinceParam : undefined;
    const records = await getAll(userId, since);
    return ok(res, 200, { records, serverTime: Date.now() });
  }

  // POST -> push changes, get canonical set back
  if (req.method === 'POST') {
    const body = req.body || {};
    const incoming: SyncRecord[] = Array.isArray(body.records) ? body.records : [];
    const sanitized = incoming
      .filter((r) => r && typeof r.id === 'string' && typeof r.module === 'string')
      .map((r) => ({
        module: r.module,
        id: r.id,
        data: r.data ?? {},
        createdAt: typeof r.createdAt === 'number' ? r.createdAt : Date.now(),
        updatedAt: typeof r.updatedAt === 'number' ? r.updatedAt : Date.now(),
        deleted: r.deleted ? true : undefined,
      }));
    const records = await putRecords(userId, sanitized);
    return ok(res, 200, { records });
  }

  return fail(res, 405, 'Method not allowed');
}

export default guard(handler);
