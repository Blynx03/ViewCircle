import type { ApiError, Credentials, PublicSession } from '../types/session';

const base = import.meta.env.VITE_API_URL ?? '';
type Envelope<T> = { success: true; data: T } | { success: false; error: ApiError };

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${base}/api${path}`, {
    ...init, credentials: 'include', headers: { 'Content-Type': 'application/json', ...init?.headers }
  });
  const payload = await response.json() as Envelope<T>;
  if (!payload.success) throw Object.assign(new Error(payload.error.message), { code: payload.error.code });
  return payload.data;
}

export const api = {
  createSession: (body: { hostName: string; sessionName?: string; pin?: string }) => request<PublicSession>('/sessions', { method: 'POST', body: JSON.stringify(body) }),
  getSession: (code: string) => request<PublicSession>(`/sessions/${code}/public`),
  join: (code: string, body: { name: string; pin?: string }) => request<Credentials>(`/sessions/${code}/join`, { method: 'POST', body: JSON.stringify(body) }),
  hostToken: (code: string) => request<Credentials>(`/sessions/${code}/host-token`, { method: 'POST' }),
  lock: (code: string, locked: boolean) => request<{ locked: boolean }>(`/sessions/${code}/lock`, { method: 'POST', body: JSON.stringify({ locked }) }),
  remove: (code: string, identity: string) => request<Record<string, never>>(`/sessions/${code}/remove-participant`, { method: 'POST', body: JSON.stringify({ identity }) }),
  leave: (code: string, identity: string) => request<Record<string, never>>(`/sessions/${code}/leave`, { method: 'POST', body: JSON.stringify({ identity }), keepalive: true }),
  participantStatus: (code: string, identity: string) => request<{ removed: boolean; status: string }>(`/sessions/${code}/participant-status`, { method: 'POST', body: JSON.stringify({ identity }) }),
  end: (code: string) => request<Record<string, never>>(`/sessions/${code}/end`, { method: 'POST' })
};
