# Super API Peer Lab

A GitHub-Pages-ready browser Web API capability lab with WebRTC peer control.

## Current scope

The fixed catalog is aligned to the MDN **Web APIs → Specifications** index checked on 24 September 2026 and contains 148 specification-level API families. MDN also maintains a separate, much larger **Interfaces** index; therefore the project now combines fixed-family coverage with runtime reflection of the actual interfaces, constructors, methods, accessors, experimental APIs and vendor-specific surfaces exposed by the browser.

The project uses these execution/coverage layers:

1. `app.js` — primary runnable API tests and WebRTC peer console.
2. `api-extensions.js` — previously detection-only APIs plus configurable server-backed tests.
3. `deep-api-tests.js` — deeper execution paths such as WebGPU device submission, inline WebXR, WebAuthn creation, file/directory reads, hardware open/connect tests, MediaSource, WebCodecs, Push, Periodic Sync and service-worker messaging.
4. `session-bootstrap.js` — one-click reusable-permission preparation and coverage audit.
5. `runtime-surface.js` — exhaustive runtime reflection of every API surface actually exposed by the current browser, with search/export and a local generic method runner.
6. `emerging-apis.js` — current/emerging Chromium capabilities including Prompt, Writer, Rewriter, Proofreader, Summarizer, Translator, Language Detector, `fetchLater()`, Digital Credentials, CropTarget, RestrictionTarget, CaptureController, handwriting recognition, WebMCP, `highlightsFromPoint()` and FileSystemObserver.

APIs that fundamentally require a compatible remote service can be tested by entering an endpoint in the **Extended / server-backed API calls** panel. GitHub Pages itself cannot act as an SSE, WebSocket, WebTransport, TURN, push, DRM, identity-provider or payment-provider backend.

## Peer model

Open the same page on two devices:

- **Controlled peer** — receives API test requests.
- **Controller peer** — requests tests from the controlled peer.

The peers communicate through a WebRTC DataChannel. Camera, microphone and screen tracks can also be sent over the paired WebRTC connection when the browser allows the requested capability.

`peer-hook.js` extends the same WebRTC channel so `ext:*`, `ext:deep-*` and `ext:emerging-*` actions use the existing pairing rather than requiring a second connection.

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

- implemented peer actions are forwarded without another Super API per-action approval;
- `session-bootstrap.js` attempts reusable browser permissions that can be requested from the initial trusted gesture;
- authorization resets on reload or when the page switches to Controller mode;
- a visible **session control ON** indicator remains on the controlled page;
- real browser errors are returned instead of fake success responses.

This does **not** override the browser or operating system. Some Web APIs require their own permission prompt, chooser, or fresh transient user activation. Examples include screen capture, file/device pickers, Bluetooth, USB, HID, Serial, contacts and similar powerful capabilities. A normal webpage cannot merge those browser-enforced requirements into one universal JavaScript permission.

The runtime generic method runner is intentionally local-only. It can invoke exposed methods from a local click using a dotted path and JSON argument array, but it is not exposed as unrestricted arbitrary remote method execution.

## Sensitive credential handling

Security-sensitive values are redacted from peer results where appropriate. WebOTP codes, FedCM tokens, Digital Credential payloads, Push subscription endpoints/keys and WebAuthn credential identifiers are not returned to the controller.

## GitHub Pages

Enable:

**Repository → Settings → Pages → Deploy from a branch → `main` / root**

Expected URL:

`https://dng0101.github.io/Super-api/`

HTTPS is required by many powerful Web APIs.

## Files

- `index.html` — UI and peer-control console
- `catalog.js` — 148 MDN specification-family catalog and feature detectors
- `peer-hook.js` — routes extension actions over the existing WebRTC DataChannel
- `app.js` — primary runnable API tests and peer transport
- `session-consent.js` — single page-session authorization layer
- `api-extensions.js` — additional calls and endpoint-backed tests
- `deep-api-tests.js` — deeper end-to-end API paths
- `session-bootstrap.js` — one-click reusable-permission bootstrap and coverage audit
- `runtime-surface.js` — runtime interface/method/property scanner and local method runner
- `emerging-apis.js` — newer Chromium/browser capability tests
- `sw.js` — offline shell/background test service worker and message round-trip endpoint
- `manifest.webmanifest` — PWA metadata
- `icon.svg` — PWA icon
- `API_COVERAGE.md` — fixed catalog snapshot

## Testing notes

Browser support differs substantially. Test current Chrome/Chromium on Android and desktop, plus Firefox and Safari where available. A red **not detected** result means the identifying API surface is not exposed in that browser/context; it does not automatically indicate an application bug.
