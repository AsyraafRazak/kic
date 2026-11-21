import { useEffect, useState } from 'react';
import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';

const MODEL_URL = '/models/face_landmarker.task';
const WASM_URL = '/wasm';
const INFERENCE_INTERVAL_MS = 100;
const SMOOTHING = 0.38;
const TRACKING_LOSS_GRACE_MS = 900;

const EMPTY_FACE = {
  status: 'idle',
  faceVisible: false,
  facesDetected: 0,
  faces: [],
  landmarks: [],
  center: null,
  size: null,
  confidence: null,
  confidenceSource: null,
  orientation: null,
  error: '',
};

function errorMessage(error) {
  if (error?.message === 'FACE_MODEL_MISSING') return 'The local face model is missing or empty. Add a valid file at public/models/face_landmarker.task.';
  if (error?.message === 'FACE_WASM_MISSING') return 'The local MediaPipe runtime is missing. Restore the runtime files in public/wasm.';
  return 'Face tracking could not be initialized. Check the local model and WASM assets, then retry.';
}

function smoothLandmarks(current, previous) {
  return current.map((landmark, index) => {
    const old = previous?.[index];
    const point = { x: 1 - landmark.x, y: landmark.y, z: landmark.z };
    return old ? {
      x: old.x + (point.x - old.x) * SMOOTHING,
      y: old.y + (point.y - old.y) * SMOOTHING,
      z: old.z + (point.z - old.z) * SMOOTHING,
    } : point;
  });
}

function estimateBounds(landmarks) {
  if (!landmarks.length) return { center: null, size: null };
  const xs = landmarks.map((point) => point.x);
  const ys = landmarks.map((point) => point.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  return {
    center: { x: (minX + maxX) / 2, y: (minY + maxY) / 2 },
    size: { width: maxX - minX, height: maxY - minY },
  };
}

function estimateConfidence(landmarks) {
  const presence = landmarks.map((point) => point.presence).filter(Number.isFinite);
  const values = presence.length ? presence : landmarks.map((point) => point.visibility).filter(Number.isFinite);
  return {
    value: values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null,
    source: presence.length ? 'landmark-presence' : values.length ? 'landmark-visibility' : null,
  };
}

function orientationFromMatrix(matrix) {
  const values = matrix?.data;
  if (!values || values.length < 16) return null;

  // MediaPipe supplies a facial transformation matrix. Decompose its rotation
  // basis into display-space Euler angles (degrees); yaw is flipped for mirroring.
  const pitch = Math.atan2(-values[9], Math.hypot(values[8], values[10]));
  const yaw = Math.atan2(values[8], values[10]);
  const roll = Math.atan2(values[1], values[5]);
  const degrees = 180 / Math.PI;
  return {
    yaw: -yaw * degrees,
    pitch: pitch * degrees,
    roll: -roll * degrees,
  };
}

/** Local, throttled Face Landmarker inference. Positions are mirrored for the preview. */
export default function useFaceTracking({ videoRef, enabled }) {
  const [faceTracking, setFaceTracking] = useState(EMPTY_FACE);

  useEffect(() => {
    if (!enabled) {
      setFaceTracking(EMPTY_FACE);
      return undefined;
    }

    let cancelled = false;
    let animationFrame = 0;
    let landmarker;
    let lastVideoTime = -1;
    let lastInferenceAt = 0;
    let lastTimestamp = 0;
    let smoothed = [];
    let previouslyVisible = false;
    let lastFaceSeenAt = 0;

    setFaceTracking({ ...EMPTY_FACE, status: 'loading' });

    async function initialize() {
      try {
        const video = videoRef.current;
        if (!video) throw new Error('CAMERA_VIDEO_NOT_READY');

        const [modelResponse, wasmProbe] = await Promise.all([
          fetch(MODEL_URL),
          fetch(`${WASM_URL}/vision_wasm_internal.js`, { method: 'HEAD' }),
        ]);
        const wasmBinaryProbe = await fetch(`${WASM_URL}/vision_wasm_internal.wasm`, { method: 'HEAD' });
        const modelType = modelResponse.headers.get('content-type') || '';
        const modelBuffer = await modelResponse.arrayBuffer();
        if (!modelResponse.ok || modelType.includes('text/html') || !modelBuffer.byteLength) {
          throw new Error('FACE_MODEL_MISSING');
        }
        if (!wasmProbe.ok || !wasmBinaryProbe.ok) throw new Error('FACE_WASM_MISSING');

        const vision = await FilesetResolver.forVisionTasks(WASM_URL);
        const task = await FaceLandmarker.createFromOptions(vision, {
          baseOptions: { modelAssetBuffer: new Uint8Array(modelBuffer), delegate: 'CPU' },
          runningMode: 'VIDEO',
          numFaces: 4,
          minFaceDetectionConfidence: 0.55,
          minFacePresenceConfidence: 0.5,
          minTrackingConfidence: 0.5,
          outputFacialTransformationMatrixes: true,
        });

        if (cancelled) {
          task.close();
          return;
        }
        landmarker = task;
        setFaceTracking({ ...EMPTY_FACE, status: 'searching' });

        const processFrame = (now) => {
          if (cancelled) return;
          animationFrame = requestAnimationFrame(processFrame);
          const currentVideo = videoRef.current;
          if (!landmarker || !currentVideo || currentVideo.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;
          if (currentVideo.currentTime === lastVideoTime || now - lastInferenceAt < INFERENCE_INTERVAL_MS) return;

          lastVideoTime = currentVideo.currentTime;
          lastInferenceAt = now;
          lastTimestamp = Math.max(lastTimestamp + 1, Math.round(now));

          try {
            const result = landmarker.detectForVideo(currentVideo, lastTimestamp);
            const detectedFaces = (result.faceLandmarks || []).filter((landmarks) => landmarks?.length);
            const previousFaces = smoothed;
            const matchedPrevious = new Set();
            const faces = detectedFaces.map((sourceLandmarks, index) => {
              const unsmoothed = smoothLandmarks(sourceLandmarks, null);
              const rawCenter = estimateBounds(unsmoothed).center;
              let previousIndex = -1;
              let nearestDistance = Infinity;
              previousFaces.forEach((previousLandmarks, candidateIndex) => {
                if (matchedPrevious.has(candidateIndex)) return;
                const previousCenter = estimateBounds(previousLandmarks).center;
                const distance = Math.hypot(rawCenter.x - previousCenter.x, rawCenter.y - previousCenter.y);
                if (distance < nearestDistance) {
                  nearestDistance = distance;
                  previousIndex = candidateIndex;
                }
              });
              if (previousIndex >= 0) matchedPrevious.add(previousIndex);
              const landmarks = smoothLandmarks(sourceLandmarks, previousFaces[previousIndex]);
              const { center, size } = estimateBounds(landmarks);
              const confidence = estimateConfidence(sourceLandmarks);
              return {
                landmarks,
                center,
                size,
                confidence: confidence.value,
                confidenceSource: confidence.source,
                orientation: orientationFromMatrix(result.facialTransformationMatrixes?.[index]),
              };
            }).filter((face) => face.landmarks.length && face.center && face.size);
            smoothed = faces.map((face) => face.landmarks);
            if (!faces.length) {
              smoothed = [];
              const status = previouslyVisible || (lastFaceSeenAt > 0 && now - lastFaceSeenAt < TRACKING_LOSS_GRACE_MS) ? 'lost' : 'no-face';
              previouslyVisible = false;
              setFaceTracking({ ...EMPTY_FACE, status });
              return;
            }

            previouslyVisible = true;
            lastFaceSeenAt = now;
            const primary = faces[0];
            setFaceTracking({
              status: 'tracking',
              faceVisible: true,
              facesDetected: faces.length,
              faces,
              landmarks: primary.landmarks,
              center: primary.center,
              size: primary.size,
              confidence: primary.confidence,
              confidenceSource: primary.confidenceSource,
              orientation: primary.orientation,
              error: '',
            });
          } catch (error) {
            cancelled = true;
            cancelAnimationFrame(animationFrame);
            setFaceTracking({ ...EMPTY_FACE, status: 'error', error: error?.message || 'Face inference stopped unexpectedly.' });
          }
        };

        animationFrame = requestAnimationFrame(processFrame);
      } catch (error) {
        if (cancelled) return;
        setFaceTracking({ ...EMPTY_FACE, status: 'error', error: errorMessage(error) });
      }
    }

    initialize();
    return () => {
      cancelled = true;
      cancelAnimationFrame(animationFrame);
      landmarker?.close();
    };
  }, [enabled, videoRef]);

  return faceTracking;
}
