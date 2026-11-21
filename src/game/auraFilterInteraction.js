const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export const AURA_FILTER_GESTURES = {
  confidence: 0.62,
  stableMs: 180,
  chargeMs: 700,
  releaseCooldownMs: 850,
};

export function createAuraFilterInteraction() {
  return { stableGesture: null, candidate: null, candidateMs: 0, charging: false, charge: 0, chargeReady: false, pulseId: 0, pulse: null, cooldownMs: 0 };
}

/** Single-shot gesture signals for filter effects. Rendering consumes this state but never interprets gestures. */
export function tickAuraFilterInteraction(state, hand, elapsedMs, faceVisible = true) {
  const next = { ...state };
  const dt = clamp(elapsedMs, 0, 200);
  next.cooldownMs = Math.max(0, next.cooldownMs - dt);
  next.pulse = null;
  if (!faceVisible || !hand?.handVisible || !hand.position) {
    next.candidate = null; next.candidateMs = 0; next.stableGesture = null;
    next.charging = false; next.charge = 0; next.chargeReady = false;
    return next;
  }
  const gesture = (Number(hand.confidence) || 0) >= AURA_FILTER_GESTURES.confidence ? hand.gesture : null;
  if (gesture && gesture === next.candidate) next.candidateMs += dt;
  else { next.candidate = gesture; next.candidateMs = gesture ? dt : 0; }
  const previous = next.stableGesture;
  const stable = gesture && next.candidateMs >= AURA_FILTER_GESTURES.stableMs ? gesture : null;
  next.stableGesture = stable;
  if (stable === 'Open_Palm') {
    next.charging = true;
    next.charge = Math.min(1, next.charge + dt / AURA_FILTER_GESTURES.chargeMs);
    if (next.charge >= 1) next.chargeReady = true;
  } else if (stable === 'Closed_Fist' && previous !== 'Closed_Fist' && next.chargeReady && next.cooldownMs === 0) {
    next.pulseId += 1;
    next.pulse = { id: next.pulseId, position: hand.position };
    next.charge = 0; next.charging = false; next.chargeReady = false;
    next.cooldownMs = AURA_FILTER_GESTURES.releaseCooldownMs;
  } else if (stable !== 'Open_Palm') {
    next.charging = false;
    // A brief gesture transition keeps glow responsive, then fades without charging.
    if (!next.chargeReady) next.charge = Math.max(0, next.charge - dt / 420);
  }
  return next;
}
