// Minimal health endpoint with NO imports (only Vercel-provided globals) so it
// can't crash on module load. If this works but register doesn't, the problem
// is in register's import chain, not the deployment.
export default function handler(req: any, res: any) {
  return res.status(200).json({
    ok: true,
    name: 'clinical-rx-api',
    method: req.method || 'GET',
    time: Date.now(),
    kvConfigured: !!(process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL) && !!(process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN),
    hasSessionSecret: !!process.env.SESSION_SECRET,
  });
}
