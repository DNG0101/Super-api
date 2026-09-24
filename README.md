# Super API Peer Lab

A GitHub-Pages-ready browser Web API capability and execution lab with WebRTC peer control.

## Coverage model

There is no single permanent finite list that equals “all Web APIs” across Chrome, Firefox, Safari, workers, worklets, installed PWAs, experimental flags and future browser releases. Super API therefore combines **fixed coverage + live discovery + realm scanning + explicit executable tests** rather than pretending that one static list is complete.

The fixed baseline is aligned to the MDN **Web APIs → Specifications** catalog checked on 24 September 2026 and contains 148 specification-family entries. That baseline is complemented by the current MDN Web/API page directory, runtime interface reflection, non-Window execution realms, instantiated API objects, and current Chromium platform additions.

### Execution and discovery layers

1. `app.js` — primary runnable API tests and the WebRTC peer console.
2. `api-extensions.js` — additional APIs, formerly detection-only paths and configurable server-backed tests.
3. `deep-api-tests.js` — deeper execution paths including WebGPU device work, inline WebXR, WebAuthn creation, file/directory reads, hardware connect/open tests, MediaSource, WebCodecs, Push, Periodic Sync, presentation/remote playback and service-worker messaging.
4. `session-bootstrap.js` — one-click reusable-permission preparation and rendered coverage audit.
5. `runtime-surface.js` — reflects constructors, interfaces, methods, accessors and properties actually exposed by the current Window/browser, with JSON export and a local generic method runner.
6. `emerging-apis.js` — Prompt/LanguageModel, Writer, Rewriter, Proofreader, Summarizer, Translator, Language Detector, `fetchLater()`, Digital Credentials presentation, Region/Element Capture targets, CaptureController, handwriting recognition, WebMCP, `highlightsFromPoint()` and FileSystemObserver.
7. `realm-scanners.js` — scans DedicatedWorker, SharedWorker, ServiceWorker and AudioWorklet realms plus instantiated WebGL extensions, WebGPU, WebRTC, MediaStream, Cache/Storage and IndexedDB objects.
8. `mdn-live-index.js` — loads the current `mdn/content` Web/API directory on demand and compares its individual API/interface pages with the browser runtime.
9. `latest-platform.js` — version-specific tests for newly shipping/beta capabilities, including CPU Performance, capability elements, WebAudio render quantum, WebSocket options/`targetAddressSpace`, modern WebCrypto algorithms, renewed HTML insertion/streaming methods, installed-related-apps, Digital Credential issuance, WebTransport headers, latest Window Management surfaces and CSSPseudoElement access.
10. `.github/workflows/validate.yml` — validates JavaScript syntax, the manifest, HTML asset references and Service Worker core assets after repository changes.

`API_COVERAGE.md` describes how to interpret these layers.

## Peer model

Open the same application on two devices:

- **Controlled peer** — executes explicitly implemented tests.
- **Controller peer** — requests those tests.

The peers communicate through one WebRTC DataChannel. Camera, microphone and screen tracks can also be attached to the same peer connection when the browser permits the requested capability. Extension, deep, emerging, latest-platform and realm-scan commands are routed through the existing peer connection rather than creating another connection.

### Pairing

1. Open the page on both devices.
2. Choose **Controlled peer** on one device and **Controller peer** on the other.
3. Create an offer, paste it on the second device, and create the answer.
4. Paste the answer back and apply it.
5. On the controlled peer enable **Authorize this paired peer to run all implemented API actions for this page session** once.

Public STUN services are used for NAT discovery. Some restrictive NAT/firewall combinations require TURN; a static GitHub Pages application cannot itself provide a TURN relay.

## One application-level authorization

Super API uses one application-level authorization for the complete page session.

After it is enabled:

- explicitly implemented peer actions execute without another Super API per-action approval;
- the bootstrap attempts reusable browser permissions that can be requested from the initial trusted action;
- the authorization is intentionally not persisted and resets on reload or when the page switches to Controller mode;
- a visible **session control ON** indicator remains on the controlled peer;
- actual browser errors are returned instead of fake success responses.

This application-level authorization does not replace the browser or operating system security model. Some Web APIs require a native permission prompt, browser-controlled capability element, device/file chooser, or fresh transient user activation. Examples include screen capture, file/device selection, Bluetooth, USB, HID, Serial, Contacts, WebAuthn, Digital Credentials and capability elements such as `<camera>`/`<microphone>`. Those requirements are enforced outside Super API and JavaScript cannot merge them into one universal browser permission.

## Why the generic runner is local-only

`runtime-surface.js` can locally invoke an exposed dotted method path with a JSON argument array. It is intentionally not available as arbitrary remote method execution. The controller instead receives the large set of explicitly implemented test actions, runtime/realm inventories and their results. This keeps the peer lab useful for capability testing without becoming an unrestricted remote-control primitive.

## Sensitive values

Where a test touches identity/security material, the peer response is minimized or redacted. WebOTP codes, FedCM tokens, Digital Credential payloads, Push subscription endpoint/key material, WebAuthn identifiers and installed-related-app identifiers are not returned to the controller.

## APIs needing external infrastructure

A static GitHub Pages origin cannot provide every protocol counterpart. The application therefore accepts configurable endpoints/credentials where appropriate for:

- WebSocket
- Server-Sent Events
- WebTransport
- Push/VAPID
- FedCM / identity providers
- Digital Credential protocols/wallets
- Presentation receivers

TURN, DRM/license systems, payment providers and other protocol-specific services likewise require compatible infrastructure outside GitHub Pages.

## GitHub Pages

Enable:

**Repository → Settings → Pages → Deploy from a branch → `main` / root**

Expected site path:

`https://dng0101.github.io/Super-api/`

HTTPS is required by many powerful Web APIs.

## Main files

- `index.html` — UI and peer console
- `catalog.js` — fixed 148-family baseline
- `app.js` — primary tests and WebRTC transport
- `peer-hook.js` — extension-action routing on the existing DataChannel
- `session-consent.js` — one page-session authorization layer
- `session-bootstrap.js` — reusable-permission bootstrap and audit
- `api-extensions.js` — extra and endpoint-backed calls
- `deep-api-tests.js` — deeper executable paths
- `emerging-apis.js` — emerging browser capabilities
- `latest-platform.js` — newest version-specific browser capabilities
- `runtime-surface.js` — Window/runtime reflection
- `realm-scanners.js` — worker/worklet/context/object reflection
- `mdn-live-index.js` — live MDN interface/API page inventory
- `sw.js` — offline shell, background tests and Service Worker realm introspection
- `manifest.webmanifest` — PWA integration metadata
- `API_COVERAGE.md` — coverage interpretation
- `.github/workflows/validate.yml` — static validation

## Testing

Browser support differs by browser version, operating system, hardware, installed-app/PWA state, experimental flags and permissions. A result such as **not detected**, **blocked**, or **requires external endpoint** is therefore a real capability result, not automatically an application failure.
