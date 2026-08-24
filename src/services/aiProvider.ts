import type { AiModuleConfig } from '../types';

/**
 * AI provider abstraction — ARCHITECTURE ONLY (Phase 1).
 *
 * The shipped AI features currently call `services/ai.ts` directly, which
 * always talks to a remote HTTP endpoint. This interface is the seam that lets
 * a LOCAL provider (llama.cpp, Ollama, ONNX, an Electron-side runtime…) be
 * added later without touching a single caller.
 *
 * Nothing here downloads or bundles a model, and no local runtime is required.
 * `resolveProvider()` returns the cloud provider today; when a local
 * implementation is registered it becomes selectable via the user's
 * `AiRuntimePreference`.
 */

export type AiRuntime = 'cloud' | 'local';

/** User-facing choice; 'auto' picks the best available at call time. */
export type AiRuntimePreference = 'auto' | 'cloud' | 'local';

export interface AiGenerateRequest {
  system: string;
  prompt: string;
  history?: Array<{ role: 'user' | 'assistant'; content: string; images?: string[] }>;
  images?: string[];
  maxTokens?: number;
  temperature?: number;
  timeoutMs?: number;
  onToken?: (token: string) => void;
}

export type AiGenerateResult = { ok: true; text: string } | { ok: false; error: string };

export interface AiProvider {
  readonly runtime: AiRuntime;
  readonly label: string;
  /** Can this provider serve a request right now? (key present, model loaded…) */
  isAvailable(config?: AiModuleConfig | null): boolean;
  /** Does it need the network? Local providers return false. */
  requiresNetwork(): boolean;
  generate(req: AiGenerateRequest, config?: AiModuleConfig | null): Promise<AiGenerateResult>;
}

/** Cloud provider — delegates to the existing transport in `services/ai.ts`. */
export const cloudProvider: AiProvider = {
  runtime: 'cloud',
  label: 'Cloud AI',
  isAvailable(config) {
    return !!config?.enabled && !!config.apiKey?.trim();
  },
  requiresNetwork() {
    return true;
  },
  async generate(req, config) {
    if (!config) return { ok: false, error: 'No AI configuration provided.' };
    const { aiChat } = await import('./ai');
    return aiChat(config, req.system, req.prompt, {
      history: req.history,
      images: req.images,
      maxTokens: req.maxTokens,
      temperature: req.temperature,
      timeoutMs: req.timeoutMs,
      onToken: req.onToken,
    });
  },
};

/**
 * Registry. A future local provider registers itself here at startup and
 * immediately becomes selectable — no changes needed in calling code.
 */
const providers = new Map<AiRuntime, AiProvider>([['cloud', cloudProvider]]);

export function registerProvider(p: AiProvider): void {
  providers.set(p.runtime, p);
}

export function getProvider(runtime: AiRuntime): AiProvider | null {
  return providers.get(runtime) ?? null;
}

export function availableRuntimes(config?: AiModuleConfig | null): AiRuntime[] {
  return [...providers.values()].filter((p) => p.isAvailable(config)).map((p) => p.runtime);
}

/** True once a local runtime has been registered (Phase 1: never). */
export function localAiAvailable(): boolean {
  const local = providers.get('local');
  return !!local && local.isAvailable(null);
}

/**
 * Pick a provider for a request.
 * 'auto' prefers local when it's ready (works offline, no key, no cost), then
 * falls back to cloud.
 */
export function resolveProvider(preference: AiRuntimePreference, config?: AiModuleConfig | null): AiProvider | null {
  const online = typeof navigator === 'undefined' || navigator.onLine;
  const local = providers.get('local');
  const cloud = providers.get('cloud');

  if (preference === 'local') return local ?? null;
  if (preference === 'cloud') return cloud ?? null;

  if (local?.isAvailable(config)) return local;
  if (cloud?.isAvailable(config) && online) return cloud;
  return null;
}
