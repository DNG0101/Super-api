# UCOS Shell v3

UCOS Shell v3 turns the Super API project from a capability dashboard into a browser-native operating shell while preserving the original Super API Lab as a developer application.

## Primary experience

Normal startup enters the UCOS shell. The legacy `header` and `main` remain in the DOM and continue to initialize, but are hidden while `body.ucos-os-active` is present. This preserves every existing API action, scanner, peer flow and diagnostics surface without making the raw Lab the normal user experience.

The shell provides:

- full-screen workspace and wallpaper surface
- top system bar with peer state, quick settings, notifications and clock
- left navigation rail on desktop
- adaptive bottom dock
- application launcher / command center (`Ctrl+Space`)
- movable, resizable, minimizable and maximizable desktop application windows
- full-screen application behavior on narrow/mobile layouts
- quick settings and notification flyouts
- explicit Developer Lab entry and Return to UCOS action

## System applications

### Files
Uses browser file/directory pickers where available and surfaces UCOS private storage health. It does not pretend that arbitrary local paths can be read without browser permission.

### Devices
Shows the local capability node and advertised peer nodes. It can refresh, advertise capabilities, ping a peer and open the existing pairing tools in Developer Lab.

### Network Center
Shows browser connectivity hints, UCOS transports and current peer-route state.

### Capability Center
Searches the unified UCOS registry. A developer-level executor remains available inside the app, but normal UCOS apps do not require users to select raw operations or JSON payloads.

### Camera
Provides an actual camera application surface with preview, facing-mode switching, capture/download and deterministic track cleanup when the app closes.

### Terminal
Provides a fixed-command UCOS shell for health, capabilities, nodes, providers, transports, routing and application launch. It does not use `eval()` or `Function()`.

### Flows
Introduces OS-level capability workflows for system health, peer handshake, storage health and network snapshots.

### Settings
Surfaces secure-context state, capability-fabric state, PWA install availability, peer-session authorization and Developer Lab access.

### Developer Lab
Reveals the original Super API Lab without removing or rewriting its UI. Returning to UCOS does not reload the page or destroy the existing runtime.

## Responsive behavior

Desktop uses a rail, workspace, floating windows and dock. Tablet compresses the rail and workspace. Phone-width layouts remove the rail, use full-screen app windows and use the launcher as a bottom sheet.

## Security boundary

UCOS Shell v3 changes presentation and application composition only. Browser/OS permissions, pickers, transient-activation requirements and the existing single-session peer authorization remain authoritative.
