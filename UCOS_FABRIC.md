# Super API UCOS Fabric v2

UCOS Fabric v2 is an additive architecture over the existing Super API Peer Lab. It does **not** remove the original API catalog, ACTIONS, `ext:*` action bus, WebRTC pairing, realm RPC, runtime scanners, deep tests, emerging/latest API tests, network/wireless modules, external protocol modules, Service Worker, or existing UI.

The purpose of v2 is to turn those working pieces into a reusable browser-native capability fabric while preserving the old lab as the compatibility and developer layer.

## Layering

```text
Adaptive UCOS Shell
        │
Unified Executor / Capability Center
        │
UCOS Fabric Runtime
 ├─ Capability Registry
 ├─ Provider Registry
 ├─ Transport Registry
 ├─ Node Registry
 ├─ Routing
 ├─ Capability Advertisements
 └─ Fabric Telemetry
        │
Existing SuperApiCapabilityOS
 ├─ normalized action registry
 ├─ extension-local adapter
 └─ peer adapter
        │
Existing implementation modules
 ├─ app.js ACTIONS
 ├─ api-extensions.js
 ├─ deep-api-tests.js
 ├─ realm-rpc.js
 ├─ runtime/realm scanners
 ├─ network/signal
 ├─ wireless/radio
 ├─ universal Internet/protocol APIs
 └─ emerging/latest platform tests
```

## Compatibility-first migration

The existing Super API runtime remains authoritative for current remote action execution. UCOS Fabric's `webrtc-compat` transport calls the already tested Capability OS peer adapter, so receiver-side role checks, page-session authorization, browser permissions, native pickers, provider authentication and existing error behavior remain intact.

The fabric adds a second message namespace (`ucos:*`) only for node discovery, capability advertisement and fabric health messages. It does not replace the existing `request/result/error` command protocol.

## Capability registry

The fabric mirrors `SuperApiCapabilityOS.catalog()` into its own mergeable registry. The registry is the future source of truth for the user-facing shell while the existing DOM action list remains supported.

A capability record carries:

- stable ID
- domain and realm
- supported operations
- dependencies and tags
- sensitivity/native-permission metadata
- remote-execution allowance
- source/status metadata

Duplicate registrations are merged rather than discarded so fixed, runtime and future discovery sources can contribute to one capability.

## Providers

Providers implement local capability execution.

Initial providers:

- `browser-native-basic` — bounded direct implementations for common capabilities such as environment, storage estimate, permission snapshots, network, battery, crypto, geolocation, clipboard, camera/microphone probes, file/directory selection, notifications, share and vibration.
- `legacy-extension-local` — reuses the existing explicit extension action bus for `ext:*` actions.

The provider registry supports priorities, domains, exact capability lists and a dynamic `supports()` predicate. New providers can be registered with `SuperApiUCOS.registerProvider()` without modifying the kernel.

Persistent camera/microphone usage remains in the original Lab. The basic provider performs bounded probes and immediately stops acquired tracks to avoid background resource leakage.

## Transports

Initial transports:

- `loopback` — local kernel execution.
- `webrtc-compat` — the existing Super API tracked WebRTC DataChannel and Capability OS peer execution path.

Transports expose a common request interface so Worker, Service Worker, BroadcastChannel, WebSocket or WebTransport implementations can be added later without rewriting the user-facing executor.

## Capability nodes

Each browser session is represented as a node with a session-scoped random node ID. The ID is not intended as a permanent device fingerprint.

A node advertises:

- node ID and label
- local/remote state
- transport
- online state / last seen
- capability IDs
- normalized capability details

Paired UCOS v2 pages exchange `ucos:hello` and `ucos:advertise` messages on the already open DataChannel. The existing Super API command stream is untouched.

## Routing

Execution modes:

- `local` — require a local provider.
- `peer` / `remote` — use the existing WebRTC compatibility transport.
- `auto` — use a local provider when one exists; otherwise use a connected peer.

`auto` does **not** fall back to a remote peer merely because a local permission or execution attempt failed. This prevents an unexpected change of execution location after a user/browser denial.

A future resolver can use the existing node/capability graph to choose among multiple peer nodes.

## Storage service

`modules/ucos-storage.js` provides one asynchronous interface with these adapters:

- memory
- sessionStorage
- localStorage
- IndexedDB
- OPFS

Default preference is OPFS → IndexedDB → localStorage → memory, with fallback when a selected backend is unavailable. Existing application storage is not migrated or deleted.

## Shell

The v2 shell is inserted at the top of the existing `<main>` element and includes:

- fabric health/status
- capability/domain totals
- provider and transport totals
- capability search
- local/remote node view
- capability advertisement and peer ping
- unified executor
- health/result output
- direct navigation to the original Developer Lab

The old panels remain in the DOM and remain usable.

## Security/trust boundaries

UCOS Fabric does not attempt to bypass browser or OS security.

- Receiver-side Super API page-session authorization remains required for the existing peer command path.
- Browser permission prompts and transient activation requirements remain browser-controlled.
- Device/file pickers remain native/browser controlled.
- External authentication remains provider controlled.
- The v2 runtime contains no unrestricted `eval()` or `Function()` executor.
- A session node ID is not a persistent device identity.
- `Auto` routing does not turn a local denial into an automatic remote execution attempt.

## Event-driven behavior

The runtime does not use a permanent polling loop. It reacts to:

- tracked DataChannel additions/open/close
- role/session-control changes
- online/offline changes
- visibility changes
- mutations to the existing action selector as older modules add capabilities

## Validation

CI now validates:

- JavaScript syntax
- existing Capability OS core matrix
- UCOS Fabric core matrix
- architecture/load-order/cache audit
- existing protocol/network/wireless matrices
- existing static wiring audit
- existing Capability OS browser smoke tests
- UCOS Fabric browser smoke test
- production-index responsiveness test

The fabric browser smoke explicitly verifies that the new shell boots **and** that the existing legacy lab remains present.

## Public runtime API

The browser exposes:

```js
SuperApiUCOS.health()
SuperApiUCOS.refresh()
SuperApiUCOS.execute({...})
SuperApiUCOS.executeLocal({...})
SuperApiUCOS.executeRemote({...})
SuperApiUCOS.route(capabilityId, options)
SuperApiUCOS.ping()
SuperApiUCOS.sendAdvertisement()
SuperApiUCOS.registerProvider(provider)
SuperApiUCOS.registerTransport(transport)
SuperApiUCOS.capabilities
SuperApiUCOS.providers
SuperApiUCOS.transports
SuperApiUCOS.nodes
SuperApiUCOS.telemetry
```

This API is the migration surface for future apps/workflows while the original Super API Lab continues to expose every current implementation path.
