import { useData } from '../stores/data';
import { syncClient } from './syncClient';
import type { AiModuleConfig } from '../types';

function acct() {
  return useData.getState().settings?.onlineAccount;
}

/**
 * 🔐 API KEY SYNC — ENABLED per explicit user request (2026-09-28).
 *
 * The previous version deliberately stripped apiKey/localModel before sync.
 * The user's standing instruction is: "cloud login must bring back everything
 * in the cloud including API keys." apiKey is therefore synced and rehydrated
 * on every login and every app start when connected.
 *
 * localModel is still stripped: it points to a local file path on a specific
 * device and is meaningless on another machine.
 *
 * Security model:
 *  - On Electron desktop, keys additionally live in OS keychain (safeStorage)
 *    via the preload bridge. After a cloud pull, any apiKey received is
 *    re-stashed in the OS keychain automatically, so a new device / reinstall
 *    gets the same key without the user retyping it.
 *  - On web, keys are held in memory only (existing sessionKeys Map) so
 *    closing the tab clears them — but they repopulate from the cloud on the
 *    next sign-in.
 *  - Keys are never logged by the app.
 */

const DEVICE_ONLY_FIELDS = ['localModel'] as const;

type AiConfigMap = Record<string, AiModuleConfig>;

/** Strip only fields that are truly device-specific (local model paths). */
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
 * Merge a cloud config over the local one. For every module, cloud's fields
 * win, EXCEPT device-only fields (local model paths) which stay local.
 * Unknown future fields present locally but absent in cloud are retained.
 */
function mergeAll(local: AiConfigMap, cloud: AiConfigMap): AiConfigMap {
  const merged: AiConfigMap = { ...local };
  for (const [key, remote] of Object.entries(cloud)) {
    const mine = local[key];
    merged[key] = {
      ...(merged[key] ?? ({} as AiModuleConfig)),
      ...remote,
      // Device-only fields always come from this device — never from cloud.
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
 * After we've merged cloud → local, re-stash any apiKeys in the OS keychain
 * (desktop) or the web session map so the AI subsystem can find them. We
 * fire-and-forget this; aiSecrets will pick them up on the next call.
 */
async function rehydrateKeys(aiConfig: AiConfigMap): Promise<void> {
  try {
    const secretsMod = await import('./aiSecrets');
    for (const [moduleKey, cfg] of Object.entries(aiConfig)) {
      const key = (cfg as any)?.apiKey;
      if (typeof key === 'string' && key.trim()) {
        try { await secretsMod.setApiKey(moduleKey, key); } catch { /* ignore per-module */ }
      }
    }
  } catch { /* secrets module unavailable — non-fatal */ }
}

/**
 * Two-way AI config sync with the cloud account.
 *
 * - Cloud has a config  → merge it over the local one (including apiKeys),
 *   then rehydrate OS-keychain / session keys.
 * - Cloud has nothing   -> seed it with the local config.
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
    const merged = mergeAll(settings.ai ?? {}, cloud as AiConfigMap);
    await useData.getState().saveSettings({ ...settings, updatedAt: Date.now(), ai: merged });
    await rehydrateKeys(merged);
    return { pulled: true, pushed: false };
  }

  // Nothing in the cloud yet — seed it with the local config (keys included).
  const save = await syncClient.saveAiConfig(a.backendUrl, a.token, stripDeviceSecrets(settings.ai));
  return { pulled: false, pushed: save.ok };
}

/** Push the current local AI config to the cloud. Returns success. */
export async function pushAiConfig(): Promise<boolean> {
  const a = acct();
  const settings = useData.getState().settings;
  if (!a?.connected || !a.token || !settings) return false;
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
