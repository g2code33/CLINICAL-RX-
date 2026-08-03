import { useData } from '../stores/data';
import { syncClient } from './syncClient';

function acct() {
  return useData.getState().settings?.onlineAccount;
}

export interface AiSyncResult {
  pulled: boolean;
  pushed: boolean;
}

/**
 * Two-way AI config sync with the cloud account.
 *
 * - Cloud has a config  -> merge it over the local one. Cloud wins per-module,
 *   but modules the cloud doesn't know about are kept locally, so nothing the
 *   user configured is ever wiped.
 * - Cloud has nothing   -> seed it with the local config, so a fresh login on
 *   another device still gets the keys.
 *
 * Called on login, on manual "Sync now", and once at app start when connected.
 */
export async function syncAiConfig(): Promise<AiSyncResult> {
  const a = acct();
  if (!a?.connected || !a.token) return { pulled: false, pushed: false };

  const res = await syncClient.getAiConfig(a.backendUrl, a.token);
  if (!res.ok) return { pulled: false, pushed: false };
  const cloud = res.data?.aiConfig;
  const settings = useData.getState().settings;
  if (!settings) return { pulled: false, pushed: false };

  if (cloud && typeof cloud === 'object' && !Array.isArray(cloud)) {
    // Cloud is the source of truth, but keep local-only modules.
    const merged = { ...(settings.ai ?? {}), ...cloud };
    await useData.getState().saveSettings({ ...settings, updatedAt: Date.now(), ai: merged });
    return { pulled: true, pushed: false };
  }

  // Nothing in the cloud yet — seed it with the local config (backup).
  const save = await syncClient.saveAiConfig(a.backendUrl, a.token, settings.ai ?? {});
  return { pulled: false, pushed: save.ok };
}

/** Push the current local AI config to the cloud. Returns success. */
export async function pushAiConfig(): Promise<boolean> {
  const a = acct();
  const settings = useData.getState().settings;
  if (!a?.connected || !a.token || !settings) return false;
  const res = await syncClient.saveAiConfig(a.backendUrl, a.token, settings.ai ?? {});
  return res.ok;
}

/**
 * Debounced push for Settings edits (typing an API key, toggling providers…).
 * Rapid edits collapse into a single request; the last edit always wins.
 */
let pushTimer: ReturnType<typeof setTimeout> | null = null;
export function queuePushAiConfig(delayMs = 800): void {
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    pushTimer = null;
    pushAiConfig().catch(() => {});
  }, delayMs);
}

/** Back-compat alias. */
export async function pullAiConfig(): Promise<AiSyncResult> {
  return syncAiConfig();
}
