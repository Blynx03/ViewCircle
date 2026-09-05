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
    if (this.sessions.has(session.roomCode)) return Promise.reject(new Error('ROOM_CODE_COLLISION'));
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
    this.queues.set(roomCode, previous.then(() => current));
    await previous;
    try {
      const session = this.sessions.get(roomCode);
      if (session) mutate(session);
      return session;
    } finally {
      release();
      if (this.queues.get(roomCode) === current) this.queues.delete(roomCode);
    }
  }

  clear(): void { this.sessions.clear(); }
}

export const sessionStore = new InMemorySessionStore();
