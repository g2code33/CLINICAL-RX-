import { useData } from '../stores/data';
import { syncClient } from './syncClient';
import type { AiModuleConfig } from '../types';

function acct() {
  return useData.getState().settings?.onlineAccount;
}

/**
 * 🔐 API KEYS ARE NEVER SYNCHRONISED (Phase 7 §36).
 *
 * An API key belongs to the DEVICE, not the account. Configuring Clinical AI
 * on a desktop must never hand that key to a phone that later signs in.
 *
 * These fields are stripped before anything leaves the device, and stripped
 * again on the way back in so a legacy cloud document containing a key can
 * never re-populate a local one.
 */
const DEVICE_ONLY_FIELDS = ['apiKey', 'localModel'] as const;

type AiConfigMap = Record<string, AiModuleConfig>;

/** Remove device-only secrets from an AI config map. */
export function stripDeviceSecrets(config: AiConfigMap | undefined): AiConfigMap {
  const out: AiConfigMap = {};
  for (const [key, cfg] of Object.entries(config ?? {})) {
    if (!cfg || typeof cfg !== 'object') continue;
    const clean: any = { ...cfg };
    for (const f of DEVICE_ONLY_FIELDS) delete clean[f];
    out[key] = clean;
  }
  return out;
}

/**
 * Merge a cloud config over the local one WITHOUT touching this device's
 * secrets. Cloud owns shareable preferences (provider, model, temperature,
 * mode, instructions); the device keeps its own key and local model.
 */
function mergePreservingSecrets(local: AiConfigMap, cloud: AiConfigMap): AiConfigMap {
  const merged: AiConfigMap = { ...local };
  for (const [key, remote] of Object.entries(stripDeviceSecrets(cloud))) {
    const mine = local[key];
    merged[key] = {
      ...(mine ?? ({} as AiModuleConfig)),
      ...remote,
      // This device's secrets always win — they are never in `remote` anyway.
      apiKey: mine?.apiKey ?? '',
      localModel: mine?.localModel,
    } as AiModuleConfig;
  }
  return merged;
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
    // Cloud owns shareable preferences; this device keeps its own API keys.
    const merged = mergePreservingSecrets(settings.ai ?? {}, cloud as AiConfigMap);
    await useData.getState().saveSettings({ ...settings, updatedAt: Date.now(), ai: merged });
    return { pulled: true, pushed: false };
  }

  // Nothing in the cloud yet — seed it with the local PREFERENCES only.
  const save = await syncClient.saveAiConfig(a.backendUrl, a.token, stripDeviceSecrets(settings.ai));
  return { pulled: false, pushed: save.ok };
}

/** Push the current local AI config to the cloud. Returns success. */
export async function pushAiConfig(): Promise<boolean> {
  const a = acct();
  const settings = useData.getState().settings;
  if (!a?.connected || !a.token || !settings) return false;
  // Preferences only — never the key.
  const res = await syncClient.saveAiConfig(a.backendUrl, a.token, stripDeviceSecrets(settings.ai));
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
