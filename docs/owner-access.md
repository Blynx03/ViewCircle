# Owner-approved portfolio access

Implemented locally. No commit, push, or deployment is part of this change.

## Architecture and behavior

Visit `/owner` for the private Owner login and small request dashboard. Credentials are checked by the backend with bcrypt (cost 12–15); production refuses to start without Owner configuration. The browser receives an opaque 256-bit random `vc_owner` HttpOnly cookie. Only an HMAC digest is stored as its server-side lookup key. Login rotates the current session; logout deletes it, including replayed copies of the cookie.

Remember Me off uses a browser-session cookie with a backend expiry of 12 hours. Browser session restore can retain session cookies, but the server deadline still applies. Remember Me on adds a persistent cookie lifetime of 30 days. Both durations are configurable, fixed from login, and not extended by polling. Credentials are never stored in localStorage, URLs, responses, or logs.

Only `/host` (Create Room) sits inside `AccessGate`. The root Host/Guest choice, `/join`, `/join/:roomCode`, `/watch/:roomCode`, and ended page are public. The existing-room `/host/:roomCode` flow uses room-specific Host authority, not demo approval. An unauthorized Host stays on `/host` while requesting access; approval automatically reveals Create Room at that same URL. An unapproved prospective Host supplies a required name (80 characters maximum) and optional email/company (160). No account or password. A random `vc_visitor` HttpOnly cookie binds this browser to its request. The backend stores only its HMAC digest. Pending requests expire after 30 minutes; approval changes that same server-side record to approved for 12 hours **from approval**, with no bearer token exposed to React. Refresh retains the cookie. Denied/expired visitors can request again, subject to cooldown and limits.

The gate polls `GET /api/access` every five seconds while unauthorized, every minute while authorized, at the authorization deadline, and when returning to the foreground. Requests do not overlap within the polling loop and timers/listeners are cleaned up. Backend creation middleware always checks current demo authorization. The frontend removes the creation form when it observes expiry; existing rooms retain their own Host authority and room lifetime. Owner dashboard polling remains available every five seconds even if push fails.

`AccessStore` is an asynchronous persistence interface with a memory implementation. It covers requests, Owner sessions, decisions, subscription registration, and atomic session-creation reservations. A future shared database adapter must implement these operations transactionally. Terminal request history is retained until 24 hours after expiry. No Supabase migration was added.

**Owner authority is not Host authority.** Owners and approved visitors may create; any Guest may join a valid existing room; existing room-specific `vc_host` checks still govern Host token, lock, remove and end. Capacity remains one Host and ten Guests.

## Cookies and CSRF

Both access cookies are HttpOnly, host-only (no Domain), SameSite=Lax, Path=/api, and Secure in production. The visitor cookie may outlive backend authorization by the pending-request duration; this does not extend approval. Store records and expiry are authoritative. API responses are `Cache-Control: no-store`, and the service worker does not cache `/api/`.

All API mutations require `X-ViewCircle-Request: 1`. Supplied Origin must exactly match `CLIENT_URL`, and cross-site Fetch Metadata is rejected. This covers login, logout, approval/denial, request creation, subscriptions and session mutations. Cross-site forms cannot supply the header; CORS only permits the configured frontend origin. Non-browser clients may omit Origin but still need the header and authorization. Status GETs do not change authorization or mint cookies.

Use the existing same-origin Vercel `/api` rewrite (or Vite proxy locally). Do not switch cookies to SameSite=None to work around a direct cross-site API URL. No new Vercel environment variables are needed; keep `VITE_API_URL` unset/empty for this deployment.

## Routes

| Route | Access |
| --- | --- |
| GET /api/health | Public |
| GET /api/access | Only current browser's authorization and request status |
| POST /api/access-requests | Public, CSRF and request rate limits |
| GET /api/access-requests/:id/status | Requires matching browser cookie; random IDs alone grant nothing |
| POST /api/owner/login | Public, CSRF and brute-force limits |
| POST /api/owner/logout | Owner |
| GET /api/owner/access-requests | Owner; up to 100 recent records |
| POST /api/owner/access-requests/:id/approve | Owner; pending requests only |
| POST /api/owner/access-requests/:id/deny | Owner; pending requests only |
| GET /api/owner/push-key | Owner; public VAPID key only |
| POST /api/owner/push-subscriptions | Owner |
| DELETE /api/owner/push-subscriptions | Owner; current endpoint |
| POST /api/sessions | Owner or approved demo access; reserves creator quota |
| GET /api/sessions/:roomCode/public | Public room preview; room-code validation |
| POST /api/sessions/:roomCode/join | Public Guest join; room/PIN/lock/capacity/lifetime checks |
| POST /api/sessions/:roomCode/leave | Signed, unexpired Guest media token matching room and Guest identity; CSRF protection |
| POST /api/sessions/:roomCode/participant-status | Existing room/identity status lookup |
| POST /api/sessions/:roomCode/host-token, lock, remove-participant or end | Existing room-specific Host authority |

Demo authorization applies only to creation. No Guest join reserves or consumes a creation allowance. Every session mutation still passes the unchanged CSRF/origin protections and existing route rate limits.

## Limits

Defaults: two active sessions, 120 minutes from session creation, five successful creations per authorization. Creation slots are reserved before async PIN hashing and refunded if creation fails. The session store atomically enforces active-room capacity. Owner limits apply per Owner login; visitor limits apply per approval. Room capacity is unchanged.

Tokens cannot be minted for expired sessions and their TTL is capped at the room deadline. An independent five-second backend sweep deletes expired LiveKit rooms, disconnecting existing media, and retries failed deletions. Expired rooms continue occupying capacity until cleanup succeeds. Room deletion depends on LiveKit being reachable; token expiry alone does not disconnect an already-connected participant.

Requests: five attempts per IP per hour and 30 global attempts per hour, plus no duplicate pending/approved request and a five-minute browser cooldown for another request. Creation of requests and push attempts is bounded together. Login: five failed attempts per IP per 15-minute window; successful requests are excluded. An additional global 50-attempt/15-minute ceiling bounds bcrypt work, including rotating-IP attacks. Rate limits operate in tests as well as production.

`TRUST_PROXY` defaults to empty (no trust of forwarded headers). It accepts only a comma-separated list of proxy IPs/CIDRs understood by Express; configure verified infrastructure ranges, never `true` or an arbitrary hop count. With no trusted proxy, users behind the Render/Vercel proxy share an IP bucket: conservative protection, potentially inconvenient. This cannot be resolved safely by guessing provider ranges. Verify the actual proxy path before configuring it. Limits and persistence are single-process: run one backend instance.

## Web Push

After login, tap **Enable Access Notifications**. The explicit tap requests permission, registers the service worker, subscribes with the public VAPID key, and registers the device with the Owner-only backend. The private VAPID key remains on Render. Up to ten devices are supported; Disable removes this browser's subscription. Reopening the dashboard re-registers an existing browser subscription after a backend restart. Logout removes the login session but leaves this explicitly enabled device subscribed; disable notifications before logout if desired.

New requests attempt encrypted push using `web-push`. A failed send never prevents request creation; 404/410 endpoints are removed. Only HTTPS Apple, Google FCM and Mozilla push-service endpoints are accepted, preventing arbitrary server requests. Other push providers would need a deliberate allowlist addition. Payloads contain the requester's name and no credentials, email/company or subscription secrets. Names can appear on the device lock screen; change OS notification previews if desired.

A notification tap focuses an existing `/owner` window, otherwise opens `/owner`. It does not navigate an active Host/Guest room away. The backend still authenticates every dashboard operation. Manual dashboard management works without notifications, denied permission, or VAPID configuration.

Home Screen Web Push requires compatible iOS/iPadOS (16.4+) and a user interaction for permission: [WebKit documentation](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/). Implementation uses the standard [web-push library](https://github.com/web-push-libs/web-push). No Firebase, APNs credentials or Apple Developer account is required.

## Exact backend environment variables

Render requires existing `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, plus:

```dotenv
NODE_ENV=production
CLIENT_URL=https://your-viewcircle-frontend.example
OWNER_USERNAME=<private-owner-username>
OWNER_PASSWORD_HASH=<bcrypt-hash-cost-12>
OWNER_SESSION_SECRET=<random-secret-at-least-32-characters>
```

To enable push, also configure all three (or leave all three empty):

```dotenv
VAPID_PUBLIC_KEY=<public-key>
VAPID_PRIVATE_KEY=<private-key>
VAPID_SUBJECT=mailto:your-real-owner-address@example.com
```

Optional settings, shown with defaults:

```dotenv
PORT=4000
OWNER_SESSION_TTL_HOURS=12
OWNER_REMEMBER_ME_DAYS=30
VISITOR_ACCESS_TTL_HOURS=12
ACCESS_REQUEST_TTL_MINUTES=30
ACCESS_REQUEST_MAX_PER_HOUR=5
ACCESS_REQUEST_GLOBAL_MAX_PER_HOUR=30
OWNER_MAX_FAILED_LOGIN_ATTEMPTS=5
OWNER_LOGIN_LOCKOUT_MINUTES=15
DEMO_MAX_ACTIVE_SESSIONS=2
DEMO_MAX_SESSION_DURATION_MINUTES=120
DEMO_MAX_SESSION_CREATIONS_PER_ACCESS=5
TRUST_PROXY=
```

Render normally supplies PORT. No Supabase variables are required. The existing `.env.example` retains its unused future Supabase placeholders. Never put Owner secrets or VAPID private keys in Vercel variables, React variables, source, or URLs.

Run these exact commands from the repository root, locally:

```sh
node backend/scripts/hash-owner-password.mjs
node -e 'console.log(require("node:crypto").randomBytes(48).toString("base64url"))'
npx --no-install web-push generate-vapid-keys
```

The first prompts for a password twice without echo or shell history and prints only its bcrypt hash. The second generates OWNER_SESSION_SECRET. The third prints the VAPID pair. Copy these outputs directly into backend secret settings or an ignored local backend `.env`; do not commit the outputs. No production secrets were generated during implementation.

## Guest dock change and verification

The accepted V1 layout has no Rotate or Fullscreen controls. Physical landscape uses full-viewport Guest video with safe-area-aware translucent overlays; portrait uses separate rows and may show a passive tip. Host and Guest share icon-above-label controls, 64px width and minimum 60px height, with extra destructive-action spacing. Safari handoff supports PiP and background two-way audio.

Reproducible checks:

```sh
npm run typecheck
npm run lint
npm test
npm run build
npx playwright install webkit
npm run test:layout -w frontend
```

Browser checks use Chromium and WebKit: 21 sizes and seven dock variants per engine, plus manifest navigation tests (46 total). They check full-viewport landscape video, portrait separation, target sizes, icons/labels, safe-area simulations and no overlap/overflow.

## Remaining platform limits

- Memory storage resets requests, approvals, Owner sessions and server push registrations on process restart/redeploy. Remember Me's 30-day ceiling does not survive that reset. Re-login and reopen notifications settings after a restart. Persistent storage is required for restart-surviving sessions and unattended push delivery.
- A stopped/sleeping backend cannot send pushes or enforce its room-deletion timer. A restart loses existing room records; already-connected LiveKit media can outlive the backend until disconnected. Do not treat this memory-based deployment as an always-on service. A durable store/worker is necessary for enforcement across outages, which is outside this local change.
- Push depends on HTTPS, a compatible installed app, permission, OS delivery/Focus settings, valid VAPID configuration and a running backend. Safari and Home Screen storage can differ: Guest Safari handoff does not require an access request; creating a new session in Safari may require its own Host approval. The room link is preserved; no approval credential is transferred in it.
- Real iPhone physical rotation, PiP, audio background behavior and physical safe areas remain device-dependent. Existing Safari/PiP hooks and Host authority have been preserved.

Follow [the real-device procedure](ios-safari-and-controls-testing.md) before using this publicly.

## Completion review and results

Final local validation: backend **26/26 tests**, frontend **43/43 tests**; backend/frontend TypeScript, ESLint, and production builds pass. Chromium/WebKit layout suite: **40/40 tests**, covering **480 geometry combinations**. `git diff --check` passes. Tests use mocks for LiveKit and push delivery; production VAPID delivery and real iPhone rendering were not exercised. Layout fixtures are development/test files, not part of the Vite production bundle.

Senior diff review was performed with edits paused. Fixes from implementation/review include:

- Ended-room lookups no longer change terminal state back to expired and consume capacity.
- Host token completion cannot mark an ended/expired room live after an async operation.
- An independent frontend expiry deadline removes protected content even if status polling stalls; access HTTP requests have a 15-second abort timeout.
- Stale VAPID subscriptions are detected and replaced through the explicit Enable action, with a bounded service-worker readiness wait.
- The existing per-room queue now removes the correct queued promise, preventing retained queue entries.
- Parser errors and unexpected failures no longer log raw bodies or transport errors that could contain credentials/subscription data.
- Expiry deletion failures are retried and keep their capacity reservation; timers cannot overlap sweeps.

All review fixes were followed by validation. Host cookie authority and existing media grants remain separate from portfolio approval. No normal accounts, OAuth, email/SMS, admin framework, or extra media transport was added.

Commit recommendation: the local implementation is reviewable, but **wait for the real-device acceptance sequence before treating this as a finished production-ready commit**. The original phone overlap complaint and actual notification delivery cannot be signed off from desktop automation. If saving a local checkpoint, retain the documented memory/restart and always-running-backend limitations. Nothing was committed, pushed, or deployed.

### File inventory for this task

New implementation/test files:

- `backend/scripts/hash-owner-password.mjs`
- `backend/src/access/routes.ts`, `backend/src/access/store.ts`, `backend/src/access/push.ts`
- `backend/src/services/session-expiry.ts`
- `backend/tests/access.test.ts`, `backend/tests/session-expiry.test.ts`
- `frontend/src/api/access.ts`, `frontend/src/components/AccessGate.tsx`, `frontend/src/pages/OwnerPage.tsx`, `frontend/src/utilities/push.ts`
- `frontend/src/test/access.test.tsx`, `frontend/src/test/service-worker.test.ts`
- `frontend/playwright.config.ts`, `frontend/layout/index.html`, `frontend/layout/main.tsx`, `frontend/layout/dock.spec.ts`
- `docs/owner-access.md`

Existing files changed by this task:

- `.gitignore`, `README.md`, `package-lock.json`
- `backend/.env.example`, `backend/package.json`, `backend/src/app.ts`, `backend/src/config/env.ts`, `backend/src/middleware/errors.ts`, `backend/src/routes/sessions.ts`, `backend/src/server.ts`
- `backend/src/services/livekit-service.ts`, `backend/src/services/session-service.ts`, `backend/src/stores/session-store.ts`
- `backend/tests/sessions.test.ts`, `backend/tests/livekit-service.test.ts`
- `frontend/package.json`, `frontend/vite.config.ts`, `frontend/public/sw.js`, `frontend/src/App.tsx`, `frontend/src/api/client.ts`, `frontend/src/styles/global.css`
- `docs/ios-safari-and-controls-testing.md` (already untracked on arrival; extended with the complete device sequence)

Pre-existing uncommitted work was preserved, including `SessionControls.tsx`, `GuestControls.tsx`, `ControlIcon.tsx`, `SafariMultitaskingHelp.tsx`, `usePictureInPicture.ts`, `useBrowserEnvironment.ts`, `JoinPage.tsx`, `WatchPage.tsx`, `guest-controls.test.tsx`, `browser-environment.ts`, `session-link.ts`, and `docs/background-session-testing.md`. Existing edits in README/global CSS/device documentation were extended. `frontend/vercel.json` was inspected and required no change.


## Host-only access correction (2026-09-16)

Old flow: Request Access → Host/Guest choice → selected role.
New flow: public Host/Guest choice → Guest joins normally, or Host checks approval → Create Room. Pending approval preserves `/host` and automatically reveals Create Room; denial leaves it gated. Direct `/host` navigation uses the same gate. `/owner` still requires Owner login, and its manifest, push actions, cookie rules and CSRF checks are unchanged.

Automated validation: 28 backend tests and 74 frontend tests pass, including the 8 new full-App routing tests, 13 manifest tests, and 12 service-worker tests. Guest PIN/capacity/lock/end tests now use clients with no demo cookie. The capability test confirms Guest join still works at the creator's exhausted creation quota, cannot create rooms or use Host operations, and retains CSRF protection. Chromium/WebKit browser validation passes all 44 tests (40 dock tests covering 480 layouts plus 4 manifest/navigation tests). TypeScript, ESLint, both production builds, and diff/security checks pass. Earlier completion totals above describe the earlier implementation.

Manual acceptance: in a clean Safari profile or installed normal PWA, verify `/` shows Host/Guest immediately; Guest joins a valid room without requesting access (repeat with a PIN and Safari handoff). Choose Host without approval, submit a request, approve from the Owner PWA/push flow, and verify automatic Create Room display. Repeat denial and approved-browser revisit. Confirm direct `/host` is gated, `/join/ROOM` is public, `/owner` still requires login and uses the Owner manifest, existing Host controls still work after demo approval expires, and room-duration limits still end media. No physical-device validation was performed for this correction.

## Final V1 acceptance

The user has accepted physical-device Owner/PWA/push, public Guest joining, Host approval, mobile overlays, Leave/End and Safari background two-way audio. Apple Watch direct approval is out of scope. Earlier test totals above are historical. Guest Leave now uses the existing LiveKit token in an Authorization header, never a URL; the backend verifies signature, issuer, expiry, room and subject before removing that Guest. Owner approval is not needed to leave. Host kick/end remain separate.
