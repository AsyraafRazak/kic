import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  forVisionTasks: vi.fn(),
  createGestureRecognizer: vi.fn(),
  createFaceLandmarker: vi.fn(),
}));

vi.mock('@mediapipe/tasks-vision', () => ({
  FilesetResolver: { forVisionTasks: mocks.forVisionTasks },
  GestureRecognizer: { createFromOptions: mocks.createGestureRecognizer },
  FaceLandmarker: { createFromOptions: mocks.createFaceLandmarker },
}));

import {
  FACE_MODEL_URL,
  HAND_MODEL_URL,
  WASM_URL,
  getFaceLandmarker,
  getHandRecognizer,
  invalidateFaceLandmarker,
  invalidateHandRecognizer,
  nextVisionTimestamp,
  resetVisionManagerForTests,
} from '../visionManager.js';

function makeFetchMock({
  wasmJsOk = true,
  wasmBinOk = true,
  wasmContentType = 'application/javascript',
  handModelOk = true,
  faceModelOk = true,
  modelContentType = 'application/octet-stream',
  modelSize = 16,
} = {}) {
  return vi.fn(async (url) => {
    if (url === `${WASM_URL}/vision_wasm_internal.js`) {
      return { ok: wasmJsOk, headers: { get: () => wasmContentType } };
    }
    if (url === `${WASM_URL}/vision_wasm_internal.wasm`) {
      return { ok: wasmBinOk, headers: { get: () => 'application/wasm' } };
    }
    if (url === HAND_MODEL_URL) {
      return {
        ok: handModelOk,
        headers: { get: () => modelContentType },
        arrayBuffer: async () => new Uint8Array(modelSize).fill(1).buffer,
      };
    }
    if (url === FACE_MODEL_URL) {
      return {
        ok: faceModelOk,
        headers: { get: () => modelContentType },
        arrayBuffer: async () => new Uint8Array(modelSize).fill(2).buffer,
      };
    }
    throw new Error(`Unexpected fetch: ${url}`);
  });
}

describe('visionManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.forVisionTasks.mockResolvedValue({ wasm: true });
    vi.stubGlobal('fetch', makeFetchMock());
    resetVisionManagerForTests();
  });

  afterEach(() => {
    resetVisionManagerForTests();
    vi.unstubAllGlobals();
  });

  it('caches GPU recognizer across repeated calls without re-fetching', async () => {
    const fakeTask = { close: vi.fn() };
    mocks.createGestureRecognizer.mockResolvedValue(fakeTask);

    const first = await getHandRecognizer();
    const second = await getHandRecognizer();

    expect(first).toEqual({ task: fakeTask, delegate: 'GPU' });
    expect(second).toBe(first);
    expect(mocks.createGestureRecognizer).toHaveBeenCalledTimes(1);
    expect(mocks.forVisionTasks).toHaveBeenCalledTimes(1);
  });

  it('falls back from GPU to CPU with a fresh Uint8Array buffer copy', async () => {
    const cpuTask = { close: vi.fn() };
    const seenBuffers = [];
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    mocks.createGestureRecognizer.mockImplementation(async (_vision, options) => {
      seenBuffers.push(options.baseOptions.modelAssetBuffer);
      if (options.baseOptions.delegate === 'GPU') {
        options.baseOptions.modelAssetBuffer.fill(0);
        throw new Error('WebGL context lost');
      }
      return cpuTask;
    });

    const entry = await getHandRecognizer();
    expect(entry).toEqual({ task: cpuTask, delegate: 'CPU' });
    expect(mocks.createGestureRecognizer).toHaveBeenCalledTimes(2);
    expect(seenBuffers[0]).not.toBe(seenBuffers[1]);
    expect(seenBuffers[1][0]).toBe(1);
  });

  it('invalidates cached tasks and allows subsequent forceCpu creation', async () => {
    const gpuTask = { close: vi.fn() };
    const cpuTask = { close: vi.fn() };
    mocks.createFaceLandmarker
      .mockResolvedValueOnce(gpuTask)
      .mockResolvedValueOnce(cpuTask);

    const first = await getFaceLandmarker();
    expect(first.delegate).toBe('GPU');

    invalidateFaceLandmarker(gpuTask);
    expect(gpuTask.close).toHaveBeenCalledTimes(1);

    const second = await getFaceLandmarker({ forceCpu: true });
    expect(second).toEqual({ task: cpuTask, delegate: 'CPU' });
    expect(mocks.createFaceLandmarker).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({
        baseOptions: expect.objectContaining({ delegate: 'CPU' }),
      }),
    );

    invalidateHandRecognizer();
  });

  it('throws specific offline error codes when assets are missing or HTML and does not cache failures', async () => {
    vi.stubGlobal('fetch', makeFetchMock({ handModelOk: false }));
    await expect(getHandRecognizer()).rejects.toThrow('MODEL_ASSET_MISSING');

    resetVisionManagerForTests();
    vi.stubGlobal('fetch', makeFetchMock({ wasmBinOk: false }));
    await expect(getFaceLandmarker()).rejects.toThrow('FACE_WASM_MISSING');

    resetVisionManagerForTests();
    vi.stubGlobal('fetch', makeFetchMock({ faceModelOk: true, modelContentType: 'text/html' }));
    await expect(getFaceLandmarker()).rejects.toThrow('FACE_MODEL_MISSING');

    // Subsequent call after restoring valid assets should recover cleanly
    vi.stubGlobal('fetch', makeFetchMock());
    const recoveredTask = { close: vi.fn() };
    mocks.createFaceLandmarker.mockResolvedValueOnce(recoveredTask);
    await expect(getFaceLandmarker()).resolves.toEqual({ task: recoveredTask, delegate: 'GPU' });
  });

  it('generates strictly monotonic timestamps per tracker kind', () => {
    const t1 = nextVisionTimestamp('hand', 100);
    const t2 = nextVisionTimestamp('hand', 100);
    const t3 = nextVisionTimestamp('hand', 50);
    const f1 = nextVisionTimestamp('face', 50);

    expect(t1).toBe(100);
    expect(t2).toBe(101);
    expect(t3).toBe(102);
    expect(f1).toBe(50);
  });
});
