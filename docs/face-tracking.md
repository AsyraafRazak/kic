# Aura Mirror face tracking

## Local assets

Face tracking loads its model and MediaPipe runtime from the app origin. Keep these files at these exact paths:

- `public/models/face_landmarker.task` — MediaPipe Face Landmarker float16 task bundle.
- `public/wasm/vision_wasm_internal.js` and `public/wasm/vision_wasm_internal.wasm`.
- The remaining `vision_wasm_*` files in `public/wasm/` are used by runtime capability selection and should ship with the build too.

The model is based on MediaPipe's published Face Landmarker model bundle. The browser app does not fetch a model or WASM from a CDN. Face Landmarker returns normalized face landmarks and can optionally return facial transformation matrices; this app enables those matrices for its head-orientation estimate. See the [MediaPipe Face Landmarker web guide](https://ai.google.dev/edge/mediapipe/solutions/vision/face_landmarker/web_js).

The web result does not include a face-level detection confidence score. The exposed `confidence` is `null` when the returned landmarks contain no presence/visibility values; otherwise it is the mean of the available landmark presence or visibility values, with its source identified separately.

## Test offline after setup

1. While preparing the machine, install dependencies with `npm ci` and confirm the model and `public/wasm/` files are present.
2. Build the production app with `npm run build`. Confirm `dist/models/face_landmarker.task` and the files in `dist/wasm/` exist.
3. Disconnect the machine from the internet, then serve the build locally with `npm run preview -- --host 127.0.0.1`.
4. Open `http://127.0.0.1:4173/`, choose **IQRA' Aura Mirror**, and allow camera permission.
5. Wait for **Face tracking active**, enable **Landmark Debug**, and move in and out of view. Check the mesh/center overlays for each face, no-face/lost status, and face center/size/orientation readout. Ask up to three more people to enter the frame and confirm the selected face filter follows each person.
6. In the browser Network panel, verify model and runtime requests use the local origin and no external host is requested.

## Hand interactions

Hand tracking is also performed locally with up to two hands. In Aura Mirror, hold **Thumb_Up** or **Thumb_Down** briefly to switch filters; hold **Pointing_Up** to open filter selection, then use the thumb gestures to browse and **Open_Palm** to confirm. Use the primary and accent color controls to recolor the active filter. Hold one closed fist near the crown: the crown stays fixed while its motes spread into a faster orbit, then an upward laser fires. Energy Hands combines two hands into one swirling energy sphere, enlarges it as they approach, and fires a Kamehameha-style beam when both fists close. Guardian Visor raises a shield with two open palms and fires twin eye lasers when both fists are near the visor. Aura Mirror tracks and applies face filters to up to four people at once.

In **Filter Creator**, use the live camera/landmark inset to see your hand. The 1280 × 720 transparent artboard uses the same 16:9 framing as the camera preview. Point with your index finger in any direction while keeping the other fingers folded to draw; an open palm does not draw. Relax the pointing pose or move the hand out of frame to stop. The **Magic Ink** tool adds a glowing gradient stroke in the selected brush color. Mouse or touchscreen drag also draws, and **Thumb_Up** and **Thumb_Down** cycle tools. Choose **Follow my face** to attach live strokes to the tracked face bounds, or **Stay on camera** to keep new strokes fixed to the preview. **Capture drawing photo** composes the mirrored camera frame, face filter, and both drawing layers; the photo remains in the browser until retaken or downloaded.

`localhost` is a secure context for browser camera access. For a deployed booth, the web server must also serve the same local model and WASM paths.
