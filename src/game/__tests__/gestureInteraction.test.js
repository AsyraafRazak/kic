import { describe, it, expect } from 'vitest';
import {
  GESTURE_ACTION,
  GESTURE_CONFIG,
  GESTURE_MODE,
  cancelFilterSelection,
  createGestureControllerState,
  enterChallengeMode,
  enterSelectionMode,
  exitChallengeMode,
  tickGestureController,
} from '../gestureInteraction.js';

function runSteps(initialState, steps) {
  let state = initialState;
  const actions = [];
  for (const { hand, dt = 100 } of steps) {
    const result = tickGestureController(state, hand, dt);
    state = result.state;
    actions.push(...result.actions);
  }
  return { state, actions };
}

function holdGesture(initialState, gesture, totalMs, position = { x: 0.5, y: 0.5 }, confidence = 0.9, stepMs = 100) {
  const count = Math.ceil(totalMs / stepMs);
  return runSteps(
    initialState,
    Array.from({ length: count }, () => ({
      hand: { handVisible: true, position, gesture, confidence },
      dt: stepMs,
    })),
  );
}

describe('gestureInteraction', () => {
  it('switches filters once on sustained Thumb_Up and Thumb_Down in AR mode', () => {
    const up = holdGesture(createGestureControllerState(), 'Thumb_Up', 700);
    expect(up.actions).toEqual([GESTURE_ACTION.NEXT_FILTER]);

    // Holding continuously must not fire a second time
    const continued = holdGesture(up.state, 'Thumb_Up', 1200);
    expect(continued.actions).toEqual([]);

    const down = holdGesture(createGestureControllerState(), 'Thumb_Down', 700);
    expect(down.actions).toEqual([GESTURE_ACTION.PREVIOUS_FILTER]);
  });

  it('opens selection carousel after holding Pointing_Up', () => {
    const res = holdGesture(createGestureControllerState(), 'Pointing_Up', 1100);
    expect(res.actions).toEqual([GESTURE_ACTION.OPEN_SELECTION]);
  });

  it('detects horizontal swipes and rejects excessive vertical drift', () => {
    const swipeRight = runSteps(createGestureControllerState(), [
      { hand: { handVisible: true, position: { x: 0.2, y: 0.5 }, gesture: null, confidence: 0 }, dt: 100 },
      { hand: { handVisible: true, position: { x: 0.28, y: 0.5 }, gesture: null, confidence: 0 }, dt: 100 },
      { hand: { handVisible: true, position: { x: 0.36, y: 0.5 }, gesture: null, confidence: 0 }, dt: 100 },
      { hand: { handVisible: true, position: { x: 0.44, y: 0.5 }, gesture: null, confidence: 0 }, dt: 100 },
    ]);
    expect(swipeRight.actions).toEqual([GESTURE_ACTION.NEXT_FILTER]);
    expect(swipeRight.state.swipe.armed).toBe(false);

    const swipeLeft = runSteps(createGestureControllerState(), [
      { hand: { handVisible: true, position: { x: 0.8, y: 0.5 }, gesture: null, confidence: 0 }, dt: 100 },
      { hand: { handVisible: true, position: { x: 0.72, y: 0.5 }, gesture: null, confidence: 0 }, dt: 100 },
      { hand: { handVisible: true, position: { x: 0.64, y: 0.5 }, gesture: null, confidence: 0 }, dt: 100 },
      { hand: { handVisible: true, position: { x: 0.56, y: 0.5 }, gesture: null, confidence: 0 }, dt: 100 },
    ]);
    expect(swipeLeft.actions).toEqual([GESTURE_ACTION.PREVIOUS_FILTER]);

    const verticalDrift = runSteps(createGestureControllerState(), [
      { hand: { handVisible: true, position: { x: 0.2, y: 0.3 }, gesture: null, confidence: 0 }, dt: 100 },
      { hand: { handVisible: true, position: { x: 0.4, y: 0.6 }, gesture: null, confidence: 0 }, dt: 100 },
    ]);
    expect(verticalDrift.actions).toEqual([]);
  });

  it('handles selection mode navigation, confirmation, timeout, and cancellation', () => {
    let state = enterSelectionMode(createGestureControllerState(), 3, 0);
    expect(state.mode).toBe(GESTURE_MODE.SELECTION);

    // Wait out initial confirmCooldownMs
    state = holdGesture(state, null, GESTURE_CONFIG.confirmCooldownMs, { x: 0.5, y: 0.5 }, 0).state;

    const thumbNav = holdGesture(state, 'Thumb_Up', 700);
    expect(thumbNav.actions).toContain(GESTURE_ACTION.NEXT_FILTER);

    const confirmed = holdGesture(state, 'Open_Palm', 400);
    expect(confirmed.actions).toContain(GESTURE_ACTION.CONFIRM_SELECTION);

    // Timeout while hand is absent
    let timeoutState = enterSelectionMode(createGestureControllerState(), 3, 0);
    const timeoutActions = [];
    for (let elapsed = 0; elapsed < GESTURE_CONFIG.selectionTimeoutMs + 200; elapsed += 200) {
      const res = tickGestureController(timeoutState, { handVisible: false }, 200);
      timeoutState = res.state;
      timeoutActions.push(...res.actions);
    }
    expect(timeoutActions).toContain(GESTURE_ACTION.SELECTION_TIMEOUT);

    const canceled = cancelFilterSelection(enterSelectionMode(createGestureControllerState(), 3, 1));
    expect(canceled.state.mode).toBe(GESTURE_MODE.AR);
    expect(canceled.actions).toEqual([GESTURE_ACTION.CANCEL_SELECTION]);
  });

  it('suppresses navigation during challenge mode and restores cooldowns on exit', () => {
    const challenge = enterChallengeMode(createGestureControllerState());
    expect(challenge.mode).toBe(GESTURE_MODE.CHALLENGE);
    const during = holdGesture(challenge, 'Pointing_Up', 1000);
    expect(during.actions).toEqual([]);

    const exited = exitChallengeMode(during.state);
    expect(exited.mode).toBe(GESTURE_MODE.AR);
    expect(exited.swipe.cooldownMs).toBe(GESTURE_CONFIG.swipeCooldownMs);
    expect(exited.selection.openCooldownMs).toBe(GESTURE_CONFIG.openSelectionCooldownMs);
  });
});
