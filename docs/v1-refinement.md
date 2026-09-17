# ViewCircle V1 refinement

This pass changes only the files listed below. Existing uncommitted Owner access, PWA, push and public Guest routing work remains in place. No backend source, auth, cookies, rate limits, grants, manifests, service worker, environment variables or deployment configuration was changed in this pass. Nothing was committed, pushed or deployed.

## UI behavior

Guest Rotate and Host/Guest Fullscreen controls, orientation selection and their unused hooks/types are removed. Layout follows the actual viewport's CSS orientation; no screen orientation lock or Fullscreen API is invoked.

Guest portrait retains separate header, video and control rows. A passive tip appears on a coarse-pointer portrait device with Host video, once per Guest identity in tab session storage. It disappears after six seconds or rotation, supports React StrictMode, and sits inside the video stage without receiving pointer events.

Guest landscape uses a full-width `100dvh` page (`100vh` fallback), with the video stage absolutely filling it. The compact header is pinned to the top and the dock to the bottom, both translucent and respecting safe-area insets. They consume no video layout rows. `object-fit: contain` retains the entire picture, so aspect-ratio letterboxing remains possible. Natural rotation also works on tablets and desktops.

Host and Guest use the same icon-above-label button renderer: 64px width, at least 60px height, rounded borders, clear pressed/unpressed styling and wrapping on small screens. Leave/End Session remain destructive, with an extra 8px separation. No room mutation or navigation handlers were changed beyond removing orientation cleanup. Explicit page tests retain Guest Leave → home and Host End confirmation → Session Ended → Return Home.

The installed iOS Safari dialog now says “Continue in Safari”, provides the short PiP/audio explanation, and uses “Copy & Continue”. Success shows “Link copied” and the manual next step. Clipboard denial exposes a selectable link. It still copies only the public join URL with the existing optional name fragment, never credentials or PINs. The lock warning is shown only when the public session read reports locked. This is a snapshot at dialog opening; a Host can change the lock afterward. Copying neither launches Safari nor automatically leaves the session.

## Microphone investigation and limits

Compared the current hook with commit `a8df2d9` and its parent. Recent Owner changes had not modified `useLiveRoom`. The earlier hook lacked explicit visibility subscription changes and foreground recovery; `a8df2d9` added remote Host-video unsubscribe while hidden, track retention and foreground recovery. Neither path explicitly muted Guest audio on backgrounding. There is no proven code-level cause of the reported physical-device regression.

Real-device follow-up confirmed the mitigation did not maintain background Guest transmission and introduced repeated permission/recovery prompts. It has been removed: no `play-and-record` audio-session override and no installed-iOS exception retaining background Host video subscriptions.

Installed iOS Guests now leave capture suspension to the platform. App recovery skips automatic microphone restarts on visibility, periodic recovery and reconnect. After explicit mic activation, the same existing audio track is marked user-provided through LiveKit's public `replaceTrack` ownership option (no new track or stream is created). This also disables LiveKit 2.15.6's own automatic mobile visibility, ended-track and reconnect reacquisition. If WebKit resumes the existing live track, it continues naturally. If the track ends, LiveKit may mark it muted; a deliberate Mic action can reacquire it. Intentionally muted Guests are never automatically unmuted. Host capture and normal Safari recovery remain unchanged.

Safari handoff is the supported workflow for PiP and background two-way audio. The dialog already contains the requested text: “For Picture-in-Picture and background two-way audio, continue this session in Safari.” No UI/layout changes were made in this cleanup.

Physical iPhone verification remains necessary: repeatedly background/foreground with mic on and off, confirm no repeated capture prompts, verify Host audio still plays, and verify explicit Mic activation recovers interrupted capture. Background microphone transmission in the installed PWA is not supported or claimed restored.

Cleanup files: `frontend/src/hooks/useLiveRoom.ts`, `frontend/src/test/session-lifecycle.test.tsx`, this document, and deletion of `frontend/src/utilities/guest-audio-session.ts`. The list below records the preceding UI pass, not additional changes in this cleanup.

## Cleanup validation

- Frontend: 87 tests pass in 9 files, including 15 media lifecycle/PiP tests, 13 manifest tests and 12 service-worker/push tests. Repeated background/foreground events cover both suspended and ended capture, intentional mute, explicit mic recovery and the normal Safari path.
- Backend and frontend TypeScript and ESLint: pass.
- Backend and frontend production builds: pass.
- Service-worker syntax and `git diff --check`: pass.
- Diff review: this cleanup touches only the four files listed above. No layout, access/auth, manifest, push, backend, environment or deployment changes. No commit, push or deployment.

## Validation from the preceding UI pass

- Backend and frontend TypeScript: pass.
- Backend and frontend ESLint: pass, zero warnings.
- Backend: 28 tests pass (4 files), including auth, request limits, Host authority and room behavior.
- Frontend: 81 tests pass (9 files), including 13 manifest tests, 12 service-worker/push tests, 9 lifecycle/PiP tests, 19 control/detection/handoff/tip tests, and 2 actual room exit tests.
- Chromium and WebKit: 46 browser tests pass, 23 per engine. Each engine checks 21 viewport sizes and seven dock variants (including Host), plus two manifest-routing tests. Mobile sizes include 320×568, 375×667, 390×844, 393×852 and 430×932 and their landscape counterparts; tablets and 1440×900 desktop are also covered.
- Browser checks assert landscape video bounds equal viewport bounds, portrait/Host controls stay below video, controls have icons and labels, touch-target dimensions, no overlaps or horizontal overflow, destructive separation and simulated notch/home-indicator padding. Simulation does not certify physical iOS safe areas.
- Backend and frontend production builds: pass.
- `node --check frontend/public/sw.js`: pass.
- `git diff --check`: pass. Scope review confirms this pass does not change Owner security, Guest public access, Host authority, PIN/capacity/quota rules, push, either manifest, or backend protections.

## Exact files changed in this pass

Modified:

- `frontend/src/components/ControlIcon.tsx`
- `frontend/src/components/GuestControls.tsx`
- `frontend/src/components/SessionControls.tsx`
- `frontend/src/components/SafariMultitaskingHelp.tsx`
- `frontend/src/hooks/useLiveRoom.ts`
- `frontend/src/pages/HostRoomPage.tsx`
- `frontend/src/pages/WatchPage.tsx`
- `frontend/src/styles/global.css`
- `frontend/src/types/session.ts`
- `frontend/src/test/guest-controls.test.tsx`
- `frontend/src/test/session-lifecycle.test.tsx`
- `frontend/layout/main.tsx`
- `frontend/layout/dock.spec.ts`

Added:

- `frontend/src/components/PortraitTip.tsx`
- `frontend/src/utilities/guest-audio-session.ts`
- `frontend/src/test/room-exit.test.tsx`
- `docs/v1-refinement.md`

Deleted:

- `frontend/src/hooks/useOrientation.ts`
- `frontend/src/hooks/useFullscreen.ts`

## Remaining physical-device acceptance

1. On an installed iPhone Guest PWA, rotate both directions with Portrait Orientation Lock off, then on. Verify full landscape video, readable overlays, notch/home indicator clearance, no clipped controls and unchanged portrait layout. Check the tip disappears and does not recur in the same Guest session.
2. With Host on another device, enable Guest mic, background for 30 seconds and several minutes, switch apps, lock/unlock, then foreground. Confirm no repeated microphone permission prompts in the installed PWA. Background Guest transmission is not expected there; check foreground capture and deliberate Mic recovery instead. Repeat intentionally muted and confirm no unmute, duplicate voice, echo, reconnect loop or extra tracks. Check speaker/Bluetooth routing and volume, including after mute and Leave.
3. Repeat in normal Safari, including PiP and background two-way audio, to confirm the known working path remains working. Test permission denial, ended capture recovery and a network interruption.
4. Try Safari handoff from unlocked and locked rooms, clipboard success/denial, and PIN-required rooms. Leave the old Guest session before rejoining to avoid duplicate participation. Confirm Guest Leave and Host End/Return Home.
5. Smoke-test public Guest join and approved/unapproved Host creation. Reopen Owner PWA at `/owner`, log in/Remember Me, and receive/approve/deny an access request. iPhone notification tap and Apple Watch notification + Dismiss should remain as before.
