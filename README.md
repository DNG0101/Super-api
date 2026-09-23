# Super API Peer Lab

A static GitHub-Pages-ready browser capability lab with two peer roles connected over a WebRTC DataChannel.

## What it does

- Detects a broad set of browser Web APIs and shows whether each API surface is exposed by the current browser.
- Provides working local demos for many APIs, including camera, microphone, screen capture, torch where exposed, geolocation, clipboard, notifications, wake lock, Web Share, File System Access, OPFS, fullscreen, Picture-in-Picture, vibration, battery/network information, Bluetooth, USB, Serial, HID, NFC, MIDI, gamepads, Web Audio, speech synthesis, Web Crypto, storage, Cache Storage, IndexedDB, Fetch, Workers, BroadcastChannel, WebGL, WebGPU, Compression Streams, Permissions, Service Workers, orientation, Contact Picker, Payment Request capability checking, WebAuthn capability checking, Performance APIs and IntersectionObserver.
- Detects many additional APIs that require hardware, a server counterpart, an installed PWA, browser-specific support, or APIs that cannot be safely/meaningfully demonstrated from a static GitHub Pages site.
- Allows a paired controller peer to request API actions on a controlled host over WebRTC.

## Security and permission model

This project intentionally does **not** bypass browser permissions or user-activation requirements.

The controlled peer must enable remote requests for the current session. Sensitive APIs that browsers require to originate from a local user gesture are queued on the controlled device until the user presses **Run requested action**. Browser permission/device-picker dialogs still apply.

That behavior is required by the Web platform for APIs such as camera/mic permissions, screen sharing, file pickers, clipboard reads, Bluetooth/USB/HID/Serial device selection, NFC, notifications and similar powerful features.

## Pair two devices without a signaling server

1. Open the same deployed page on both devices.
2. Device A: choose **Controlled peer (Host)** and check **Allow paired peer to request API actions for this session**.
3. Device A: press **Create offer**, copy the JSON offer to Device B.
4. Device B: choose **Controller peer**, paste the offer and press **Create answer from pasted offer**.
5. Copy Device B's answer back to Device A.
6. Device A: paste the answer and press **Apply pasted answer**.
7. Wait until both pages report the peer data channel as connected.
8. Device B can now choose an API and press **Request on peer**.

The app uses a public STUN server for NAT discovery. Some restrictive NAT/firewall combinations require a TURN relay; this static project does not include a TURN server.

## GitHub Pages

For this repository, enable GitHub Pages from:

**Repository → Settings → Pages → Deploy from a branch → `main` / root**

Then the expected URL is:

`https://dng0101.github.io/Super-api/`

GitHub Pages provides HTTPS, which is required for many powerful Web APIs.

## Important limitations

There is no single browser that implements every Web API. Some APIs are experimental, removed, vendor-specific, restricted to installed PWAs, require hardware, require a backend/service endpoint, require an origin trial/flag, or are intentionally unavailable to ordinary web pages.

Therefore the project uses two strategies:

1. **Runnable demo** where a meaningful static-page test is possible.
2. **Capability detection** where the API cannot be fully exercised in a portable GitHub Pages-only app.

The capability matrix reports the browser's actual exposed API surface instead of pretending unsupported features work.
