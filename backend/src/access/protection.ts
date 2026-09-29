// Separate from authorization records and Owner login limiters. Only a committed
// new access request consumes these fixed windows; rejected submissions do not.
export const ACCESS_REQUEST_LIMITS = { browser: 5, ip: 120, global: 300, windowMs: 10 * 60_000 };
type Bucket = { count: number; expiresAt: number };
export class AccessRequestThrottle extends Error {
  constructor(readonly retryAfterSeconds: number) { super('Too many access requests were received. Please contact the Owner or try again shortly.'); }
}
export class AccessRequestProtection {
  private browsers = new Map<string, Bucket>();
  private ips = new Map<string, Bucket>();
  private global: Bucket | undefined;
  private lastThrottledAt: number | null = null;
  constructor(private readonly limits = ACCESS_REQUEST_LIMITS) {}
  private prune(now: number) {
    for (const map of [this.browsers, this.ips]) for (const [key, value] of map) if (value.expiresAt <= now) map.delete(key);
    if (this.global && this.global.expiresAt <= now) this.global = undefined;
  }
  consume(browser: string, ip: string, now = Date.now()) {
    this.prune(now);
    const entries = [[this.browsers.get(browser), this.limits.browser], [this.ips.get(ip), this.limits.ip], [this.global, this.limits.global]] as const;
    const waits = entries.filter(([bucket, limit]) => bucket && bucket.count >= limit).map(([bucket]) => bucket!.expiresAt - now);
    if (waits.length) {
      this.lastThrottledAt = now;
      throw new AccessRequestThrottle(Math.max(1, Math.ceil(Math.max(...waits) / 1000)));
    }
    const increment = (bucket?: Bucket): Bucket => ({ count: (bucket?.count ?? 0) + 1, expiresAt: bucket?.expiresAt ?? now + this.limits.windowMs });
    this.browsers.set(browser, increment(this.browsers.get(browser)));
    this.ips.set(ip, increment(this.ips.get(ip)));
    this.global = increment(this.global);
  }
  status(now = Date.now()) {
    this.prune(now);
    return { browserBuckets: this.browsers.size, ipBuckets: this.ips.size, newRequests: this.global?.count ?? 0, lastThrottledAt: this.lastThrottledAt };
  }
  reset() { this.browsers.clear(); this.ips.clear(); this.global = undefined; this.lastThrottledAt = null; }
}
export const accessRequestProtection = new AccessRequestProtection();
