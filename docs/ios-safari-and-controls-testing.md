# Safari multitasking and control dock: next device tests

Use a laptop browser as Host and the same iPhone as Guest. Record iOS version and whether the Guest opened from Safari or the Home Screen. The previous user-run A/B test verified normal Safari's PiP/two-way background audio; repeat it after this UI change. Automated tests do not prove iOS background behavior.

1. **Home Screen:** Join from the installed icon. Confirm a compass marked Safari replaces PiP, including when Host video is playing. Tap Safari. Confirm the title “Continue in Safari”, the correct room code/name, and readable instructions. Closing the dialog must return focus to the Safari control without changing Mic, Sound, or membership.
2. **Move to Safari:** Tap Copy & Continue. Close the instructions and tap Leave. Open Safari manually, paste the link into the address bar, and join. The room and name should be filled in. For a private session, enter its PIN normally; the copied link must contain no PIN or credentials. Unlock the session first if needed. Confirm the old Guest has left and only the new Safari Guest is present. Joining in Safari starts muted and follows physical orientation; this is a normal join, not a credential transfer.
3. **Copy fallback:** If clipboard permission is unavailable, confirm the selectable link and “Touch and hold” instruction appear. Copy manually, then follow step 2. A copy must never claim to have opened Safari or automatically leave the room.
4. **Safari A/B regression:** With Host video playing, confirm PiP appears where supported. Enable Guest mic, activate PiP, and open another app for 30 seconds, then two minutes. Talk in both directions. Return via PiP's native control and verify normal video, the same membership, Guest mic still on, and unchanged Sound state. Repeat with mic off and Sound off; they must remain off. Repeat app switching without PiP and check video resumes upon return.
5. **Orientation:** Physically rotate both ways. Landscape video fills the viewport with overlaid status and controls; portrait preserves separate rows. Check the passive portrait tip disappears. No orientation preference is stored or OS lock overridden.
6. **Dock layout:** Test phone, tablet and desktop sizes. Check icon/label alignment, active borders, destructive separation, safe areas and wrapping. Rotate and Fullscreen must be absent. Test VoiceOver and text enlargement.
7. **Other environments:** On an iPad, test normal Safari and installed mode, including Request Desktop Website. Only installed iOS gets Safari guidance. Android Chrome/PWA and desktop Chrome/Safari retain capability-based PiP. No Host video or no PiP capability means no normal PiP entry button. An already-active PiP keeps its Return action.
8. **Host review:** On the laptop, verify all icon-and-label controls are visible, camera/Flip/Lock/Share/End work, and the video remains dominant. Repeat Host layout at phone portrait and landscape widths; controls must wrap without overlap. Finish with Leave/End checks and confirm media and PiP are released.

## Automated checks for this change

- Unit/component tests cover installed-iOS detection (including desktop-identity iPad), normal-browser exclusions, display-mode changes and listener cleanup, PiP versus Safari actions, actual video availability, removed Rotate/Fullscreen controls and passive portrait-tip behavior, copy success/fallback, and public-link/name handling.
- Run `npm run typecheck`, `npm run lint`, `npm run test`, and `npm run build`. Backend tests need a temporary local HTTP socket.
- Playwright checks Chromium and WebKit across 21 viewport sizes and seven dock variants per engine: 42 layout tests, plus four manifest/navigation tests. It verifies full-viewport landscape geometry, portrait separation, icons/labels, safe-area simulations, overlap and overflow. Physical iPhone safe areas have also passed user acceptance; browser automation alone cannot prove them.

## Owner access and complete phone acceptance sequence

Use a separate visitor browser/profile and the Owner iPhone. For local device testing, use an HTTPS tunnel to the local frontend and set backend CLIENT_URL to that exact origin. No deployment is required. Configure local Owner/VAPID settings using [owner-access.md](owner-access.md). Keep the backend awake.

1. Installed iPhone PWA, portrait: join publicly and inspect Mic, Sound, Safari, People and Leave. No Rotate or Fullscreen. Check safe areas and no overlapping controls.
2. Installed PWA, landscape: physically rotate with OS rotation lock off. Video fills the viewport beneath the overlays; check both notch orientations.
3. Normal Safari, portrait: join directly without Owner approval; private rooms still require their PIN. Expand/collapse browser chrome; verify dock and safe areas. Repeat in landscape.
4. Safari PiP: use actual Host video; tap PiP, switch apps for 30 seconds then two minutes; verify two-way audio and return behavior. No fake PiP capability should appear while video is absent.
5. Physical orientation: rotate and reload; layout follows the viewport with no saved selection. Portrait may show a brief passive tip.
6. Removed controls: verify neither Host nor Guest exposes Fullscreen, and Guest has no Rotate button.
7. Safari action: tap guidance, close it, confirm focus returns and Mic/Sound are unchanged. Copy room link; confirm it contains no PIN or authorization credential. Follow the existing leave-and-open-Safari instructions.
8. No PiP: test no Host video or an unsupported browser; remaining controls must reflow without gaps that intercept touches.
9. Muted Mic: confirm crossed-out state, enable then mute, and verify peers stop hearing audio. Test the requesting-permission state too.
10. Sound off: mute playback, rotate, open/close guidance, and confirm it stays off.
11. Background return: repeat with Mic on/off and Sound on/off; membership, physical orientation and controls must remain correct. Expand/collapse browser chrome again.
12. Small-width device: repeat at 320/375 CSS-pixel widths if available; also test a large iPhone, Android, and iPad portrait/landscape. Enable larger text and VoiceOver; verify readable labels and touch targets. Record actual device, OS version, standalone/Safari, and screenshots of each state.
13. Owner login: open `/owner` from the installed app; wrong credentials give a generic error, correct credentials show Pending and Enter ViewCircle. Entering ViewCircle does not confer control over an existing Host's room.
14. Remember Me: off, check browser-session cookie and backend 12-hour ceiling; on, fully close/reopen the installed app and confirm login persists while the backend remains running. Check 30-day expiry in browser storage without copying cookie values. For local accelerated tests use short configurable durations and restart before login.
15. Enable notifications: no prompt on page load; tap Enable, grant permission, confirm enabled. Also test deny/unavailable; dashboard still works. Disable and enable again.
16. Prospective Host requests access: choose Host from the public landing page, then provide name and optional company; confirm Waiting, refresh it, and confirm the same request remains pending. Repeated submissions must not flood notifications.
17. Push appears: background/close Owner PWA and submit from the visitor. Confirm a visible ViewCircle request notification on the iPhone. If missing, check permission, Focus, server wakefulness and VAPID configuration; do not mistake a UI test for a delivery test.
18. Tap push: confirm Owner PWA opens/focuses; no credentials appear in the URL.
19. Dashboard: confirm Pending loads, including when push is disabled. If Owner login expired, login before viewing any requester details.
20. Approve: approve one pending request; refresh dashboard to verify it is Recently approved.
21. Visitor transition: within roughly five seconds, the waiting Host reaches Create Room automatically at `/host`. A Guest starting with `/join/ROOM` must skip approval entirely and still provide its private PIN if required.
22. Deny: submit from another profile; deny it and confirm the visitor sees “Access was not approved” and cannot create a room (Guest joining is still allowed). A closed request cannot be approved again.
23. Logout: log out Owner; request list and approval APIs must deny that session immediately. Notifications remain explicitly enabled for this device until Disable is used; a notification tap after logout must require login.
24. Visitor expiry: locally set VISITOR_ACCESS_TTL_HOURS=0.01 (36 seconds), restart, make a fresh request, approve, and confirm session creation rejects it after expiry and the `/host` gate returns; Guest joining remains available. Restore 12 afterward. Also set DEMO_MAX_SESSION_DURATION_MINUTES=1 for a fresh test room: the backend should disconnect media within about five seconds after its minute deadline, assuming LiveKit is reachable. Restore 120 afterward.

Record results as pass/fail/not tested. None of these physical-device steps was executed by automated browser geometry tests.
