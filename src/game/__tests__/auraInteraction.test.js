import { describe, it, expect } from 'vitest';
import {
  AURA_MARKERS,
  createAuraChallenge,
  getAuraCollision,
  startAuraChallenge,
  tickAuraChallenge,
} from '../auraInteraction.js';

function step(state, hand, faceVisible, totalMs, stepMs = 100) {
  let next = state;
  for (let elapsed = 0; elapsed < totalMs; elapsed += stepMs) {
    next = tickAuraChallenge(next, hand, faceVisible, Math.min(stepMs, totalMs - elapsed));
  }
  return next;
}

describe('auraInteraction', () => {
  it('detects collision only with unactivated markers', () => {
    const marker = AURA_MARKERS[0];
    expect(getAuraCollision({ x: marker.x, y: marker.y }, AURA_MARKERS, [])).toEqual(marker);
    expect(getAuraCollision({ x: marker.x, y: marker.y }, AURA_MARKERS, [marker.id])).toBeNull();
    expect(getAuraCollision({ x: 0.01, y: 0.01 }, AURA_MARKERS, [])).toBeNull();
  });

  it('pauses and resets charge when face or hand is lost', () => {
    let state = startAuraChallenge('aura-crown');
    state = step(state, { handVisible: true, position: { x: 0.5, y: 0.5 }, gesture: 'Open_Palm', confidence: 0.9 }, true, 1100);
    expect(state.chargeReady).toBe(true);

    const paused = tickAuraChallenge(state, { handVisible: false }, true, 100);
    expect(paused.chargeReady).toBe(false);
    expect(paused.energy).toBe(0);
    expect(paused.feedback).toContain('TRACKING PAUSED');

    const noFace = tickAuraChallenge(state, { handVisible: true, position: { x: 0.5, y: 0.5 } }, false, 100);
    expect(noFace.chargeReady).toBe(false);
  });

  it('activates all markers and completes the challenge', () => {
    let state = startAuraChallenge('aura-crown');
    expect(state.filterActivated).toBe(true);

    for (let i = 0; i < AURA_MARKERS.length; i += 1) {
      const marker = AURA_MARKERS[i];
      if (state.cooldownMs > 0) {
        state = step(state, { handVisible: true, position: { x: marker.x, y: marker.y }, gesture: null, confidence: 0 }, true, 900);
      }
      state = step(state, { handVisible: true, position: { x: marker.x, y: marker.y }, gesture: 'Open_Palm', confidence: 0.9 }, true, 1100);
      expect(state.chargeReady).toBe(true);

      state = step(state, { handVisible: true, position: { x: marker.x, y: marker.y }, gesture: 'Closed_Fist', confidence: 0.9 }, true, 200);
      expect(state.activated).toContain(marker.id);
    }

    expect(state.status).toBe('complete');
    expect(state.activated).toHaveLength(AURA_MARKERS.length);
  });

  it('records a miss when releasing away from any marker', () => {
    let state = startAuraChallenge('aura-crown');
    state = step(state, { handVisible: true, position: { x: 0.05, y: 0.05 }, gesture: 'Open_Palm', confidence: 0.9 }, true, 1100);
    state = step(state, { handVisible: true, position: { x: 0.05, y: 0.05 }, gesture: 'Closed_Fist', confidence: 0.9 }, true, 200);
    expect(state.activated).toEqual([]);
    expect(state.pulse?.hit).toBe(false);
    expect(state.feedback).toContain('MISSED');
    expect(tickAuraChallenge(createAuraChallenge(), null, true, 100).status).toBe('idle');
  });
});
