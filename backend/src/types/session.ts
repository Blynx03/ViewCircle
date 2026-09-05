export const sessionStatuses = ['CREATED', 'READY', 'LIVE', 'HOST_RECONNECTING', 'ENDED', 'EXPIRED'] as const;
export type SessionStatus = (typeof sessionStatuses)[number];

export interface GuestRecord {
  identity: string;
  name: string;
  joinedAt: Date;
  removed: boolean;
}

export interface Session {
  id: string;
  roomCode: string;
  sessionName?: string;
  hostName: string;
  pinHash?: string;
  status: SessionStatus;
  locked: boolean;
  createdAt: Date;
  startedAt?: Date;
  endedAt?: Date;
  hostAuthorityHash: string;
  guests: Map<string, GuestRecord>;
}

export interface PublicSession {
  roomCode: string;
  sessionName?: string;
  hostName: string;
  pinRequired: boolean;
  status: SessionStatus;
  locked: boolean;
  guestCount: number;
  capacity: number;
}
