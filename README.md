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

The peers use a WebRTC DataChannel. Camera, microphone, and screen streams can also be sent over the already-paired WebRTC connection after the controlled peer approves that specific action.

### Pairing

1. Open the page on both devices.
2. Choose **Controlled peer** on one and **Controller peer** on the other.
3. On one device press **Create offer**, then copy the JSON to the other device.
4. Paste it and press **Answer pasted offer**.
5. Copy the generated answer back to the offer device.
6. Paste it and press **Apply pasted answer**.
7. On the controlled device enable **Allow this paired peer to send requests during this session**.

The app uses public STUN services for NAT discovery. A restrictive NAT/firewall can still require a TURN relay; a static GitHub Pages deployment cannot itself provide TURN.

## Permission and safety model

The application does not bypass browser or operating-system permission boundaries.

After the controlled peer explicitly enables requests for the current session:

- low-risk diagnostics can execute automatically;
- sensitive capabilities are queued and require **Approve once** on the controlled device;
- any browser/OS permission prompt or device picker still applies;
- approval is for one requested action only.

Sensitive actions include camera, microphone, screen capture, geolocation, clipboard access, local files/directories, contacts, Bluetooth, USB, Serial, HID, NFC, MIDI, local-font enumeration, screen/window details, sensors, authentication/payment-related checks, and similar powerful capabilities.

This is intentional. Ordinary web pages cannot legitimately make many of these APIs universally consentless, and some APIs specifically require transient local user activation.

## GitHub Pages

Enable:

**Repository → Settings → Pages → Deploy from a branch → `main` / root**

Expected URL:

`https://dng0101.github.io/Super-api/`

HTTPS is important because many powerful Web APIs are restricted to secure contexts.

## Files

- `index.html` — UI and peer-control console
- `catalog.js` — current Web API specification catalog and capability detectors
- `app.js` — runnable API tests, peer transport, permission policy, logging
- `sw.js` — service worker/offline shell and background-sync test target
- `manifest.webmanifest` — PWA integration surfaces
- `icon.svg` — PWA icon
- `API_COVERAGE.md` — generated catalog snapshot

## Testing notes

Browser support differs substantially. For broad coverage, test current Chrome/Chromium on Android and desktop, plus Firefox and Safari where available. A red **not detected** result means the identifying surface is not exposed in that browser/context; it is not automatically an application bug.
