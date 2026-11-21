# Engineering Improvements & Roadmap

This document tracks code quality, performance, architecture, and reliability improvements for **IQRA' Gesture Lab**.

---

## Completed Improvements

### Repository Setup (`eb83318`)
- Added root [`.gitignore`](.gitignore) to exclude `node_modules/`, `dist/`, `.venv/`, Android/Gradle caches (`android-tablet/.gradle/`, `build/`, `app/build/`, `local.properties`, `*.apk`, `*.keystore`), and the compiled Electron `windows-desktop/release/` outputs while keeping source code and local MediaPipe assets (`public/models/`, `public/wasm/`) tracked.

---

### Phase 1: Bugfix, Cleanup, Linting & Unit Tests (`1463761`, `787fad6`)
- **Fixed Filter Creator live air-drawing crash (`src/components/FilterCreator.jsx`):**
  - Finger-drawing during live preview previously threw a `ReferenceError` because the preview branch passed an out-of-scope `point` variable instead of `rawPoint`. Fixed to use `rawPoint` with null guards.
- **Removed dead code:**
  - Deleted unused `src/game/auraDrawing.js`.
  - Removed unused `videoPointToFace` from `src/components/FilterCreator.jsx` and unused `distance` from `src/game/gestureInteraction.js`.
- **Added ESLint 9 + Vitest 2:**
  - Configured flat ESLint in `eslint.config.js` (`eslint-plugin-react`, `eslint-plugin-react-hooks`) and added `lint`, `test`, and `test:watch` scripts to `package.json`.
  - Added unit tests for pure game and gesture logic:
    - `src/game/__tests__/gameState.test.js`
    - `src/game/__tests__/pointingGesture.test.js`
    - `src/game/__tests__/auraInteraction.test.js`
    - `src/game/__tests__/auraFilterInteraction.test.js`
    - `src/game/__tests__/gestureInteraction.test.js`

---

### Phase 2: ML Task Caching, GPU Fallback & Ref-Based Tracking (`da3ff57`, `ce81747`)
- **Shared MediaPipe task manager (`src/tracking/visionManager.js` + `src/tracking/__tests__/visionManager.test.js`):**
  - Caches the MediaPipe WASM fileset, model byte buffers, `GestureRecognizer`, and `FaceLandmarker` instances across experience switches instead of re-fetching and re-initializing on every screen change.
  - Attempts `delegate: 'GPU'` first and falls back automatically to `'CPU'` (with fresh `Uint8Array` buffer copies) if WebGL/GPU initialization or runtime inference fails.
  - Provides `nextVisionTimestamp` so MediaPipe `VIDEO` mode receives strictly increasing timestamps across task reuse.
- **Eliminated full-tree React re-renders on every ML frame:**
  - `src/hooks/useHandTracking.js` and `src/hooks/useFaceTracking.js` now publish high-frequency landmark/position frames to `latestRef.current` and only trigger React `setState` on coarse UI transitions (`status`, `handVisible`, `gesture`, `handCount`, `pointingActive`, `facesDetected`, `delegate`, `error`) or throttled 250 ms numeric readouts in Aura Mirror (`src/App.jsx`).
  - Updated `src/components/CameraView.jsx`, `src/components/AuraMirror.jsx`, and `src/components/FilterCreator.jsx` to read `latestRef.current` inside 60 fps canvas loops and gesture timers.
  - Updated `src/components/FilterCreator.jsx` to position its artboard/preview fingertip cursors and 21 hand landmark dots via a `requestAnimationFrame` DOM loop rather than re-rendering JSX every frame.

---

### Phase 3: Modularization, Deduplication & Code Splitting (`19c0257`..`cdb04c5`)
- **Shared drawing & photo capture utilities (`19c0257`):**
  - Unified the duplicated brush, magic-ink gradient, eraser, and shape rendering code into `src/game/drawingRenderer.js` (+ `src/game/__tests__/drawingRenderer.test.js`), supporting both pixel artboard and normalized live-overlay coordinates.
  - Extracted horizontally mirrored `object-fit: cover` compositing, filename sanitization, and download helpers into `src/utils/photoCapture.js` (+ `src/utils/__tests__/photoCapture.test.js`).
- **Split `src/game/auraCanvas.js` into per-filter modules (`fd26b18`):**
  - `src/game/filters/canvasHelpers.js`
  - `src/game/filters/auraCrown.js`
  - `src/game/filters/energyHands.js`
  - `src/game/filters/guardianVisor.js`
  - `src/game/filters/customFilter.js`
- **Extracted camera stream hook & lazy-loaded studios (`cf68121`):**
  - Moved `getUserMedia` lifecycle, cancellation, and error mapping into `src/hooks/useCameraStream.js`.
  - Lazy-loaded `AuraMirror` and `FilterCreator` in `src/App.jsx` via `React.lazy()` and `<Suspense>` to reduce the initial bundle chunk.
- **Split `src/components/FilterCreator.jsx` (`310c9af`):**
  - Extracted undo/redo state into `src/hooks/useFilterHistory.js`.
  - Split UI into `FilterArtboard.jsx`, `FilterToolPanel.jsx`, `FilterPreviewStage.jsx`, and `FilterPlacementPanel.jsx` under `src/components/filter-creator/`.
- **Simplified `src/components/AuraMirror.jsx` (`cdb04c5`):**
  - Extracted `AuraChallengeOverlays.jsx` and `AuraControlsPanel.jsx` under `src/components/aura-mirror/` and adopted `photoCapture.js`.

---

## Current Verification Baseline

- `npm run lint` — 0 errors (5 `react-hooks/exhaustive-deps` warnings)
- `npm test` — 8 test files passed, 36 tests passed
- `npm run build` — builds cleanly with separate lazy chunks and preserves `dist/models/` and `dist/wasm/`

---

## Planned Next Steps

### Phase 4: Booth Reliability & Desktop Hardening
1. **React Error Boundary (`src/components/ErrorBoundary.jsx`):** Catch unexpected WebGL/WASM or runtime UI errors and display a recovery screen with a **Restart Booth** action.
2. **Camera Device Selector:** Expose `navigator.mediaDevices.enumerateDevices()` through `useCameraStream.js` so showcase laptops with external USB webcams can switch cameras easily.
3. **Optional Kiosk Idle Auto-Reset:** Toggleable inactivity timer to return cleanly to the mode selection screen when no visitor is in frame.
4. **Electron Strict Offline Hardening (`windows-desktop/main.cjs`):** Add a `Content-Security-Policy` header in `serveWebAsset` and block non-loopback network requests via `session.defaultSession.webRequest.onBeforeRequest`.

### Phase 5: Optional Larger Stack Upgrades
- **TypeScript Migration:** Convert `src/` modules to `.ts` / `.tsx` with a `tsconfig.json` for compile-time safety on tracking payloads and coordinate spaces.
- **Scoped Styling:** Migrate the global `src/styles.css` into CSS Modules or Tailwind CSS.
- **GitHub Actions CI & Releases:** Automate `npm run lint`, `npm test`, `npm run build` on pull requests, and attach Windows `.exe` / Android `.apk` artifacts automatically to tagged GitHub Releases.
