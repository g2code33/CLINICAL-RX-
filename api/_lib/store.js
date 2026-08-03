function makeUpstash() {
  const url = (process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || '').replace(/\/$/, '');
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || '';

  async function cmd(...parts) {
    const res = await fetch(`${url}/${parts[0]}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(parts.slice(1)),
    });
    if (!res.ok) throw new Error(`KV REST error ${res.status}: ${await res.text()}`);
    const data = await res.json();
    if (data && data.error) throw new Error('KV error: ' + data.error);
    return data?.result;
  }

  return {
    async get(key) { try { return (await cmd('GET', key)) ?? null; } catch (e) { throw new Error('KV storage connection failed: ' + e.message); } },
    async set(key, value) { try { await cmd('SET', key, value); } catch (e) { throw new Error('KV storage connection failed: ' + e.message); } },
    async hget(hash, field) { try { return (await cmd('HGET', hash, field)) ?? null; } catch (e) { throw new Error('KV storage connection failed: ' + e.message); } },
    async hset(hash, map) { try { const args = [hash]; for (const [k, v] of Object.entries(map)) args.push(k, v); await cmd('HSET', ...args); } catch (e) { throw new Error('KV storage connection failed: ' + e.message); } },
    async hgetall(hash) { try { const v = await cmd('HGETALL', hash); if (!v) return null; if (Array.isArray(v)) { const out = {}; for (let i = 0; i < v.length; i += 2) out[String(v[i])] = String(v[i + 1]); return out; } return null; } catch (e) { throw new Error('KV storage connection failed: ' + e.message); } },
    async hdel(hash, ...fields) { try { if (fields.length) await cmd('HDEL', hash, ...fields); } catch (e) { throw new Error('KV storage connection failed: ' + e.message); } },
  };
}

function makeMemory() {
  const scalars = new Map();
  const hashes = new Map();
  const warn = () => { if (!globalThis.__cr_kv_warned__) { globalThis.__cr_kv_warned__ = true; console.warn('[clinical-rx] KV not configured. Using in-memory storage.'); } };
  return {
    async get(key) { return scalars.get(key) ?? null; },
    async set(key, value) { warn(); scalars.set(key, value); },
    async hget(hash, field) { return hashes.get(hash)?.[field] ?? null; },
    async hset(hash, map) { warn(); const cur = hashes.get(hash) ?? {}; Object.assign(cur, map); hashes.set(hash, cur); },
    async hgetall(hash) { return hashes.get(hash) ?? null; },
    async hdel(hash, ...fields) { const cur = hashes.get(hash); if (cur) for (const f of fields) delete cur[f]; },
  };
}

function storage() {
  const hasUrl = !!(process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL);
  const hasToken = !!(process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN);
  if (hasUrl && hasToken) { try { return makeUpstash(); } catch (e) { console.warn('[clinical-rx] Upstash init failed, falling back to in-memory: ' + e.message); } }
  return makeMemory();
}

let _store = null;
const store = new Proxy({}, {
  get(_t, prop) { if (!_store) _store = storage(); return _store[prop]; },
});

module.exports = { store, storage };
