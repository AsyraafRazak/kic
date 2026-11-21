import { FaceLandmarker, FilesetResolver, GestureRecognizer } from '@mediapipe/tasks-vision';

export const WASM_URL = '/wasm';
export const HAND_MODEL_URL = '/models/gesture_recognizer.task';
export const FACE_MODEL_URL = '/models/face_landmarker.task';
export const TARGET_GESTURES = new Set([
  'Open_Palm',
  'Closed_Fist',
  'Pointing_Up',
  'Thumb_Up',
  'Thumb_Down',
  'Victory',
]);

class MissingWasmError extends Error {}

let wasmPromise = null;
const modelBytesPromises = new Map();
let handEntryPromise = null;
let handEntryValue = null;
let faceEntryPromise = null;
let faceEntryValue = null;
const timestamps = { hand: 0, face: 0 };

function isHtmlResponse(response) {
  const contentType = response?.headers?.get?.('content-type') || '';
  return contentType.includes('text/html');
}

async function ensureWasmFileset() {
  if (!wasmPromise) {
    wasmPromise = (async () => {
      try {
        const [jsProbe, binaryProbe] = await Promise.all([
          fetch(`${WASM_URL}/vision_wasm_internal.js`, { method: 'HEAD' }),
          fetch(`${WASM_URL}/vision_wasm_internal.wasm`, { method: 'HEAD' }),
        ]);
        if (!jsProbe?.ok || isHtmlResponse(jsProbe) || !binaryProbe?.ok || isHtmlResponse(binaryProbe)) {
          throw new MissingWasmError('WASM asset missing');
        }
        return await FilesetResolver.forVisionTasks(WASM_URL);
      } catch (error) {
        wasmPromise = null;
        throw error;
      }
    })();
  }
  return wasmPromise;
}

async function loadWasmFileset(missingCode) {
  try {
    return await ensureWasmFileset();
  } catch (error) {
    if (error instanceof MissingWasmError) {
      throw new Error(missingCode);
    }
    throw error;
  }
}

async function loadModelBytes(url, missingCode) {
  let promise = modelBytesPromises.get(url);
  if (!promise) {
    promise = (async () => {
      try {
        const response = await fetch(url);
        const buffer = await response.arrayBuffer();
        if (!response?.ok || isHtmlResponse(response) || !buffer?.byteLength) {
          throw new Error(missingCode);
        }
        return new Uint8Array(buffer);
      } catch (error) {
        modelBytesPromises.delete(url);
        throw error;
      }
    })();
    modelBytesPromises.set(url, promise);
  }
  return promise;
}

async function createTaskWithFallback(createForDelegate, modelBytes, forceCpu) {
  if (!forceCpu) {
    try {
      const task = await createForDelegate('GPU', modelBytes.slice());
      return { task, delegate: 'GPU' };
    } catch (error) {
      console.warn('[visionManager] GPU delegate unavailable, falling back to CPU:', error);
    }
  }
  const task = await createForDelegate('CPU', modelBytes.slice());
  return { task, delegate: 'CPU' };
}

/**
 * Returns a cached GestureRecognizer entry ({ task, delegate }), trying GPU first
 * and falling back automatically to CPU when WebGL/GPU initialization fails.
 */
export async function getHandRecognizer({ forceCpu = false } = {}) {
  if (handEntryPromise) {
    if (!forceCpu || handEntryValue?.delegate === 'CPU') {
      return handEntryPromise;
    }
    try {
      const existing = await handEntryPromise;
      if (existing?.delegate === 'CPU') return existing;
      invalidateHandRecognizer(existing?.task);
    } catch {
      handEntryPromise = null;
      handEntryValue = null;
    }
  }

  const promise = (async () => {
    try {
      const [modelBytes, vision] = await Promise.all([
        loadModelBytes(HAND_MODEL_URL, 'MODEL_ASSET_MISSING'),
        loadWasmFileset('WASM_ASSET_MISSING'),
      ]);
      const entry = await createTaskWithFallback(
        (delegate, bytes) => GestureRecognizer.createFromOptions(vision, {
          baseOptions: { modelAssetBuffer: bytes, delegate },
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
        }),
        modelBytes,
        forceCpu,
      );
      if (handEntryPromise === promise) {
        handEntryValue = entry;
      } else {
        entry.task?.close?.();
      }
      return entry;
    } catch (error) {
      if (handEntryPromise === promise) {
        handEntryPromise = null;
        handEntryValue = null;
      }
      throw error;
    }
  })();

  handEntryPromise = promise;
  return promise;
}

/**
 * Returns a cached FaceLandmarker entry ({ task, delegate }), trying GPU first
 * and falling back automatically to CPU when WebGL/GPU initialization fails.
 */
export async function getFaceLandmarker({ forceCpu = false } = {}) {
  if (faceEntryPromise) {
    if (!forceCpu || faceEntryValue?.delegate === 'CPU') {
      return faceEntryPromise;
    }
    try {
      const existing = await faceEntryPromise;
      if (existing?.delegate === 'CPU') return existing;
      invalidateFaceLandmarker(existing?.task);
    } catch {
      faceEntryPromise = null;
      faceEntryValue = null;
    }
  }

  const promise = (async () => {
    try {
      const [modelBytes, vision] = await Promise.all([
        loadModelBytes(FACE_MODEL_URL, 'FACE_MODEL_MISSING'),
        loadWasmFileset('FACE_WASM_MISSING'),
      ]);
      const entry = await createTaskWithFallback(
        (delegate, bytes) => FaceLandmarker.createFromOptions(vision, {
          baseOptions: { modelAssetBuffer: bytes, delegate },
          runningMode: 'VIDEO',
          numFaces: 4,
          minFaceDetectionConfidence: 0.55,
          minFacePresenceConfidence: 0.5,
          minTrackingConfidence: 0.5,
          outputFacialTransformationMatrixes: true,
        }),
        modelBytes,
        forceCpu,
      );
      if (faceEntryPromise === promise) {
        faceEntryValue = entry;
      } else {
        entry.task?.close?.();
      }
      return entry;
    } catch (error) {
      if (faceEntryPromise === promise) {
        faceEntryPromise = null;
        faceEntryValue = null;
      }
      throw error;
    }
  })();

  faceEntryPromise = promise;
  return promise;
}

/** Closes and clears the cached GestureRecognizer if it matches expectedTask (or unconditionally if omitted). */
export function invalidateHandRecognizer(expectedTask) {
  if (expectedTask && handEntryValue && handEntryValue.task !== expectedTask) return;
  const stalePromise = handEntryPromise;
  const toClose = handEntryValue?.task;
  handEntryPromise = null;
  handEntryValue = null;
  if (toClose) {
    toClose.close?.();
  } else if (stalePromise) {
    stalePromise.then((entry) => {
      if (!expectedTask || entry?.task === expectedTask) entry?.task?.close?.();
    }, () => {});
  }
}

/** Closes and clears the cached FaceLandmarker if it matches expectedTask (or unconditionally if omitted). */
export function invalidateFaceLandmarker(expectedTask) {
  if (expectedTask && faceEntryValue && faceEntryValue.task !== expectedTask) return;
  const stalePromise = faceEntryPromise;
  const toClose = faceEntryValue?.task;
  faceEntryPromise = null;
  faceEntryValue = null;
  if (toClose) {
    toClose.close?.();
  } else if (stalePromise) {
    stalePromise.then((entry) => {
      if (!expectedTask || entry?.task === expectedTask) entry?.task?.close?.();
    }, () => {});
  }
}

/** Generates strictly increasing millisecond timestamps for MediaPipe VIDEO mode across task reuse. */
export function nextVisionTimestamp(kind, now = performance.now()) {
  const next = Math.max((timestamps[kind] || 0) + 1, Math.round(now));
  timestamps[kind] = next;
  return next;
}

/** Resets all cached runtime state for deterministic unit tests. */
export function resetVisionManagerForTests() {
  invalidateHandRecognizer();
  invalidateFaceLandmarker();
  wasmPromise = null;
  modelBytesPromises.clear();
  timestamps.hand = 0;
  timestamps.face = 0;
}
