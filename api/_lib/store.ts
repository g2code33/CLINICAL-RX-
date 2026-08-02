// Unified storage layer for the API.
//
// - If Vercel KV env vars are set (KV_REST_API_URL + KV_REST_API_TOKEN), it uses
//   Upstash Redis (the deployed backend).
// - If not (e.g. local testing without KV configured), it falls back to an
//   in-memory store so auth/sync still work for a single process. Data is not
//   persistent across restarts in fallback mode — a clear warning is logged.

interface KV {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  hget(hash: string, field: string): Promise<string | null>;
  hset(hash: string, map: Record<string, string>): Promise<void>;
  hgetall(hash: string): Promise<Record<string, string> | null>;
  hdel(hash: string, ...fields: string[]): Promise<void>;
  pipeline(): { hset(hash: string, map: Record<string, string>): void; exec(): Promise<void> };
}

// ---- Upstash Redis implementation ----
function makeUpstash(): KV {
  const { Redis } = require('@upstash/redis');
  const redis = Redis.fromEnv();
  return {
    async get(key) {
      return (await redis.get(key)) ?? null;
    },
    async set(key, value) {
      await redis.set(key, value);
    },
    async hget(hash, field) {
      return (await redis.hget(hash, field)) ?? null;
    },
    async hset(hash, map) {
      await redis.hset(hash, map);
    },
    async hgetall(hash) {
      return (await redis.hgetall(hash)) ?? null;
    },
    async hdel(hash, ...fields) {
      await redis.hdel(hash, ...fields);
    },
    pipeline() {
      const p = redis.pipeline();
      return {
        hset(hash, map) {
          p.hset(hash, map);
        },
        async exec() {
          await p.exec();
        },
      };
    },
  };
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

export const store = storage();
