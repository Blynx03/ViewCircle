# Background session real-device test plan

Automated tests verify application state and mocked browser events, not OS background operation. Run this plan over HTTPS with a Host and a separate Guest device. Record device, OS/browser version, installed-PWA versus browser mode, power-saving mode, and actual results. This change has not been validated on physical devices here.

Run the Guest and Host sequences on iPhone Safari, iPhone installed PWA, iPad Safari, Android Chrome, Android installed PWA, desktop Chrome, and desktop Safari. Test both supported and unavailable PiP paths; do not interpret a missing capability as an app failure.

Installed iOS PWA background Guest mic is not a supported V1 capability. Verify no repeated permission prompts on background/return and use explicit Mic activation if capture ended. Safari handoff is the supported path for PiP and background two-way audio, accepted on the tested physical device.

## Guest sequence

1. Host starts camera/mic; Guest joins without Owner approval. Verify portrait layout, no Rotate/Fullscreen buttons, and no Guest camera permission request.
2. Physically rotate to landscape. Video fills the viewport beneath top/status and bottom/control overlays. Check safe areas on both sides; OS rotation lock remains authoritative.
3. Turn Guest microphone on (first use must request permission). Talk both ways, then background ViewCircle and open another app for 30 seconds. Return. Verify the same membership, microphone selection, Sound selection, Host video, and controls. Record whether each audio direction continued.
4. Repeat with Guest mic off and Sound off; neither may turn itself on. Return and turn Sound on to confirm there is no doubled audio.
5. Without PiP, background for 30 seconds. Using remote browser debugging or LiveKit receive statistics, confirm Host video bytes stop increasing after unsubscribe settles, while audio stays subscribed. Return and confirm video resumes without duplicate subscriptions. Repeat five times, including browser Back/Forward cache navigation when available.
6. When Picture in Picture appears, activate it while Host video is playing. Open another app: verify video remains visible and receiving. Move/resize using whatever native controls are offered; use the native return control to return to ViewCircle. Verify the layout matches physical orientation. Close PiP while still backgrounded and verify video reception stops, then returns on foreground. If PiP is rejected, verify a friendly message and working normal viewing/audio.
7. Physically return to portrait. Verify separate layout rows and the brief passive tip; no saved orientation selection exists.
8. Briefly disable networking and restore it. Verify reconnect state, restored video/audio, no duplicate participant/tracks, and unchanged mute/sound choices. Repeat with the app backgrounded.

## Host sequence

1. Test front and rear camera setup, optional microphone permission, Start Session, Flip, Camera Off/On, and Mic Off/On. Camera Off must not end the session.
2. With camera and microphone on, open another app for 30 seconds, then two minutes. Guest should remain in the session. Record whether Host audio and video continue; when capture is interrupted, check the friendly unavailable-video state where the browser signals it.
3. Return to ViewCircle. Verify camera/mic recover where permissions and OS allow, selected camera remains correct, and only one publication per source exists. If playback needs a gesture, tap the audio prompt.
4. Repeat with camera off and mic muted: returning must preserve both. Test screen locking, a phone-call interruption, and power-saving mode separately; record actual platform limitations.

## Definitive exit and regression checks

1. Guest leaves: verify local capture stops, PiP closes, credentials clear, and Home opens. Host and other Guests remain; participant count decreases by one.
2. Host ends the room: remaining Guests see Session Ended, media/PiP release, and Return Home works. Repeat with a backgrounded Guest returning afterward.
3. Remove a Guest while visible and while backgrounded; returning must show removal and must not reconnect. Repeat loss of networking during removal/end.
4. Create a new future session: Guest starts in Portrait. Verify optional PIN, Lock/Unlock, ten-Guest limit, and Host-only End/removal still work. Verify closing the tab releases browser media resources; don't expect a reliable server-side Leave notification from OS termination.

## Automated validation

Run `npm run typecheck`, `npm run lint`, `npm run test`, and `npm run build` from the repository root. Backend HTTP tests require permission to bind a temporary local socket. The new lifecycle tests cover physical-layout controls and passive tips, unsupported/rejected capabilities, background subscription decisions, reconnect reconciliation, cleanup, and removed-Guest recovery suppression.

For the installed-iOS distinction and updated dock, also run [the focused Safari and control-dock tests](ios-safari-and-controls-testing.md).
