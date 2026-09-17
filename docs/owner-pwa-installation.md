# Separate ViewCircle Owner installation

The main manifest is unchanged: ViewCircle starts at `/` and retains its existing default identity (`/`). `owner-manifest.webmanifest` declares ViewCircle Owner with distinct `id: /owner`, `start_url: /owner`, scope `/`, and the same icons, colors and standalone mode.

The document head synchronously assigns the correct manifest href before React loads. There is no temporary main-manifest href on `/owner`. React's layout effect updates that same link on client-side route changes, including back/forward navigation. `/owner` (including its trailing-slash/case variants accepted by the router) selects Owner; other routes select the normal manifest. The Apple installation title follows the selection. All URLs are origin-relative, so local HTTPS tunnels and deployed origins use the same files.

The existing `/sw.js` and its scope, cache strategy, Web Push handlers, authentication and media behavior are unchanged. No second service worker or redirects are introduced. Distinct manifest identity separates the install metadata; it is not a separate backend identity or permission grant. Normal ViewCircle installations retain their original identity and start URL.

## iPhone acceptance check

1. Keep the existing normal ViewCircle Home Screen app installed.
2. In Safari, open the current origin's `/owner` and reload so it receives the updated HTML. Do not install from an old, already-open page.
3. Choose Share → Add to Home Screen. Confirm the proposed name is **ViewCircle Owner**, then add it.
4. Launch the new Owner icon. Confirm `/owner` opens (login or dashboard, depending on its cookies), not the visitor request page.
5. Fully close the Owner app and reopen its icon; repeat the `/owner` check. iOS may restore an existing app window's last state rather than perform a fresh launch; the manifest's cold-launch target remains `/owner`.
6. Launch the existing normal ViewCircle icon and confirm it still starts at `/` with normal Host/Guest/access behavior. Confirm both icons coexist.
7. Log in within the new Owner installation and enable access notifications there if needed. Verify a visitor request notification opens the Owner screen using the unchanged push flow.

A previously installed incorrect shortcut does not acquire a new identity merely because its source page changed. Remove only that mistaken duplicate if necessary and install Owner afresh; keep the normal app. Separate Home Screen installs can have different login/notification state. A temporary tunnel's installation belongs to that tunnel origin and will stop working if it expires.

WebKit documents manifest-ID support and the role of the app name in distinguishing Home Screen apps in [its iOS/iPadOS Web Push documentation](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/). Automated tests verify metadata, early selection and SPA navigation in desktop browsers; actual Home Screen installation, OS restoration and coexistence still require these iPhone checks.
