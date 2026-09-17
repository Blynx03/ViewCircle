import { AccessToken, RoomServiceClient, TrackSource } from 'livekit-server-sdk';
import { env } from '../config/env.js';

const httpUrl = env.LIVEKIT_URL.replace(/^ws/, 'http');
const roomService = new RoomServiceClient(httpUrl, env.LIVEKIT_API_KEY, env.LIVEKIT_API_SECRET);

export async function createMediaToken(input: {
  roomCode: string;
  identity: string;
  name: string;
  role: 'host' | 'guest';
  ttl?: number;
}): Promise<string> {
  const token = new AccessToken(env.LIVEKIT_API_KEY, env.LIVEKIT_API_SECRET, {
    identity: input.identity,
    name: input.name,
    ttl: input.ttl ?? env.DEMO_MAX_SESSION_DURATION_MINUTES * 60,
    metadata: JSON.stringify({ role: input.role })
  });
  token.addGrant({
    roomJoin: true,
    room: input.roomCode,
    canSubscribe: true,
    canPublish: true,
    canPublishData: input.role === 'host',
    canPublishSources: input.role === 'host'
      ? [TrackSource.CAMERA, TrackSource.MICROPHONE]
      : [TrackSource.MICROPHONE]
  });
  return token.toJwt();
}

export async function removeParticipant(roomCode: string, identity: string): Promise<void> {
  await roomService.removeParticipant(roomCode, identity);
}

export async function closeRoom(roomCode: string): Promise<void> {
  try { await roomService.deleteRoom(roomCode); } catch { /* The room may not exist until media starts. */ }
}

// Expiry cleanup must surface transport failures so the sweep can retry.
export async function expireRoom(roomCode: string): Promise<void> {
  try { await roomService.deleteRoom(roomCode); } catch (error) {
    if ((error as { status?: number; code?: string }).status !== 404 && (error as { code?: string }).code !== 'not_found') throw error;
  }
}
