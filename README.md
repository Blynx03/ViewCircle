# ViewCircle

**Share your view. Stay connected.**  
The Dreamer Project · by blynx03

ViewCircle is a mobile-first private live experience: one Host broadcasts camera video while the Host and up to ten Guests talk over group audio. Guests are technically prevented from publishing video. There are no accounts and no media is recorded or stored.

## Prerequisites

- Node.js 20+
- npm 10+
- A free [LiveKit Cloud](https://cloud.livekit.io/) project, or a self-hosted LiveKit server

## Local setup

1. Install packages:

   ```bash
   npm install
   ```

2. Copy `backend/.env.example` to `backend/.env` and fill in the three values shown by the LiveKit project settings:

   - `LIVEKIT_URL`: the WebSocket URL, such as `wss://project.livekit.cloud`
   - `LIVEKIT_API_KEY`: server API key
   - `LIVEKIT_API_SECRET`: server API secret

   Keep the key and secret only in the backend environment. Never prefix them with `VITE_` or put them in `frontend/.env`.

3. Start both applications:

   ```bash
   npm run dev
   ```

4. Open `http://localhost:5173`. Choose **Host**, create a session, then use the separate **Enable Camera** and **Enable Microphone** actions. ViewCircle shows readiness immediately after the real browser permission succeeds. Start the session, open the displayed `/join/CODE` link in a second browser/device, and join as a Guest. Guests begin muted and only request microphone permission after **Turn Mic On** is tapped.

Supabase is not needed for this single-instance MVP. The optional placeholders describe the planned shared-store seam; the application currently stores only short-lived metadata in memory. Restarting the API ends those sessions.

## Verification

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

The automated suite covers room-code constraints/collisions, PINs, capacity, lock/unlock, removal, Host authorization, ending, validation, LiveKit publish-source grants, explicit permission actions, media readiness, front/rear selection, secure-context guidance, core routes/forms, normalization, and control states. Real WebRTC hardware still needs manual testing.

## Testing with phones and tablets

Camera and microphone access requires HTTPS except on `localhost`. Do not disable browser security. For a practical local-device test, keep `npm run dev` running and expose the Vite server through one HTTPS tunnel; Vite proxies `/api` to the local backend:

```bash
cloudflared tunnel --url http://localhost:5173
```

Open the generated `https://…trycloudflare.com` URL on both devices. Do not use the laptop's plain `http://192.168…` or `http://10.…` address for media testing. Alternatively, deploy a preview using the steps below.

Manually test all four target classes: iPhone Safari, iPad Safari, Android phone Chrome, and Android tablet Chrome.

- Host separate camera/microphone prompts, readiness updates, front/rear camera, Flip, camera off/on, mic off/on, background/foreground, Wi-Fi-to-cellular recovery, and a session up to the configured expiration
- Previously denied camera/microphone guidance and successful **Try Again** after changing site settings
- Guest muted entry without a permission prompt, first permission request from **Turn Mic On**, Sound toggle, autoplay recovery, wired/Bluetooth route changes, lock/full room/removal
- Portrait/landscape responsive fallback, landscape overlays, safe areas, installation, and clean End Session propagation

Layout follows physical orientation. No Rotate or Fullscreen control is exposed and the app does not override OS rotation lock.

## Deployment

1. Create a LiveKit Cloud project (free Build tier) and keep egress/recording disabled.
2. Deploy the backend with `render.yaml` on Render or an equivalent Node host. Add `CLIENT_URL`, `LIVEKIT_URL`, `LIVEKIT_API_KEY`, and `LIVEKIT_API_SECRET`. Keep one backend instance while using the in-memory store.
3. Deploy `frontend/` to Vercel. Replace `YOUR-BACKEND.example.com` in `frontend/vercel.json` so `/api` stays same-origin through the rewrite. Update backend `CLIENT_URL` to the exact Vercel production origin. The same-origin API path is important for the secure Host cookie.
4. Use HTTPS/WSS in production. Test cookies and CORS from the final custom domains.

For multiple API instances or restart-resistant rooms, implement the existing `SessionStore` interface using Supabase PostgreSQL or Redis with transactional capacity admission. Do that before scaling horizontally. LiveKit can later move from Cloud to self-hosting by changing the three backend environment values.

Free tiers can change and LiveKit usage is participant-minute based. The demo defaults to a 120-minute lifetime from room creation and does not enable automatic paid upgrades or resource-heavy recording features.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the security and lifecycle design.

### Background use, PiP, and orientation compatibility

ViewCircle keeps its LiveKit room and audio enabled when backgrounded, respecting your Mic and Sound selections. Background microphone, playback, and camera availability depend on the browser, OS, interruptions, and power policy. **iPhone/iPad Safari and installed iOS PWAs may suspend capture, playback, or the page when another app is active or the screen locks. Installing the PWA does not grant native background privileges.** A killed/reloaded page cannot preserve an in-memory Host capture session. Foreground recovery is best-effort and may require tapping the audio prompt or granting media permission again.

Guest layout follows physical orientation: portrait keeps separate header/video/control rows; landscape fills the viewport with video beneath translucent status and control overlays. A passive portrait tip may appear briefly once per session on touch devices. There are no Rotate or Fullscreen controls. Video uses `object-fit: contain`.

In normal browsers, Picture in Picture is offered when Host video is available and the video element supports the standard API or Safari's presentation API. Installed iOS Home Screen mode instead offers a Safari multitasking action. This implementation uses native video PiP (Document PiP is optional and is not used). Availability for live streams varies; a rejected request displays a simple fallback message. Native controls determine placement, resizing, and returning to the page. No arbitrary overlays or background permissions are added. See [MDN's PiP API reference](https://developer.mozilla.org/en-US/docs/Web/API/Picture-in-Picture_API), [Apple's Safari PiP guidance](https://developer.apple.com/documentation/webkitjs/adding_picture_in_picture_to_your_safari_media_controls), and [WebKit's capture behavior](https://webkit.org/blog/7763/a-closer-look-into-webrtc/).

Without PiP, a background Guest unsubscribes from Host video while audio stays connected; foregrounding resubscribes. With PiP active, video remains subscribed. Explicit subscription control replaces LiveKit's visibility-based adaptive stream behavior so it cannot independently suspend PiP video. This reduces background video bandwidth; **it does not eliminate LiveKit participant-minute usage**.

Session status is checked on foreground/recovery and every 30 seconds while visible. LiveKit handles temporary transport reconnects; after a full disconnection the app checks session status before attempting to connect with the existing credentials and retained tracks. Expired credentials, revoked permissions, OS termination, or loss of the backend's existing in-memory session store can prevent recovery. Use Leave or End Session for a definitive exit; pagehide is deliberately not treated as Leave (it can also indicate suspension or browser navigation caching).

Before production deployment, configure the backend Owner credentials and VAPID settings described in [owner-access.md](docs/owner-access.md). Preserve the same-origin API proxy. Deploy backend before frontend in a coordinated maintenance window; existing in-memory sessions reset on backend restart.


### iOS Home Screen versus Safari: device-tested distinction

A user-run A/B test with a laptop Host and an iPhone Guest verified PiP and two-way background audio in normal Safari, with the Guest mic still on after returning. The same session opened from the iPhone Home Screen had unavailable PiP and unreliable background media. These are observations for that device/setup, not a guarantee for every iOS version or interruption. Installed iOS Guest capture is not automatically reacquired on visibility changes; explicit Mic actions remain available. Normal Safari recovery is preserved.

The centralized environment check combines `(display-mode: standalone)` with WebKit's `navigator.standalone`, restricted to iPhone/iPad/iPod identities or iPadOS's Mac identity with multi-touch. It does not label normal Safari, desktop Mac web apps, or Android PWAs as installed iOS. References: [Apple standalone detection](https://developer.apple.com/library/archive/documentation/AppleApplications/Reference/SafariWebContent/ConfiguringWebApplications/ConfiguringWebApplications.html) and [display-mode detection](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/%40media/display-mode).

Installed iOS Guests see a **Safari** compass action instead of PiP. It opens “Continue in Safari” instructions and **Copy & Continue**. No reliable direct launch/credential handoff is assumed: links can be handled within a web app or Safari View Controller ([Apple's web app behavior](https://developer.apple.com/videos/play/wwdc2023/10120/)). Guests copy the link, Leave, manually open Safari, and paste it to rejoin. The public room code is preserved; the display name is optionally prefilled from a URL fragment. No token, identity, Host credential, or PIN is transferred. The name is visible in the copied link. Safari still uses the normal PIN, capacity, and session-lock checks; a locked session must be unlocked by its Host before rejoining. Copying alone never leaves or changes microphone state. Clipboard denial falls back to a selectable link.

Host and Guest share 64px-wide, minimum 60px-high icon-above-label controls with responsive wrapping and safe-area padding. Mic/Sound have explicit active states, and destructive Leave/End actions have extra separation. See [the device test plan](docs/ios-safari-and-controls-testing.md).

## Owner-controlled portfolio access

ViewCircle requires Owner login or temporary Owner-approved demo access to create a session. The Host/Guest landing page and Guest joining are public; Guests still pass normal room, PIN, lock and capacity checks. Existing-room Host controls require their separate room-specific Host authority. Start at `/owner` to manage access requests and enable iPhone Home Screen Web Push. Configure backend-only Owner credentials before production startup; the frontend continues using the existing same-origin `/api` proxy.

See [Owner setup, environment variables, key generation, security and limitations](docs/owner-access.md) and the [real-device acceptance procedure](docs/ios-safari-and-controls-testing.md). In-memory authorization and notification registrations reset on backend restart. No normal user accounts are introduced.
