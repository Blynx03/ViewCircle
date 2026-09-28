export const sessionStatuses = ['CREATED', 'READY', 'LIVE', 'HOST_RECONNECTING', 'ENDED', 'EXPIRED'] as const;
export type SessionStatus = (typeof sessionStatuses)[number];

export interface GuestRecord {
  identity: string;
  name: string;
  joinedAt: Date;
  removed: boolean;
  connected?: boolean;
  missingSince?: number;
  chatColor?: number;
}

export interface Session {
  id: string;
  roomCode: string;
  sessionName?: string;
  hostName: string;
  pinHash?: string;
  visibility?: 'public' | 'private';
  accessKey?: string;
  discoveryId?: string;
  provisioning?: boolean;
  hostConnected?: boolean;
  hostSeen?: boolean;
  hostMissingSince?: number;
  cameraMissingSince?: number;
  cameraReportedLost?: boolean;
  everJoined?: boolean;
  aloneSince?: number;
  keepWaiting?: boolean;
  pendingExtension?: number;
  endingReason?: string;
  requests?: Map<string, { id: string; name: string; secretHash: string; expiresAt: number; status: 'pending' | 'allowed' | 'denied'; credentials?: { token: string; identity: string } }>;

  status: SessionStatus;
  locked: boolean;
  createdAt: Date;
  startedAt?: Date;
  endedAt?: Date;
  hostAuthorityHash: string;
  guests: Map<string, GuestRecord>;
}

export interface PublicSession {
  provisioning: boolean;
  joinable: boolean;
  roomCode: string;
  sessionName?: string;
  hostName: string;
  pinRequired: boolean;
  status: SessionStatus;
  locked: boolean;
  guestCount: number;
  capacity: number;
  discoveryId: string | undefined;
  visibility: 'public' | 'private';
  createdAt: string;
  expiresAt: number;
  hostConnected: boolean;
  cameraMissingSince: number | undefined;
  hostMissingSince: number | undefined;
  everJoined: boolean;
  aloneSince: number | undefined;
  keepWaiting: boolean;
  pendingExtension: number;
  endingReason: string | undefined;
}
