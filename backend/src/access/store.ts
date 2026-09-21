import type { PushSubscription } from 'web-push';
import { ServiceError } from '../services/session-service.js';

export interface AccessRequest {
  id: string; name: string; emailOrCompany?: string | undefined;
  status: 'pending' | 'approved' | 'denied' | 'expired';
  createdAt: number; expiresAt: number; approvedAt?: number; deniedAt?: number;
  browserHash: string; creations: number;
}
export interface OwnerSession { expiresAt: number; creations: number }
export interface AccessIdentity { kind: 'owner' | 'visitor'; id: string }
// Async adapter boundary: a database implementation uses transactions for decisions
// and creation reservations. Routes never mutate persistence records themselves.
export interface AccessStore {
  findOwner(hash: string): Promise<OwnerSession | undefined>;
  putOwner(hash: string, session: OwnerSession): Promise<void>;
  deleteOwner(hash: string): Promise<void>;
  findVisitor(hash: string): Promise<AccessRequest | undefined>;
  createRequest(item: AccessRequest): Promise<void>;
  listRequests(): Promise<AccessRequest[]>;
  decide(id: string, action: 'approve' | 'deny', visitorTtl: number): Promise<AccessRequest>;
  reserveCreation(identity: AccessIdentity, max: number): Promise<number>;
  releaseCreation(identity: AccessIdentity, reservation: number): Promise<void>;
  resetCreations(): Promise<void>;
  listSubscriptions(): Promise<[string, PushSubscription][]>;
  putSubscription(id: string, subscription: PushSubscription): Promise<void>;
  deleteSubscription(id: string): Promise<void>;
}
// Keep the same asynchronous contract as a future database adapter; mutations
// intentionally finish before yielding so reservations and decisions are atomic.
/* eslint-disable @typescript-eslint/require-await */
export class MemoryAccessStore implements AccessStore {
  private usageGeneration = 0;
  readonly requests = new Map<string, AccessRequest>();
  readonly owners = new Map<string, OwnerSession>();
  readonly subscriptions = new Map<string, PushSubscription>();
  private prune() {
    const now = Date.now();
    for (const [id, item] of this.requests) {
      if (item.expiresAt <= now && item.status !== 'denied') item.status = 'expired';
      if (item.expiresAt + 86_400_000 <= now) this.requests.delete(id);
    }
    for (const [id, item] of this.owners) if (item.expiresAt <= now) this.owners.delete(id);
  }
  async findOwner(hash: string) { this.prune(); return this.owners.get(hash); }
  async putOwner(hash: string, session: OwnerSession) { this.prune(); this.owners.set(hash, session); }
  async deleteOwner(hash: string) { this.owners.delete(hash); }
  async findVisitor(hash: string) { this.prune(); return [...this.requests.values()].find(item => item.browserHash === hash); }
  async createRequest(item: AccessRequest) { this.prune(); this.requests.set(item.id, item); }
  async listRequests() { this.prune(); return [...this.requests.values()].sort((a, b) => b.createdAt - a.createdAt); }
  async decide(id: string, action: 'approve' | 'deny', visitorTtl: number) {
    this.prune(); const item = this.requests.get(id);
    if (!item) throw new ServiceError('NOT_FOUND', 'Request not found.', 404);
    if (item.status !== 'pending') throw new ServiceError('REQUEST_CLOSED', 'This request is no longer pending.', 409);
    const now = Date.now();
    item.status = action === 'approve' ? 'approved' : 'denied';
    if (action === 'approve') { item.approvedAt = now; item.expiresAt = now + visitorTtl; }
    else item.deniedAt = now;
    return item;
  }
  private authorization(identity: AccessIdentity) {
    this.prune();
    const item = identity.kind === 'owner' ? this.owners.get(identity.id) : this.requests.get(identity.id);
    if (!item || item.expiresAt <= Date.now() || ('status' in item && item.status !== 'approved')) throw new ServiceError('ACCESS_REQUIRED', 'Owner approval is required.', 403);
    return item;
  }
  async reserveCreation(identity: AccessIdentity, max: number) {
    const item = this.authorization(identity);
    if (item.creations >= max) throw new ServiceError('DEMO_CREATION_LIMIT', 'This Host access has reached its session-creation limit.', 429);
    item.creations += 1; return this.usageGeneration;
  }
  async releaseCreation(identity: AccessIdentity, reservation: number) {
    if (reservation !== this.usageGeneration) return;
    const item = identity.kind === 'owner' ? this.owners.get(identity.id) : this.requests.get(identity.id);
    if (item) item.creations = Math.max(0, item.creations - 1);
  }
  async resetCreations() { this.usageGeneration += 1; for (const item of [...this.owners.values(), ...this.requests.values()]) item.creations = 0; }
  async listSubscriptions(): Promise<[string, PushSubscription][]> { return [...this.subscriptions]; }
  async putSubscription(id: string, subscription: PushSubscription) {
    if (this.subscriptions.size >= 10 && !this.subscriptions.has(id)) throw new ServiceError('DEVICE_LIMIT', 'Remove an old notification device first.', 409);
    this.subscriptions.set(id, subscription);
  }
  async deleteSubscription(id: string) { this.subscriptions.delete(id); }
  clear() { this.requests.clear(); this.owners.clear(); this.subscriptions.clear(); }
}
export const memoryAccessStore = new MemoryAccessStore();
export const accessStore: AccessStore = memoryAccessStore;
