// Unified storage layer for the API — uses Upstash KV's REST API directly via
// fetch, so there is NO package dependency to fail at module load on Vercel.
//
// - If KV env vars are set (KV_REST_API_URL + KV_REST_API_TOKEN), it calls the
//   Upstash REST API.
// - If not, it falls back to an in-memory store so auth/sync still work for a
//   single process (data not persisted across restarts).

interface KV {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  hget(hash: string, field: string): Promise<string | null>;
  hset(hash: string, map: Record<string, string>): Promise<void>;
  hgetall(hash: string): Promise<Record<string, string> | null>;
  hdel(hash: string, ...fields: string[]): Promise<void>;
  pipeline(): { hset(hash: string, map: Record<string, string>): void; exec(): Promise<void> };
}

// ---- Upstash REST implementation (pure fetch, no package) ----
function makeUpstash(): KV {
  const url = (process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || '').replace(/\/$/, '');
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || '';

  // Run a single REST command. `args` is a JSON array of arguments.
  async function cmd(...parts: unknown[]): Promise<any> {
    const res = await fetch(`${url}/${parts[0]}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(parts.slice(1)),
    });
    if (!res.ok) throw new Error(`KV REST error ${res.status}: ${await res.text()}`);
    const data: any = await res.json();
    if (data && data.error) throw new Error('KV error: ' + data.error);
    return data?.result;
  }

  // Upstash REST returns raw Redis replies; translate for our helpers.
  return {
    async get(key) {
      try {
        const v = await cmd('GET', key);
        return v ?? null;
      } catch (e: any) {
        throw new Error('KV storage connection failed: ' + (e?.message || 'unknown error') + '. Check KV_REST_API_URL and KV_REST_API_TOKEN in Vercel env vars.');
      }
    },
    async set(key, value) {
      try {
        await cmd('SET', key, value);
      } catch (e: any) {
        throw new Error('KV storage connection failed: ' + (e?.message || 'unknown error') + '. Check KV_REST_API_URL and KV_REST_API_TOKEN in Vercel env vars.');
      }
    },
    async hget(hash, field) {
      try {
        const v = await cmd('HGET', hash, field);
        return v ?? null;
      } catch (e: any) {
        throw new Error('KV storage connection failed: ' + (e?.message || 'unknown error') + '. Check KV_REST_API_URL and KV_REST_API_TOKEN in Vercel env vars.');
      }
    },
    async hset(hash, map) {
      try {
        const args: unknown[] = [hash];
        for (const [k, v] of Object.entries(map)) args.push(k, v);
        await cmd('HSET', ...args);
      } catch (e: any) {
        throw new Error('KV storage connection failed: ' + (e?.message || 'unknown error') + '. Check KV_REST_API_URL and KV_REST_API_TOKEN in Vercel env vars.');
      }
    },
    async hgetall(hash) {
      try {
        const v = await cmd('HGETALL', hash);
        if (!v) return null;
        // Redis HGETALL returns a flat array [k1,v1,k2,v2,...]
        if (Array.isArray(v)) {
          const out: Record<string, string> = {};
          for (let i = 0; i < v.length; i += 2) out[String(v[i])] = String(v[i + 1]);
          return out;
        }
        return null;
      } catch (e: any) {
        throw new Error('KV storage connection failed: ' + (e?.message || 'unknown error') + '. Check KV_REST_API_URL and KV_REST_API_TOKEN in Vercel env vars.');
      }
    },
    async hdel(hash, ...fields) {
      try {
        if (fields.length) await cmd('HDEL', hash, ...fields);
      } catch (e: any) {
        throw new Error('KV storage connection failed: ' + (e?.message || 'unknown error') + '. Check KV_REST_API_URL and KV_REST_API_TOKEN in Vercel env vars.');
      }
    },
    pipeline() {
      // Upstash supports pipelining via a single body with an array, but for
      // simplicity we just queue and execute sequentially here.
      const pending: Array<() => Promise<void>> = [];
      return {
        hset(hash, map) {
          pending.push(() => makeUpstashHset(hash, map));
        },
        async exec() {
          for (const p of pending) await p();
        },
      };
    },
  };
}

async function makeUpstashHset(hash: string, map: Record<string, string>): Promise<void> {
  const url = (process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || '').replace(/\/$/, '');
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || '';
  const args: unknown[] = [hash];
  for (const [k, v] of Object.entries(map)) args.push(k, v);
  const res = await fetch(`${url}/HSET`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  });
  if (!res.ok) throw new Error('KV storage connection failed (HSET): ' + (await res.text()) + '. Check KV_REST_API_URL and KV_REST_API_TOKEN in Vercel env vars.');
}

// ---- In-memory fallback (for local/dev without KV) ----
function makeMemory(): KV {
  const scalars = new Map<string, string>();
  const hashes = new Map<string, Record<string, string>>();
  const warn = () => {
    if (!(globalThis as any).__cr_kv_warned__) {
      (globalThis as any).__cr_kv_warned__ = true;
      console.warn('[clinical-rx] KV not configured (missing KV_REST_API_URL / KV_REST_API_TOKEN). Using in-memory storage — data will NOT persist across restarts. Set these env vars to enable real cloud sync.');
    }
  };
  return {
    async get(key) {
      return scalars.get(key) ?? null;
    },
    async set(key, value) {
      warn();
      scalars.set(key, value);
    },
    async hget(hash, field) {
      return hashes.get(hash)?.[field] ?? null;
    },
    async hset(hash, map) {
      warn();
      const cur = hashes.get(hash) ?? {};
      Object.assign(cur, map);
      hashes.set(hash, cur);
    },
    async hgetall(hash) {
      return hashes.get(hash) ?? null;
    },
    async hdel(hash, ...fields) {
      const cur = hashes.get(hash);
      if (cur) for (const f of fields) delete cur[f];
    },
    pipeline() {
      warn();
      const pending: Array<[string, Record<string, string>]> = [];
      return {
        hset(hash, map) {
          pending.push([hash, map]);
        },
        async exec() {
          for (const [hash, map] of pending) {
            const cur = hashes.get(hash) ?? {};
            Object.assign(cur, map);
            hashes.set(hash, cur);
          }
        },
      };
    },
  };
}

export function storage(): KV {
  const hasUrl = !!(process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL);
  const hasToken = !!(process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN);
  if (hasUrl && hasToken) {
    try {
      return makeUpstash();
    } catch (e: any) {
      console.warn('[clinical-rx] Upstash init failed, falling back to in-memory: ' + (e?.message || e));
    }
  }
  return makeMemory();
}

// Lazy store: resolve on first access so there's no module-load side effect.
let _store: KV | null = null;
export const store: KV = new Proxy({} as KV, {
  get(_t, prop: string) {
    if (!_store) _store = storage();
    return (_store as any)[prop];
  },
});
