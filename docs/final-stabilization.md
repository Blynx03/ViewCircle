# Final ViewCircle stabilization pass

No commits, pushes, deployment, environment-file changes, or application dependency changes were made. The existing admission, session, media, grace, wake-lock and chat architecture remains in place.

## 1. Host zoom

The confirmed code regression was the live Host render condition: `HostCameraZoom` was unmounted whenever `audioBlocked`, a general `mediaMessage`, an API error or a microphone/flip error was present. None proves that camera zoom is unavailable. This particularly affected an otherwise working camera while audio playback awaited a gesture.

The existing zoom component now stays mounted. Its existing published-track getter and runtime capability/settings checks still determine visibility; its 250ms observation detects publication, delayed settings and native-track replacement. No CSS zoom or fabricated hardware capability was added. The audio playback prompt moved to the top of the Host video stage to avoid covering the restored controls. Tests cover delayed settings/publication, replacement, unsupported cameras, and rendering through audio/media warnings.

The reported physical-device regression cannot be attributed exclusively to that condition without the device/browser details and reproduction. Cameras whose browser exposes no usable zoom range/settings still correctly have no zoom control.

## 2. iPhone left edge

The live surface previously used layout-viewport coordinates and `100dvh` without observing visual-viewport offsets. Safari keyboard/toolbar transitions can change the visible coordinate system independently. Chat's maximum width also subtracted a fixed 24px even when its left safe-area inset exceeded 12px, making its safe-area width budget inconsistent.

`LiveViewport` now anchors the whole live surface to visual-viewport width, height and offsets at normal page zoom, updating on resize/scroll. Matching layout dimensions use CSS rather than stored pixels; stale pre-rotation visual bounds are ignored. Header, video and chat share that coordinate system. It stops applying these measurements during accessibility page zoom. Root width/min-width and shrinkable live children are explicit, and horizontal overflow is constrained. Chat width now subtracts both actual safe-area margins. No arbitrary left offset was added to chat.

The coordinate mismatch is reproduced by simulated visual-viewport pan/keyboard tests, which pass at 375/390/393/414/430px portrait and corresponding landscape dimensions. This is a tested code-level correction, not confirmation of the exact cause on the user's physical iPhone; physical Safari/PWA validation remains necessary.

## 3. Live Room Code

Only `.host-room-code` changed: font size increased from `.75rem` to `clamp(.85rem, 3.7vw, 1rem)`, matching the live wordmark's size scale. The existing 8px header gap plus a 12px code margin produces exactly 20px between wordmark and code. Time Left/status layout and Join-page code styling are unchanged. Browser geometry tests verify the gap and relative size.

## 4. Open-chat unread messages

When expanded chat is more than 48px from the bottom, incoming messages increase a separate “↓ N new messages” count. The review position stays unchanged. Tapping the indicator jumps to the bottom and clears the count; manually scrolling near the bottom also clears it. This indicator has no breathing animation. Existing collapsed unread count/glow, opening reset, own-message exclusion and near-bottom auto-scroll remain intact.

## 5. Firefox chat height

The old landscape override replaced the compact viewport cap with the entire available stage height. The flex log also relied on an indefinite outer height. Expanded chat now has a definite viewport-based height, and its log explicitly takes the remaining shrinkable space with `flex: 1 1 0; min-height: 0`.

Portrait uses `min(33dvh, 320px)`; landscape uses `min(50dvh, 320px)` with the existing available-space cap and width `min(360px, 32vw)`. Safe-area and zoom exclusions still apply. No browser-specific hack was added. Firefox is included for the focused chat and stabilization browser tests, alongside the full Chromium/WebKit suite.

## 6–8. One-tap Guest recovery and security

Private admission and approved Public admission set a persistent `vc_guest_recovery` cookie containing the already-issued Guest-scoped LiveKit credential. It is HttpOnly, SameSite=Lax, Secure in production and scoped to `/api/sessions`. Its maximum age is bounded by the remaining three-hour session lifetime. No new localStorage record, Owner credential, Host credential, password or server secret is retained. Existing per-tab sessionStorage still holds the normal Guest media credentials after successful rejoin.

Landing and Join pages check `GET /api/sessions/guest-recovery` before rendering any card. The backend verifies the signed credential and expiry, Guest identity prefix and room grant, existing session/Guest membership, active state, session deadline, provisioning/lock state, removal state and original reconnect-grace deadline. A fresh LiveKit presence query feeds the existing lifecycle reconciliation. Control-plane errors fail closed without advertising stale eligibility. Missing rooms, invalid credentials and ineligible sessions clear the cookie.

Only then does the card show “Rejoin session?” / “You were recently connected to this session.” It rechecks while displayed and on foreground return. “Rejoin Session” performs a second backend validation through POST, returns the same scoped credential/identity and navigates directly to Watch. The original signed name is reused. It neither calls fresh join/request-admission endpoints nor changes `missingSince`, `joinedAt`, session expiry, or Guest identity. Full capacity does not block a valid existing member from reclaiming its own participation; a locked session does reject the recovery prompt as requested.

“Not Now” clears the cookie and hides the card without treating it as an explicit Leave. Explicit authenticated Leave clears the cookie and removes participation. Session-ended/removed Watch cleanup requests cookie deletion; a killed/backgrounded app cannot receive immediate client cleanup, so the next backend validation rejects and clears stale recovery. A missing Guest's 120-second grace is never extended by checks or clicks. After it expires, the existing independent Host-alone countdown remains authoritative.

The API does not store a separate recovery database or issue a privileged reconnect token. Before this pass's first new admission, older Guest sessions without the recovery cookie cannot automatically recover after losing their tab storage.

## 9. Exact files changed

- `backend/src/routes/sessions.ts`
- `backend/src/services/session-expiry.ts`
- `backend/src/services/guest-recovery.ts` (new)
- `backend/tests/guest-recovery.test.ts` (new)
- `frontend/layout/main.tsx`
- `frontend/layout/stabilization.spec.ts` (new)
- `frontend/playwright.config.ts`
- `frontend/src/api/client.ts`
- `frontend/src/components/SessionChat.tsx`
- `frontend/src/components/GuestRejoin.tsx` (new)
- `frontend/src/components/LiveViewport.tsx` (new)
- `frontend/src/pages/HostRoomPage.tsx`
- `frontend/src/pages/JoinPage.tsx`
- `frontend/src/pages/LandingPage.tsx`
- `frontend/src/pages/WatchPage.tsx`
- `frontend/src/styles/global.css`
- `frontend/src/test/camera-zoom.test.tsx`
- `frontend/src/test/room-exit.test.tsx`
- `frontend/src/test/session-chat.test.tsx`
- `frontend/src/test/guest-rejoin.test.tsx` (new)
- `frontend/src/test/live-viewport.test.tsx` (new)
- `docs/final-stabilization.md` (new)

## 10. Validation

- Backend tests: **85 passed**.
- Full frontend tests: **166 passed**.
- Backend/frontend TypeScript and ESLint: passed.
- Backend/frontend production builds: passed.
- Full Chromium/WebKit plus focused Firefox browser run: **206 passed** (1.6 minutes).
- `git diff --check`: passed.

Existing regression suites cover approval/admission, public/private joining, session lifecycle, Host recovery, Guest grace, Host-alone countdown, wake lock, camera recovery, chat, Host/Guest zoom, Time Left, Leave/End and Owner behavior. New tests cover recovery validation/rejection, unchanged identity/name/grace, stale-session rejection on click, cookie security/clearing, open-chat unread review, delayed camera capability data, room-code geometry and visual-viewport changes.

Continuation verification on September 28, 2026 inspected and preserved all existing uncommitted implementation and test changes. No further application-code changes were needed. All results above were rerun successfully during this continuation. The initial sandboxed test attempts could not bind local server ports (`EPERM`); the backend/frontend tests and browser suite passed after rerunning with the required execution permissions. This continuation changed only this report and generated ignored test/build artifacts.

An intermediate full run caught an orientation race in stored visual-viewport dimensions (205 passed, 1 failed). The dimension fallback was corrected; all 66 focused Guest-zoom/viewport cases then passed.

An initial new browser test mock intercepted a frontend API source module, preventing the fixture from loading. That test mock was corrected; it was not an application failure. Firefox's Playwright browser was installed in the test-browser cache for cross-engine validation; application packages and environment values were not changed.

## 11. Remaining physical-device/browser limitations

Real iPhone/iPad camera capability exposure, native keyboard/toolbar animation, safe-area behavior, installed-PWA restoration and force-kill recovery still need device testing. Synthetic visual-viewport tests and desktop WebKit do not establish those results. Safari tabs and installed apps may have separate cookie stores; recovery requires the same browser profile/store and its retained cookie. Clearing website data, private-browser cookie loss, backend in-memory session loss, an expired/removed/locked session, or expired grace prevents one-tap recovery. A transient media-control outage suppresses the card until another validation succeeds. OS suspension, audio-autoplay restrictions, microphone recovery requirements and wake-lock denial remain outside application control.
