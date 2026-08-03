module.exports = async function handler(req, res) {
  return res.status(200).json({
    ok: true,
    name: 'clinical-rx-api',
    timestamp: Date.now(),
    kvConfigured: !!(process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL) && !!(process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN),
    hasSessionSecret: !!process.env.SESSION_SECRET,
    kvUrl: process.env.KV_REST_API_URL ? '(set)' : '(not set)',
    kvToken: process.env.KV_REST_API_TOKEN ? '(set)' : '(not set)',
    sessionSecret: process.env.SESSION_SECRET ? '(set)' : '(not set)',
  });
};
