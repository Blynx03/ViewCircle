# Background session real-device test plan

Automated tests verify application state and mocked browser events, not OS background operation. Run this plan over HTTPS with a Host and a separate Guest device. Record device, OS/browser version, installed-PWA versus browser mode, power-saving mode, and actual results. This change has not been validated on physical devices here.

Run the Guest and Host sequences on iPhone Safari, iPhone installed PWA, iPad Safari, Android Chrome, Android installed PWA, desktop Chrome, and desktop Safari. Test both supported and unavailable PiP/orientation paths; do not interpret a missing capability as an app failure.

## Guest sequence

1. Host creates and starts a session with camera and microphone. Guest joins. Verify Portrait is selected, both orientation buttons are visible, and a wide Host frame is fully visible without distortion. Guest camera must never be requested.
2. Select Landscape. If locking succeeds, verify fullscreen landscape; otherwise verify Landscape stays selected and “Rotate your device for the best view.” appears. Rotate physically in both directions: the selected button must not change.
3. Turn Guest microphone on (first use must request permission). Talk both ways, then background ViewCircle and open another app for 30 seconds. Return. Verify the same membership, Landscape selection, microphone selection, Sound selection, Host video, and controls. Record whether each audio direction continued.
4. Repeat with Guest mic off and Sound off; neither may turn itself on. Return and turn Sound on to confirm there is no doubled audio.
5. Without PiP, background for 30 seconds. Using remote browser debugging or LiveKit receive statistics, confirm Host video bytes stop increasing after unsubscribe settles, while audio stays subscribed. Return and confirm video resumes without duplicate subscriptions. Repeat five times, including browser Back/Forward cache navigation when available.
6. When Picture in Picture appears, activate it while Host video is playing. Open another app: verify video remains visible and receiving. Move/resize using whatever native controls are offered; use the native return control to return to ViewCircle. Verify Landscape remains selected. Close PiP while still backgrounded and verify video reception stops, then returns on foreground. If PiP is rejected, verify a friendly message and working normal viewing/audio.
7. Switch back to Portrait. Repeat app switching and PiP; Portrait must persist. Reload the Guest page during the same session and verify the saved selection returns.
8. Briefly disable networking and restore it. Verify reconnect state, restored video/audio, no duplicate participant/tracks, and unchanged orientation/mute/sound choices. Repeat with the app backgrounded.

## Host sequence

1. Test front and rear camera setup, optional microphone permission, Start Session, Flip, Camera Off/On, and Mic Off/On. Camera Off must not end the session.
2. With camera and microphone on, open another app for 30 seconds, then two minutes. Guest should remain in the session. Record whether Host audio and video continue; when capture is interrupted, check the friendly unavailable-video state where the browser signals it.
3. Return to ViewCircle. Verify camera/mic recover where permissions and OS allow, selected camera remains correct, and only one publication per source exists. If playback needs a gesture, tap the audio prompt.
4. Repeat with camera off and mic muted: returning must preserve both. Test screen locking, a phone-call interruption, and power-saving mode separately; record actual platform limitations.

## Definitive exit and regression checks

1. Guest selects Landscape, then Leave. Verify local mic indicator stops, PiP closes, room disconnects, and that Guest's `vc_orientation_…` storage key is deleted. Join again: Portrait must be selected.
2. Guest selects Landscape; Host ends the session. Verify Guest receives session-ended state, releases media/PiP, clears orientation storage, and does not reconnect. Repeat with Guest backgrounded at the time of End, then returning.
3. Remove a Guest while visible and while backgrounded; returning must show removal and must not reconnect. Repeat loss of networking during removal/end.
4. Create a new future session: Guest starts in Portrait. Verify optional PIN, Lock/Unlock, ten-Guest limit, and Host-only End/removal still work. Verify closing the tab releases browser media resources; don't expect a reliable server-side Leave notification from OS termination.

## Automated validation

Run `npm run typecheck`, `npm run lint`, `npm run test`, and `npm run build` from the repository root. Backend HTTP tests require permission to bind a temporary local socket. The new lifecycle tests cover Portrait default, selection persistence/reset, unsupported/rejected capabilities, background subscription decisions, reconnect reconciliation, cleanup, and removed-Guest recovery suppression.
