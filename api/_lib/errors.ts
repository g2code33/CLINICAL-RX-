import type { VercelResponse } from '@vercel/node';

// Wrap a handler so unexpected errors return a helpful message instead of a
// bare 500. Also turns thrown errors into a 500 with `error` detail.
export function ok(res: VercelResponse, status: number, body: Record<string, unknown>) {
  return res.status(status).json(body);
}

export function fail(res: VercelResponse, status: number, message: string, extra?: Record<string, unknown>) {
  return res.status(status).json({ error: message, ...extra });
}

// A middleware-ish wrapper. Usage: export default guard(handler)
export function guard(fn: (req: any, res: VercelResponse) => Promise<any>) {
  return async (req: any, res: VercelResponse) => {
    try {
      return await fn(req, res);
    } catch (e: any) {
      console.error('[clinical-rx] API error:', e);
      const message = e?.message || 'Unexpected server error.';
      // Distinguish storage-not-configured from real errors for friendlier UX.
      if (/KV_REST_API|in-memory|storage|redis/i.test(message)) {
        return fail(res, 503, 'Cloud storage is not configured. Please set KV_REST_API_URL and KV_REST_API_TOKEN (or deploy to Vercel with a KV store).');
      }
      return fail(res, 500, message);
    }
  };
}
