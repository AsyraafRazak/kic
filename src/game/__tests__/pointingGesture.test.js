import { describe, it, expect } from 'vitest';
import { isPointingPose } from '../pointingGesture.js';

function makeHand(extendedFingers = [], count = 21) {
  const landmarks = Array.from({ length: count }, () => ({ x: 0.5, y: 0.85, z: 0 }));
  const bases = [5, 9, 13, 17];
  bases.forEach((mcpIndex, fingerIdx) => {
    const baseX = 0.35 + fingerIdx * 0.08;
    const baseY = 0.6;
    const extended = extendedFingers.includes(fingerIdx);
    landmarks[mcpIndex] = { x: baseX, y: baseY, z: 0 };
    if (extended) {
      landmarks[mcpIndex + 1] = { x: baseX, y: baseY - 0.06, z: 0 };
      landmarks[mcpIndex + 2] = { x: baseX, y: baseY - 0.12, z: 0 };
      landmarks[mcpIndex + 3] = { x: baseX, y: baseY - 0.18, z: 0 };
    } else {
      landmarks[mcpIndex + 1] = { x: baseX, y: baseY - 0.03, z: 0 };
      landmarks[mcpIndex + 2] = { x: baseX, y: baseY + 0.03, z: 0 };
      landmarks[mcpIndex + 3] = { x: baseX, y: baseY + 0.07, z: 0 };
    }
  });
  return { landmarks };
}

describe('pointingGesture', () => {
  it('returns true only when index finger is extended and other fingers are folded', () => {
    expect(isPointingPose(makeHand([0]))).toBe(true);
  });

  it('returns false for open palm, closed fist, and victory poses', () => {
    expect(isPointingPose(makeHand([0, 1, 2, 3]))).toBe(false);
    expect(isPointingPose(makeHand([]))).toBe(false);
    expect(isPointingPose(makeHand([0, 1]))).toBe(false);
  });

  it('returns false for missing, incomplete, or out-of-bounds landmarks', () => {
    expect(isPointingPose(null)).toBe(false);
    expect(isPointingPose({ landmarks: makeHand([0]).landmarks.slice(0, 18) })).toBe(false);

    const outOfBounds = makeHand([0]);
    outOfBounds.landmarks[8] = { x: 1.2, y: 0.4, z: 0 };
    expect(isPointingPose(outOfBounds)).toBe(false);

    const nanHand = makeHand([0]);
    nanHand.landmarks[7] = { x: Number.NaN, y: 0.4, z: 0 };
    expect(isPointingPose(nanHand)).toBe(false);
  });
});
