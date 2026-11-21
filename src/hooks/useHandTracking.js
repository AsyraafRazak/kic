import { useEffect, useMemo, useRef, useState } from 'react';
import { isPointingPose } from '../game/pointingGesture.js';
import {
  TARGET_GESTURES,
  getHandRecognizer,
  invalidateHandRecognizer,
  nextVisionTimestamp,
} from '../tracking/visionManager.js';

const INFERENCE_INTERVAL_MS = 1000 / 18;
const EMPTY_TRACKING = {
  status: 'idle',
  handVisible: false,
  position: null,
  gesture: null,
  confidence: 0,
  hands: [],
  handCount: 0,
  pointingActive: false,
  delegate: null,
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

function shouldSyncHandUi(previous, next) {
  return (
    previous.status !== next.status ||
    previous.handVisible !== next.handVisible ||
    previous.gesture !== next.gesture ||
    previous.handCount !== next.handCount ||
    previous.pointingActive !== next.pointingActive ||
    previous.error !== next.error ||
    previous.delegate !== next.delegate
  );
}

/**
 * Returns coarse UI hand tracking state plus `latestRef` for high-frequency consumers.
 * Emits mirrored, normalized coordinates and caches the MediaPipe task across modes.
 */
export default function useHandTracking({ videoRef, enabled }) {
  const [tracking, setTracking] = useState(EMPTY_TRACKING);
  const latestRef = useRef(EMPTY_TRACKING);

  useEffect(() => {
    if (!enabled) {
      latestRef.current = EMPTY_TRACKING;
      setTracking(EMPTY_TRACKING);
      return undefined;
    }

    let cancelled = false;
    let animationFrame = 0;
    let activeTask = null;
    let activeDelegate = null;
    let retriedCpu = false;
    let committedUi = EMPTY_TRACKING;
    let lastVideoTime = -1;
    let lastInferenceAt = 0;
    let smoothedPositions = [];
    let smoothedIndexTips = [];

    function publish(next, force = false) {
      latestRef.current = next;
      if (force || shouldSyncHandUi(committedUi, next)) {
        committedUi = next;
        setTracking(next);
      }
    }

    publish({ ...EMPTY_TRACKING, status: 'loading' }, true);

    async function initTask(forceCpu = false) {
      const video = videoRef.current;
      if (!video) throw new Error('CAMERA_VIDEO_NOT_READY');

      const { task, delegate } = await getHandRecognizer({ forceCpu });
      if (cancelled) return;
      activeTask = task;
      activeDelegate = delegate;
      publish({ ...EMPTY_TRACKING, status: 'ready', delegate }, true);
    }

    const processFrame = (now) => {
      if (cancelled) return;
      animationFrame = requestAnimationFrame(processFrame);

      const currentVideo = videoRef.current;
      if (!activeTask || !currentVideo || currentVideo.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;
      if (currentVideo.currentTime === lastVideoTime || now - lastInferenceAt < INFERENCE_INTERVAL_MS) return;

      lastVideoTime = currentVideo.currentTime;
      lastInferenceAt = now;
      const timestamp = nextVisionTimestamp('hand', now);

      try {
        const result = activeTask.recognizeForVideo(currentVideo, timestamp);
        const detectedHands = (result.landmarks || []).filter((landmarks) => landmarks?.length);
        if (!detectedHands.length) {
          smoothedPositions = [];
          smoothedIndexTips = [];
          publish({ ...EMPTY_TRACKING, status: 'ready', delegate: activeDelegate });
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
            ? { x: previousIndexTip.x + (rawIndexTip.x - previousIndexTip.x) * 0.78, y: previousIndexTip.y + (rawIndexTip.y - previousIndexTip.y) * 0.78 }
            : rawIndexTip;
          smoothedIndexTips[index] = indexTip;
          const category = result.gestures[index]?.find((item) => TARGET_GESTURES.has(item.categoryName));
          return {
            position,
            indexTip,
            landmarks: landmarks.map((landmark) => ({ ...landmark, x: 1 - landmark.x })),
            gesture: category?.categoryName || null,
            confidence: category?.score || 0,
          };
        });
        smoothedPositions.length = hands.length;
        smoothedIndexTips.length = hands.length;
        const first = hands[0];
        const pointingActive = hands.some(isPointingPose);
        publish({
          status: 'ready',
          handVisible: true,
          position: first.position,
          gesture: first.gesture,
          confidence: first.confidence,
          hands,
          handCount: hands.length,
          pointingActive,
          delegate: activeDelegate,
          error: '',
        });
      } catch {
        if (activeDelegate === 'GPU' && !retriedCpu) {
          retriedCpu = true;
          const failedTask = activeTask;
          activeTask = null;
          activeDelegate = null;
          smoothedPositions = [];
          smoothedIndexTips = [];
          invalidateHandRecognizer(failedTask);
          initTask(true).catch((error) => {
            if (cancelled) return;
            cancelled = true;
            cancelAnimationFrame(animationFrame);
            publish({ ...EMPTY_TRACKING, status: 'error', error: messageFor(error) }, true);
          });
          return;
        }
        cancelled = true;
        cancelAnimationFrame(animationFrame);
        invalidateHandRecognizer(activeTask);
        activeTask = null;
        publish({
          ...EMPTY_TRACKING,
          status: 'error',
          error: 'Gesture inference stopped unexpectedly. Restart the experience to try again.',
        }, true);
      }
    };

    initTask(false)
      .then(() => {
        if (!cancelled) {
          animationFrame = requestAnimationFrame(processFrame);
        }
      })
      .catch((error) => {
        if (cancelled) return;
        publish({ ...EMPTY_TRACKING, status: 'error', error: messageFor(error) }, true);
      });

    return () => {
      cancelled = true;
      cancelAnimationFrame(animationFrame);
      latestRef.current = EMPTY_TRACKING;
    };
  }, [enabled, videoRef]);

  return useMemo(() => ({ ...tracking, latestRef }), [tracking]);
}
