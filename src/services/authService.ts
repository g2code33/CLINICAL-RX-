import { useData } from '../stores/data';
import { syncClient } from './syncClient';
import { audit } from './auditLog';

/**
 * 👤 AUTH SERVICE (Phase 7)
 *
 * The ONLY place the app talks to an authentication backend. UI components
 * call these methods and never touch a provider or an endpoint directly, so
 * the vendor can be swapped later without touching a single screen.
 *
 * Accounts are entirely OPTIONAL. Every method here can fail, the network can
 * be absent, and the application keeps working on local data regardless.
 */

// ---- Provider abstraction (§7) -----------------------------------------

export interface AuthUser {
  id: string;
  email?: string;
  name?: string;
}

export interface AuthResult {
  ok: boolean;
  user?: AuthUser;
  token?: string;
  error?: string;
}

/**
 * Implement this to add a different backend (self-hosted, OAuth, …).
 * `kind` is what the UI shows; nothing else in the app branches on it.
 */
export interface AuthProvider {
  readonly kind: string;
  readonly label: string;
  /** Does this provider support these optional capabilities? */
  readonly supports: { passwordReset: boolean; oauth: boolean };
  signUp(email: string, password: string, name?: string): Promise<AuthResult>;
  signIn(email: string, password: string): Promise<AuthResult>;
  signOut(token: string): Promise<void>;
  getCurrentUser(token: string): Promise<AuthUser | null>;
  requestPasswordReset(email: string): Promise<{ ok: boolean; error?: string }>;
  refreshSession?(token: string): Promise<AuthResult>;
}

function backendUrl(): string {
  return useData.getState().settings?.onlineAccount?.backendUrl ?? '';
}

/** The built-in provider, backed by the existing /api/auth endpoint. */
export const clinicalRxAuthProvider: AuthProvider = {
  kind: 'clinical-rx',
  label: 'CLINICAL Rx Cloud',
  supports: { passwordReset: true, oauth: false },

  async signUp(email, password, name) {
    const res = await syncClient.register(backendUrl(), email, password, name ?? '');
    if (!res.ok) return { ok: false, error: res.error };
    const d: any = res.data ?? {};
    return { ok: true, token: d.token, user: { id: d.user?.id ?? d.userId ?? '', email, name } };
  },

  async signIn(email, password) {
    const res = await syncClient.login(backendUrl(), email, password);
    if (!res.ok) return { ok: false, error: res.error };
    const d: any = res.data ?? {};
    return { ok: true, token: d.token, user: { id: d.user?.id ?? d.userId ?? '', email, name: d.user?.name } };
  },

  async signOut() {
    // Tokens are stateless (HMAC-signed); dropping it locally is the sign-out.
  },

  async getCurrentUser(token) {
    const res = await syncClient.me(backendUrl(), token);
    if (!res.ok) return null;
    const d: any = res.data ?? {};
    const u = d.user ?? d;
    return u?.id ? { id: u.id, email: u.email, name: u.name } : null;
  },

  async requestPasswordReset(email) {
    const res = await syncClient.forgot(backendUrl(), email);
    return res.ok ? { ok: true } : { ok: false, error: res.error };
  },
};

let provider: AuthProvider = clinicalRxAuthProvider;

/** Swap the provider (future OAuth / self-hosted backend). */
export function setAuthProvider(p: AuthProvider): void {
  provider = p;
}

export function getAuthProvider(): AuthProvider {
  return provider;
}

// ---- Local identity (§10) ----------------------------------------------

function randomId(prefix: string): string {
  const rnd =
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}_${rnd}`;
}

function detectPlatform(): string {
  const nav: any = typeof navigator !== 'undefined' ? navigator : {};
  const ua = String(nav.userAgent ?? '');
  if ((window as any)?.clinicalRx?.isElectron) return 'desktop';
  if (/android/i.test(ua)) return 'android';
  if (/iphone|ipad|ipod/i.test(ua)) return 'ios';
  if (/win/i.test(ua)) return 'windows';
  if (/mac/i.test(ua)) return 'macos';
  if (/linux/i.test(ua)) return 'linux';
  return 'web';
}

function defaultDeviceName(): string {
  const p = detectPlatform();
  const pretty: Record<string, string> = {
    desktop: 'Desktop app',
    windows: 'Windows PC',
    macos: 'Mac',
    linux: 'Linux PC',
    android: 'Android device',
    ios: 'iOS device',
    web: 'Web browser',
  };
  return pretty[p] ?? 'This device';
}

/**
 * This installation's stable identity.
 *
 * Deliberately independent of any email or cloud account: signing in, signing
 * out, or switching accounts never changes it, and all local records belong
 * to it.
 */
export async function ensureDeviceIdentity(): Promise<{ deviceId: string; deviceName: string; platform: string }> {
  const st = useData.getState();
  const settings = st.settings;
  const existing = settings?.device;
  if (existing?.deviceId) {
    return {
      deviceId: existing.deviceId,
      deviceName: existing.deviceName ?? defaultDeviceName(),
      platform: existing.platform ?? detectPlatform(),
    };
  }
  const device = {
    deviceId: randomId('dev'),
    deviceName: defaultDeviceName(),
    platform: detectPlatform(),
    lastSeen: Date.now(),
  };
  if (settings) {
    await st.saveSettings({ ...settings, updatedAt: Date.now(), device });
  }
  return { deviceId: device.deviceId, deviceName: device.deviceName, platform: device.platform };
}

export function deviceInfo() {
  const d = useData.getState().settings?.device;
  return {
    deviceId: d?.deviceId ?? '',
    deviceName: d?.deviceName ?? defaultDeviceName(),
    platform: d?.platform ?? detectPlatform(),
    lastSeen: d?.lastSeen,
    lastSync: d?.lastSync,
  };
}

export async function renameDevice(name: string): Promise<void> {
  const st = useData.getState();
  const settings = st.settings;
  if (!settings?.device) return;
  await st.saveSettings({
    ...settings,
    updatedAt: Date.now(),
    device: { ...settings.device, deviceName: name.trim() || defaultDeviceName() },
  });
}

// ---- Account state -----------------------------------------------------

export interface AccountState {
  signedIn: boolean;
  email?: string;
  name?: string;
  cloudUserId?: string;
  lastSynced?: number;
  /** True when we have a cached session but no connectivity (§45). */
  offlineSession: boolean;
  online: boolean;
}

export function accountState(): AccountState {
  const a = useData.getState().settings?.onlineAccount;
  const online = typeof navigator === 'undefined' ? true : navigator.onLine;
  const signedIn = !!a?.connected && !!a.token;
  return {
    signedIn,
    email: a?.email,
    name: a?.name,
    cloudUserId: a?.cloudUserId,
    lastSynced: a?.lastSynced,
    offlineSession: signedIn && !online,
    online,
  };
}

async function persistAccount(patch: Record<string, unknown>): Promise<void> {
  const st = useData.getState();
  const settings = st.settings;
  if (!settings) return;
  const current = settings.onlineAccount ?? ({} as typeof settings.onlineAccount);
  await st.saveSettings({
    ...settings,
    updatedAt: Date.now(),
    onlineAccount: {
      ...current,
      // `backendConfigured()` requires backendUrl to be DEFINED (empty string
      // means "same origin"). Leaving it undefined after sign-in silently
      // disables the offline queue, so pin it here.
      backendUrl: current.backendUrl ?? '',
      ...patch,
    },
  });
}

// ---- Public API (§6) ---------------------------------------------------

export async function signUp(email: string, password: string, name?: string): Promise<AuthResult> {
  const res = await provider.signUp(email, password, name);
  if (res.ok && res.token) {
    audit('auth.signup', { ok: true });
    await ensureDeviceIdentity();
    await persistAccount({
      connected: true,
      email,
      name: name ?? res.user?.name,
      token: res.token,
      cloudUserId: res.user?.id,
      // A brand-new account has no cloud data, so nothing can be clobbered —
      // but the first upload is still explicit (§13).
      firstSyncApproved: false,
      failureCount: 0,
      lastError: undefined,
    });
  }
  return res;
}

export async function signIn(email: string, password: string): Promise<AuthResult> {
  const res = await provider.signIn(email, password);
  if (!res.ok) audit('auth.failed', { ok: false });
  if (res.ok && res.token) {
    audit('auth.signin', { ok: true });
    await ensureDeviceIdentity();
    await persistAccount({
      connected: true,
      email,
      name: res.user?.name,
      token: res.token,
      cloudUserId: res.user?.id,
      firstSyncApproved: false,
      failureCount: 0,
      lastError: undefined,
    });
  }
  return res;
}

/**
 * Sign out.
 *
 * LOCAL DATA IS NEVER DELETED (§42). Only the session is dropped, so the user
 * carries on exactly as an offline user.
 */
export async function signOut(): Promise<void> {
  const token = useData.getState().settings?.onlineAccount?.token;
  if (token) {
    try {
      await provider.signOut(token);
    } catch {
      /* signing out must succeed locally even if the network fails */
    }
  }
  await persistAccount({
    connected: false,
    token: undefined,
    syncing: false,
    firstSyncApproved: false,
  });
  audit('auth.signout');
}

export async function resetPassword(email: string): Promise<{ ok: boolean; error?: string }> {
  return provider.requestPasswordReset(email);
}

export async function getCurrentUser(): Promise<AuthUser | null> {
  const a = useData.getState().settings?.onlineAccount;
  if (!a?.token) return null;
  const online = typeof navigator === 'undefined' ? true : navigator.onLine;
  // OFFLINE CONTINUITY (§45): trust the cached session rather than forcing a
  // login the user cannot possibly complete.
  if (!online) {
    return a.cloudUserId || a.email ? { id: a.cloudUserId ?? '', email: a.email, name: a.name } : null;
  }
  try {
    return await provider.getCurrentUser(a.token);
  } catch {
    return a.email ? { id: a.cloudUserId ?? '', email: a.email, name: a.name } : null;
  }
}

/**
 * Validate the cached session when connectivity returns.
 * A failure here NEVER signs the user out on its own — it records the problem
 * so the UI can offer a graceful re-login (§45).
 */
export async function refreshSession(): Promise<{ ok: boolean; needsReauth: boolean }> {
  const a = useData.getState().settings?.onlineAccount;
  if (!a?.token) return { ok: false, needsReauth: false };
  const online = typeof navigator === 'undefined' ? true : navigator.onLine;
  if (!online) return { ok: true, needsReauth: false };

  if (provider.refreshSession) {
    const res = await provider.refreshSession(a.token);
    if (res.ok && res.token) {
      await persistAccount({ token: res.token, lastError: undefined });
      return { ok: true, needsReauth: false };
    }
  }
  const user = await getCurrentUser();
  if (user) return { ok: true, needsReauth: false };
  await persistAccount({ lastError: 'Your session expired. Sign in again to resume syncing.' });
  audit('auth.session-expired', { ok: false });
  return { ok: false, needsReauth: true };
}
