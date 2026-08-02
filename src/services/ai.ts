import type { AiModuleConfig } from '../types';

export type AiResult = { ok: true; text: string } | { ok: false; error: string };

function baseUrlFor(cfg: AiModuleConfig): string {
  if (cfg.provider === 'anthropic') return 'https://api.anthropic.com';
  if (cfg.provider === 'openrouter') return 'https://openrouter.ai/api';
  if (cfg.baseUrl) return cfg.baseUrl.replace(/\/$/, '');
  return 'https://api.openai.com';
}

function headersFor(cfg: AiModuleConfig): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (cfg.provider === 'anthropic') {
    headers['x-api-key'] = cfg.apiKey;
    headers['anthropic-version'] = '2023-06-01';
  } else {
    headers.Authorization = `Bearer ${cfg.apiKey}`;
  }
  return headers;
}

// OpenAI-compatible chat completion. Anthropic is mapped onto its messages API.
export async function aiChat(cfg: AiModuleConfig, system: string, user: string): Promise<AiResult> {
  if (!cfg.enabled) return { ok: false, error: 'This AI module is disabled in Settings.' };
  if (!cfg.apiKey) return { ok: false, error: 'No API key configured for this AI module. Add one in Settings → AI.' };

  try {
    if (cfg.provider === 'anthropic') {
      const res = await fetch(`${baseUrlFor(cfg)}/v1/messages`, {
        method: 'POST',
        headers: headersFor(cfg),
        body: JSON.stringify({
          model: cfg.model || 'claude-3-5-sonnet-latest',
          max_tokens: 2000,
          system,
          messages: [{ role: 'user', content: user }],
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
      const data = await res.json();
      const text = data?.content?.[0]?.text ?? '';
      return { ok: true, text };
    }

    const res = await fetch(`${baseUrlFor(cfg)}/v1/chat/completions`, {
      method: 'POST',
      headers: headersFor(cfg),
      body: JSON.stringify({
        model: cfg.model || 'gpt-4o-mini',
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content ?? '';
    return { ok: true, text };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'AI request failed. Check your connection and API key.' };
  }
}
