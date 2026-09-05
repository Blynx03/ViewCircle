export type SessionStatus = 'CREATED' | 'READY' | 'LIVE' | 'HOST_RECONNECTING' | 'ENDED' | 'EXPIRED';
export type OrientationPreference = 'portrait' | 'landscape';
export type ConnectionState = 'connected' | 'poor' | 'reconnecting' | 'disconnected';
export interface PublicSession { roomCode: string; sessionName?: string; hostName: string; pinRequired: boolean; status: SessionStatus; locked: boolean; guestCount: number; capacity: number }
export interface Credentials { token: string; identity: string; livekitUrl: string }
export interface ApiError { code: string; message: string }
