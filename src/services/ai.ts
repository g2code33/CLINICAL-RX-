import type { AiModuleConfig } from '../types';

export type AiResult = { ok: true; text: string } | { ok: false; error: string };

export interface AiHistoryItem {
  role: 'user' | 'assistant';
  content: string;
  images?: string[];
}

export interface AiChatOpts {
  /** Called with each streamed token. When provided, the response is streamed. */
  onToken?: (token: string) => void;
  /** Prior messages in the current conversation (same section), most recent last. */
  history?: AiHistoryItem[];
  /** Images (data URLs) attached to the CURRENT user message (AI vision). */
  images?: string[];
  /** Cap on generated tokens (default 1400). */
  maxTokens?: number;
  /** Sampling temperature (default 0.7). */
  temperature?: number;
  /** Abort after this many ms (default 120_000). */
  timeoutMs?: number;
}

function baseUrlFor(cfg: AiModuleConfig): string {
  if (cfg.provider === 'anthropic') return 'https://api.anthropic.com';
  if (cfg.provider === 'openrouter') return 'https://openrouter.ai/api';
  if (cfg.provider === 'nvidia') return 'https://integrate.api.nvidia.com';
  if (cfg.baseUrl) return cfg.baseUrl.replace(/\/$/, '');
  return 'https://api.openai.com';
}

function defaultModelFor(cfg: AiModuleConfig): string {
  if (cfg.provider === 'nvidia') return 'meta/llama-3.3-70b-instruct';
  if (cfg.provider === 'anthropic') return 'claude-3-5-sonnet-latest';
  if (cfg.provider === 'openrouter') return 'openai/gpt-4o-mini';
  return 'gpt-4o-mini';
}

function friendlyNetworkError(e: any, host: string): string {
  const msg = e?.message || 'network error';
  if (msg.includes('Failed to fetch') || msg.includes('NetworkError') || msg.includes('load failed')) {
    return `Could not reach ${host}. This usually means your network/ISP is blocking the AI provider, you're offline, or the provider doesn't allow browser (CORS) calls. Check your connection and try again, or switch provider in Settings → AI.`;
  }
  return `AI request failed: ${msg}`;
}

function friendlyHttpError(status: number, body: string, host: string): string {
  const snippet = (body || '').slice(0, 300);
  if (status === 401) return `Invalid API key (401) for ${host}. Check the key in Settings → AI.`;
  if (status === 403) return `Access denied (403) by ${host}. The key may be restricted or the region blocked.`;
  if (status === 404) return `Not found (404) at ${host}. Check the provider's base URL / model name.`;
  if (status === 429) return `Rate limit hit (429) at ${host}. Wait a moment and try again.`;
  if (status === 400) return `Bad request (400) from ${host}: ${snippet || 'check the model name in Settings → AI.'}`;
  return `HTTP ${status} from ${host}: ${snippet}`;
}

/** Consume an SSE stream and call onJson for every `data:` payload. */
async function readSse(res: Response, onJson: (json: any) => void): Promise<void> {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, idx).trim();
      buf = buf.slice(idx + 1);
      if (!line.startsWith('data:')) continue;
      const data = line.slice(5).trim();
      if (data === '[DONE]') return;
      try { onJson(JSON.parse(data)); } catch { /* partial chunk */ }
    }
  }
}

type TryResult = { ok: true; text: string; status?: number } | { ok: false; error: string; status?: number };

/** Build OpenAI-style multimodal content array from text + image data URLs. */
function openAiContent(text: string, images?: string[]): any[] {
  const parts: any[] = [{ type: 'text', text }];
  for (const img of images ?? []) {
    if (typeof img === 'string' && img.startsWith('data:')) {
      parts.push({ type: 'image_url', image_url: { url: img } });
    }
  }
  return parts;
}

/** Build Anthropic-style multimodal content array from text + image data URLs. */
function anthropicContent(text: string, images?: string[]): any[] {
  const parts: any[] = [{ type: 'text', text }];
  for (const img of images ?? []) {
    const m = /^data:(image\/[a-z+]+);base64,([A-Za-z0-9+/=]+)$/.exec(img);
    if (m) parts.push({ type: 'image', source: { type: 'base64', media_type: m[1], data: m[2] } });
  }
  return parts;
}

/** Convert an AiHistoryItem into the content payload for the target API. */
function historyContent(item: AiHistoryItem, anthropic: boolean): string | any[] {
  if (!item.images || !item.images.length) return item.content;
  return anthropic ? anthropicContent(item.content, item.images) : openAiContent(item.content, item.images);
}

/**
 * OpenAI-compatible chat completion (Anthropic mapped onto its messages API).
 * Supports streaming (opts.onToken) for a much faster perceived response.
 * If a provider rejects "stream": true, retries once without streaming.
 */
export async function aiChat(cfg: AiModuleConfig, system: string, user: string, opts: AiChatOpts = {}): Promise<AiResult> {
  if (!cfg.enabled) return { ok: false, error: 'This AI module is disabled in Settings.' };
  if (!cfg.apiKey) return { ok: false, error: 'No API key configured for this AI module. Add one in Settings → AI.' };

  const apiKey = cfg.apiKey.trim();
  if (!apiKey) return { ok: false, error: 'API key looks empty — add one in Settings → AI.' };

  const model = (cfg.model || defaultModelFor(cfg)).trim() || defaultModelFor(cfg);
  const maxTokens = opts.maxTokens ?? 1400;
  const temperature = opts.temperature ?? 0.7;
  const timeoutMs = opts.timeoutMs ?? 120000;
  const history = opts.history ?? [];
  const stream = !!opts.onToken;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const host = baseUrlFor(cfg);

  const cleanup = () => clearTimeout(timer);

  const tryOnce = async (useStream: boolean): Promise<TryResult | null> => {
    if (cfg.provider === 'anthropic') {
      const res = await fetch(`${host}/v1/messages`, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model,
          max_tokens: maxTokens,
          temperature,
          system,
          messages: [
            ...history.map((h) => ({ role: h.role, content: historyContent(h, true) })),
            { role: 'user', content: anthropicContent(user, opts.images) },
          ],
          stream: useStream,
        }),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        return { ok: false, error: friendlyHttpError(res.status, body, host), status: res.status };
      }
      if (useStream && !res.body) return null; // can't stream -> fall back
      if (useStream) {
        let text = '';
        await readSse(res, (json) => {
          if (json?.type === 'content_block_delta' && json.delta?.text) {
            text += json.delta.text;
            opts.onToken!(json.delta.text);
          }
        });
        return { ok: true, text };
      }
      const data = await res.json();
      return { ok: true, text: data?.content?.[0]?.text ?? '' };
    }

    // OpenAI-compatible endpoints (openai / openrouter / nvidia / custom)
    const res = await fetch(`${host}/v1/chat/completions`, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model,
          max_tokens: maxTokens,
          temperature,
          messages: [
            { role: 'system', content: system },
            ...history.map((h) => ({ role: h.role, content: historyContent(h, false) })),
            { role: 'user', content: openAiContent(user, opts.images) },
          ],
          stream: useStream,
        }),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        return { ok: false, error: friendlyHttpError(res.status, body, host), status: res.status };
      }
      if (useStream && !res.body) return null;
      if (useStream) {
      let text = '';
      await readSse(res, (json) => {
        const d = json?.choices?.[0]?.delta?.content;
        if (typeof d === 'string' && d) {
          text += d;
          opts.onToken!(d);
        }
      });
      return { ok: true, text };
    }
    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content ?? '';
    return { ok: true, text };
  };

  try {
    const first = await tryOnce(stream);
    if (first && first.ok) {
      cleanup();
      return first;
    }
    if (first && !first.ok && stream && (first.status === 400 || first.status === 422 || first.status === 501 || first.status === 500)) {
      // Streaming unsupported by this endpoint — retry non-streamed.
      const fallback = await tryOnce(false);
      if (fallback) {
        cleanup();
        return fallback as AiResult;
      }
    }
    cleanup();
    return first as AiResult;
  } catch (e: any) {
    cleanup();
    if (e?.name === 'AbortError') {
      return { ok: false, error: `The AI request timed out after ${Math.round(timeoutMs / 1000)}s. This is usually a slow/blocked connection to ${host}. Try again or use a faster model.` };
    }
    return { ok: false, error: friendlyNetworkError(e, host) };
  }
}

/**
 * Test an AI key: makes a tiny 1-token request and reports success + latency.
 * Lets users verify a key in Settings without waiting for a full answer.
 */
export async function testAiKey(cfg: AiModuleConfig): Promise<{ ok: boolean; ms: number; error?: string }> {
  const t0 = Date.now();
  const res = await aiChat({ ...cfg, enabled: true, model: cfg.model || defaultModelFor(cfg) }, 'Reply with the single word: ok', 'ok', {
    maxTokens: 5,
    temperature: 0,
    timeoutMs: 15000,
  });
  const ms = Date.now() - t0;
  if (res.ok) return { ok: true, ms };
  return { ok: false, ms, error: res.error };
}
