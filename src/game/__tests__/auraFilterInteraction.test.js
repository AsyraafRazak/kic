import { describe, it, expect } from 'vitest';
import {
  AURA_FILTER_GESTURES,
  createAuraFilterInteraction,
  tickAuraFilterInteraction,
} from '../auraFilterInteraction.js';

function step(state, hand, totalMs, faceVisible = true, stepMs = 100) {
  let next = state;
  for (let elapsed = 0; elapsed < totalMs; elapsed += stepMs) {
    next = tickAuraFilterInteraction(next, hand, Math.min(stepMs, totalMs - elapsed), faceVisible);
  }
  return next;
}

describe('auraFilterInteraction', () => {
  it('resets state when face is hidden or hand disappears', () => {
    let state = createAuraFilterInteraction();
    state = step(state, { handVisible: true, position: { x: 0.5, y: 0.5 }, gesture: 'Open_Palm', confidence: 0.9 }, 900);
    expect(state.chargeReady).toBe(true);

    const hiddenFace = tickAuraFilterInteraction(state, { handVisible: true, position: { x: 0.5, y: 0.5 }, gesture: 'Open_Palm', confidence: 0.9 }, 100, false);
    expect(hiddenFace.charge).toBe(0);
    expect(hiddenFace.chargeReady).toBe(false);

    const hiddenHand = tickAuraFilterInteraction(state, { handVisible: false }, 100, true);
    expect(hiddenHand.charge).toBe(0);
  });

  it('ignores low-confidence gestures', () => {
    const lowConf = { handVisible: true, position: { x: 0.5, y: 0.5 }, gesture: 'Open_Palm', confidence: AURA_FILTER_GESTURES.confidence - 0.1 };
    const next = step(createAuraFilterInteraction(), lowConf, 1000);
    expect(next.charge).toBe(0);
    expect(next.chargeReady).toBe(false);
  });

  it('charges on Open_Palm and fires a single-shot pulse on Closed_Fist', () => {
    const pos = { x: 0.4, y: 0.5 };
    let state = step(createAuraFilterInteraction(), { handVisible: true, position: pos, gesture: 'Open_Palm', confidence: 0.9 }, 900);
    expect(state.chargeReady).toBe(true);
    expect(state.charge).toBe(1);

    // Build stable Closed_Fist
    state = tickAuraFilterInteraction(state, { handVisible: true, position: pos, gesture: 'Closed_Fist', confidence: 0.9 }, 100);
    expect(state.pulse).toBeNull();
    state = tickAuraFilterInteraction(state, { handVisible: true, position: pos, gesture: 'Closed_Fist', confidence: 0.9 }, 100);
    expect(state.pulse).toEqual({ id: 1, position: pos });
    expect(state.charge).toBe(0);
    expect(state.chargeReady).toBe(false);
    expect(state.cooldownMs).toBe(AURA_FILTER_GESTURES.releaseCooldownMs);

    // Holding Closed_Fist does not refire
    const held = tickAuraFilterInteraction(state, { handVisible: true, position: pos, gesture: 'Closed_Fist', confidence: 0.9 }, 100);
    expect(held.pulse).toBeNull();
  });

  it('decays partial charge when Open_Palm is released early', () => {
    let state = step(createAuraFilterInteraction(), { handVisible: true, position: { x: 0.5, y: 0.5 }, gesture: 'Open_Palm', confidence: 0.9 }, 500);
    expect(state.charge).toBeGreaterThan(0);
    expect(state.chargeReady).toBe(false);

    const decayed = tickAuraFilterInteraction(state, { handVisible: true, position: { x: 0.5, y: 0.5 }, gesture: null, confidence: 0 }, 200);
    expect(decayed.charge).toBeLessThan(state.charge);
  });
});
