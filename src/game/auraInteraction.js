export const AURA_MARKERS = [
  { id: 0, x: 0.27, y: 0.36, radius: 0.105 },
  { id: 1, x: 0.72, y: 0.42, radius: 0.105 },
  { id: 2, x: 0.49, y: 0.68, radius: 0.105 },
];

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export function createAuraChallenge() {
  return { status: 'idle', remainingMs: 30000, energy: 0, chargeMs: 0, chargeReady: false, cooldownMs: 0, candidate: null, candidateMs: 0, stableGesture: null, feedback: '', feedbackMs: 0, pulse: null, pulseId: 0, activated: [], filterActivated: false, filterId: null };
}

export function startAuraChallenge(filterId = null) { return { ...createAuraChallenge(), status: 'playing', filterActivated: Boolean(filterId), filterId }; }

export function getAuraCollision(position, markers = AURA_MARKERS, activated = []) {
  if (!position) return null;
  return markers.find((marker) => !activated.includes(marker.id) && Math.hypot(position.x - marker.x, position.y - marker.y) <= marker.radius) || null;
}

/** Pure 100 ms style simulation step. Gesture results are real tracker output only. */
export function tickAuraChallenge(state, tracking, faceVisible, elapsedMs) {
  if (state.status !== 'playing') return state;
  const dt = clamp(elapsedMs, 0, 200);
  let next = { ...state, remainingMs: Math.max(0, state.remainingMs - dt), cooldownMs: Math.max(0, state.cooldownMs - dt), feedbackMs: Math.max(0, state.feedbackMs - dt) };
  if (!faceVisible || !tracking?.handVisible || !tracking.position) {
    next = { ...next, energy: 0, chargeMs: 0, chargeReady: false, candidate: null, candidateMs: 0, stableGesture: null, feedback: 'TRACKING PAUSED · SHOW FACE AND HAND', feedbackMs: 700 };
    if (next.remainingMs === 0) next.status = 'finished';
    return next;
  }

  const confidence = Number(tracking.confidence) || 0;
  const rawGesture = confidence >= 0.62 ? tracking.gesture : null;
  if (rawGesture && rawGesture === next.candidate) next.candidateMs += dt;
  else { next.candidate = rawGesture; next.candidateMs = rawGesture ? dt : 0; }
  const confirmed = rawGesture && next.candidateMs >= 180 ? rawGesture : null;
  const wasStable = next.stableGesture;
  if (confirmed === 'Open_Palm') {
    next.chargeMs = Math.min(2200, next.chargeMs + dt);
    next.energy = Math.min(100, Math.round(next.chargeMs / 22));
    if (next.chargeMs >= 900) next.chargeReady = true;
    next.feedback = next.chargeReady ? 'CHARGE READY · CLOSE FIST TO RELEASE' : 'HOLD OPEN PALM TO CHARGE';
    next.feedbackMs = 250;
  } else if (confirmed === 'Pointing_Up') {
    next.feedback = 'AIM AT A MARKER · CLOSE FIST TO RELEASE'; next.feedbackMs = 250;
  }
  if (confirmed === 'Closed_Fist' && wasStable !== 'Closed_Fist' && next.chargeReady && next.cooldownMs === 0) {
    const hit = getAuraCollision(tracking.position, AURA_MARKERS, next.activated);
    next.pulseId += 1;
    next.pulse = { id: next.pulseId, x: tracking.position.x, y: tracking.position.y, hit: !!hit };
    next.cooldownMs = 850;
    next.energy = 0; next.chargeMs = 0; next.chargeReady = false;
    if (hit) {
      next.activated = [...next.activated, hit.id];
      next.feedback = 'MARKER ACTIVATED'; next.feedbackMs = 1200;
      if (next.activated.length === AURA_MARKERS.length) next.status = 'complete';
    } else { next.feedback = 'PULSE MISSED · AIM WITH POINTING UP'; next.feedbackMs = 1100; }
  }
  if (confirmed) next.stableGesture = confirmed;
  else if (!rawGesture && next.candidateMs === 0) next.stableGesture = null;
  if (next.remainingMs === 0 && next.status === 'playing') next.status = 'finished';
  return next;
}
