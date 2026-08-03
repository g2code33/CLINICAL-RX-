function ok(res, status, body) {
  return res.status(status).json(body);
}

function fail(res, status, message, extra) {
  return res.status(status).json({ error: message, ...extra });
}

function guard(fn) {
  return async (req, res) => {
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

module.exports = { ok, fail, guard };
