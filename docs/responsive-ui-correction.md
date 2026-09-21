# Responsive Host-room UI correction

## Findings

The confirmed Host overlap came from incompatible layout strategies: `.room-overlay` was absolutely positioned at `62px + safe-area-inset-top`, while the new lifecycle row occupied that same vertical space. Time Left, long notices and a full list of request actions were also rendered in one growing vertical block. Adding requests or warnings enlarged that block, reduced the video area and collided with the room code.

Mobile page density also came from fixed desktop-sized spacing: 18px outer page padding, 22px card padding, 20px form gaps, large headings and rigid two-column camera/dialog actions. At 320px, the corrected page/card padding provides about 24px more usable content width. Automatic grid minimums and unshrinkable flex children were additional overflow risks, especially with long labels.

A controlled comparison of the original CSS on Host-create and Guest-join pages at 320, 375, 390, 414 and 430px did **not** reproduce horizontal document overflow in either Chromium or WebKit. Therefore the reported real-device need to pinch out cannot be conclusively attributed to a universal document-width bug. This pass fixes the demonstrated Host overlap and vertical bloat, reduces mobile density, and explicitly constrains shrinkable content. Physical Safari/PWA confirmation remains appropriate.

## Host layout

The live Host screen now has four normal-flow rows:

1. Static header: ViewCircle, room code, LIVE and connection state. The secondary people count is shown where space permits; Guest count remains available in the existing controls.
2. Fixed-height status/action row: flexible temporary content on the left, **Time Left at the far right**.
3. Video: takes all remaining space.
4. Existing Host controls; compact, touch-friendly sizing in short landscape viewports.

The old absolutely positioned room-code overlay was removed. Time Left occupies a reserved 112px-wide area in the 48px-high status row, directly below the connection/header area. Its horizontal and vertical position stays unchanged when requests arrive or disappear. Tabular numbers and reserved space also avoid countdown-related width changes. The static header plus status row is at most 92px high in the tested portrait viewports and 84px in short landscape viewports.

## Requests and lifecycle notices

- One waiting Guest: name and Allow/Deny appear as one compact horizontal group. Long names truncate visually; tapping the name opens the full request for review.
- Multiple Guests: a compact count and Review button replace the full list. Review opens an accessible native dialog with individual Allow/Deny and the existing Allow All Waiting action.
- Allow/Deny refresh only request presentation through the existing API calls. The timer, room identity and video geometry do not move.
- Existing lifecycle/recovery notices share the same left-hand region. A concise summary and Details button open their full text and existing actions. Host media errors also use this region rather than adding independent video overlays.
- Urgent countdowns use compact “Ending in 0:30” wording. At narrow widths they take priority over a separate waiting-count button; pending requests remain reachable inside Details.
- Native dialogs provide modal focus behavior and Escape dismissal. Opening/closing review is presentation state only.

Polling intervals, deadline calculations, Keep Waiting/Dismiss/End actions, camera retry, admission requests and Allow All Waiting snapshot semantics remain unchanged. No backend, authentication, security, Public/Private admission, recovery logic or zoom implementation was edited.

## Responsive corrections across pages

- Extended border-box sizing to pseudo-elements.
- Removed the body's hard minimum width; constrained form/grid columns and input children with `min-width: 0` and `minmax(0, 1fr)`.
- Allowed session-discovery labels and action groups to wrap; long content can shrink or wrap instead of forcing its container wider.
- Kept toggle switches from being compressed by their label text.
- Reduced page/card padding, gaps, headings and role-card dimensions at widths up to 430px.
- Made camera choices and dialog action columns shrink safely; constrained dialogs to the viewport with internal vertical scrolling.
- Reduced redundant nested padding on session-ended views.
- Preserved centered Owner cards, Session Management, password visibility/autofill, and at least 44px action targets.
- Kept input text at least 16px to avoid introducing focus-driven iOS text-input zoom.
- Kept browser accessibility zoom enabled. No viewport restrictions were added. Guest pinch/pan and Host zoom styles/controllers are unchanged.

## Verification

- Frontend TypeScript: passed.
- Frontend ESLint (zero warnings): passed.
- Frontend unit/component tests: **135 passed** across 13 files.
- Full Chromium/WebKit suite: **106 passed**. After the final request-group spacing and urgent-countdown refinements, the focused responsive suite passed **38 checks**, including two new urgent-countdown checks (one per browser).
- Frontend production build: passed.
- `git diff --check`: passed.
- Backend tests were not run because no backend files were changed.

Browser coverage includes:

- Room code/header, request actions and timer do not intersect.
- Timer remains rightmost and its bounding box is identical before/after Allow or Deny, on request arrival, and after review dismissal.
- Video bounding box remains unchanged as request groups come and go; video occupies the full available row between status and controls.
- Single request, multiple requests, camera recovery, urgent countdown and arrival/denial on a 568×320 landscape viewport.
- No horizontal document overflow and browser scale 1 at 320, 375, 390, 414 and 430px on Landing, Host creation/setup, Guest joining, Owner login/dashboard, access approval, session-ended and error views. Guest-watch presentation uses the existing real-component browser fixture without connecting to LiveKit.
- Existing Host zoom, Guest pinch/pan, dock interaction, Owner and manifest browser regressions.

Host screenshots are generated for both Chromium and WebKit at:

- Portrait: 320×740, 375×740, 390×740, 414×740 and 430×740.
- Landscape: 740×320, 740×375, 740×390, 740×414 and 740×430.

Files follow `/tmp/viewcircle-responsive-{chromium|webkit}-{width}x{height}.png`. Representative screenshots inspected: WebKit 320×740 and 740×320, Chromium 390×740. The black video surface is intentional: these tests validate actual UI geometry without a hardware camera or LiveKit connection.

## Exact files changed in this pass

- `frontend/src/components/HostRoomHeader.tsx` — shared static Host identity/header markup.
- `frontend/src/components/SessionLifecycle.tsx` — compact status/admission presentation and review-dialog state.
- `frontend/src/pages/HostRoomPage.tsx` — structural header integration and consolidated notification placement.
- `frontend/src/styles/global.css` — Host row layout and responsive sizing corrections.
- `frontend/src/test/hardening.test.tsx` — existing lifecycle-action assertions updated to open the review surface.
- `frontend/layout/main.tsx` — Host fixture uses the production header/status components when requested.
- `frontend/layout/responsive.spec.ts` — responsive, overlap, timer stability and page-width browser checks.
- `docs/responsive-ui-correction.md` — findings and verification report.

The temporary original-CSS diagnostic was removed after recording its results. No backend files, environment values, dependencies, commits, pushes or deployments were changed.
