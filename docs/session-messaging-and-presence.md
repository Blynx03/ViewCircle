# Session messaging, presence and Host wake lock

Implemented without commits, pushes, deployment, environment changes, new dependencies, database chat persistence, or Owner message archives.

## Guest background and recovery

Removed the `syncVideo` optimization in `useLiveRoom` that called `setSubscribed(false)` when a Guest page was hidden unless PiP was active. Removed its PiP/visibility subscription listeners, `videoPaused` state, and the corresponding background-paused message.

`visibilitychange` and `pagehide` now only track background state; they do not leave, disconnect, unpublish, unsubscribe, or alter server attendance. Visibility return and `pageshow` try playback immediately, then perform authorized recovery. A connected room is not rejoined. Actual disconnection triggers automatic recovery, with a three-second retry while visible; the existing 30-second session/media reconciliation remains. Ended/removed participants are checked before reconnect. The installed-iOS microphone exception and explicit Mic recovery remain intact.

The server records the first observed disappearance of a previously connected Guest and retains logical participation for 120 seconds. Returning clears the missing timestamp. While any Guest is connected or within grace, `aloneSince` is absent. Only after all such Guests are gone does the separate two-minute Host-alone countdown start; its existing notification, Dismiss/End actions and 30-second warning remain. Grace does not extend the three-hour session maximum or Host/camera recovery deadlines. Never-connected token reservations retain their existing short connection window.

Explicit authenticated Leave marks that Guest removed immediately and now also requests LiveKit removal, without affecting other participants. Removal bypasses reconnect grace.

## Host wake lock

The existing hook now observes sentinel release and retries after one second while visible. It also reacquires on visibility return/pageshow, guards overlapping requests, releases late requests after cleanup, and handles unsupported/denied APIs without breaking the room.

The Host enables it only with active credentials, a connected room and broadcasting camera, and no terminal session state. It remains enabled throughout the Host-alone countdown while video is broadcasting. Server lifecycle termination is wired into the live Host view, stopping media/disconnecting and releasing wake lock on Owner end, auto-end or expiry, as well as the existing Host-end navigation cleanup. No device settings are changed.

## Session chat

Host and Guest credentials grant LiveKit data publishing while retaining existing media-source restrictions. `SessionChat` sends reliable room-wide packets on `viewcircle.chat.v1`. Sender display information comes from the SDK participant rather than the packet. Messages render as text, with a 500-character limit, 4096-byte incoming packet limit, and a rolling 100-message in-memory list. No historical replay or persistent storage is added.

Both live pages include a collapsed chat icon over the video. Expanding reveals floating colored messages, a scrollable log, and bottom input/Send action. The Guest overlay occupies a separate layer outside the pinch-zoom surface. Landscape width is limited to 32vw (maximum 360px); portrait height is limited to about one-third of the viewport. Host zoom has reserved space. Existing header/status, Time Left, control dock and video transforms remain separate.

Messages auto-scroll only within 48px of the bottom. Reviewing older messages preserves scroll position. Older messages fade gradually to 45% opacity; hover/focus restores readability for review. Reduced-motion mode removes transitions and the unread breathing animation. Incoming messages while collapsed increment a count and activate one subtle glow; opening clears both. Own sends never produce an unread alert. Failed sends retain the draft and show a retry message.

The server assigns palette slots in participant token metadata: Host slot 0 and distinct Guest slots. The palette supports the requested Host plus eight Guests and the existing ten-Guest capacity without reducing it. A Guest keeps its issued slot through backgrounding and reconnection; name plus content always identifies the message. Old credentials lacking metadata use white. Slots remain reserved even after disconnect grace expires, so a late returning Guest keeps its color without a new Guest taking that slot. Explicitly removed participation can release its slot. Additional historical slots beyond the base palette use deterministic pastel hues.

## Validation

- Backend TypeScript and frontend TypeScript: passed.
- Backend and frontend ESLint: passed.
- Backend tests: **70 passed**.
- Full frontend tests: **155 passed**.
- Full Chromium/WebKit suite: **136 passed**.
- After adding zoom-overlap coverage and fixing narrow portrait spacing, focused Chromium/WebKit chat suite: **20 passed**.
- Backend and frontend production builds: passed.
- `git diff --check`: passed.

Coverage includes wake-lock acquisition/release/reacquisition/unsupported and denied APIs, hidden-page subscription preservation, reconnect versus visibility return, grace/alone timer boundaries, authenticated Leave, Host and Guest sends, simulated three-participant delivery, failed sends, session-only history, scroll review, unread behavior, stable colors, portrait/landscape geometry and reduced motion. Existing Owner/access, Public/Private joins, Host recovery, camera recovery, zoom, Safari controls, status/Time Left and overflow regression suites passed.

Backend tests required local-server sandbox permission; the initial sandbox-only attempt could not bind sockets. The authorized rerun passed. Browser tests use UI/media fixtures; they do not establish physical-device sleep or live remote WebRTC behavior.

## Remaining device limitations

Wake lock is best effort. An unsupported API or browser/OS denial cannot be overridden by ViewCircle. Keep the broadcasting Host foregrounded; there is no settings-changing fallback. iOS or other operating systems can still suspend background pages, network connections, media capture or timers, or discard the page entirely. Surviving connections resume without app-imposed unsubscribe delays; actual reconnection timing depends on the browser/network/LiveKit. Audio autoplay may require a tap. Existing installed-iOS microphone recovery and Safari handoff guidance remain unchanged.

Physical iPhone/iPad/Android idle, lock/unlock, low-power, installed-PWA, virtual-keyboard and background tests remain to be run using `background-session-testing.md`. Messages missed while disconnected are not replayed. Previously issued Guest tokens without data-publishing grants require fresh participation credentials to send chat.

## Exact files changed

- `backend/src/routes/sessions.ts`
- `backend/src/services/livekit-service.ts`
- `backend/src/services/session-expiry.ts`
- `backend/src/services/session-service.ts`
- `backend/src/types/session.ts`
- `backend/tests/guest-leave.test.ts`
- `backend/tests/hardening.test.ts`
- `backend/tests/livekit-service.test.ts`
- `backend/tests/sessions.test.ts`
- `frontend/layout/chat.spec.ts` (new)
- `frontend/layout/main.tsx`
- `frontend/src/components/SessionChat.tsx` (new)
- `frontend/src/hooks/useLiveRoom.ts`
- `frontend/src/hooks/useWakeLock.ts`
- `frontend/src/pages/HostRoomPage.tsx`
- `frontend/src/pages/WatchPage.tsx`
- `frontend/src/styles/global.css`
- `frontend/src/test/room-exit.test.tsx`
- `frontend/src/test/session-chat.test.tsx` (new)
- `frontend/src/test/session-lifecycle.test.tsx`
- `frontend/src/test/wake-lock.test.tsx` (new)
- `frontend/src/utilities/chat.ts` (new)
- `docs/background-session-testing.md`
- `docs/session-messaging-and-presence.md` (new)
