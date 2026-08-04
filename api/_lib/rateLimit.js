// Simple in-memory rate limiter. Fine for Vercel's serverless (per-instance)
// and for the in-memory fallback; with Upstash KV it could be shared, but
// per-instance limits still blunt brute-force attempts.
const buckets = new Map(); // key -> { count, resetAt }

function clientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (fwd) return String(fwd).split(',')[0].trim();
  return req.socket?.remoteAddress || req.connection?.remoteAddress || 'unknown';
}

/**
 * Check the rate limit for (ip:route). Returns true if the request is allowed.
 * When false, also returns ms until reset for the Retry-After header.
 */
function checkLimit(route, ip, max, windowMs) {
  const key = `${route}:${ip}`;
  const now = Date.now();
  const cur = buckets.get(key);
  if (!cur || cur.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfter: 0 };
  }
  if (cur.count >= max) {
    return { allowed: false, retryAfter: Math.ceil((cur.resetAt - now) / 1000) };
  }
  cur.count += 1;
  return { allowed: true, retryAfter: 0 };
}

/**
 * Wrap an async (req, res) handler with a rate limit. Usage:
 *   module.exports = guard(rateLimit({ route: 'login', max: 10 })(handler));
 */
function rateLimit({ route, max = 10, windowMs = 15 * 60 * 1000, message = 'Too many attempts. Please wait a few minutes and try again.' }) {
  return function withLimit(handler) {
    return async function rateLimited(req, res) {
      const { allowed, retryAfter } = checkLimit(route, clientIp(req), max, windowMs);
      if (!allowed) {
        if (res.setHeader) res.setHeader('Retry-After', String(retryAfter));
        return res.status(429).json({ error: message });
      }
      return handler(req, res);
    };
  };
}

module.exports = { rateLimit, clientIp };
