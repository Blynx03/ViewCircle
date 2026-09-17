import { request as apiRequest } from './client';
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try { return await apiRequest<T>(path, { ...init, signal: controller.signal }); }
  finally { clearTimeout(timer); }
}
export interface AccessStatus { authorized: boolean; owner: boolean; expiresAt?: number; request: { id: string; status: string; expiresAt: number } | null }
export interface AccessItem { id: string; name: string; emailOrCompany?: string; status: string; createdAt: number; expiresAt: number }
const post = (body?: unknown): RequestInit => ({ method: 'POST', ...(body ? { body: JSON.stringify(body) } : {}) });
export const accessApi = {
  status: () => request<AccessStatus>('/access'),
  ask: (name: string, emailOrCompany: string) => request<{ id: string; status: string }>('/access-requests', post({ name, emailOrCompany })),
  poll: (id: string) => request<{ status: string }>(`/access-requests/${encodeURIComponent(id)}/status`),
  login: (username: string, password: string, rememberMe: boolean) => request('/owner/login', post({ username, password, rememberMe })),
  logout: () => request('/owner/logout', post()),
  list: () => request<AccessItem[]>('/owner/access-requests'),
  decide: (id: string, action: 'approve' | 'deny') => request(`/owner/access-requests/${encodeURIComponent(id)}/${action}`, post()),
  pushKey: () => request<{ publicKey: string | null }>('/owner/push-key'),
  subscribe: (subscription: PushSubscription) => request('/owner/push-subscriptions', post(subscription.toJSON())),
  unsubscribe: (endpoint: string) => request('/owner/push-subscriptions', { method: 'DELETE', body: JSON.stringify({ endpoint }) })
};
