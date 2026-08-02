import type { VercelRequest, VercelResponse } from '@vercel/node';
import { extractToken, verifyToken } from './_lib/auth';
import { getAll, putRecords, type SyncRecord } from './_lib/records';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const token = extractToken(req);
  const userId = token ? verifyToken(token) : null;
  if (!userId) return res.status(401).json({ error: 'Not authenticated' });

  // GET -> pull records (optionally incremental via ?since=<ms>)
  if (req.method === 'GET') {
    const sinceParam = typeof req.query.since === 'string' ? Number(req.query.since) : NaN;
    const since = Number.isFinite(sinceParam) ? sinceParam : undefined;
    const records = await getAll(userId, since);
    return res.status(200).json({ records, serverTime: Date.now() });
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
    return res.status(200).json({ records });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
