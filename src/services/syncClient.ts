import type { SyncRecord } from '../types';

export interface ApiResult<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
  status?: number;
}

function baseUrl(backendUrl?: string): string {
  const b = (backendUrl || '').trim();
  if (!b || b === '/' || b === '') return '';
  return b.replace(/\/$/, '');
}

async function request(backendUrl: string | undefined, path: string, method: 'GET' | 'POST' | 'DELETE', token: string | undefined, body?: unknown): Promise<ApiResult<any>> {
  return requestWithHeaders(backendUrl, path, method, token ? { Authorization: `Bearer ${token}` } : {}, body);
}

async function requestWithHeaders(backendUrl: string | undefined, path: string, method: 'GET' | 'POST' | 'DELETE', headers: Record<string, string>, body?: unknown): Promise<ApiResult<any>> {
  let res: Response;
  try {
    res = await fetch(`${baseUrl(backendUrl)}${path}`, { method, headers: { 'Content-Type': 'application/json', ...headers }, body: body ? JSON.stringify(body) : undefined });
  } catch (e: any) { return { ok: false, error: e?.message || 'Network error. Are you online?' }; }
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
    const body: any = { email, password, name };
    if (securityQuestion) body.securityQuestion = securityQuestion;
    if (securityAnswer) body.securityAnswer = securityAnswer;
    return request(backendUrl, '/api/auth/register', 'POST', undefined, body);
  },
  login(backendUrl: string | undefined, email: string, password: string) {
    return request(backendUrl, '/api/auth/login', 'POST', undefined, { email, password });
  },
  me(backendUrl: string | undefined, token: string) { return request(backendUrl, '/api/auth/me', 'GET', token); },
  updateProfile(backendUrl: string | undefined, token: string, body: { name?: string; securityQuestion?: string; securityAnswer?: string }) {
    return request(backendUrl, '/api/auth/update', 'POST', token, body);
  },
  changePassword(backendUrl: string | undefined, token: string, currentPassword: string, newPassword: string) {
    return request(backendUrl, '/api/auth/change-password', 'POST', token, { currentPassword, newPassword });
  },
  deleteAccount(backendUrl: string | undefined, token: string, password: string) {
    return request(backendUrl, '/api/auth/delete-account', 'DELETE', token, { password });
  },
  // Admin endpoints
  listUsers(backendUrl: string | undefined, token: string) {
    return request(backendUrl, "/api/admin?action=list", "GET", token);
  },,
  adminResetPassword(backendUrl: string | undefined, token: string, email: string, newPassword: string) {
    return request(backendUrl, "/api/admin", "POST", token, { action: "reset", email, newPassword });
  },);
  },
  adminDeleteUser(backendUrl: string | undefined, token: string, email: string) {
    return request(backendUrl, "/api/admin", "POST", token, { action: "delete", email });
  },);
  },
  forgot(backendUrl: string | undefined, email: string) { return request(backendUrl, '/api/auth/forgot', 'POST', undefined, { email }); },
  reset(backendUrl: string | undefined, payload: { method: string; email?: string; password?: string; token?: string; securityQuestion?: string; securityAnswer?: string; adminToken?: string }) {
    const headers: Record<string, string> = {};
    if (payload.adminToken) headers['x-admin-token'] = payload.adminToken;
    return requestWithHeaders(backendUrl, '/api/auth/reset', 'POST', headers, payload);
  },
  pull(backendUrl: string | undefined, token: string, since?: number) {
    const q = typeof since === 'number' ? `?since=${since}` : '';
    return request(backendUrl, '/api/sync' + q, 'GET', token);
  },
  getAiConfig(backendUrl: string | undefined, token: string) { return request(backendUrl, '/api/aiConfig', 'GET', token); },
  saveAiConfig(backendUrl: string | undefined, token: string, aiConfig: unknown) { return request(backendUrl, '/api/aiConfig', 'POST', token, { aiConfig }); },
  push(backendUrl: string | undefined, token: string, records: SyncRecord[]) { return request(backendUrl, '/api/sync', 'POST', token, { records }); },
};
