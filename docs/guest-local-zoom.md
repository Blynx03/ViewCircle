# Guest-local video zoom

A Guest can pinch the received Host video from 1× to 3× and drag with one finger
while zoomed. This changes only that Guest's video element. It adds no camera
permissions, constraints, track replacements, media capture, network messages,
or publication changes. The existing Host native zoom continues to affect the
published camera framing for all Guests; each Guest can independently enlarge
that received image. Local enlargement does not add source detail.

## Gestures and controls

Touch Pointer Events track contacts on the existing video stage. CSS transforms
are written once per animation frame, with the pinch midpoint as the anchor.
Pan bounds use the actual object-fit-contained video dimensions, including
letterboxing. ResizeObserver, viewport/orientation events, and video metadata
and resize events refresh those bounds without resizing the viewing area.

A pinch or a drag exceeding six CSS pixels suppresses the generated click.
A fresh stationary single tap still restores the dock. Gestures pause the dock's
existing timer without revealing a hidden dock; release starts a full countdown
for visible controls. Audio buttons, Safari guidance, Leave, and other controls
keep their existing handlers. No double-tap or desktop zoom controls are added.

The temporary multiplier stays visible during interaction and fades 1.2 seconds
after release, using a 200 ms opacity transition (disabled for reduced motion).
`touch-action: none`, selection prevention, and Safari gesture-event cancellation
are scoped to the video stage. App-wide browser accessibility zoom is unchanged.

Zoom returns to a centered 1× on component/session cleanup, Guest Leave, Host End,
removal, or video clearing. A camera switch that keeps usable metadata preserves
zoom with recalculated bounds; clearing the media element resets it. Nothing is
persisted. Pointer cancellation, capture loss, and backgrounding release the dock
pause without touching the media lifecycle.

## Physical verification

Connect one Host and two Guests. On Guest A, pinch and pan the Host video while
Guest B stays at 1×. Verify the Host and Guest B do not change. Then adjust Host
native zoom where supported: both Guests must receive the changed framing, with
Guest A's independent local magnification on top.

On iPhone Safari and the installed PWA, repeat in portrait and landscape:

1. Pinch from 1× to 3×, pan toward each edge, then pinch back to 1×. Confirm the
   image stays bounded and resets to center, with no document scrolling.
2. Hide the dock by waiting; pinch and pan without revealing it, then use a fresh
   single tap to restore it. Hold a gesture with visible controls for over 4.5
   seconds; they should remain visible and hide only after release/countdown.
3. Check the indicator disappears, Leave still works, and Safari guidance/audio
   controls remain usable. Rotate while zoomed and flip the Host camera.
4. Leave/rejoin, have the Host end the room, and start a different session. Zoom
   should start at 1×. Check foreground/background and Safari/PiP workflows.

Desktop WebKit/Chromium tests use synthetic touch Pointer Events; they cannot
prove physical iOS gesture arbitration, edge gestures, accessibility gestures,
or rendering performance. System gestures may cancel contacts. Native PiP is a
separate presentation surface and does not inherit this page's CSS zoom. Local
3× enlargement can look softer; it does not increase the incoming resolution.
