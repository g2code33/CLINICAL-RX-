// Minimal health endpoint with NO imports so it can't crash on module load.
// If this crashes, the Vercel runtime itself is broken or the deployment is stale.
export default async function handler(req: Request): Promise<Response> {
  return new Response(JSON.stringify({
    ok: true,
    name: 'clinical-rx-api',
    kvConfigured: !!(process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL) && !!(process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN),
    hasSessionSecret: !!process.env.SESSION_SECRET,
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
