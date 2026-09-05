import { describe, expect, it } from 'vitest';
import { createMediaToken } from '../src/services/livekit-service.js';

interface TokenPayload { video?: { canPublishSources?: string[]; canPublish?: boolean; canSubscribe?: boolean; room?: string } }

function payload(token: string): TokenPayload {
  const encoded = token.split('.')[1];
  if (!encoded) throw new Error('Token payload is missing');
  return JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as TokenPayload;
}

describe('LiveKit media grants', () => {
  it('limits Guests to microphone publishing while retaining subscriptions', async () => {
    const grant = payload(await createMediaToken({ roomCode: '7K4P', identity: 'guest-test', name: 'Guest', role: 'guest' })).video;
    expect(grant).toMatchObject({ canPublish: true, canSubscribe: true, room: '7K4P' });
    expect(grant?.canPublishSources).toEqual(['microphone']);
    expect(grant?.canPublishSources).not.toContain('camera');
    expect(grant?.canPublishSources).not.toContain('screen_share');
  });

  it('allows the Host camera and microphone but not screen sharing', async () => {
    const sources = payload(await createMediaToken({ roomCode: '7K4P', identity: 'host-test', name: 'Host', role: 'host' })).video?.canPublishSources;
    expect(sources).toEqual(expect.arrayContaining(['camera', 'microphone']));
    expect(sources).not.toContain('screen_share');
  });
});
