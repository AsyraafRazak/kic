import { useEffect, useState } from 'react';
import { FilesetResolver, GestureRecognizer } from '@mediapipe/tasks-vision';

const MODEL_URL = '/models/gesture_recognizer.task';
const WASM_URL = '/wasm';
const TARGET_GESTURES = new Set(['Open_Palm', 'Closed_Fist', 'Pointing_Up', 'Thumb_Up', 'Thumb_Down', 'Victory']);
const INFERENCE_INTERVAL_MS = 1000 / 18;
const EMPTY_TRACKING = {
  status: 'idle',
  handVisible: false,
  position: null,
  gesture: null,
  confidence: 0,
  hands: [],
  handCount: 0,
  error: '',
};

function messageFor(error) {
  if (error?.message === 'MODEL_ASSET_MISSING') {
    return 'Gesture model missing or empty. Add a valid model at public/models/gesture_recognizer.task.';
  }
  if (error?.message === 'WASM_ASSET_MISSING') {
    return 'MediaPipe WASM runtime is missing. Restore the local runtime files in public/wasm.';
  }
  return 'Gesture recognition could not be initialized. Check the local model and WASM files, then reload.';
}

/** Returns normalized, mirrored hand position and real MediaPipe gesture output. */
export default function useHandTracking({ videoRef, enabled }) {
  const [tracking, setTracking] = useState(EMPTY_TRACKING);

  useEffect(() => {
    if (!enabled) {
      setTracking(EMPTY_TRACKING);
      return undefined;
    }

    let cancelled = false;
    let animationFrame = 0;
    let recognizer;
    let lastVideoTime = -1;
    let lastInferenceAt = 0;
    let lastTimestamp = 0;
    let smoothedPositions = [];
    let smoothedIndexTips = [];

    setTracking({ ...EMPTY_TRACKING, status: 'loading' });

    async function initialize() {
      try {
        const video = videoRef.current;
        if (!video) throw new Error('CAMERA_VIDEO_NOT_READY');

        const [modelResponse, wasmProbe] = await Promise.all([
          fetch(MODEL_URL),
          fetch(`${WASM_URL}/vision_wasm_internal.js`, { method: 'HEAD' }),
        ]);
        const modelType = modelResponse.headers.get('content-type') || '';
        const modelBuffer = await modelResponse.arrayBuffer();

        if (!modelResponse.ok || modelType.includes('text/html') || modelBuffer.byteLength === 0) {
          throw new Error('MODEL_ASSET_MISSING');
        }
        if (!wasmProbe.ok) throw new Error('WASM_ASSET_MISSING');

        const vision = await FilesetResolver.forVisionTasks(WASM_URL);
        const task = await GestureRecognizer.createFromOptions(vision, {
          baseOptions: {
            modelAssetBuffer: new Uint8Array(modelBuffer),
            delegate: 'CPU',
          },
          runningMode: 'VIDEO',
          numHands: 2,
          minHandDetectionConfidence: 0.55,
          minHandPresenceConfidence: 0.5,
          minTrackingConfidence: 0.5,
          cannedGesturesClassifierOptions: {
            categoryAllowlist: [...TARGET_GESTURES],
            scoreThreshold: 0.5,
            maxResults: 1,
          },
        });

        if (cancelled) {
          task.close();
          return;
        }

        recognizer = task;
        setTracking({ ...EMPTY_TRACKING, status: 'ready' });

        const processFrame = (now) => {
          if (cancelled) return;
          animationFrame = requestAnimationFrame(processFrame);

          const currentVideo = videoRef.current;
          if (!recognizer || !currentVideo || currentVideo.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;
          if (currentVideo.currentTime === lastVideoTime || now - lastInferenceAt < INFERENCE_INTERVAL_MS) return;

          lastVideoTime = currentVideo.currentTime;
          lastInferenceAt = now;
          lastTimestamp = Math.max(lastTimestamp + 1, Math.round(now));

          try {
            const result = recognizer.recognizeForVideo(currentVideo, lastTimestamp);
            const detectedHands = (result.landmarks || []).filter((landmarks) => landmarks?.length);
            if (!detectedHands.length) {
              smoothedPositions = [];
              smoothedIndexTips = [];
              setTracking({ ...EMPTY_TRACKING, status: 'ready' });
              return;
            }
            const smoothing = 0.32;
            const hands = detectedHands.map((landmarks, index) => {
              // Landmark 9 is a stable palm anchor; landmark 8 is the drawing tip.
              const anchor = landmarks[9] || landmarks[0];
              const point = { x: 1 - anchor.x, y: anchor.y };
              const previous = smoothedPositions[index];
              const position = previous
                ? { x: previous.x + (point.x - previous.x) * smoothing, y: previous.y + (point.y - previous.y) * smoothing }
                : point;
              smoothedPositions[index] = position;
              const rawIndexTip = landmarks[8] ? { x: 1 - landmarks[8].x, y: landmarks[8].y } : position;
              const previousIndexTip = smoothedIndexTips[index];
              const indexTip = previousIndexTip
                ? { x: previousIndexTip.x + (rawIndexTip.x - previousIndexTip.x) * .78, y: previousIndexTip.y + (rawIndexTip.y - previousIndexTip.y) * .78 }
                : rawIndexTip;
              smoothedIndexTips[index] = indexTip;
              const category = result.gestures[index]?.find((item) => TARGET_GESTURES.has(item.categoryName));
              return {
                position,
                indexTip,
                landmarks: landmarks.map((point) => ({ ...point, x: 1 - point.x })),
                gesture: category?.categoryName || null,
                confidence: category?.score || 0,
              };
            });
            smoothedPositions.length = hands.length;
            smoothedIndexTips.length = hands.length;
            const first = hands[0];
            setTracking({
              status: 'ready',
              handVisible: true,
              position: first.position,
              gesture: first.gesture,
              confidence: first.confidence,
              hands,
              handCount: hands.length,
              error: '',
            });
          } catch {
            cancelled = true;
            setTracking({ ...EMPTY_TRACKING, status: 'error', error: 'Gesture inference stopped unexpectedly. Restart the experience to try again.' });
          }
        };

        animationFrame = requestAnimationFrame(processFrame);
      } catch (error) {
        if (cancelled) return;
        setTracking({ ...EMPTY_TRACKING, status: 'error', error: messageFor(error) });
      }
    }

    initialize();
    return () => {
      cancelled = true;
      cancelAnimationFrame(animationFrame);
      recognizer?.close();
    };
  }, [enabled, videoRef]);

  return tracking;
}
