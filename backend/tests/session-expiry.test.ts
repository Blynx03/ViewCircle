import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('../src/services/livekit-service.js', () => ({ expireRoom: vi.fn(async () => undefined), roomPresence: vi.fn(async () => []), provisionRoom: vi.fn(async () => undefined), createMediaToken: vi.fn() }));
import { expireRoom } from '../src/services/livekit-service.js';
import { createExpirySweep } from '../src/services/session-expiry.js';
import { SessionService } from '../src/services/session-service.js';
import { sessionStore } from '../src/stores/session-store.js';
beforeEach(() => { sessionStore.clear(); vi.clearAllMocks(); });
it('retries room deletion failures and releases capacity only after successful cleanup', async () => {
  const { session } = await new SessionService(sessionStore).create({ hostName: 'Test' });
  session.createdAt = new Date(Date.now() - 181 * 60000);
  vi.mocked(expireRoom).mockRejectedValueOnce(new Error('network'));
  const sweep = createExpirySweep(); await sweep();
  expect(session.status).toBe('EXPIRED');
  await sweep(); expect(session.status).toBe('ENDED');
  await sweep(); expect(expireRoom).toHaveBeenCalledTimes(2);
});
it('does not overlap sweeps or delete unexpired rooms', async () => {
  const service = new SessionService(sessionStore);
  const { session } = await service.create({ hostName: 'Old' });
  await service.create({ hostName: 'New' });
  session.createdAt = new Date(Date.now() - 181 * 60000);
  let release!: () => void;
  vi.mocked(expireRoom).mockImplementationOnce(() => new Promise<void>(resolve => { release = resolve; }));
  const sweep = createExpirySweep(); const first = sweep(); await sweep();
  expect(expireRoom).toHaveBeenCalledOnce(); release(); await first;
  expect(session.status).toBe('ENDED');
});
