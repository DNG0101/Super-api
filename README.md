# Super API Peer Lab

A GitHub-Pages-ready browser Web API capability lab with WebRTC peer control.

## Current scope

The catalog is aligned to the MDN **Web APIs → Specifications** index checked on 24 September 2026. It contains 148 specification-level Web API entries and feature-detects each entry in the current browser.

The project now uses four execution layers:

1. `app.js` — the primary runnable API test set and WebRTC peer console.
2. `api-extensions.js` — completes previously detection-only APIs and provides live/configurable endpoint tests where a server counterpart is required.
3. `deep-api-tests.js` — exercises deeper API paths such as WebGPU device submission, inline WebXR sessions, WebAuthn credential creation, redacted WebOTP/FedCM flows, file/directory reads, Bluetooth/USB/HID connection/open tests, MediaSource lifecycle, WebCodecs frame creation, Periodic Sync registration, Push subscription, Presentation start, Remote Playback prompting, screen-orientation locking and service-worker messaging.
4. `session-bootstrap.js` — runs the one-click reusable-permission bootstrap and audits catalog coverage in the rendered page.

The extension layer includes calls for Background Fetch, CSS Painting, Content Index, Encrypted Media Extensions/ClearKey, Fenced Frames, File and Directory Entries, Force Touch, Houdini, Invoker Commands, JS Self-Profiling, Launch Handler, Presentation, Private State Token surface construction, Push subscription state, Remote Playback, Server-Sent Events, Shared Storage, Topics, Text Fragments, Viewport Segments, Periodic Background Sync, Payment Handler state, legacy WebVR, WebSocket and WebTransport.

APIs that fundamentally require a compatible remote service can be tested by entering an endpoint in the **Extended / server-backed API calls** panel. GitHub Pages itself cannot act as an SSE, WebSocket, WebTransport, TURN, push, DRM, identity-provider or payment-provider backend.

See [`API_COVERAGE.md`](./API_COVERAGE.md) for the catalog snapshot.

## Peer model

Open the same page on two devices:

- **Controlled peer** — receives API test requests.
- **Controller peer** — requests tests from the controlled peer.

The peers communicate through a WebRTC DataChannel. Camera, microphone and screen tracks can also be sent over the paired WebRTC connection when the browser allows the requested capability.

`peer-hook.js` extends the same WebRTC channel so the additional `ext:*` and `ext:deep-*` actions use the existing pairing rather than requiring a second connection.

### Pairing

1. Open the page on both devices.
2. Choose **Controlled peer** on one and **Controller peer** on the other.
3. Press **Create offer** on one peer and copy the JSON to the other.
4. Paste it and press **Answer pasted offer**.
5. Copy the generated answer back to the offer peer.
6. Paste it and press **Apply pasted answer**.
7. On the controlled peer enable **Authorize this paired peer to run all implemented API actions for this page session** once.

The project uses public STUN services for NAT discovery. Restrictive NAT/firewall combinations can still require TURN; a static GitHub Pages site cannot provide a TURN relay.

## One app-level authorization

There is one application-level authorization for the whole page session.

After it is enabled:

- all implemented primary, extension and deep peer actions are forwarded without another app-level approval;
- `session-bootstrap.js` immediately attempts reusable browser permissions that can be requested from that one trusted user gesture, including camera/microphone, geolocation, notifications, orientation/idle permission where exposed, persistent storage and a permission-state snapshot;
- the authorization resets on reload or when the page switches to Controller mode;
- the controlled page displays **session control ON**;
- API errors are returned to the controller instead of being reported as fake successes.

This does **not** override the browser or operating system. Web-platform APIs may independently require a native permission prompt, device picker, or transient local user activation. Examples include screen capture, file/device pickers, Bluetooth, USB, HID, Serial, contacts and some clipboard/sensor operations. A normal webpage cannot merge those browser-enforced permissions into a single JavaScript permission.

The **Session permission bootstrap + coverage audit** panel shows which reusable permissions are ready and which capabilities remain browser-chooser/fresh-activation bound. It also audits how many catalog entries currently have an executable UI path.

## Sensitive credential handling

Deep tests deliberately redact security-sensitive values before returning peer results. WebOTP codes, FedCM tokens, Push subscription endpoints/keys and WebAuthn credential identifiers are not returned to the controller.

## GitHub Pages

Enable:

**Repository → Settings → Pages → Deploy from a branch → `main` / root**

Expected URL:

`https://dng0101.github.io/Super-api/`

HTTPS is required by many powerful Web APIs.

## Files

- `index.html` — UI and peer-control console
- `catalog.js` — Web API catalog and feature detectors
- `peer-hook.js` — routes extension actions over the existing WebRTC DataChannel
- `app.js` — primary runnable API tests and peer transport
- `session-consent.js` — single page-session authorization layer
- `api-extensions.js` — additional API calls, endpoint-backed tests and supplemental capabilities
- `deep-api-tests.js` — deeper end-to-end exercise paths for powerful/specialized APIs
- `session-bootstrap.js` — one-click reusable-permission bootstrap and coverage audit
- `sw.js` — offline shell, background test service worker and message round-trip endpoint
- `manifest.webmanifest` — PWA metadata
- `icon.svg` — PWA icon
- `API_COVERAGE.md` — catalog snapshot

## Testing notes

Browser support differs substantially. Test current Chrome/Chromium on Android and desktop, plus Firefox and Safari where available. A red **not detected** result means the identifying API surface is not exposed in that browser/context; it does not automatically indicate an application bug.
