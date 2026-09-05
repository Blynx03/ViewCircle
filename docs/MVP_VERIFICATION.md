# MVP verification checklist

## Automated

- Session creation, valid random code, collision retry, public lookup, optional PIN and wrong-PIN rejection
- Ten simultaneous Guest admissions; eleventh rejected atomically
- Room lock/unlock, Guest removal state, Host-only operations, ended-room rejection, invalid input
- LiveKit Guest grant contains microphone only; camera and screen share are absent
- LiveKit Host grant contains camera and microphone; screen share is absent
- No media permission request on landing, create form, join form, or initial Host setup render
- Explicit Host camera/microphone actions, readiness state, and post-permission front/rear selection
- Insecure-context and denied-permission guidance
- TypeScript, ESLint, unit/integration tests, production builds, and dependency audit

## Requires physical devices

- Real permission prompts and previously blocked-site recovery on iPhone Safari, iPad Safari, Android Chrome phone, and Android Chrome tablet
- Host video transport, all-party audio, echo behavior, Bluetooth/wired routes, autoplay recovery, and hardware camera switching
- Camera Off versus End Session, reconnection across Wi-Fi/cellular changes, background/foreground recovery, and 3+ hour stability
- PWA installation, safe areas, fullscreen and orientation fallbacks on each target browser

Use HTTPS for every physical-device media test. `localhost` is permitted only on the device running the development server.
