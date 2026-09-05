import { randomUUID } from 'node:crypto';
import type { CreateSessionInput } from '../validation/session.js';
import type { PublicSession, Session } from '../types/session.js';
import type { SessionStore } from '../stores/session-store.js';
import { createMediaToken } from './livekit-service.js';
import { createRoomCode, createSecret, hashAuthority, hashPin, verifyPin } from '../utilities/security.js';

export class ServiceError extends Error {
  constructor(public readonly code: string, message: string, public readonly status: number) { super(message); }
}

export class SessionService {
  constructor(private readonly store: SessionStore, private readonly codeFactory = createRoomCode) {}

  async create(input: CreateSessionInput): Promise<{ session: Session; authority: string }> {
    const authority = createSecret();
    for (let attempt = 0; attempt < 25; attempt += 1) {
      const roomCode = this.codeFactory();
      if (await this.store.find(roomCode)) continue;
      const session: Session = {
        id: randomUUID(), roomCode, hostName: input.hostName,
        ...(input.sessionName ? { sessionName: input.sessionName } : {}),
        ...(input.pin ? { pinHash: await hashPin(input.pin) } : {}),
        status: 'CREATED', locked: false, createdAt: new Date(),
        hostAuthorityHash: hashAuthority(authority), guests: new Map()
      };
      try { await this.store.create(session); return { session, authority }; }
      catch (error) { if (!(error instanceof Error) || error.message !== 'ROOM_CODE_COLLISION') throw error; }
    }
    throw new ServiceError('CODE_GENERATION_FAILED', 'Could not create a room. Please try again.', 503);
  }

  publicView(session: Session): PublicSession {
    return {
      roomCode: session.roomCode, ...(session.sessionName ? { sessionName: session.sessionName } : {}),
      hostName: session.hostName, pinRequired: Boolean(session.pinHash), status: session.status,
      locked: session.locked, guestCount: [...session.guests.values()].filter((guest) => !guest.removed).length,
      capacity: 10
    };
  }

  async requireSession(roomCode: string): Promise<Session> {
    const session = await this.store.find(roomCode);
    if (!session) throw new ServiceError('SESSION_NOT_FOUND', 'This session could not be found.', 404);
    return session;
  }

  requireHost(session: Session, authority: string | undefined): void {
    if (!authority || hashAuthority(authority) !== session.hostAuthorityHash) {
      throw new ServiceError('HOST_UNAUTHORIZED', 'Host authorization is required.', 403);
    }
  }

  async hostToken(session: Session, authority: string | undefined): Promise<{ token: string; identity: string }> {
    this.requireHost(session, authority);
    if (session.status === 'ENDED' || session.status === 'EXPIRED') throw new ServiceError('SESSION_ENDED', 'This session has ended.', 410);
    const identity = `host-${session.id}`;
    const token = await createMediaToken({ roomCode: session.roomCode, identity, name: session.hostName, role: 'host' });
    if (session.status !== 'LIVE') await this.store.update(session.roomCode, (current) => {
      current.status = 'LIVE'; current.startedAt ??= new Date();
    });
    return { token, identity };
  }

  async join(session: Session, name: string, pin?: string): Promise<{ token: string; identity: string }> {
    if (session.status === 'ENDED' || session.status === 'EXPIRED') throw new ServiceError('SESSION_ENDED', 'This session has ended.', 410);
    if (session.locked) throw new ServiceError('SESSION_LOCKED', 'This session is no longer accepting Guests.', 423);
    if (session.pinHash && (!pin || !(await verifyPin(pin, session.pinHash)))) {
      throw new ServiceError('WRONG_PIN', 'That PIN is not correct.', 401);
    }
    const identity = `guest-${randomUUID()}`;
    let accepted = false;
    await this.store.update(session.roomCode, (current) => {
      const active = [...current.guests.values()].filter((guest) => !guest.removed).length;
      if (active < 10 && !current.locked && !['ENDED', 'EXPIRED'].includes(current.status)) {
        current.guests.set(identity, { identity, name, joinedAt: new Date(), removed: false }); accepted = true;
      }
    });
    if (!accepted) throw new ServiceError('SESSION_FULL', 'This session is full.', 409);
    const token = await createMediaToken({ roomCode: session.roomCode, identity, name, role: 'guest' });
    return { token, identity };
  }
}
