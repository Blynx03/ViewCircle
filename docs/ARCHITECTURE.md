# ViewCircle architecture

## System boundaries

- The React PWA owns presentation, device permission prompts, local media controls, and LiveKit room connections.
- Express owns temporary session metadata, PIN verification, admission, Host authorization, and LiveKit token grants.
- LiveKit is the SFU. Camera and microphone bytes only travel through WebRTC and are never handled or stored by the API.
- `SessionStore` isolates persistence. The MVP uses an atomic in-memory implementation and is intentionally suitable for one API instance. A shared PostgreSQL/Redis adapter is required before horizontal scaling.

## Security model

The server creates a random 256-bit Host secret and places it in a scoped HTTP-only cookie. Only its SHA-256 digest is retained. Room codes and PINs can never grant Host access. Four-digit PINs are salted and hashed with scrypt, never returned or logged. LiveKit grants allow Hosts to publish camera/microphone and Guests to publish microphone only. API limits apply to creation, lookups, joins, and Host actions. Production uses secure cookies, HTTPS, Helmet, and an exact CORS origin.

## Lifecycles

Host: `HOME → CREATE_SESSION → CAMERA_SETUP → CONNECTING → LIVE → RECONNECTING → ENDING → ENDED`.

Guest: `HOME → JOIN → VALIDATING → CONNECTING → WAITING_FOR_HOST/WATCHING → RECONNECTING → ENDED/REMOVED/LEFT`.

LiveKit provides reconnection and real-time participant/track events. Ending deletes the LiveKit room, disconnecting all participants; Guests then verify terminal server state and show the ended screen.

## Operational limits and risks

- An in-memory session disappears on API restart and cannot coordinate multiple API replicas. That is the deliberate free-tier MVP tradeoff.
- Browser automation cannot validate actual camera switching, Bluetooth routing, iOS PWA fullscreen, or multi-hour network transitions. Those require the device checklist in the README.
- Screen orientation lock and fullscreen are best-effort because iOS Safari support is limited.
- No recording, egress, transcription, chat, screen sharing, or analytics is enabled.
