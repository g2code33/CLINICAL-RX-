import { useData } from '../stores/data';
import { syncClient } from './syncClient';

function acct() {
  return useData.getState().settings?.onlineAccount;
}

/** Pull the cloud AI config and apply it to local settings (called on login). */
export async function pullAiConfig(): Promise<void> {
  const a = acct();
  if (!a?.connected || !a.token) return;
  const res = await syncClient.getAiConfig(a.backendUrl, a.token);
  if (res.ok && res.data?.aiConfig) {
    const settings = useData.getState().settings;
    if (settings) {
      await useData.getState().saveSettings({ ...settings, updatedAt: Date.now(), ai: res.data.aiConfig });
    }
  }
}

/** Push the local AI config to the cloud (called when AI settings change). */
export async function pushAiConfig(): Promise<void> {
  const a = acct();
  const settings = useData.getState().settings;
  if (!a?.connected || !a.token || !settings) return;
  await syncClient.saveAiConfig(a.backendUrl, a.token, settings.ai);
}
