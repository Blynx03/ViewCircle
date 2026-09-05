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

- Host separate camera/microphone prompts, readiness updates, front/rear camera, Flip, camera off/on, mic off/on, background/foreground, Wi-Fi-to-cellular recovery, and a 3+ hour session
- Previously denied camera/microphone guidance and successful **Try Again** after changing site settings
- Guest muted entry without a permission prompt, first permission request from **Turn Mic On**, Sound toggle, autoplay recovery, wired/Bluetooth route changes, lock/full room/removal
- Portrait/landscape responsive fallback, fullscreen behavior, safe areas, installation, and clean End Session propagation

Browser limitations are surfaced as plain-language fallbacks. iOS does not consistently support orientation lock or the standard fullscreen API.

## Deployment

1. Create a LiveKit Cloud project (free Build tier) and keep egress/recording disabled.
2. Deploy the backend with `render.yaml` on Render or an equivalent Node host. Add `CLIENT_URL`, `LIVEKIT_URL`, `LIVEKIT_API_KEY`, and `LIVEKIT_API_SECRET`. Keep one backend instance while using the in-memory store.
3. Deploy `frontend/` to Vercel. Replace `YOUR-BACKEND.example.com` in `frontend/vercel.json` so `/api` stays same-origin through the rewrite. Update backend `CLIENT_URL` to the exact Vercel production origin. The same-origin API path is important for the secure Host cookie.
4. Use HTTPS/WSS in production. Test cookies and CORS from the final custom domains.

For multiple API instances or restart-resistant rooms, implement the existing `SessionStore` interface using Supabase PostgreSQL or Redis with transactional capacity admission. Do that before scaling horizontally. LiveKit can later move from Cloud to self-hosting by changing the three backend environment values.

Free tiers can change and LiveKit usage is participant-minute based. The app imposes no artificial session timeout and does not enable automatic paid upgrades or resource-heavy recording features.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the security and lifecycle design.
