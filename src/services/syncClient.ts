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
  let res: Response;
  try {
    res = await fetch(`${baseUrl(backendUrl)}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
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
  register(backendUrl: string | undefined, email: string, password: string, name: string) {
    return request(backendUrl, '/api/auth/register', 'POST', undefined, { email, password, name });
  },
  login(backendUrl: string | undefined, email: string, password: string) {
    return request(backendUrl, '/api/auth/login', 'POST', undefined, { email, password });
  },
  me(backendUrl: string | undefined, token: string) {
    return request(backendUrl, '/api/auth/me', 'GET', token);
  },
  pull(backendUrl: string | undefined, token: string) {
    return request(backendUrl, '/api/sync', 'GET', token);
  },
  push(backendUrl: string | undefined, token: string, records: SyncRecord[]) {
    return request(backendUrl, '/api/sync', 'POST', token, { records });
  },
};
