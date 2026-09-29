import { expect, it } from 'vitest';
import { AccessRequestProtection, AccessRequestThrottle } from '../src/access/protection.js';
it('expires fixed windows, does not count rejected attempts, and resets every access-only bucket', () => {
  const protection = new AccessRequestProtection({ browser: 1, ip: 2, global: 3, windowMs: 60_000 });
  protection.consume('a', 'ip-a', 0);
  try { protection.consume('a', 'ip-b', 10_000); throw new Error('Expected throttle'); }
  catch (error) { expect(error).toBeInstanceOf(AccessRequestThrottle); expect((error as AccessRequestThrottle).retryAfterSeconds).toBe(50); }
  protection.consume('b', 'ip-a', 10_000);
  expect(() => protection.consume('c', 'ip-a', 20_000)).toThrow(AccessRequestThrottle);
  protection.consume('c', 'ip-c', 20_000);
  expect(() => protection.consume('d', 'ip-d', 30_000)).toThrow(AccessRequestThrottle);
  expect(protection.status(30_000).newRequests).toBe(3);
  // Blocked retries do not move the original window deadline.
  protection.consume('a', 'ip-a', 60_000);
  expect(protection.status(60_000).newRequests).toBe(1);
  protection.reset();
  expect(protection.status(60_000)).toEqual({ browserBuckets: 0, ipBuckets: 0, newRequests: 0, lastThrottledAt: null });
});
