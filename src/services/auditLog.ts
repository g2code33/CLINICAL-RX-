/**
 * 📋 SECURITY AUDIT LOG (Phase 8 §34, §35)
 *
 * A lightweight, local record of security-relevant events so the user can see
 * what happened to their account and data.
 *
 * WHAT IS NEVER LOGGED (§35):
 *   passwords, API keys, session tokens, PINs, record contents,
 *   AI conversation text.
 *
 * Only the SHAPE of an event is stored — what happened, when, and a count.
 * The log lives on the device and is never uploaded.
 */

export type AuditEvent =
  | 'auth.signin'
  | 'auth.signout'
  | 'auth.signup'
  | 'auth.failed'
  | 'auth.session-expired'
  | 'account.linked'
  | 'sync.completed'
  | 'sync.failed'
  | 'sync.conflict'
  | 'backup.created'
  | 'backup.restored'
  | 'backup.deleted'
  | 'data.bulk-delete'
  | 'data.exported'
  | 'data.imported'
  | 'security.setting-changed'
  | 'security.lock-enabled'
  | 'security.lock-disabled'
  | 'security.unlock-failed'
  | 'ai.config-changed'
  | 'ai.key-stored'
  | 'ai.key-removed'
  | 'ai.injection-blocked';

export interface AuditEntry {
  id: string;
  ts: number;
  event: AuditEvent;
  /** Short, non-sensitive description. */
  detail?: string;
  /** Optional count, e.g. records synced. */
  count?: number;
  ok?: boolean;
}

const KEY = 'clinical-rx:audit-log';
const MAX_ENTRIES = 500;

/**
 * Values that must never reach the log. Belt-and-braces: callers are also
 * expected not to pass them, but a mistake here would be a security bug.
 */
const FORBIDDEN = /(sk-[A-Za-z0-9_-]{8,}|Bearer\s+[A-Za-z0-9._-]{10,}|password|api[_-]?key|token\s*[:=]|\btok_[A-Za-z0-9]+)/i;

function scrub(text: string | undefined): string | undefined {
  if (!text) return undefined;
  const clipped = text.slice(0, 200);
  return FORBIDDEN.test(clipped) ? '[redacted]' : clipped;
}

export function loadAudit(): AuditEntry[] {
  try {
    const raw = localStorage.getItem(KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

/** Record a security event. Never throws — logging must not break a flow. */
export function audit(event: AuditEvent, opts: { detail?: string; count?: number; ok?: boolean } = {}): void {
  try {
    const entry: AuditEntry = {
      id: `a_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      ts: Date.now(),
      event,
      detail: scrub(opts.detail),
      count: typeof opts.count === 'number' ? opts.count : undefined,
      ok: opts.ok,
    };
    const list = [entry, ...loadAudit()].slice(0, MAX_ENTRIES);
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* logging is best-effort by design */
  }
}

export function clearAudit(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

const LABELS: Record<AuditEvent, string> = {
  'auth.signin': 'Signed in',
  'auth.signout': 'Signed out',
  'auth.signup': 'Account created',
  'auth.failed': 'Sign-in failed',
  'auth.session-expired': 'Session expired',
  'account.linked': 'Device linked to account',
  'sync.completed': 'Sync completed',
  'sync.failed': 'Sync failed',
  'sync.conflict': 'Sync conflict detected',
  'backup.created': 'Backup created',
  'backup.restored': 'Backup restored',
  'backup.deleted': 'Backup deleted',
  'data.bulk-delete': 'Bulk deletion',
  'data.exported': 'Data exported',
  'data.imported': 'Data imported',
  'security.setting-changed': 'Security setting changed',
  'security.lock-enabled': 'App Lock enabled',
  'security.lock-disabled': 'App Lock disabled',
  'security.unlock-failed': 'Failed unlock attempt',
  'ai.config-changed': 'AI configuration changed',
  'ai.key-stored': 'AI key saved to secure storage',
  'ai.key-removed': 'AI key removed',
  'ai.injection-blocked': 'Suspicious instruction text neutralised in a record',
};

export function auditLabel(event: AuditEvent): string {
  return LABELS[event] ?? event;
}

/** Recent security-relevant activity, most recent first. */
export function recentAudit(limit = 50): AuditEntry[] {
  return loadAudit().slice(0, limit);
}
