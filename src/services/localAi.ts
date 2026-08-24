import type { AiModuleConfig } from '../types';
import type { AiGenerateRequest, AiGenerateResult, AiProvider } from './aiProvider';
import { getProvider, registerProvider } from './aiProvider';

/**
 * 💻 LOCAL AI ENGINE
 *
 * Talks to a locally-installed model runtime over its HTTP API, so CLINICAL Rx
 * can run AI with NO INTERNET. Nothing about a specific model is hard-coded:
 * the runtime is discovered at startup and the user picks from whatever models
 * they have installed.
 *
 * Supported runtimes (both expose a localhost HTTP API):
 *   - Ollama                     http://127.0.0.1:11434
 *   - Any OpenAI-compatible      e.g. LM Studio / llama.cpp server on :1234
 *
 * The model never needs to contain the user's knowledge — retrieved context
 * comes from the Intelligence Layer and stays entirely on the machine.
 */

export type LocalRuntimeKind = 'ollama' | 'openai-compatible';

export interface LocalRuntime {
  kind: LocalRuntimeKind;
  baseUrl: string;
  label: string;
}

export interface LocalModelInfo {
  id: string;
  name: string;
  /** Size in bytes when the runtime reports it. */
  size?: number;
  runtime: LocalRuntimeKind;
}

/** Default endpoints probed when discovering a local runtime. */
export const DEFAULT_LOCAL_ENDPOINTS: LocalRuntime[] = [
  { kind: 'ollama', baseUrl: 'http://127.0.0.1:11434', label: 'Ollama' },
  { kind: 'openai-compatible', baseUrl: 'http://127.0.0.1:1234', label: 'LM Studio / llama.cpp' },
  { kind: 'openai-compatible', baseUrl: 'http://127.0.0.1:8080', label: 'Local OpenAI-compatible server' },
];

interface LocalState {
  runtime: LocalRuntime | null;
  models: LocalModelInfo[];
  lastProbe: number;
  probing: boolean;
}

const state: LocalState = { runtime: null, models: [], lastProbe: 0, probing: false };

/** Currently detected runtime, if any. */
export function localRuntime(): LocalRuntime | null {
  return state.runtime;
}

export function localModels(): LocalModelInfo[] {
  return state.models;
}

async function fetchWithTimeout(url: string, init: RequestInit = {}, ms = 2500): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** Ask a runtime which models it has installed. */
async function listModels(rt: LocalRuntime): Promise<LocalModelInfo[]> {
  try {
    if (rt.kind === 'ollama') {
      const res = await fetchWithTimeout(`${rt.baseUrl}/api/tags`);
      if (!res.ok) return [];
      const json: any = await res.json();
      return (json.models ?? []).map((m: any) => ({
        id: m.name,
        name: m.name,
        size: m.size,
        runtime: 'ollama' as const,
      }));
    }
    const res = await fetchWithTimeout(`${rt.baseUrl}/v1/models`);
    if (!res.ok) return [];
    const json: any = await res.json();
    return (json.data ?? []).map((m: any) => ({
      id: m.id,
      name: m.id,
      runtime: 'openai-compatible' as const,
    }));
  } catch {
    return [];
  }
}

/**
 * Probe for a local runtime. Cheap and safe to call repeatedly — results are
 * cached briefly, and every failure is swallowed (a missing runtime is a
 * normal state, not an error).
 */
export async function detectLocalAi(force = false): Promise<{ runtime: LocalRuntime | null; models: LocalModelInfo[] }> {
  const now = Date.now();
  if (!force && state.lastProbe && now - state.lastProbe < 30_000) {
    return { runtime: state.runtime, models: state.models };
  }
  if (state.probing) return { runtime: state.runtime, models: state.models };
  state.probing = true;
  try {
    for (const rt of DEFAULT_LOCAL_ENDPOINTS) {
      const models = await listModels(rt);
      if (models.length) {
        state.runtime = rt;
        state.models = models;
        state.lastProbe = Date.now();
        return { runtime: rt, models };
      }
    }
    state.runtime = null;
    state.models = [];
    state.lastProbe = Date.now();
    return { runtime: null, models: [] };
  } finally {
    state.probing = false;
  }
}

/** True when a local runtime with at least one model was detected. */
export function localReady(): boolean {
  return !!state.runtime && state.models.length > 0;
}

/** Hardware hints, used to warn before running an oversized model. */
export interface HardwareInfo {
  cores?: number;
  memoryGb?: number;
}

export function hardwareInfo(): HardwareInfo {
  const nav: any = typeof navigator !== 'undefined' ? navigator : {};
  return {
    cores: typeof nav.hardwareConcurrency === 'number' ? nav.hardwareConcurrency : undefined,
    memoryGb: typeof nav.deviceMemory === 'number' ? nav.deviceMemory : undefined,
  };
}

/** Rough suitability check so we never push a model the machine can't run. */
export function modelFitsHardware(model: LocalModelInfo): { ok: boolean; note?: string } {
  const hw = hardwareInfo();
  if (!model.size || !hw.memoryGb) return { ok: true };
  const modelGb = model.size / 1e9;
  if (modelGb > hw.memoryGb * 0.8) {
    return { ok: false, note: `${modelGb.toFixed(1)} GB model on ~${hw.memoryGb} GB RAM may be very slow or fail.` };
  }
  return { ok: true };
}

// ---- Generation --------------------------------------------------------

async function generateOllama(rt: LocalRuntime, model: string, req: AiGenerateRequest): Promise<AiGenerateResult> {
  const messages = [
    { role: 'system', content: req.system },
    ...(req.history ?? []).map((h) => ({ role: h.role, content: h.content })),
    { role: 'user', content: req.prompt },
  ];
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), req.timeoutMs ?? 180_000);
  try {
    const res = await fetch(`${rt.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: ctrl.signal,
      body: JSON.stringify({
        model,
        messages,
        stream: !!req.onToken,
        options: { temperature: req.temperature ?? 0.7, num_predict: req.maxTokens ?? 1200 },
      }),
    });
    if (!res.ok) return { ok: false, error: `Local model error (HTTP ${res.status}). Is "${model}" installed?` };

    if (!req.onToken) {
      const json: any = await res.json();
      return { ok: true, text: json?.message?.content ?? '' };
    }
    // Ollama streams newline-delimited JSON.
    const reader = res.body?.getReader();
    if (!reader) return { ok: false, error: 'Local model returned no response body.' };
    const decoder = new TextDecoder();
    let text = '';
    let buffer = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const json = JSON.parse(line);
          const chunk = json?.message?.content ?? '';
          if (chunk) {
            text += chunk;
            req.onToken(chunk);
          }
        } catch {
          /* skip malformed chunk */
        }
      }
    }
    return { ok: true, text };
  } catch (e: any) {
    if (e?.name === 'AbortError') return { ok: false, error: 'Local AI timed out.' };
    return { ok: false, error: `Could not reach the local AI runtime at ${rt.baseUrl}.` };
  } finally {
    clearTimeout(timer);
  }
}

async function generateOpenAiCompatible(rt: LocalRuntime, model: string, req: AiGenerateRequest): Promise<AiGenerateResult> {
  const messages = [
    { role: 'system', content: req.system },
    ...(req.history ?? []).map((h) => ({ role: h.role, content: h.content })),
    { role: 'user', content: req.prompt },
  ];
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), req.timeoutMs ?? 180_000);
  try {
    const res = await fetch(`${rt.baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: ctrl.signal,
      body: JSON.stringify({
        model,
        messages,
        temperature: req.temperature ?? 0.7,
        max_tokens: req.maxTokens ?? 1200,
        stream: false,
      }),
    });
    if (!res.ok) return { ok: false, error: `Local model error (HTTP ${res.status}).` };
    const json: any = await res.json();
    const text = json?.choices?.[0]?.message?.content ?? '';
    if (req.onToken && text) req.onToken(text);
    return { ok: true, text };
  } catch (e: any) {
    if (e?.name === 'AbortError') return { ok: false, error: 'Local AI timed out.' };
    return { ok: false, error: `Could not reach the local AI runtime at ${rt.baseUrl}.` };
  } finally {
    clearTimeout(timer);
  }
}

/** The LocalAIProvider registered with the orchestrator's provider registry. */
export const localProvider: AiProvider = {
  runtime: 'local',
  label: 'Local AI',
  isAvailable() {
    return localReady();
  },
  requiresNetwork() {
    return false; // the whole point: works with no internet
  },
  async generate(req, config) {
    const rt = state.runtime;
    if (!rt) {
      return {
        ok: false,
        error: 'No local AI runtime detected. Install Ollama (or an OpenAI-compatible local server) and pull a model, then run Test AI in Settings.',
      };
    }
    const model = config?.localModel || state.models[0]?.id;
    if (!model) return { ok: false, error: 'No local model installed.' };
    return rt.kind === 'ollama' ? generateOllama(rt, model, req) : generateOpenAiCompatible(rt, model, req);
  },
};

/**
 * Register the built-in local provider.
 *
 * Only installs when no local provider exists yet, so a different local
 * runtime (or a test double) registered earlier is never clobbered.
 */
export function installLocalProvider(force = false): void {
  if (!force && getProvider('local')) return;
  registerProvider(localProvider);
}

/** Convenience for Settings: probe then register. */
export async function initLocalAi(): Promise<boolean> {
  installLocalProvider();
  const { runtime } = await detectLocalAi(true);
  return !!runtime;
}

export type { AiModuleConfig };
