import type { SyncRecord } from '../types';

export interface ApiResult<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
  status?: number;
}

// The app's deployed backend. Used as the default Backend URL on the desktop
// app, where there is no same-origin /api (the renderer runs from file://).
export const DEFAULT_BACKEND_URL = 'https://clinicalrx30.vercel.app';

function baseUrl(backendUrl?: string): string {
  const b = (backendUrl || '').trim();
  if (!b || b === '/' || b === '') return '';
  return b.replace(/\/$/, '');
}

async function request(backendUrl: string | undefined, path: string, method: 'GET' | 'POST' | 'DELETE', token: string | undefined, body?: unknown): Promise<ApiResult<any>> {
  return requestWithHeaders(backendUrl, path, method, token ? { Authorization: `Bearer ${token}` } : {}, body);
}

async function requestWithHeaders(backendUrl: string | undefined, path: string, method: 'GET' | 'POST' | 'DELETE', headers: Record<string, string>, body?: unknown): Promise<ApiResult<any>> {
  const root = baseUrl(backendUrl);
  const url = `${root}${path}`;
  let res: Response;
  try {
    res = await fetch(url, { method, headers: { 'Content-Type': 'application/json', ...headers }, body: body ? JSON.stringify(body) : undefined });
  } catch (e: any) {
    const detail = e?.message || 'network error';
    const offline = typeof navigator !== 'undefined' && navigator.onLine === false;

    // Being offline, or the server being briefly down, is a NORMAL state for
    // an offline-first app — not a misconfiguration. Say something reassuring
    // and true rather than sending the user to change settings that are fine.
    if (offline) {
      return { ok: false, error: 'You are offline. Your changes are saved locally and will sync when you reconnect.' };
    }
    if (!root) {
      return {
        ok: false,
        error: `Cloud sync is temporarily unavailable (${detail}). Your changes are safely stored locally and will sync later. If this persists, set your server URL — e.g. ${DEFAULT_BACKEND_URL} — in Settings.`,
      };
    }
    return {
      ok: false,
      error: `Cloud sync is temporarily unavailable — could not reach ${root} (${detail}). Your changes are safely stored locally and will sync later.`,
    };
  }
  let json: any = null;
  const contentType = res.headers.get('content-type') || '';
  try { if (contentType.includes('application/json')) json = await res.json(); } catch { json = null; }
  if (!res.ok) {
    if (json?.error) return { ok: false, status: res.status, error: json.error };
    const bodyText = json === null ? await res.text().catch(() => '') : '';
    let hint = 'Server error';
    if (res.status === 503) hint = 'Cloud storage is not set up';
    else if (res.status === 404) hint = 'API endpoint not found';
    else if (res.status === 403) hint = 'Access denied';
    return { ok: false, status: res.status, error: `${hint} (${res.status}). ${res.status === 503 ? 'In Vercel: go to Storage → KV → create a store.' : (json?.error || 'Request failed.')}`, ...(bodyText ? { detail: bodyText.slice(0, 200) } : {}) };
  }
  return { ok: true, data: json, status: res.status };
}

export const syncClient = {
  register(backendUrl: string | undefined, email: string, password: string, name: string, securityQuestion?: string, securityAnswer?: string) {
    const body: any = { action: 'register', email, password, name };
    if (securityQuestion) body.securityQuestion = securityQuestion;
    if (securityAnswer) body.securityAnswer = securityAnswer;
    return request(backendUrl, '/api/auth', 'POST', undefined, body);
  },
  login(backendUrl: string | undefined, email: string, password: string) {
    return request(backendUrl, '/api/auth', 'POST', undefined, { action: 'login', email, password });
  },
  me(backendUrl: string | undefined, token: string) { return request(backendUrl, '/api/auth', 'GET', token, { action: 'me' }); },
  updateProfile(backendUrl: string | undefined, token: string, body: { name?: string; securityQuestion?: string; securityAnswer?: string }) {
    return request(backendUrl, '/api/auth', 'POST', token, { action: 'update', ...body });
  },
  changePassword(backendUrl: string | undefined, token: string, currentPassword: string, newPassword: string) {
    return request(backendUrl, '/api/auth', 'POST', token, { action: 'change-password', currentPassword, newPassword });
  },
  deleteAccount(backendUrl: string | undefined, token: string, password: string) {
    return request(backendUrl, '/api/auth', 'DELETE', token, { action: 'delete-account', password });
  },
  // Admin endpoints
  listUsers(backendUrl: string | undefined, token: string) {
    return request(backendUrl, "/api/admin?action=list", "GET", token);
  },
  adminResetPassword(backendUrl: string | undefined, token: string, email: string, newPassword: string) {
    return request(backendUrl, "/api/admin", "POST", token, { action: "reset", email, newPassword });
  },
  adminDeleteUser(backendUrl: string | undefined, token: string, email: string) {
    return request(backendUrl, "/api/admin", "POST", token, { action: "delete", email });
  },
  adminChangeEmail(backendUrl: string | undefined, token: string, email: string, newEmail: string) {
    return request(backendUrl, "/api/admin", "POST", token, { action: "changeEmail", email, newEmail });
  },
  adminUpdateName(backendUrl: string | undefined, token: string, email: string, name: string) {
    return request(backendUrl, "/api/admin", "POST", token, { action: "updateName", email, name });
  },
  adminClearSecurity(backendUrl: string | undefined, token: string, email: string) {
    return request(backendUrl, "/api/admin", "POST", token, { action: "clearSecurity", email });
  },
  forgot(backendUrl: string | undefined, email: string) { return request(backendUrl, '/api/auth', 'POST', undefined, { action: 'forgot', email }); },
  getSecurityQuestion(backendUrl: string | undefined, email: string) {
    return request(backendUrl, '/api/auth', 'POST', undefined, { action: 'security-question', email });
  },
  reset(backendUrl: string | undefined, payload: { method: string; email?: string; password?: string; token?: string; securityQuestion?: string; securityAnswer?: string; adminToken?: string }) {
    const headers: Record<string, string> = {};
    if (payload.adminToken) headers['x-admin-token'] = payload.adminToken;
    return requestWithHeaders(backendUrl, '/api/auth', 'POST', headers, { action: 'reset', ...payload });
  },
  pull(backendUrl: string | undefined, token: string, since?: number) {
    const q = typeof since === 'number' ? `?since=${since}` : '';
    return request(backendUrl, '/api/sync' + q, 'GET', token);
  },
  getAiConfig(backendUrl: string | undefined, token: string) { return request(backendUrl, '/api/aiConfig', 'GET', token); },
  saveAiConfig(backendUrl: string | undefined, token: string, aiConfig: unknown) { return request(backendUrl, '/api/aiConfig', 'POST', token, { aiConfig }); },
  push(backendUrl: string | undefined, token: string, records: SyncRecord[]) { return request(backendUrl, '/api/sync', 'POST', token, { records }); },
};
