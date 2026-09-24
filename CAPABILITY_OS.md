# Super API — Universal Browser Capability OS

Super API is a browser-native capability operating layer. Its purpose is to discover, normalize, execute, test, and orchestrate browser capabilities, device-facing APIs, execution realms, network/wireless surfaces, and external Internet APIs through one common control plane.

## Capability Registry

Every executable or inspectable feature is represented as a normalized capability with a stable ID, domain, realm, supported operations, dependencies, source, sensitivity metadata, and external/native requirements. Current domains are Web, realm, device, media, graphics, storage, network, wireless, external, protocol, authentication, PWA, and diagnostics.

The registry is dynamic. Existing feature modules continue to add options to the extension-action bus, and the Capability OS discovers them rather than requiring a second hard-coded catalog.

## Execution Kernel

All commands use the same flow:

1. Validate the command contract.
2. Resolve the capability.
3. Evaluate session/security policy.
4. Resolve dependencies.
5. Resolve an adapter.
6. Execute the capability.
7. Normalize the result or error.
8. Record telemetry.

The kernel returns one result envelope shape for all adapters so UI, peer execution, diagnostics, and future automation can consume the same contract.

## Adapter Bus

The Capability OS does not replace working modules. It treats them as adapters.

- `extension-local`: invokes the existing explicit Super API extension action bus on the controlled device.
- `peer`: sends the same explicit action through the paired WebRTC DataChannel and waits for the matching result/error envelope.
- Existing realm, world-API, network/signal, wireless/radio, Web API, storage, media, GPU, and device modules remain the implementation layer behind those adapters.

No unrestricted `eval()` or arbitrary remote JavaScript executor is introduced.

## Session Policy

Super API has one application-level authorization for controlled-peer operation: `#allowRequests`.

That authorization governs whether the paired controller can request implemented Super API actions for the current page session. It resets on reload/revocation or when the page changes role to Controller.

Browser, OS, hardware, and provider security remain separate. APIs such as camera, microphone, screen capture, Bluetooth, USB, HID, Serial, NFC, files, contacts, WebAuthn, OAuth, API keys, and similar protected capabilities may still require native prompts, device pickers, transient user activation, or provider authentication.

## Peer Transport

Peer orchestration uses the existing WebRTC DataChannel transport. The Capability OS discovers the currently open tracked channel, sends a request with a unique command ID, waits for the matching response, and normalizes the result.

The transport is request/response correlated. Timeouts produce explicit errors rather than silent success.

## Telemetry

The runtime keeps bounded in-memory execution telemetry for the current page session. Each execution records time, capability, operation, adapter, realm, status, duration, result or error. The state can be exported from the UI for debugging and compatibility analysis.

No permanent telemetry backend is required by this architecture.

## Trust boundaries

The control plane deliberately preserves these boundaries:

- Super API session authorization does not replace browser/OS permission UI.
- External API provider authentication is never fabricated or bypassed.
- CORS, mixed-content, secure-context, private-network, device-picker, and transient-activation rules remain browser-enforced.
- Raw wireless/radio functions not exposed by the Web platform are reported as unavailable or bridge-only rather than simulated.
- The unified runtime does not use unrestricted `eval()`/`Function()` execution.

## Failure semantics

A capability may resolve as available, unavailable, blocked, permission-required, external-required, error, or unknown. A failed adapter call returns an error envelope with the command ID, capability ID, operation, adapter, realm, duration, and error text.

No module should claim success when the browser/provider rejected the operation.

## Architecture

```text
Browser / Device / Internet / Wireless / Workers
                     │
              Domain adapters
                     │
          Explicit extension action bus
                     │
              Capability Registry
                     │
              Execution Kernel
             ┌───────┴────────┐
             │                │
      Local adapter      Peer adapter
             │                │
             └───────┬────────┘
                     │
             Session Policy
                     │
          Normalized Result Envelope
                     │
             Telemetry / Tests
```

## Test strategy

CI validates JavaScript syntax, Capability OS core combinations, universal Internet protocols, network/signal logic, wireless/radio logic, architecture wiring, manifest validity, HTML references, Service Worker assets, and deployment compatibility.

The Capability OS core matrix covers every domain × operation pair in addition to policy, command, dependency, compatibility, registry, and result-envelope tests.

Passing CI means the tested contracts and repository wiring are green. It does not imply that every third-party provider, browser version, hardware device, or future Web API can never fail independently.
