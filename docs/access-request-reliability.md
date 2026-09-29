# ViewCircle access-request reliability

## 1. Original lockout causes

The access-request route ran both Express rate limiters before parsing input or checking the browser record. Every submission consumed the per-IP budget, including malformed input, pending retries and already-approved browsers. Submissions passing that limiter also consumed the global budget. Existing pending/approved requests were then rejected with `REQUEST_EXISTS` rather than reused. Denied/otherwise closed records less than five minutes old were also rejected. A lost POST response could leave a Host unsure whether the request existed.

With `TRUST_PROXY` empty, Express uses the socket peer rather than forwarded client IP headers. The Vercel external `/api` rewrite and Render ingress can therefore put unrelated users in the same effective bucket. The repository does not establish verified production proxy ranges or a trustworthy hop topology. No production infrastructure inspection or environment changes were made.

## 2. Original and replacement waits

The previous defaults were five submissions per IP per hour and 30 global submissions per hour: fixed windows could require waiting almost an hour. The additional browser cooldown lasted until five minutes after request creation. Pending/approved records were rejected regardless of that cooldown; a pending record normally lasts 30 minutes, and approval normally lasts 12 hours from approval. The separate request-status endpoint also had a 30-polls-per-IP-per-minute limit (up to a minute's wait); normal gate polling uses `/api/access`.

There is now no five-minute cooldown and no status-poll throttle. Denied, expired or cleared workflows can submit immediately unless they have actually exhausted a new-request budget. Actual creation throttling waits at most the remainder of the ten-minute window, with a structured estimate. Retries never slide or extend that deadline. Owner reset makes a blocked new workflow eligible immediately, subject to subsequent new traffic.

## 3. Idempotency and browser identity

The existing `GET /api/access` establishes a missing server-signed opaque `vc_visitor` HttpOnly cookie before the gate renders Request Access. A POST accepted by the server can then be retried with the same identity even if its response is lost. No browser identity, password or approval credential is added to localStorage. Cookies retain SameSite=Lax, Path=/api, host-only scope and Secure in production. Server records store the HMAC lookup digest. Existing legacy cookies bound to request records remain supported; arbitrary unrecognized caller-selected cookies are replaced.

A pending browser gets the same ID/status and “Your access request is already waiting for approval.” An approved browser gets its current approval and “Access already granted.” The frontend rechecks authoritative access and opens Create Room. An authenticated Owner also receives approved state rather than creating a visitor request. Polling/reuse does not extend authorization or cookie expiry.

The memory store performs the second reuse check, limiter consumption and insertion without yielding. Concurrent submissions with the same established identity create exactly one record, count once and send one push attempt. A future database adapter must make this boundary transactional. Denied/expired request history remains available; cookie lookup uses the latest workflow.

Different profiles/devices remain different identities. No person-level identification is attempted. Clients that erase/reject cookies, or raw API callers submitting without first establishing an identity, cannot recover a lost identity; they remain subject to secondary IP/global protection. Browser startup must complete the access check before submission.

## 4. Remaining rate-limit rules

Only validated, genuinely new access records consume the following code-defined fixed windows:

| Scope | New requests | Window |
| --- | ---: | --- |
| Browser identity | 5 | 10 minutes |
| Effective IP (secondary) | 120 | 10 minutes |
| All browsers/IPs | 300 | 10 minutes |

All three budgets are checked before any counter increments. Rejected submissions, malformed input, pending/approved reuse and status polling consume none. Push occurs only for a new record; clearing cookies cannot bypass the IP/global ceilings. IPv6 addresses use express-rate-limit's subnet key normalization, and the resulting IP key is HMAC-hashed before storage. Expired buckets are pruned, and blocked requests allocate no additional buckets.

The old `ACCESS_REQUEST_MAX_PER_HOUR` and `ACCESS_REQUEST_GLOBAL_MAX_PER_HOUR` schema settings are retired and no longer read. Existing environment files/values, including any legacy settings, were not edited; no environment update is required for the new policy. The deliberate broader IP/global windows accommodate shared infrastructure and multiple legitimate browsers while bounding creation and notification work. This application-level protection does not replace infrastructure DDoS controls.

Owner login's existing five-failed-attempts/IP/15-minute default and global 50-attempts/15-minute limiter remain unchanged, as do session-route limits.

## 5. Proxy/IP handling

`TRUST_PROXY` and app configuration are unchanged. The code uses only Express's resolved `request.ip` (socket fallback), never raw `X-Forwarded-For`. Tests demonstrate that spoofed forwarding headers do not split buckets when trust is disabled. Existing request header, Origin, Sec-Fetch-Site and CORS validation remain intact.

The secondary IP bucket may still aggregate legitimate users; deduplication and broader creation budgets reduce its normal impact. Reliable production client attribution still requires a separately verified infrastructure trust boundary. Express warns that blindly trusting proxy headers can allow client-controlled values: [Express behind proxies](https://expressjs.com/en/guide/behind-proxies/). The repository's external rewrite is consistent with [Vercel external rewrites](https://vercel.com/docs/routing/rewrites), but its configuration alone does not prove which forwarding chain Render observes. [Vercel request headers](https://vercel.com/docs/headers/request-headers) and [Render edge protection](https://render.com/articles/how-render-handles-ddos-attacks) describe provider header behavior; neither justifies trusting arbitrary headers at this application's public backend.

## 6–8. Owner reset and preserved state

The Owner dashboard has **Access Request Protection**, an aggregate last-throttled status and **Reset Access Request Limits**. Confirmation reads:

> Reset access request limits?
>
> This allows blocked Hosts to request access again immediately.

`GET /api/owner/access-request-protection` reports aggregate bucket counts, new-request count and last throttled time. No IP addresses or identity keys are exposed. `POST /api/owner/access-request-protection/reset` clears exactly the browser buckets, secondary IP buckets, global creation bucket and last-throttled timestamp. There are no remaining browser cooldown records or independent access-status counters to clear.

Both routes are behind existing Owner authentication. Reset also requires the custom CSRF header and existing Origin/Fetch Metadata checks. It is not subject to the exhausted creation budget and reports success/failure in the dashboard.

Reset preserves pending requests, approvals/expiry, request history, Owner authentication and cookies, failed-login/global-login counters, passwords, Host creation usage, room capacity, active sessions, Guest admission, LiveKit rooms and push subscriptions. Reset Host Creation Usage remains a separate action. Tests prove an exhausted Owner-login bucket remains exhausted after access reset.

Ending a room does not revoke valid access approval: an approved browser can create another room within its authorization lifetime, preserving creation quotas and the one-active-room rule. No session/media architecture was changed.

## 9. User-facing errors

Access creation no longer returns the generic “Too many attempts” response. Actual throttles return HTTP 429, code `ACCESS_REQUEST_THROTTLED`, `retryAfterSeconds`, a matching `Retry-After` header, and:

> Too many access requests were received. Please contact the Owner or try again shortly.

The frontend adds “Try again in about N minutes.” It leaves retry available so Owner reset takes effect immediately without a client-side countdown lock. Successful polls do not erase a creation throttle message while access is still unavailable. Pending and approved workflows display their own messages rather than an error.

## 10. Exact files changed

- `backend/src/access/protection.ts` (new)
- `backend/src/access/routes.ts`
- `backend/src/access/store.ts`
- `backend/src/config/env.ts`
- `backend/tests/access-protection.test.ts` (new)
- `backend/tests/access.test.ts`
- `frontend/src/api/access.ts`
- `frontend/src/api/client.ts`
- `frontend/src/components/AccessGate.tsx`
- `frontend/src/pages/OwnerPage.tsx`
- `frontend/src/types/session.ts`
- `frontend/src/test/access.test.tsx`
- `frontend/layout/access-reliability.spec.ts` (new)
- `docs/owner-access.md`
- `docs/access-request-reliability.md` (new)

## 11. Validation

Final validation passed:

- Backend TypeScript and frontend TypeScript.
- Backend/frontend ESLint, zero warnings.
- Backend: **92 tests** across nine files.
- Frontend: **170 tests** across 17 files.
- Full browser suite: **210 passed** (Chromium 90, WebKit 90, focused Firefox 30).
- Final focused access-flow rerun after review: **4 passed** across Chromium/WebKit.
- Backend and frontend production builds.
- `git diff --check`.

The initial new concurrency test reused a Supertest agent across simultaneous ephemeral server requests and hit `ECONNRESET`; it was corrected to use independent clients carrying the same established cookie. A new test also used `unset` on the agent instead of its request; that test harness error was corrected. Final suites pass without retries. No application behavior was weakened to accommodate those test errors.

Tests include concurrency/lost-response identity reuse, pending/approved reuse above prior attempt limits, push deduplication, denied/expired/cleared recovery, browser/IP/global throttles, retry estimates/window expiry, authenticated reset and preservation of rooms/approvals/usage/login lockout, source validation, untrusted forwarded headers, and mobile Owner/Host browser flows. Existing regression suites cover Owner decisions/logout, push, Host creation, Public/Private joining, active-session controls, quotas, room uniqueness and stabilization behavior.

## 12. Memory-backed limits and operational scope

A backend restart clears access throttle counters, but also loses the application's existing in-memory requests, approvals, Owner sessions and session records. Owner reset clears only the access-request protection object and needs no restart. Counts/status/reset apply to one process, not a shared multi-instance fleet. No database or dependency was added. Push delivery and production proxy routing were not exercised against live services; tests mock these boundaries.

The working tree was clean at the beginning of this pass, with prior stabilization present. No commits, pushes, deployments or environment-variable changes were performed.
