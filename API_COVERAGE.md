# API Coverage Model

Checked baseline date: **24 September 2026**.

Super API does not treat one static number as “all Web APIs.” Browsers expose different interfaces according to browser/version, Window vs Worker/Worklet realm, hardware, installed-PWA context, flags/origin trials, permissions and instantiated objects. The lab therefore measures coverage through multiple complementary layers.

## 1. Fixed specification-family baseline

`catalog.js` contains **148 MDN Web API specification-family entries**. This is useful for category-level navigation and stable feature detection, but it is intentionally not described as the total number of Web API interfaces.

A specification family can expose many interfaces/classes. For example, one family such as WebRTC or WebGPU contains numerous individual objects that only exist after a connection/device/context is created.

## 2. Primary executable tests

`app.js` contains the main practical test actions, including media capture, camera/torch, microphone, screen capture, geolocation, clipboard, files, storage, workers, notifications, Bluetooth, USB, Serial, HID, NFC, MIDI, WebAuthn capability checks, WebXR/WebGPU/WebGL/WebCodecs, sensors, sharing, Wake Lock, networking, cryptography, DOM/CSS and many more.

## 3. Extended and server-backed calls

`api-extensions.js` covers API families that previously only had detection and APIs that need configurable protocol endpoints. Examples include Background Fetch, CSS Painting, Content Index, EME/ClearKey, Fenced Frames, File and Directory Entries, Force Touch, Houdini, Invoker Commands, JS Self-Profiling, Launch Handler, Presentation, Private State Tokens, Push state, Remote Playback, SSE, Shared Storage, Topics, Text Fragments, Viewport Segments, Periodic Sync, Payment Handler, legacy WebVR, WebSocket and WebTransport.

## 4. Deep executable paths

`deep-api-tests.js` goes beyond surface detection for selected powerful APIs. It instantiates/uses WebGPU devices, inline WebXR, WebAuthn creation, files/directories, Bluetooth GATT, USB/HID opens, MediaSource, VideoFrame/WebCodecs, Push subscriptions, Periodic Sync, FedCM, Presentation, Remote Playback, orientation locking and Service Worker message channels.

## 5. Emerging APIs

`emerging-apis.js` exercises newer browser surfaces including Prompt/LanguageModel, Writer, Rewriter, Proofreader, Summarizer, Translator, Language Detector, `fetchLater()`, Digital Credentials presentation, CropTarget, RestrictionTarget, CaptureController, handwriting recognition, WebMCP, `highlightsFromPoint()` and FileSystemObserver.

## 6. Latest platform/version tests

`latest-platform.js` targets newly shipping/beta browser capabilities rather than waiting for the fixed catalog. Current tests include:

- CPU Performance API (`navigator.cpuPerformance`)
- `<camera>`, `<microphone>`, `<usermedia>` and `<geolocation>` capability-element implementation detection
- configurable WebAudio `renderSizeHint`
- WebSocket options dictionaries and `targetAddressSpace`
- Fetch abort-reason behavior
- modern WebCrypto algorithms and new KEM methods
- renewed HTML insertion/streaming methods
- Get Installed Related Apps summary
- Digital Credentials issuance (payload redacted)
- WebTransport request headers / response headers
- newest Window Management surfaces (non-destructive detection)
- CSSPseudoElement access

## 7. Runtime Window/interface discovery

`runtime-surface.js` reflects what the **actual browser** exposes rather than depending on a hard-coded list. It inventories global constructors plus prototype methods/properties and important `navigator`, `document`, storage, media, GPU, XR, credentials, locks, clipboard and other objects. The full result can be exported to JSON.

The generic dotted-path method runner is local-only and requires a local click; it is not unrestricted remote execution.

## 8. Worker/worklet and instantiated-object discovery

`realm-scanners.js` covers APIs invisible to a Window-only scanner:

- DedicatedWorkerGlobalScope
- SharedWorkerGlobalScope
- ServiceWorkerGlobalScope
- AudioWorkletGlobalScope / processor objects
- WebGL/WebGL2 contexts and extension objects
- WebGPU adapter/device/queue/encoder/buffer/texture/sampler objects
- WebRTC peer/datachannel/transceiver/sender/receiver/SCTP objects
- MediaStream/MediaStreamTrack objects
- CacheStorage, StorageManager and IndexedDB objects

The realm scan is available through the paired peer under the same one-session authorization and returns capability metadata rather than arbitrary method execution.

## 9. Live MDN interface/API page inventory

`mdn-live-index.js` can load the current `mdn/content` `files/en-us/web/api` directory on demand. This gives the page a live inventory of individual MDN Web/API pages and compares normalized page names with globals exposed by the current browser.

A page without an exact Window-global match is not automatically missing: it can be worker-only, worklet-only, instance-only, an event/dictionary, an overview page, unsupported in that browser, or exposed under another name. The realm/runtime scanners handle those distinctions more accurately.

## What “implemented” means

The UI should distinguish these states rather than falsely reporting every catalog item as identical:

- **Callable** — an explicit executable test exists.
- **Deep callable** — an instantiated end-to-end path exists.
- **Runtime exposed** — the browser exposes the interface/member.
- **Realm exposed** — a Worker/Worklet/context/instance exposes it.
- **Endpoint required** — a compatible external server/provider is necessary.
- **Browser permission/activation required** — JavaScript cannot pre-grant the native requirement.
- **Not exposed** — this browser/version/context does not currently expose the surface.

## Authorization model

There is **one Super API application-level authorization** per page session. After it is enabled, explicitly implemented peer tests do not request another Super API approval.

Browser and operating-system permission prompts, device/file choosers, browser-controlled capability elements and transient-user-activation requirements are separate platform protections. A normal webpage cannot transform those distinct browser permissions into one universal browser permission.

## Validation

`.github/workflows/validate.yml` statically verifies all top-level JavaScript syntax, the web manifest, local HTML script/link references and Service Worker core-cache file references after repository changes.
