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

// Errors that are safe to show a user verbatim: they describe a
// configuration problem the operator must fix, and contain no internals.
const SAFE_ERROR_PREFIX = 'CLIENT_SAFE:';

/** Mark an error message as safe to return to the client. */
function clientError(message) {
  const e = new Error(SAFE_ERROR_PREFIX + message);
  return e;
}

/**
 * Phase 8 §30: never leak internals to the client.
 *
 * A raw `e.message` can contain absolute filesystem paths, driver internals,
 * query fragments, or upstream credentials. The full error is logged
 * server-side with a short reference id; the client gets a friendly message
 * plus that id, so a user can report a problem without us exposing anything.
 */
function guard(fn) {
  return async (req, res) => {
    setCors(res);
    if (req.method === 'OPTIONS') {
      return res.status(204).end();
    }
    try {
      return await fn(req, res);
    } catch (e) {
      const ref = Math.random().toString(36).slice(2, 10);
      // Full detail goes to the server log ONLY.
      console.error(`[clinical-rx] API error ref=${ref}:`, e);

      const message = e?.message || '';

      if (message.startsWith(SAFE_ERROR_PREFIX)) {
        return fail(res, 400, message.slice(SAFE_ERROR_PREFIX.length));
      }
      if (/KV_REST_API|KV error|KV REST|in-memory|storage|redis|UPSTASH/i.test(message)) {
        return fail(res, 503, 'Cloud storage is not available right now. Your changes are safe locally and will sync later.');
      }
      return fail(res, 500, `Something went wrong on the server. Reference: ${ref}`);
    }
  };
}

module.exports = { ok, fail, guard, setCors, clientError };
