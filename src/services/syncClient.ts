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

async function request(
  backendUrl: string | undefined,
  path: string,
  method: 'GET' | 'POST',
  token: string | undefined,
  body?: unknown
): Promise<ApiResult<any>> {
  return requestWithHeaders(backendUrl, path, method, token ? { Authorization: `Bearer ${token}` } : {}, body);
}

async function requestWithHeaders(
  backendUrl: string | undefined,
  path: string,
  method: 'GET' | 'POST',
  headers: Record<string, string>,
  body?: unknown
): Promise<ApiResult<any>> {
  let res: Response;
  try {
    res = await fetch(`${baseUrl(backendUrl)}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Network error. Are you online?' };
  }
  let json: any = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  if (!res.ok) {
    return { ok: false, status: res.status, error: json?.error || `Server error (${res.status})` };
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
  me(backendUrl: string | undefined, token: string) {
    return request(backendUrl, '/api/auth/me', 'GET', token);
  },
  forgot(backendUrl: string | undefined, email: string) {
    return request(backendUrl, '/api/auth/forgot', 'POST', undefined, { email });
  },
  reset(backendUrl: string | undefined, payload: { method: 'token' | 'security' | 'admin'; email?: string; password?: string; token?: string; securityQuestion?: string; securityAnswer?: string; adminToken?: string }) {
    const headers: Record<string, string> = {};
    if (payload.adminToken) headers['x-admin-token'] = payload.adminToken;
    const body: any = { method: payload.method };
    if (payload.email) body.email = payload.email;
    if (payload.password) body.password = payload.password;
    if (payload.token) body.token = payload.token;
    if (payload.securityQuestion) body.securityQuestion = payload.securityQuestion;
    if (payload.securityAnswer) body.securityAnswer = payload.securityAnswer;
    return requestWithHeaders(backendUrl, '/api/auth/reset', 'POST', headers, body);
  },
  pull(backendUrl: string | undefined, token: string, since?: number) {
    const q = typeof since === 'number' ? `?since=${since}` : '';
    return request(backendUrl, '/api/sync' + q, 'GET', token);
  },
  push(backendUrl: string | undefined, token: string, records: SyncRecord[]) {
    return request(backendUrl, '/api/sync', 'POST', token, { records });
  },
};
