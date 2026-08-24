import { useData } from '../stores/data';

/**
 * 🔒 APP LOCK (Phase 8 §14, §15)
 *
 * Optional protection for a shared computer. Entirely off by default and
 * never required for basic operation — CLINICAL Rx must still open and work
 * for someone who has never touched this setting.
 *
 * SECURITY MODEL, stated honestly:
 *   This guards against a housemate or classmate opening the laptop. It does
 *   NOT encrypt the database, so it cannot stop someone with real filesystem
 *   access and technical skill. The Security settings page says exactly that
 *   rather than implying protection the app does not provide.
 *
 * The PIN itself is never stored. We store a salted PBKDF2-SHA-256 hash using
 * the Web Crypto API — no hand-rolled cryptography (§40 "do not invent custom
 * encryption").
 */

const LOCK_KEY = 'clinical-rx:app-lock';
const SESSION_KEY = 'clinical-rx:unlocked';

const PBKDF2_ITERATIONS = 210_000; // OWASP guidance for PBKDF2-SHA256
const MAX_ATTEMPTS = 10;
const LOCKOUT_MS = 5 * 60 * 1000;

export type LockMode = 'off' | 'pin';

interface LockConfig {
  mode: LockMode;
  salt?: string;
  hash?: string;
  iterations?: number;
  /** Failed attempts since the last success. */
  failures?: number;
  /** Epoch ms before which unlocking is refused. */
  lockedUntil?: number;
  /** Lock again when the app has been in the background this long. */
  autoLockMinutes?: number;
}

function readConfig(): LockConfig {
  try {
    const raw = localStorage.getItem(LOCK_KEY);
    const obj = raw ? JSON.parse(raw) : null;
    return obj && typeof obj === 'object' ? obj : { mode: 'off' };
  } catch {
    return { mode: 'off' };
  }
}

function writeConfig(cfg: LockConfig): void {
  try {
    localStorage.setItem(LOCK_KEY, JSON.stringify(cfg));
  } catch {
    /* ignore */
  }
}

function toHex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function randomSalt(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Derive a PIN hash. Uses the platform's crypto — never a custom scheme. */
async function derive(pin: string, salt: string, iterations = PBKDF2_ITERATIONS): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(pin), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: enc.encode(salt), iterations, hash: 'SHA-256' },
    key,
    256
  );
  return toHex(bits);
}

/** Constant-time-ish comparison, so timing does not reveal the prefix. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function lockMode(): LockMode {
  return readConfig().mode ?? 'off';
}

export function isLockEnabled(): boolean {
  return lockMode() !== 'off';
}

export function autoLockMinutes(): number {
  return readConfig().autoLockMinutes ?? 15;
}

export async function setAutoLockMinutes(minutes: number): Promise<void> {
  writeConfig({ ...readConfig(), autoLockMinutes: Math.max(0, Math.min(240, Math.round(minutes))) });
}

export interface LockState {
  enabled: boolean;
  locked: boolean;
  lockedOut: boolean;
  lockedUntilMs?: number;
  attemptsRemaining: number;
}

/** Is the app currently unlocked for this session? */
function sessionUnlocked(): boolean {
  try {
    return sessionStorage.getItem(SESSION_KEY) === '1';
  } catch {
    return false;
  }
}

function setSessionUnlocked(v: boolean): void {
  try {
    if (v) sessionStorage.setItem(SESSION_KEY, '1');
    else sessionStorage.removeItem(SESSION_KEY);
  } catch {
    /* ignore */
  }
}

export function lockState(): LockState {
  const cfg = readConfig();
  const enabled = cfg.mode !== 'off';
  const lockedOut = !!cfg.lockedUntil && Date.now() < cfg.lockedUntil;
  return {
    enabled,
    locked: enabled && !sessionUnlocked(),
    lockedOut,
    lockedUntilMs: lockedOut ? cfg.lockedUntil : undefined,
    attemptsRemaining: Math.max(0, MAX_ATTEMPTS - (cfg.failures ?? 0)),
  };
}

export interface PinResult {
  ok: boolean;
  error?: string;
}

/** Turn on PIN lock. Requires 4–12 digits. */
export async function enablePin(pin: string): Promise<PinResult> {
  if (!/^\d{4,12}$/.test(pin)) return { ok: false, error: 'Choose a PIN of 4 to 12 digits.' };
  // Reject the handful of PINs that offer no protection at all.
  if (/^(\d)\1+$/.test(pin) || ['1234', '12345', '123456', '0000'].includes(pin)) {
    return { ok: false, error: 'That PIN is too easy to guess. Choose a less predictable one.' };
  }
  const salt = randomSalt();
  const hash = await derive(pin, salt);
  writeConfig({ mode: 'pin', salt, hash, iterations: PBKDF2_ITERATIONS, failures: 0, autoLockMinutes: autoLockMinutes() });
  setSessionUnlocked(true);
  return { ok: true };
}

/** Turn off App Lock. Requires the current PIN. */
export async function disableLock(currentPin: string): Promise<PinResult> {
  const verify = await unlock(currentPin);
  if (!verify.ok) return verify;
  writeConfig({ mode: 'off' });
  setSessionUnlocked(true);
  return { ok: true };
}

/** Attempt to unlock. Throttles after repeated failures. */
export async function unlock(pin: string): Promise<PinResult> {
  const cfg = readConfig();
  if (cfg.mode === 'off') {
    setSessionUnlocked(true);
    return { ok: true };
  }
  if (cfg.lockedUntil && Date.now() < cfg.lockedUntil) {
    const mins = Math.ceil((cfg.lockedUntil - Date.now()) / 60000);
    return { ok: false, error: `Too many attempts. Try again in ${mins} minute${mins === 1 ? '' : 's'}.` };
  }
  if (!cfg.salt || !cfg.hash) return { ok: false, error: 'App Lock is misconfigured. Turn it off and set it up again.' };

  const candidate = await derive(pin, cfg.salt, cfg.iterations ?? PBKDF2_ITERATIONS);
  if (safeEqual(candidate, cfg.hash)) {
    writeConfig({ ...cfg, failures: 0, lockedUntil: undefined });
    setSessionUnlocked(true);
    return { ok: true };
  }

  const failures = (cfg.failures ?? 0) + 1;
  const next: LockConfig = { ...cfg, failures };
  if (failures >= MAX_ATTEMPTS) {
    next.lockedUntil = Date.now() + LOCKOUT_MS;
    next.failures = 0;
  }
  writeConfig(next);
  const remaining = MAX_ATTEMPTS - failures;
  return {
    ok: false,
    error: remaining > 0 ? `Incorrect PIN. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining.` : 'Too many attempts. Locked for 5 minutes.',
  };
}

/** Lock the app immediately (menu action, or auto-lock on idle). */
export function lockNow(): void {
  setSessionUnlocked(false);
}

/**
 * Start the idle auto-lock timer.
 * Returns a cleanup function. Does nothing when App Lock is off.
 */
export function startAutoLock(): () => void {
  let hiddenAt = 0;
  const onVisibility = () => {
    if (!isLockEnabled()) return;
    const limit = autoLockMinutes();
    if (limit <= 0) return;
    if (document.hidden) {
      hiddenAt = Date.now();
    } else if (hiddenAt && Date.now() - hiddenAt > limit * 60_000) {
      lockNow();
      // Nudge React to re-render the lock screen.
      useData.getState().setStatus('🔒 Locked');
      hiddenAt = 0;
    }
  };
  document.addEventListener('visibilitychange', onVisibility);
  return () => document.removeEventListener('visibilitychange', onVisibility);
}
