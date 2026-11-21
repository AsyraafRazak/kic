# IQRA Gesture Lab for Windows

This is a separate Windows desktop app project. It packages the web app, local face and gesture models, and MediaPipe WASM runtime into an installer. The installed app serves these bundled files from a loopback-only local server, so it does not depend on this computer, a web host, or internet access while running.

## Build the installer

1. Install Node.js 20 or newer on a Windows computer.
2. From this folder, run `npm.cmd install`.
3. Run `npm.cmd run dist`.
4. Share `release\IQRA Gesture Lab Setup 1.0.0.exe` with the Windows computer.

The installer creates a Start menu entry and desktop shortcut. The app asks for camera permission when a camera experience is selected. Exported images use the Windows Save dialog.

This build targets 64-bit Windows. The installer is unsigned, so Windows SmartScreen may show a warning; only proceed if you trust the person who sent you the installer.
