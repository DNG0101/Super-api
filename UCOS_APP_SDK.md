# UCOS v6 App SDK

UCOS sandbox applications run in an iframe without `allow-same-origin`. They communicate with the operating environment only through the injected `window.UCOS` SDK over `MessageChannel` IPC. Browser and operating-system permission prompts remain authoritative.

## `.ucosapp` package

A package is JSON with:

```json
{
  "format": "ucosapp",
  "formatVersion": 1,
  "minUCOS": "^6.0.0",
  "manifest": {
    "id": "example.notes",
    "name": "Notes",
    "version": "1.0.0",
    "entry": "main.js",
    "capabilities": ["system.vfs"]
  },
  "files": {
    "main.js": "window.UCOSApp = async (root, UCOS) => { root.textContent = 'Hello UCOS'; };"
  }
}
```

UCOS canonicalizes package paths, rejects traversal, verifies semantic-version compatibility, computes SHA-256 integrity, prevents unintended downgrades, stores package files under the internal VFS, and launches the verified entry as a Blob script inside the existing CSP/Trusted-Types sandbox. It does not use `eval()` or `Function()`.

## Capability requests

```js
const result = await UCOS.capability.request('action:environment-info', {
  operation: 'execute',
  mode: 'auto',
  signal: abortController.signal,
  timeoutMs: 15000
});
```

An app can request only capabilities declared in its manifest. The UCOS permission broker, quotas and capability leases apply before the request reaches a provider. Cancellation is best-effort for provider calls and authoritative for workflow execution and pending IPC replies.

## Private application filesystem

Sandbox VFS calls are rooted inside `/apps/data/<appId>` and cannot address another application's private directory or `/home` directly.

```js
await UCOS.vfs.writeText('/notes.txt', 'hello');
const text = await UCOS.vfs.readText('/notes.txt');
```

## Workflows

Workflows support capability, set, condition, delay, loop and emit steps; dependency ordering; cancellation; retry/backoff; `${...}` data binding; saved event triggers; and bounded run history.

```js
await UCOS.workflows.run({
  id: 'sample',
  steps: [
    { id: 'items', type: 'set', key: 'items', value: [1,2,3] },
    { id: 'loop', type: 'loop', items: '${vars.items}', body: [
      { id: 'copy', type: 'set', key: 'last', value: '${loop.item}' }
    ]}
  ]
});
```

## Runtime events and lifecycle

```js
const off = UCOS.runtime.on('process-state', detail => console.log(detail));
const stop = UCOS.runtime.onLifecycle(event => console.log(event.state));
```

Sandbox applications may subscribe only to the bounded event classes exposed by the runtime. Lifecycle callbacks can also be provided on an object-style `window.UCOSApp` as `onSuspend`, `onResume`, and `onCrash`.

## Type definitions

`UCOS_SDK.d.ts` describes the current sandbox SDK contract for editor/TypeScript integration.
