import type { VercelRequest, VercelResponse } from '@vercel/node';

// Simple health/diagnostic endpoint so you can confirm the API is deployed and
// whether KV is configured. Visit /api/health in the browser.
export default async function handler(_req: VercelRequest, res: VercelResponse) {
  return res.status(200).json({
    ok: true,
    name: 'clinical-rx-api',
    time: Date.now(),
    kvConfigured: !!(process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL) && !!(process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN),
    hasSessionSecret: !!process.env.SESSION_SECRET,
  });
}
