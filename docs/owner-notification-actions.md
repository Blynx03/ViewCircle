# Owner notification actions

The existing service worker now offers `approve` / **Approve** and `deny` / **Deny** for valid access-request notifications. The backend payload adds only an opaque request record ID and fixed action descriptors to the existing title/name-only message. No email/company, authority token, cookie or secret is included. Each request gets a separate notification tag so a newer request cannot overwrite a different request's action target.

## Protected direct decisions

A recognized action with a valid UUID performs exactly one POST to the existing `/api/owner/access-requests/:id/approve` or `/deny` endpoint. It uses `credentials: same-origin`, `mode: same-origin`, `redirect: error`, and the existing `X-ViewCircle-Request: 1` header. The browser attaches the HttpOnly cookie and generates Origin/Fetch Metadata; JavaScript does not read credentials or override those headers. No backend authentication, cookie, CSRF, origin, request-state or rate-limit rules changed. The record ID selects a request but grants no authority. Replaying a closed request is rejected by the existing pending-state check.

This uses the existing same-origin frontend API proxy; a cross-site API configuration is not worked around. The [Fetch standard](https://fetch.spec.whatwg.org/) supports authenticated same-origin requests from workers. The [Notifications standard](https://notifications.spec.whatwg.org/) defines action clicks and explicitly makes action display platform-dependent. A browser that cannot attach a valid Owner session or satisfy the existing protections simply cannot complete the decision.

On confirmed success, the notification dismisses; the existing dashboard and waiting visitor polling reflect the new state. On rejection, stale/expired requests, network failure or an eight-second timeout, the worker does not retry or assume success. It posts a review notification and tries to open/focus `/owner#request=UUID&intent=approve` (or `deny`). This fragment is only non-sensitive UI context: it highlights the record and requested intent after login, never calls an API or authorizes a decision. The Owner reviews current state and uses the existing dashboard buttons. If the request is already closed, use Recently approved/denied.

Window opening can lose its user-activation eligibility while awaiting a network response. The visible review notification remains available for a fresh body tap if automatic opening fails. This also covers a response lost after the server actually changed the request.

Ordinary body taps continue to open/focus `/owner`, without a mutation. Only a review notification adds its non-authorizing fragment context. Active Host/Guest windows are never navigated away. Unknown actions and malformed/legacy request IDs use the ordinary open-Owner fallback. The existing service worker is reused; there is no second worker, new endpoint, bearer credential or navigation-triggered approval.

## Platform expectations

Actions use `Notification.maxActions` where exposed. Zero means omit buttons; implementations without the property receive standard optional action options, which they may ignore. If display rejects those options, retry display once without actions. The manual dashboard remains available in every case.

Current [MDN browser compatibility data](https://github.com/mdn/browser-compat-data/blob/main/api/Notification.json) lists action support in Chrome/Edge/other Chromium-family browsers and newer Firefox (152+), but not Safari/iOS. Expect normal notification-body navigation on current iPhone/iPad Safari PWAs. Apple Watch mirroring/action presentation is best-effort and is **not guaranteed**. Web Push delivery support is not evidence of action-button support; OS notification presentation can also suppress or limit buttons.

## Local validation

- Backend: 28 tests pass, including payload privacy, same-origin worker-style requests requiring Owner authorization, foreign-origin rejection, and replay rejection.
- Frontend: 66 tests pass, including 12 service-worker tests, 13 PWA manifest tests, manual dashboard decisions and notification-context highlighting without auto-submission.
- Backend/frontend TypeScript, ESLint and production builds pass. Service-worker syntax and diff whitespace checks pass.
- No real push was sent and no physical iPhone/Watch action was exercised during implementation.

## Device acceptance

1. Reopen the Owner app online so it receives the updated existing service worker; ensure it has an active Owner login and enabled push subscription.
2. On an action-capable desktop/Android browser, send two visitor requests. Verify separate name-only notifications and Approve/Deny buttons where the OS exposes them.
3. Approve one and deny the other from their notifications. Confirm the correct visitor transitions and the dashboard reflects each decision.
4. Tap a notification body: Owner opens, with no decision. Keep a Host/Guest room open separately and verify its media is uninterrupted.
5. Log out (or expire Owner authorization), then use an action. It must not approve/deny; the review/login path opens. Log in and manually confirm the highlighted request.
6. Use a notification for an already-decided/expired request. Verify no overwrite, automatic retry or false success. Check recent history in the dashboard.
7. Disconnect network before an action. Verify review fallback. Restore connectivity, tap review, and inspect the actual state before deciding; a timeout is not proof that the server did nothing.
8. On installed iPhone/iPad and paired Apple Watch, verify normal delivery, name-only content and body-tap behavior. Record whether action buttons appear; absence is expected on unsupported systems. If shown, repeat the authorized/expired/offline checks.

Files changed for this task: `backend/src/access/push.ts`, `backend/src/access/routes.ts` (request ID passed to push only), `backend/tests/access.test.ts`, `frontend/public/sw.js`, `frontend/src/pages/OwnerPage.tsx`, `frontend/src/test/service-worker.test.ts`, `frontend/src/test/access.test.tsx`, and this document. No environment values, rate limits, media hooks, manifests or Host authority were modified. No commit, push or deployment was performed.
