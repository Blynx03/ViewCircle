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
  chatColor?: number;
}): Promise<string> {
  const token = new AccessToken(env.LIVEKIT_API_KEY, env.LIVEKIT_API_SECRET, {
    identity: input.identity,
    name: input.name,
    ttl: input.ttl ?? 180 * 60,
    metadata: JSON.stringify({ role: input.role, chatColor: input.chatColor ?? 0 })
  });
  token.addGrant({
    roomJoin: true,
    room: input.roomCode,
    canSubscribe: true,
    canPublish: true,
    canPublishData: true,
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
  await expireRoom(roomCode);
}

// Expiry cleanup must surface transport failures so the sweep can retry.
export async function expireRoom(roomCode: string): Promise<void> {
  try { await roomService.deleteRoom(roomCode); } catch (error) {
    if ((error as { status?: number; code?: string }).status !== 404 && (error as { code?: string }).code !== 'not_found') throw error;
  }
}

export async function provisionRoom(roomCode: string): Promise<void> {
  await roomService.createRoom({ name: roomCode, metadata: JSON.stringify({ application: 'viewcircle', version: 1 }), emptyTimeout: 600, departureTimeout: 180, maxParticipants: 11 });
}
export async function roomPresence(roomCode: string) {
  return roomService.listParticipants(roomCode);
}

// Only rooms explicitly tagged by this application can be reconciled after a
// process restart. Never delete unrelated rooms in a shared LiveKit project.
export async function orphanedRooms(known: Set<string>): Promise<string[]> {
  const rooms = await roomService.listRooms();
  return rooms.filter(room => {
    try { return (JSON.parse(room.metadata) as { application?: string } | null)?.application === 'viewcircle' && !known.has(room.name); }
    catch { return false; }
  }).map(room => room.name);
}
