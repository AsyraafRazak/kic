# IQRA' Gesture Lab

An offline-first, privacy-preserving interactive camera showcase built for **Kelab IQRA**. All hand gesture recognition, multi-face tracking, AR rendering, and photo compositing run **locally on-device** with bundled MediaPipe models and WebAssembly assets—no camera video is ever recorded, saved, or uploaded, and no internet connection is required at runtime.

---

## Interactive Experiences

1. **Gesture Game** (`src/components/CameraView.jsx`, `src/components/GameHUD.jsx`)
   - 30-second target challenge driven by hand gestures.
   - Hold an **Open Palm** to charge energy, aim over a glowing target, and close into a **Closed Fist** to release an expanding energy pulse.
   - Includes synthesized Web Audio feedback and a mouse-controlled **Demo Mode** when no camera is connected.

2. **IQRA' Aura Mirror** (`src/components/AuraMirror.jsx`)
   - Live mirrored AR camera booth tracking **up to 4 faces** and **up to 2 hands** simultaneously.
   - Features customizable primary/accent colors, effect intensity, **Landmark Debug** overlays, photo capture, an optional 30-second challenge, and gesture controls:
     - `Thumb_Up` / `Thumb_Down` to switch filters
     - `Pointing_Up` (hold) to open the filter selection carousel, then `Open_Palm` to confirm
     - Interactive filter effects (*Aura Crown* upward laser, *Energy Hands* swirling sphere & Kamehameha-style beam, and *Guardian Visor* two-palm shield & twin eye lasers)

3. **Filter Creator** (`src/components/FilterCreator.jsx`)
   - Transparent `1280 × 720` drawing studio (`Brush`, `Magic Ink`, `Eraser`, `Circle`, `Star`, `Heart`, `Line`, `Rectangle`) with undo/redo and PNG export.
   - Draw in mid-air with an extended index finger (`Pointing` pose) or with mouse/touch, cycle tools with `Thumb_Up` / `Thumb_Down`, and toggle live preview strokes between **Follow my face** and **Stay on camera**.

---

## Tech Stack

- **Frontend / UI:** React 18 (`react`, `react-dom`), Vite 5 (`vite`, `@vitejs/plugin-react`), plain CSS (`src/styles.css`), HTML5 2D Canvas, Web Audio API (`src/game/gameAudio.js`).
- **On-Device Computer Vision / ML:** `@mediapipe/tasks-vision` running locally with bundled models (`public/models/`) and WASM runtime (`public/wasm/`), supporting GPU acceleration with automatic CPU fallback.
- **Linting & Testing:** ESLint 9 (`eslint.config.js` with `eslint-plugin-react` and `eslint-plugin-react-hooks`) and Vitest 2 (`vitest`).
- **Desktop & Mobile Packaging:**
  - **Windows Desktop:** Electron 45 + `electron-builder` (`windows-desktop/`) serving the built `dist/` bundle via a loopback-only HTTP server.
  - **Android Tablet:** Gradle + Android WebView (`android-tablet/`) bundling the web app and ML assets into an offline APK with external network requests blocked.

---

## Main & Important Files

| Area | Path | Purpose |
| --- | --- | --- |
| **App Entry & Shell** | `index.html`, `src/main.jsx`, `src/App.jsx`, `src/styles.css` | Bootstraps React, manages screen routing, lazy-loads heavy studios, and coordinates camera/audio/tracking lifecycles. |
| **Build & Lint Config** | `package.json`, `vite.config.js`, `eslint.config.js`, `.gitignore` | Scripts, Vite config, ESLint rules, and Git exclusions for dependencies/build artifacts. |
| **Camera & ML Engine** | `src/hooks/useCameraStream.js`, `src/tracking/visionManager.js`, `src/hooks/useHandTracking.js`, `src/hooks/useFaceTracking.js` | Webcam lifecycle, shared MediaPipe task/model cache with GPU→CPU fallback, and ref-backed high-frequency hand/face inference hooks. |
| **Mode Selector & Info Screens** | `src/components/ModeSelectionScreen.jsx`, `src/components/LandingScreen.jsx`, `src/components/ResultScreen.jsx` | Experience chooser, game instructions, and round summary screens. |
| **01 · Gesture Game** | `src/components/CameraView.jsx`, `src/components/GameHUD.jsx`, `src/game/gameState.js`, `src/game/effectsCanvas.js`, `src/game/gameAudio.js` | Round timer, energy charging/pulse mechanics, canvas particle renderer, and Web Audio cues. |
| **02 · Aura Mirror** | `src/components/AuraMirror.jsx`, `src/components/aura-mirror/`, `src/game/auraCanvas.js`, `src/game/filters/`, `src/game/gestureInteraction.js`, `src/game/auraInteraction.js`, `src/game/auraFilterInteraction.js`, `src/game/faceDebugCanvas.js` | Multi-face AR canvas orchestrator, per-filter renderers (`auraCrown`, `energyHands`, `guardianVisor`, `customFilter`), gesture state machines, and landmark inspector. |
| **03 · Filter Creator** | `src/components/FilterCreator.jsx`, `src/components/filter-creator/`, `src/hooks/useFilterHistory.js`, `src/game/drawingRenderer.js`, `src/game/pointingGesture.js` | Drawing studio UI, undo/redo history, unified stroke/shape renderer, and index-finger pointing pose detector. |
| **Shared Utilities** | `src/utils/photoCapture.js` | Horizontally mirrored `object-fit: cover` compositing, filename sanitization, and image download helpers. |
| **Offline ML Assets** | `public/models/face_landmarker.task`, `public/models/gesture_recognizer.task`, `public/wasm/vision_wasm_*` | Local MediaPipe models and WASM binaries served from the app origin. |
| **Packaging & Docs** | `docs/face-tracking.md`, `IMPROVEMENT.md`, `windows-desktop/main.cjs`, `android-tablet/app/src/main/java/com/kelabiqra/gesturelab/MainActivity.java` | Face/hand tracking guide, engineering changelog, Windows Electron wrapper, and Android WebView wrapper. |

---

## Getting Started

```bash
# 1. Install dependencies
npm ci

# 2. Start local dev server
npm run dev

# 3. Run linter and unit tests
npm run lint
npm test

# 4. Build production bundle and verify offline preview
npm run build
npm run preview -- --host 127.0.0.1
```

### Available npm Scripts

| Script | Description |
| --- | --- |
| `npm run dev` | Starts Vite development server. |
| `npm run build` | Builds production assets into `dist/` (including `dist/models/` and `dist/wasm/`). |
| `npm run preview` | Serves the built `dist/` folder locally for offline verification. |
| `npm run lint` | Runs ESLint across `src/`. |
| `npm test` | Runs all Vitest unit tests once (`vitest run`). |
| `npm run test:watch` | Runs Vitest in watch mode. |

---

## Offline Assets & Packaging

- **Offline Web / Booth Verification:** See [`docs/face-tracking.md`](docs/face-tracking.md) for local model/WASM path requirements and offline testing steps.
- **Windows Desktop Installer:** See [`windows-desktop/README.md`](windows-desktop/README.md) to build the NSIS `.exe` installer (`windows-desktop/release/` is excluded from Git—distribute compiled `.exe` binaries via **GitHub Releases**).
- **Android Tablet APK:** See [`android-tablet/README.md`](android-tablet/README.md) to build the offline debug/release APK via `build-apk.bat`.
- **Engineering Improvements & Roadmap:** See [`IMPROVEMENT.md`](IMPROVEMENT.md).
