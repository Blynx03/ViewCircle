import { ServiceError } from '../services/session-service.js';
import type { Session } from '../types/session.js';

export interface SessionStore {
  create(session: Session): Promise<void>;
  find(roomCode: string): Promise<Session | undefined>;
  update(roomCode: string, mutate: (session: Session) => void): Promise<Session | undefined>;
  clear(): void;
}

export class InMemorySessionStore implements SessionStore {
  private readonly sessions = new Map<string, Session>();
  private readonly queues = new Map<string, Promise<void>>();

  create(session: Session): Promise<void> {
    this.prune();
    if (this.sessions.has(session.roomCode)) return Promise.reject(new Error('ROOM_CODE_COLLISION'));
    const active = [...this.sessions.values()].filter(item => item.status !== 'ENDED').length;
    if (active >= 2) return Promise.reject(new ServiceError('DEMO_SESSION_LIMIT', 'All available session slots are currently in use.', 429));
    if (session.accessKey && [...this.sessions.values()].some(item => item.status !== 'ENDED' && item.accessKey === session.accessKey)) return Promise.reject(new ServiceError('ACTIVE_SESSION_EXISTS', 'You already have an active session.', 409));
    this.sessions.set(session.roomCode, session);
    return Promise.resolve();
  }

  find(roomCode: string): Promise<Session | undefined> {
    return Promise.resolve(this.sessions.get(roomCode));
  }

  async update(roomCode: string, mutate: (session: Session) => void): Promise<Session | undefined> {
    const previous = this.queues.get(roomCode) ?? Promise.resolve();
    let release = (): void => undefined;
    const current = new Promise<void>((resolve) => { release = resolve; });
    const queued = previous.then(() => current);
    this.queues.set(roomCode, queued);
    await previous;
    try {
      const session = this.sessions.get(roomCode);
      if (session) mutate(session);
      return session;
    } finally {
      release();
      if (this.queues.get(roomCode) === queued) this.queues.delete(roomCode);
    }
  }

  private prune(): void {
    for (const [code, session] of this.sessions) if (session.status === 'ENDED' && session.endedAt && session.endedAt.getTime() < Date.now() - 86400000) this.sessions.delete(code);
  }
  all(): Session[] { return [...this.sessions.values()]; }
  clear(): void { this.sessions.clear(); this.queues.clear(); }
}

export const sessionStore = new InMemorySessionStore();
