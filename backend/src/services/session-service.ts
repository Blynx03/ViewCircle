import { randomUUID } from 'node:crypto';
import type { CreateSessionInput } from '../validation/session.js';
import type { PublicSession, Session } from '../types/session.js';
import type { SessionStore } from '../stores/session-store.js';
import { createMediaToken } from './livekit-service.js';
import { createRoomCode, createSecret, hashAuthority } from '../utilities/security.js';

export class ServiceError extends Error {
  constructor(public readonly code: string, message: string, public readonly status: number) { super(message); }
}

export class SessionService {
  constructor(private readonly store: SessionStore, private readonly codeFactory = createRoomCode) {}

  async create(input: CreateSessionInput, accessKey?: string): Promise<{ session: Session; authority: string }> {
    const authority = createSecret();
    for (let attempt = 0; attempt < 25; attempt += 1) {
      const roomCode = this.codeFactory();
      if (await this.store.find(roomCode)) continue;
      const session: Session = {
        id: randomUUID(), discoveryId: randomUUID(), ...(accessKey ? { provisioning: true } : {}), roomCode, hostName: input.hostName,
        ...(input.sessionName ? { sessionName: input.sessionName } : {}),
        status: 'CREATED', locked: false, createdAt: new Date(), visibility: input.visibility ?? 'private', requests: new Map(), ...(accessKey ? { accessKey } : {}),
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
      locked: session.locked, guestCount: [...session.guests.values()].filter((guest) => !guest.removed && guest.connected !== false).length,
      capacity: 10, discoveryId: session.visibility === 'public' ? session.discoveryId : undefined, visibility: session.visibility ?? 'private', createdAt: session.createdAt.toISOString(), expiresAt: session.createdAt.getTime() + 180 * 60_000, hostConnected: session.hostConnected ?? false, cameraMissingSince: session.cameraMissingSince, hostMissingSince: session.hostMissingSince, everJoined: session.everJoined ?? false, aloneSince: session.aloneSince, keepWaiting: session.keepWaiting ?? false, pendingExtension: session.pendingExtension ?? 0, endingReason: session.endingReason
    };
  }

  async requireSession(roomCode: string): Promise<Session> {
    const session = await this.store.find(roomCode);
    if (!session) throw new ServiceError('SESSION_NOT_FOUND', 'This session could not be found.', 404);
    if (session.status !== 'ENDED' && session.createdAt.getTime() + 180 * 60_000 <= Date.now()) { session.status = 'EXPIRED'; session.endingReason ??= 'The three-hour session limit has been reached.'; }
    return session;
  }

  private remainingSeconds(session: Session): number {
    const remaining = Math.floor((session.createdAt.getTime() + 180 * 60_000 - Date.now()) / 1000);
    if (remaining <= 0) throw new ServiceError('SESSION_ENDED', 'This session has ended.', 410);
    return remaining;
  }

  requireHost(session: Session, authority: string | undefined): void {
    if (!authority || hashAuthority(authority) !== session.hostAuthorityHash) {
      throw new ServiceError('HOST_UNAUTHORIZED', 'Host authorization is required.', 403);
    }
  }

  async hostToken(session: Session, authority: string | undefined): Promise<{ token: string; identity: string }> {
    this.requireHost(session, authority);
    if (session.provisioning) throw new ServiceError('SESSION_PREPARING', 'The Host is preparing this session. Please try again shortly.', 409);
    if (session.status === 'ENDED' || session.status === 'EXPIRED') throw new ServiceError('SESSION_ENDED', 'This session has ended.', 410);
    const identity = `host-${session.id}`;
    const token = await createMediaToken({ roomCode: session.roomCode, identity, name: session.hostName, role: 'host', ttl: this.remainingSeconds(session) });
    if (session.status !== 'LIVE') await this.store.update(session.roomCode, (current) => {
      if (['ENDED', 'EXPIRED'].includes(current.status)) throw new ServiceError('SESSION_ENDED', 'This session has ended.', 410);
      this.remainingSeconds(current);
      current.status = 'LIVE'; current.startedAt ??= new Date();
    });
    return { token, identity };
  }

  async join(session: Session, name: string, _pin?: string, approved = false): Promise<{ token: string; identity: string }> {
    if (session.provisioning) throw new ServiceError('SESSION_PREPARING', 'The Host is preparing this session. Please try again shortly.', 409);
    if (session.status === 'ENDED' || session.status === 'EXPIRED') throw new ServiceError('SESSION_ENDED', 'This session has ended.', 410);
    if (session.visibility === 'public' && !approved) throw new ServiceError('APPROVAL_REQUIRED', 'Request access and wait for the Host to allow you.', 403);
    if (session.locked) throw new ServiceError('SESSION_LOCKED', 'This session is no longer accepting Guests.', 423);
    const identity = `guest-${randomUUID()}`;
    let accepted = false;
    await this.store.update(session.roomCode, (current) => {
      const active = [...current.guests.values()].filter((guest) => !guest.removed && guest.connected !== false).length;
      if (active < 10 && !current.locked && !['ENDED', 'EXPIRED'].includes(current.status)) {
        current.guests.set(identity, { identity, name, joinedAt: new Date(), removed: false }); accepted = true;
      }
    });
    if (!accepted) throw new ServiceError('SESSION_FULL', 'This session is full.', 409);
    let token: string;
    try { token = await createMediaToken({ roomCode: session.roomCode, identity, name, role: 'guest', ttl: this.remainingSeconds(session) }); }
    catch (error) { session.guests.delete(identity); throw error; }
    if (['ENDED', 'EXPIRED'].includes(session.status)) throw new ServiceError('SESSION_ENDED', 'This session has ended.', 410);
    return { token, identity };
  }
}
