/**
 * 🔐 API KEY VAULT (renderer side)
 *
 * Storage hierarchy:
 *   - Desktop: OS credential store (safeStorage via `secret:*` IPC) is the
 *     primary local location; keys are ALSO persisted into settings.ai so
 *     cloud sign-in can restore them across installs/devices (per the
 *     user's explicit requirement: "cloud login must bring back everything
 *     in the cloud including API keys").
 *   - Web: sessionKeys Map for the current tab (so the key never hits
 *     localStorage/sessionStorage), mirrored into settings.ai for cloud sync.
 *   - NEVER written to localStorage; NEVER logged; NEVER in source control.
 *
 * The renderer can ask whether a key exists and see a masked hint. Outbound
 * AI requests on desktop are proxied through the main process (where the
 * plaintext lives) via `aiFetchWithKey`, so the key never travels back to
 * the renderer after entry.
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

/**
 * Persist the key into settings.ai so cloud sync has a copy to back up /
 * restore. Fire-and-forget; settings errors never break key entry.
 */
async function persistToSettings(moduleKey: string, value: string): Promise<void> {
  try {
    const { useData } = await import('../stores/data');
    const st = useData.getState();
    const ai = { ...(st.settings?.ai ?? {}) };
    const existing = (ai as any)[moduleKey] ?? {};
    (ai as any)[moduleKey] = { ...existing, apiKey: value };
    if (st.settings) {
      await st.saveSettings({ ...st.settings, updatedAt: Date.now(), ai });
    }
    // Kick a cloud push (debounced) so the key reaches the server promptly.
    import('./aiConfigSync').then((m) => m.queuePushAiConfig(1500)).catch(() => {});
  } catch {
    /* never break saveKey */
  }
}

/** Save a key. Returns where it ended up so the UI can be honest about it. */
export async function setApiKey(moduleKey: string, value: string): Promise<KeyStatus> {
  const trimmed = value.trim();
  const b = bridge();
  let stored: KeyStatus['storage'] = 'none';
  if (b?.secrets && (await secureStorageAvailable())) {
    await b.secrets.set(account(moduleKey), trimmed);
    stored = 'os';
  } else {
    if (trimmed) sessionKeys.set(moduleKey, trimmed);
    else sessionKeys.delete(moduleKey);
    stored = trimmed ? 'session' : 'none';
  }
  // Always mirror into settings.ai for cloud sync.
  if (trimmed) await persistToSettings(moduleKey, trimmed);
  return {
    present: !!trimmed,
    hint: trimmed ? `••••${trimmed.slice(-4)}` : undefined,
    storage: stored,
  };
}

export async function getKeyStatus(moduleKey: string): Promise<KeyStatus> {
  const b = bridge();
  if (b?.secrets) {
    try {
      const s = await b.secrets.status(account(moduleKey));
      if (s?.present) {
        // OS keychain has the key — pull the plaintext back over the bridge
        // (secret:get is restricted to ai:* accounts) so sync callers like
        // getKeyForRequest() can read it. This is what lets pre-v1.11.20
        // desktop installs keep working without the user retyping keys.
        if (b.secrets.get && !sessionKeys.has(moduleKey)) {
          try {
            const plain = await b.secrets.get(account(moduleKey));
            if (typeof plain === 'string' && plain.trim()) sessionKeys.set(moduleKey, plain.trim());
          } catch { /* ignore */ }
        }
        return { present: true, hint: s.hint, storage: 'os' };
      }
    } catch { /* fall through */ }
  }
  const mem = sessionKeys.get(moduleKey);
  if (mem) return { present: true, hint: `••••${mem.slice(-4)}`, storage: 'session' };
  // Fallback: check settings.ai for a cloud-restored key (present after sign-in
  // on a device where we haven't yet had the user re-type it). If found,
  // re-hydrate the OS/session store and return present.
  try {
    const { useData } = await import('../stores/data');
    const cfg = (useData.getState().settings?.ai as any)?.[moduleKey];
    const cloudKey = typeof cfg?.apiKey === 'string' ? cfg.apiKey.trim() : '';
    if (cloudKey) {
      // Rehydrate silently into OS/session storage and return present.
      if (b?.secrets && (await secureStorageAvailable())) {
        await b.secrets.set(account(moduleKey), cloudKey);
      } else {
        sessionKeys.set(moduleKey, cloudKey);
      }
      return { present: true, hint: `••••${cloudKey.slice(-4)}`, storage: b?.secrets ? 'os' : 'session' };
    }
  } catch { /* ignore */ }
  return { present: false, storage: isDesktop() ? 'os' : 'session' };
}

export async function removeApiKey(moduleKey: string): Promise<void> {
  void import('./auditLog').then((m) => m.audit('ai.key-removed')).catch(() => {});
  const b = bridge();
  if (b?.secrets) {
    try { await b.secrets.remove(account(moduleKey)); } catch { /* ignore */ }
  }
  sessionKeys.delete(moduleKey);
  // Clear from settings.ai too (and push the change to cloud).
  try {
    const { useData } = await import('../stores/data');
    const st = useData.getState();
    const ai = { ...(st.settings?.ai ?? {}) };
    if ((ai as any)[moduleKey]) {
      (ai as any)[moduleKey] = { ...(ai as any)[moduleKey], apiKey: '' };
      if (st.settings) await st.saveSettings({ ...st.settings, updatedAt: Date.now(), ai });
      import('./aiConfigSync').then((m) => m.queuePushAiConfig(1500)).catch(() => {});
    }
  } catch { /* ignore */ }
}

/**
 * Retrieve a key for an outbound request. Looks in (priority order):
 *   1. In-memory sessionKeys (web + post-rehydrate desktop)
 *   2. settings.ai.<module>.apiKey (cloud-synced / newly-saved keys)
 *   3. On desktop: OS keychain via secret:get IPC (legacy keys saved
 *      pre-v1.11.20, when apiKey was NOT written to settings).
 *
 * Returned value (if any) is suitable for use directly in Authorization /
 * x-api-key headers. Callers should await this BEFORE building the request.
 */
export async function resolveKey(moduleKey: string): Promise<string | null> {
  const mem = sessionKeys.get(moduleKey);
  if (mem) return mem;
  // settings.ai
  try {
    const { useData } = await import('../stores/data');
    const cfg = (useData.getState().settings?.ai as any)?.[moduleKey];
    const fromSettings = typeof cfg?.apiKey === 'string' ? cfg.apiKey.trim() : '';
    if (fromSettings) {
      sessionKeys.set(moduleKey, fromSettings);
      return fromSettings;
    }
  } catch { /* ignore */ }
  // Desktop OS keychain (legacy keys saved before v1.11.20).
  const b = bridge();
  if (b?.secrets?.get) {
    try {
      const v = await b.secrets.get(account(moduleKey));
      if (typeof v === 'string' && v.trim()) {
        sessionKeys.set(moduleKey, v);
        return v;
      }
    } catch { /* ignore */ }
  }
  return null;
}

/**
 * Retrieve a key for an outbound request (web build only).
 *
 * On desktop this returns null synchronously — callers must await
 * resolveKey() instead. In the web build it returns the session-only
 * value, or (after a cloud sync) the value from settings.ai.
 */
export async function getKeyForRequestAsync(moduleKey: string): Promise<string | null> {
  return resolveKey(moduleKey);
}

/** Synchronous version — returns only session-held keys (used by callers that
 *  cannot await; they will miss OS-keychain / cloud-restored keys until the
 *  next async tick). Prefer resolveKey() at actual request time. */
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
  const found = new Set<string>();
  if (b?.secrets?.list) {
    try {
      const list: string[] = await b.secrets.list();
      list.forEach((a) => found.add(a.replace(/^ai:/, '')));
    } catch { /* ignore */ }
  }
  sessionKeys.forEach((_, k) => found.add(k));
  try {
    const { useData } = await import('../stores/data');
    const ai = (useData.getState().settings?.ai ?? {}) as Record<string, any>;
    for (const [k, v] of Object.entries(ai)) if (v?.apiKey) found.add(k);
  } catch { /* ignore */ }
  return [...found];
}
