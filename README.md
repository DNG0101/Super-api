# Super API Peer Lab

A GitHub-Pages-ready browser Web API capability lab with WebRTC peer control.

## Current scope

The catalog is aligned to the MDN **Web APIs → Specifications** index checked on 24 September 2026. The build contains 148 specification-level Web API entries. The page feature-detects every catalog entry and exposes an executable browser test wherever a useful static-page test is possible.

Some APIs cannot be fully exercised by a static GitHub Pages site because they require a server counterpart, installed-PWA state, an identity/payment provider, DRM/key system, a push service, origin trials/browser flags, compatible external hardware, or a specific OS/browser. Those APIs remain in the catalog and are reported accurately as detected/not detected instead of pretending that a complete call succeeded.

See [`API_COVERAGE.md`](./API_COVERAGE.md) for the generated catalog snapshot.

## Peer model

The same page can be opened on two devices:

- **Controlled peer** — receives API test requests.
- **Controller peer** — requests a test from the controlled peer.

The peers use a WebRTC DataChannel. Camera, microphone, and screen streams can also be sent over the paired WebRTC connection when the browser allows the requested capability.

### Pairing

1. Open the page on both devices.
2. Choose **Controlled peer** on one and **Controller peer** on the other.
3. On one device press **Create offer**, then copy the JSON to the other device.
4. Paste it and press **Answer pasted offer**.
5. Copy the generated answer back to the offer device.
6. Paste it and press **Apply pasted answer**.
7. On the controlled device enable **Authorize this paired peer to run all implemented API actions for this page session** once.

The app uses public STUN services for NAT discovery. A restrictive NAT/firewall can still require a TURN relay; a static GitHub Pages deployment cannot itself provide TURN.

## Single-session authorization model

There is one app-level authorization for the complete page session.

After the controlled peer enables that single authorization:

- every implemented peer API request is forwarded immediately by the application;
- the application does not ask for a second per-action approval;
- the authorization is not stored persistently and resets on reload or when the page switches to Controller mode;
- a visible **session control ON** indicator remains on the controlled page.

Browser and operating-system security rules still apply independently. Some Web APIs require their own permission prompt, device chooser, or fresh transient user activation. Examples include screen capture, file/device pickers, Bluetooth, USB, HID, Serial, contacts and similar powerful APIs. JavaScript cannot convert the app's one session authorization into a browser permission that the browser specification requires separately.

If a remotely requested API is blocked for that reason, the error is returned to the controller instead of reporting a false success.

## GitHub Pages

Enable:

**Repository → Settings → Pages → Deploy from a branch → `main` / root**

Expected URL:

`https://dng0101.github.io/Super-api/`

HTTPS is important because many powerful Web APIs are restricted to secure contexts.

## Files

- `index.html` — UI and peer-control console
- `catalog.js` — current Web API specification catalog and capability detectors
- `app.js` — runnable API tests, peer transport and logging
- `session-consent.js` — one-session authorization layer for all peer actions
- `sw.js` — service worker/offline shell and background-sync test target
- `manifest.webmanifest` — PWA integration surfaces
- `icon.svg` — PWA icon
- `API_COVERAGE.md` — generated catalog snapshot

## Testing notes

Browser support differs substantially. For broad coverage, test current Chrome/Chromium on Android and desktop, plus Firefox and Safari where available. A red **not detected** result means the identifying surface is not exposed in that browser/context; it is not automatically an application bug.