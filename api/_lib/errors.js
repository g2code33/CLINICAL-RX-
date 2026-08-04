function ok(res, status, body) {
  return res.status(status).json(body);
}

function fail(res, status, message, extra) {
  return res.status(status).json({ error: message, ...extra });
}

// CORS: the desktop app (origin file://) and any custom front-end call these
// endpoints cross-origin. Every response must carry CORS headers, and OPTIONS
// preflight requests must be answered, or the browser blocks with
// "Failed to fetch".
function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-admin-token');
  res.setHeader('Access-Control-Max-Age', '86400');
  if (!res.headersSent) res.setHeader('Vary', 'Origin');
}

function guard(fn) {
  return async (req, res) => {
    setCors(res);
    if (req.method === 'OPTIONS') {
      return res.status(204).end();
    }
    try {
      return await fn(req, res);
    } catch (e) {
      console.error('[clinical-rx] API error:', e);
      const message = e?.message || 'Unexpected server error.';
      if (/KV_REST_API|KV error|KV REST|in-memory|storage|redis|UPSTASH/i.test(message)) {
        return fail(res, 503, 'Cloud storage is not configured. Please set KV_REST_API_URL and KV_REST_API_TOKEN in Vercel (Storage → KV → create).');
      }
      return fail(res, 500, message);
    }
  };
}

module.exports = { ok, fail, guard, setCors };
