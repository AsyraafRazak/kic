export const ROUND_DURATION_MS = 30_000;
export const PULSE_COOLDOWN_MS = 850;
export const MIN_CHARGE = 0.28;
export const POINTS_PER_HIT = 100;
export const TARGET_RADIUS = 0.046;

export function createGameState() {
  return {
    status: 'idle',
    score: 0,
    remainingMs: ROUND_DURATION_MS,
    energy: 0,
    cooldownMs: 0,
    target: null,
    targetSequence: 0,
    pulseSequence: 0,
    resolvedPulses: [],
    feedback: 'READY',
    feedbackMs: 0,
  };
}

export function makeTarget(id, random = Math.random, previous = null) {
  let position = { x: 0.5, y: 0.5 };
  for (let attempt = 0; attempt < 16; attempt += 1) {
    position = { x: 0.12 + random() * 0.76, y: 0.14 + random() * 0.7 };
    if (!previous || Math.hypot(position.x - previous.x, position.y - previous.y) >= 0.28) break;
  }
  if (previous && Math.hypot(position.x - previous.x, position.y - previous.y) < 0.28) {
    position = { x: previous.x < 0.5 ? 0.84 : 0.16, y: previous.y < 0.5 ? 0.83 : 0.17 };
  }
  return { id, ...position, radius: TARGET_RADIUS };
}

export function startRound(_state, random = Math.random) {
  return {
    ...createGameState(),
    status: 'playing',
    target: makeTarget(1, random),
    targetSequence: 1,
  };
}

export function pauseRound(state) {
  return state.status === 'playing' ? { ...state, status: 'paused' } : state;
}

export function resumeRound(state) {
  return state.status === 'paused' ? { ...state, status: 'playing' } : state;
}

export function tickRound(state, elapsedMs) {
  if (state.status !== 'playing') return state;
  const elapsed = Math.max(0, elapsedMs);
  const remainingMs = Math.max(0, state.remainingMs - elapsed);
  const feedbackMs = Math.max(0, state.feedbackMs - elapsed);
  return {
    ...state,
    status: remainingMs === 0 ? 'finished' : state.status,
    remainingMs,
    cooldownMs: Math.max(0, state.cooldownMs - elapsed),
    feedback: feedbackMs === 0 ? (remainingMs === 0 ? 'TIME' : 'READY') : state.feedback,
    feedbackMs,
  };
}

export function chargeRound(state, elapsedMs) {
  if (state.status !== 'playing' || state.cooldownMs > 0 || elapsedMs <= 0) return state;
  return { ...state, energy: Math.min(1, state.energy + elapsedMs / 1400) };
}

export function firePulse(state) {
  if (state.status !== 'playing' || state.cooldownMs > 0 || state.energy < MIN_CHARGE || !state.target) {
    return { state, accepted: false, pulse: null };
  }
  const pulseId = state.pulseSequence + 1;
  return {
    accepted: true,
    pulse: { id: pulseId, target: state.target, energy: state.energy },
    state: {
      ...state,
      energy: 0,
      cooldownMs: PULSE_COOLDOWN_MS,
      pulseSequence: pulseId,
      feedback: 'PULSE',
      feedbackMs: PULSE_COOLDOWN_MS,
    },
  };
}

/** Checks whether a growing ring sweeps through a circular target. */
export function pulseTouchesTarget(previousRadius, nextRadius, distance, targetRadius) {
  return previousRadius <= distance + targetRadius && nextRadius >= Math.max(0, distance - targetRadius);
}

/** Resolves one pulse exactly once; only the current target can award points. */
export function resolvePulse(state, { pulseId, targetId, hit }, random = Math.random) {
  if (state.status !== 'playing' || state.resolvedPulses.includes(pulseId)) return state;
  const isHit = Boolean(hit && state.target?.id === targetId);
  const resolvedPulses = [...state.resolvedPulses, pulseId].slice(-8);
  if (!isHit) {
    return { ...state, resolvedPulses, feedback: 'MISS', feedbackMs: 850 };
  }

  const nextId = state.targetSequence + 1;
  return {
    ...state,
    score: state.score + POINTS_PER_HIT,
    target: makeTarget(nextId, random, state.target),
    targetSequence: nextId,
    resolvedPulses,
    feedback: `HIT +${POINTS_PER_HIT}`,
    feedbackMs: 900,
  };
}

export function endRound(state) {
  return state.status === 'finished' ? state : { ...state, status: 'finished', feedback: 'TIME', feedbackMs: 0 };
}
