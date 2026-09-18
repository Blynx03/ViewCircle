# Host camera zoom

Zoom is a Host-only progressive enhancement, available in camera setup and the
live Host preview. It changes the camera MediaStreamTrack that LiveKit publishes;
it is not a CSS preview effect. No additional camera capture, republish, media
processor, dependency, backend endpoint, or permission request is introduced.

## Supported cameras and controls

The active track must report a usable zoom range and current zoom through
`getCapabilities()` and `getSettings()`. The control respects its minimum,
maximum, and step. Device/browser support is determined at runtime, not from a
browser name or screen width. Native camera zoom may itself be digital depending
on the hardware; it is not a guarantee of optical magnification.

Touch-capable devices show a compact zoom-value pill. Tap it for +/- and a range
dial; it collapses after 4.5 seconds of inactivity and stays expanded during a
held interaction. Mouse devices show +/- and the slider directly. Hybrid devices
support both. Left/Right and Home/End work only inside the focused zoom control.
The displayed multiplier always comes from the actual camera settings.

Constraint updates are coalesced, serialized, and limited to eight per second.
Existing non-zoom capture constraints are retained. Read-only observation every
250 ms detects publication changes and native-track replacement inside a LiveKit
wrapper. A different camera retains relative zoom intent within its own range;
a restart of the same camera reads the resulting actual settings. Camera-off,
unsupported, or failed zoom hides the control. Rejected or silently ignored zoom
constraints never stop/restart video and are not repeatedly retried on that track.
Recovery/audio prompts take precedence over the overlay.

## Digital fallback assessment

Installed LiveKit 2.15.6 has `LocalVideoTrack.setProcessor`, including processed
local preview and sender replacement, but no built-in crop/zoom processor. This
app has no existing video processor. A fallback would need a new frame-rendering
pipeline, processed-track ownership, restart/disposal handling, and browser
background/performance validation. That is beyond a small native-camera control,
so no digital fallback is installed. Unsupported cameras keep their original
published video and show no zoom control. In particular, iPhone front/rear support
and laptop webcam support must be checked independently; iOS support is not promised.

## Physical release verification

Use a second device as a Guest throughout. Mount the Host device facing a printed
page or object with recognizable edges. Change zoom without moving the camera:
the Guest must see the same change in framing/detail as the Host (existing local
preview mirroring is independent of zoom). A larger Host preview alone is not a
passing result. Check audio and motion remain continuous.

1. **iPhone rear:** test Safari and installed PWA; expand the pill, sweep the
   supported range, hold the dial longer than 4.5 seconds, release, and confirm
   collapse. Verify min/max and real Guest output. If no control appears, record
   browser/OS/camera as unsupported rather than expecting fixed preset values.
2. **iPhone front:** flip front/rear repeatedly at non-default zoom. Check the new
   camera's range, displayed actual value, and Guest framing. Unsupported front
   zoom should disappear without interrupting video.
3. **MacBook/laptop:** test +/- and slider if supported; focus slider and test
   Left/Right/Home/End. Arrows elsewhere must not zoom. Test an external camera
   via the existing device workflow if available; no new device picker is added.
4. **No native zoom:** confirm no zoom control, normal preview/Guest video, camera
   off/on, Flip, audio, and Host End Session all still work.
5. **Touchscreen/hybrid:** at a wide viewport, expand by touch, drag, then use mouse
   +/- and keyboard without changing layout based on width. Confirm focus remains
   usable after collapse.
6. **Lifecycle:** change zoom, toggle camera off/on, background/foreground, and
   reconnect. Confirm actual camera state is reflected and there is no extra
   capture prompt, duplicate stream, or stuck value. Guest controls, Leave, and
   Safari/PiP workflows must remain unchanged.

Automated tests use simulated camera capabilities and verify outgoing-track
selection, constraints, failure isolation, timing, controls, and browser layout.
They do not prove physical native-zoom support or end-to-end camera quality.
