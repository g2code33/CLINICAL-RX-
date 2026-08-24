/**
 * 🔐 API KEY VAULT (renderer side)
 *
 * Rules enforced here:
 *   - a key is NEVER written to localStorage
 *   - a key is NEVER stored in the SQLite records
 *   - a key is NEVER held in React state beyond the moment of entry
 *   - a key is NEVER in source control
 *
 * On desktop, keys go into OS credential storage through `secret:*` IPC and
 * can only be decrypted by the main process. The renderer can check that a key
 * exists and see a masked hint — nothing more.
 *
 * In the browser build there is no OS keychain, so keys are held in memory for
 * the session only and the UI says so plainly.
 */

const bridge = (): any => (typeof window !== 'undefined' ? (window as any).clinicalRx : undefined);

export function isDesktop(): boolean {
  return !!bridge()?.secrets;
}

/** Session-only fallback for the web build. Cleared when the tab closes. */
const sessionKeys = new Map<string, string>();

export interface KeyStatus {
  present: boolean;
  hint?: string;
  /** 'os' = OS credential storage, 'session' = memory only, 'none' = unavailable. */
  storage: 'os' | 'session' | 'none';
}

function account(moduleKey: string): string {
  return `ai:${moduleKey}`;
}

export async function secureStorageAvailable(): Promise<boolean> {
  const b = bridge();
  if (!b?.secrets) return false;
  try {
    return await b.secrets.available();
  } catch {
    return false;
  }
}

/** Save a key. Returns where it ended up so the UI can be honest about it. */
export async function setApiKey(moduleKey: string, value: string): Promise<KeyStatus> {
  const b = bridge();
  if (b?.secrets && (await secureStorageAvailable())) {
    await b.secrets.set(account(moduleKey), value);
    return getKeyStatus(moduleKey);
  }
  if (value.trim()) sessionKeys.set(moduleKey, value);
  else sessionKeys.delete(moduleKey);
  return {
    present: !!value.trim(),
    hint: value.trim() ? `••••${value.trim().slice(-4)}` : undefined,
    storage: value.trim() ? 'session' : 'none',
  };
}

export async function getKeyStatus(moduleKey: string): Promise<KeyStatus> {
  const b = bridge();
  if (b?.secrets) {
    try {
      const s = await b.secrets.status(account(moduleKey));
      if (s?.present) return { present: true, hint: s.hint, storage: 'os' };
    } catch {
      /* fall through */
    }
  }
  const mem = sessionKeys.get(moduleKey);
  if (mem) return { present: true, hint: `••••${mem.slice(-4)}`, storage: 'session' };
  return { present: false, storage: isDesktop() ? 'os' : 'session' };
}

export async function removeApiKey(moduleKey: string): Promise<void> {
  void import('./auditLog').then((m) => m.audit('ai.key-removed')).catch(() => {});
  const b = bridge();
  if (b?.secrets) {
    try {
      await b.secrets.remove(account(moduleKey));
    } catch {
      /* ignore */
    }
  }
  sessionKeys.delete(moduleKey);
}

/**
 * Retrieve a key for an outbound request.
 *
 * On desktop this returns null by design — the key stays in the main process
 * and requests are proxied via `aiFetchWithKey()`. In the web build it returns
 * the session-only value because there is no main process to proxy through.
 */
export function getKeyForRequest(moduleKey: string): string | null {
  return sessionKeys.get(moduleKey) ?? null;
}

/**
 * Perform an AI HTTP call with the stored key injected in the MAIN process.
 * Put the literal `{{KEY}}` placeholder in a header value; it is substituted
 * where the plaintext lives and never travels back to the renderer.
 */
export async function aiFetchWithKey(
  moduleKey: string,
  url: string,
  init: { method?: string; headers?: Record<string, string>; body?: string }
): Promise<{ ok: boolean; status?: number; body?: string; error?: string }> {
  const b = bridge();
  if (!b?.secrets?.aiFetch) return { ok: false, error: 'Secure request bridge unavailable.' };
  return b.secrets.aiFetch(account(moduleKey), url, init);
}

/** Which module keys currently have a stored secret. */
export async function storedKeyModules(): Promise<string[]> {
  const b = bridge();
  if (b?.secrets?.list) {
    try {
      const list: string[] = await b.secrets.list();
      return list.map((a) => a.replace(/^ai:/, ''));
    } catch {
      /* ignore */
    }
  }
  return [...sessionKeys.keys()];
}

/**
 * One-time migration: move any plaintext key already sitting in settings into
 * the vault, then blank the stored field so it stops being persisted.
 */
export async function migratePlaintextKeys(
  settingsAi: Record<string, { apiKey?: string }> | undefined,
  writeBack: (moduleKey: string) => void
): Promise<number> {
  if (!settingsAi || !(await secureStorageAvailable())) return 0;
  let moved = 0;
  for (const [moduleKey, cfg] of Object.entries(settingsAi)) {
    const key = cfg?.apiKey?.trim();
    if (!key) continue;
    await setApiKey(moduleKey, key);
    writeBack(moduleKey);
    moved++;
  }
  return moved;
}
