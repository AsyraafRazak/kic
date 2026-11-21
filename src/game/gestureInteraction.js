/**
 * Reusable gesture interaction controller.
 *
 * Separates raw tracker output (hand position + gesture name) from application
 * actions. It only ever returns a list of semantic actions; it never touches
 * React, the DOM or the AR filters. This keeps gesture recognition decoupled
 * from what the application does with it.
 *
 * Coordinate space: the hand tracking hook already emits mirrored, normalized
 * (0..1) positions, so swipe directions map 1:1 to what the user sees on screen.
 */

export const GESTURE_MODE = {
  AR: "ar",
  SELECTION: "selection",
  CHALLENGE: "challenge",
};

export const GESTURE_ACTION = {
  NEXT_FILTER: "next-filter",
  PREVIOUS_FILTER: "previous-filter",
  OPEN_SELECTION: "open-selection",
  CONFIRM_SELECTION: "confirm-selection",
  CANCEL_SELECTION: "cancel-selection",
  SELECTION_TIMEOUT: "selection-timeout",
};

/** Tunable on the booth laptop without touching logic. */
export const GESTURE_CONFIG = {
  // Swipe detection (normalized units per second, relative to preview width).
  swipeMinDistance: 0.16,
  swipeMinVelocity: 0.55,
  swipeMaxVerticalDrift: 0.12,
  swipeMaxDurationMs: 900,
  swipeCooldownMs: 650,
  swipeNeutralResetMs: 250,
  // Stable Pointing_Up hold required to open the selection carousel.
  openSelectionHoldMs: 800,
  openSelectionConfidence: 0.62,
  openSelectionCooldownMs: 1200,
  // Selection mode behaviour.
  selectionTimeoutMs: 8000,
  confirmCooldownMs: 1200,
  confirmConfidence: 0.6,
  // Global guards.
  gestureConfidence: 0.62,
  gestureStabilityMs: 180,
  filterTapSwitchHoldMs: 350,
  trackingLossGraceMs: 300,
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function createGestureControllerState() {
  return {
    mode: GESTURE_MODE.AR,
    // Swipe tracking.
    swipe: {
      origin: null,
      startedAt: 0,
      lastPosition: null,
      lastAt: 0,
      velocityX: 0,
      armed: true,
      neutralMs: 0,
      cooldownMs: 0,
      tapCooldownMs: 0,
    },
    // Stable-gesture tracking (shared by "open selection" and "confirm").
    gesture: {
      name: null,
      candidate: null,
      candidateMs: 0,
      stable: null,
      stableMs: 0,
      fired: false,
    },
    // Selection mode.
    selection: {
      remainingMs: GESTURE_CONFIG.selectionTimeoutMs,
      index: 0,
      count: 0,
      confirmCooldownMs: 0,
      openCooldownMs: 0,
    },
    // Tracking loss.
    tracking: {
      lostMs: 0,
      lost: false,
    },
  };
}

function resetSwipe(state) {
  state.swipe.origin = null;
  state.swipe.startedAt = 0;
  state.swipe.velocityX = 0;
  state.swipe.neutralMs = 0;
}

function resetStableGesture(state) {
  state.gesture.name = null;
  state.gesture.candidate = null;
  state.gesture.candidateMs = 0;
  state.gesture.stable = null;
  state.gesture.stableMs = 0;
  state.gesture.fired = false;
}

/** Tracks how long the current gesture has been held without interruption. */
function updateStableGesture(state, hand, dt, confidenceFloor) {
  const gesture = state.gesture;
  const confidence = Number(hand.confidence) || 0;
  const rawGesture =
    hand.gesture && confidence >= confidenceFloor ? hand.gesture : null;

  if (rawGesture && rawGesture === gesture.candidate) {
    gesture.candidateMs += dt;
  } else {
    gesture.candidate = rawGesture;
    gesture.candidateMs = rawGesture ? dt : 0;
  }

  const confirmed =
    rawGesture && gesture.candidateMs >= GESTURE_CONFIG.gestureStabilityMs
      ? rawGesture
      : null;
  if (confirmed === gesture.stable) {
    if (confirmed) gesture.stableMs += dt;
  } else {
    gesture.stable = confirmed;
    gesture.stableMs = confirmed ? dt : 0;
    gesture.fired = false;
  }

  // A gesture change always re-arms single-shot actions so a continuous gesture
  // cannot fire the same action repeatedly.
  if (gesture.name !== gesture.stable) {
    gesture.name = gesture.stable;
    gesture.fired = false;
  }
}

/**
 * Advances the controller by one simulation step.
 *
 * @param {object} state Current controller state (not mutated).
 * @param {object} hand Latest tracker output: { handVisible, position, gesture, confidence }.
 * @param {number} elapsedMs Elapsed time since the previous step in milliseconds.
 * @returns {{ state: object, actions: string[] }}
 */
export function tickGestureController(state, hand, elapsedMs) {
  const dt = clamp(elapsedMs, 0, 200);
  const next = {
    mode: state.mode,
    swipe: { ...state.swipe },
    gesture: { ...state.gesture },
    selection: { ...state.selection },
    tracking: { ...state.tracking },
  };
  const actions = [];

  const handVisible = Boolean(hand?.handVisible && hand.position);
  if (!handVisible) {
    // Loss of tracking: reset every pending timer so nothing fires accidentally.
    next.tracking.lostMs += dt;
    next.tracking.lost = true;
    next.swipe.armed = true;
    next.swipe.cooldownMs = Math.max(0, next.swipe.cooldownMs - dt);
    next.swipe.tapCooldownMs = Math.max(0, next.swipe.tapCooldownMs - dt);
    next.selection.confirmCooldownMs = Math.max(
      0,
      next.selection.confirmCooldownMs - dt,
    );
    next.selection.openCooldownMs = Math.max(
      0,
      next.selection.openCooldownMs - dt,
    );
    resetSwipe(next);
    resetStableGesture(next);
    if (next.mode === GESTURE_MODE.SELECTION) {
      next.selection.remainingMs = Math.max(0, next.selection.remainingMs - dt);
      if (next.selection.remainingMs === 0)
        actions.push(GESTURE_ACTION.SELECTION_TIMEOUT);
    }
    return { state: next, actions };
  }

  next.tracking.lostMs = 0;
  next.tracking.lost = false;
  next.swipe.cooldownMs = Math.max(0, next.swipe.cooldownMs - dt);
  next.swipe.tapCooldownMs = Math.max(0, next.swipe.tapCooldownMs - dt);
  next.selection.confirmCooldownMs = Math.max(
    0,
    next.selection.confirmCooldownMs - dt,
  );
  next.selection.openCooldownMs = Math.max(
    0,
    next.selection.openCooldownMs - dt,
  );

  if (next.mode === GESTURE_MODE.CHALLENGE) {
    resetSwipe(next);
    resetStableGesture(next);
    return { state: next, actions };
  }

  updateStableGesture(
    next,
    hand,
    dt,
    next.mode === GESTURE_MODE.SELECTION
      ? GESTURE_CONFIG.confirmConfidence
      : GESTURE_CONFIG.openSelectionConfidence,
  );

  const position = hand.position;
  const confidence = Number(hand.confidence) || 0;
  const swipeConfig = GESTURE_CONFIG;

  // Selection mode: thumb holds navigate; swipes remain a fallback.
  if (next.mode === GESTURE_MODE.SELECTION) {
    next.selection.remainingMs = Math.max(0, next.selection.remainingMs - dt);
    if (next.selection.remainingMs === 0)
      actions.push(GESTURE_ACTION.SELECTION_TIMEOUT);

    // Intentional gesture input takes priority over fallback swipe navigation.
    const intentionalGesture = Boolean(hand.gesture && confidence >= GESTURE_CONFIG.gestureConfidence);
    const swipeAction = intentionalGesture ? (resetSwipe(next), null) : detectSwipe(next, position, dt, swipeConfig);
    if (swipeAction) actions.push(swipeAction);

    if (
      next.selection.confirmCooldownMs === 0 &&
      !next.gesture.fired &&
      next.gesture.stableMs >= GESTURE_CONFIG.filterTapSwitchHoldMs &&
      (next.gesture.stable === "Thumb_Up" || next.gesture.stable === "Thumb_Down")
    ) {
      next.gesture.fired = true;
      actions.push(next.gesture.stable === "Thumb_Up"
        ? GESTURE_ACTION.NEXT_FILTER
        : GESTURE_ACTION.PREVIOUS_FILTER);
    }

    if (
      next.selection.confirmCooldownMs === 0 &&
      next.gesture.stable === "Open_Palm" &&
      !next.gesture.fired &&
      confidence >= GESTURE_CONFIG.confirmConfidence
    ) {
      next.gesture.fired = true;
      actions.push(GESTURE_ACTION.CONFIRM_SELECTION);
    }
    return { state: next, actions };
  }

  // Normal AR mode: swipe changes filter, long stable Pointing_Up opens selection.
  // Keep charging, release and selection gestures distinct from filter swipes.
  // Reset the swipe origin during a recognized gesture so it cannot resume with
  // accumulated movement when that gesture ends.
  const intentionalGesture = Boolean(hand.gesture && confidence >= GESTURE_CONFIG.gestureConfidence);
  const swipeAction = intentionalGesture ? (resetSwipe(next), null) : detectSwipe(next, position, dt, swipeConfig);
  if (swipeAction) actions.push(swipeAction);

  if (next.swipe.tapCooldownMs === 0 && !next.gesture.fired && next.gesture.stableMs >= GESTURE_CONFIG.filterTapSwitchHoldMs) {
    if (next.gesture.stable === 'Thumb_Up') {
      next.gesture.fired = true;
      next.swipe.tapCooldownMs = 800;
      actions.push(GESTURE_ACTION.NEXT_FILTER);
    } else if (next.gesture.stable === 'Thumb_Down') {
      next.gesture.fired = true;
      next.swipe.tapCooldownMs = 800;
      actions.push(GESTURE_ACTION.PREVIOUS_FILTER);
    }
  }

  if (
    next.selection.openCooldownMs === 0 &&
    next.gesture.stable === "Pointing_Up" &&
    next.gesture.stableMs >= GESTURE_CONFIG.openSelectionHoldMs &&
    !next.gesture.fired
  ) {
    next.gesture.fired = true;
    actions.push(GESTURE_ACTION.OPEN_SELECTION);
  }

  return { state: next, actions };
}

/**
 * Horizontal swipe detection over smoothed hand positions.
 * Requires a clear horizontal displacement, a minimum velocity, limited vertical
 * drift and a bounded duration. Fires once per motion, then needs a cooldown and
 * a return to the neutral position before it can fire again.
 */
function detectSwipe(state, position, dt, config) {
  const swipe = state.swipe;
  swipe.neutralMs += dt;

  if (!swipe.armed) {
    if (swipe.cooldownMs > 0) return null;
    if (swipe.neutralMs >= config.swipeNeutralResetMs) {
      swipe.armed = true;
      swipe.origin = position;
      swipe.startedAt = 0;
      swipe.velocityX = 0;
      swipe.lastPosition = position;
      swipe.lastAt = 0;
    }
    return null;
  }

  if (!swipe.origin) {
    swipe.origin = position;
    swipe.startedAt = 0;
    swipe.lastPosition = position;
    swipe.lastAt = 0;
    swipe.neutralMs = 0;
    return null;
  }

  const stepMs = swipe.lastAt ? dt : dt;
  const dx = position.x - (swipe.lastPosition?.x ?? position.x);
  if (stepMs > 0) {
    const instantVelocity = dx / (stepMs / 1000);
    swipe.velocityX = swipe.velocityX * 0.6 + instantVelocity * 0.4;
  }
  swipe.lastPosition = position;
  swipe.startedAt += dt;

  const totalDx = position.x - swipe.origin.x;
  const totalDy = position.y - swipe.origin.y;
  if (Math.abs(totalDy) > config.swipeMaxVerticalDrift) {
    // Too much vertical movement: treat this motion as neutral and start over.
    swipe.origin = position;
    swipe.startedAt = 0;
    swipe.velocityX = 0;
    return null;
  }

  if (Math.abs(totalDx) < config.swipeMinDistance) return null;
  if (Math.abs(swipe.velocityX) < config.swipeMinVelocity) return null;
  if (swipe.startedAt > config.swipeMaxDurationMs) {
    swipe.origin = position;
    swipe.startedAt = 0;
    swipe.velocityX = 0;
    return null;
  }

  const direction = totalDx > 0 ? 1 : -1;
  if (direction !== Math.sign(swipe.velocityX)) {
    swipe.origin = position;
    swipe.startedAt = 0;
    swipe.velocityX = 0;
    return null;
  }

  // Fire once, then require cooldown + a neutral return before the next swipe.
  swipe.armed = false;
  swipe.cooldownMs = config.swipeCooldownMs;
  swipe.neutralMs = 0;
  return direction > 0
    ? GESTURE_ACTION.NEXT_FILTER
    : GESTURE_ACTION.PREVIOUS_FILTER;
}

/** Enters selection mode from normal AR mode. */
export function enterSelectionMode(state, count = 0, activeIndex = 0) {
  const next = {
    mode: GESTURE_MODE.SELECTION,
    swipe: {
      ...state.swipe,
      origin: null,
      startedAt: 0,
      velocityX: 0,
      armed: false,
      cooldownMs: GESTURE_CONFIG.swipeCooldownMs,
      neutralMs: 0,
    },
    gesture: {
      ...state.gesture,
      name: null,
      candidate: null,
      candidateMs: 0,
      stable: null,
      stableMs: 0,
      fired: true,
    },
    selection: {
      ...state.selection,
      remainingMs: GESTURE_CONFIG.selectionTimeoutMs,
      index: activeIndex,
      count,
      confirmCooldownMs: GESTURE_CONFIG.confirmCooldownMs,
      openCooldownMs: GESTURE_CONFIG.openSelectionCooldownMs,
    },
    tracking: { ...state.tracking },
  };
  return next;
}

/** Leaves selection mode and re-arms normal AR gesture handling. */
export function exitSelectionMode(state) {
  const next = {
    mode: GESTURE_MODE.AR,
    swipe: {
      ...state.swipe,
      origin: null,
      startedAt: 0,
      velocityX: 0,
      armed: false,
      cooldownMs: GESTURE_CONFIG.swipeCooldownMs,
      neutralMs: 0,
    },
    gesture: {
      ...state.gesture,
      name: null,
      candidate: null,
      candidateMs: 0,
      stable: null,
      stableMs: 0,
      fired: false,
    },
    selection: {
      ...state.selection,
      confirmCooldownMs: GESTURE_CONFIG.confirmCooldownMs,
      openCooldownMs: GESTURE_CONFIG.openSelectionCooldownMs,
    },
    tracking: { ...state.tracking },
  };
  return next;
}

/** Explicit Escape/button cancellation for the visible filter carousel. */
export function cancelFilterSelection(state) {
  if (state.mode !== GESTURE_MODE.SELECTION) return { state, actions: [] };
  return { state: exitSelectionMode(state), actions: [GESTURE_ACTION.CANCEL_SELECTION] };
}

/** Suspends filter navigation while the dedicated Aura challenge owns gestures. */
export function enterChallengeMode(state) {
  const next = createGestureControllerState();
  next.mode = GESTURE_MODE.CHALLENGE;
  next.tracking = { ...state.tracking };
  return next;
}

/** Returns to normal AR navigation with a brief cooldown after challenge play. */
export function exitChallengeMode(state) {
  const next = createGestureControllerState();
  next.swipe.armed = false;
  next.swipe.cooldownMs = GESTURE_CONFIG.swipeCooldownMs;
  next.selection.openCooldownMs = GESTURE_CONFIG.openSelectionCooldownMs;
  next.tracking = { ...state.tracking };
  return next;
}

/** Moves the highlighted index, wrapping around the filter list. */
export function moveSelectionIndex(state, direction) {
  const count = state.selection.count || 0;
  if (count <= 0) return state.selection.index;
  return (((state.selection.index + direction) % count) + count) % count;
}

/** Keeps the selection state in sync when the user confirms via a manual button. */
export function setSelectionIndex(state, index) {
  return {
    ...state.selection,
    index: clamp(index, 0, Math.max(0, state.selection.count - 1)),
  };
}

export function shouldResetForTrackingLoss(state, hand, previousHand) {
  const wasVisible = Boolean(
    previousHand?.handVisible && previousHand.position,
  );
  const isVisible = Boolean(hand?.handVisible && hand.position);
  return wasVisible && !isVisible;
}
