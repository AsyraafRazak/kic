import { describe, it, expect } from 'vitest';
import {
  MIN_CHARGE,
  POINTS_PER_HIT,
  PULSE_COOLDOWN_MS,
  ROUND_DURATION_MS,
  TARGET_RADIUS,
  chargeRound,
  createGameState,
  endRound,
  firePulse,
  makeTarget,
  pauseRound,
  pulseTouchesTarget,
  resolvePulse,
  resumeRound,
  startRound,
  tickRound,
} from '../gameState.js';

describe('gameState', () => {
  it('creates an idle initial state', () => {
    const state = createGameState();
    expect(state.status).toBe('idle');
    expect(state.score).toBe(0);
    expect(state.remainingMs).toBe(ROUND_DURATION_MS);
    expect(state.energy).toBe(0);
    expect(state.target).toBeNull();
  });

  it('starts, pauses, resumes, and ends a round cleanly', () => {
    const started = startRound(createGameState(), () => 0.5);
    expect(started.status).toBe('playing');
    expect(started.target).toEqual({ id: 1, x: 0.5, y: 0.49, radius: TARGET_RADIUS });

    const paused = pauseRound(started);
    expect(paused.status).toBe('paused');
    expect(pauseRound(paused)).toBe(paused);

    const resumed = resumeRound(paused);
    expect(resumed.status).toBe('playing');
    expect(resumeRound(resumed)).toBe(resumed);

    const ended = endRound(resumed);
    expect(ended.status).toBe('finished');
    expect(ended.feedback).toBe('TIME');
    expect(endRound(ended)).toBe(ended);
  });

  it('ticks timers and finishes when remaining time hits zero', () => {
    let state = { ...startRound(createGameState(), () => 0.5), cooldownMs: 500, feedback: 'PULSE', feedbackMs: 300 };
    state = tickRound(state, 400);
    expect(state.remainingMs).toBe(ROUND_DURATION_MS - 400);
    expect(state.cooldownMs).toBe(100);
    expect(state.feedbackMs).toBe(0);
    expect(state.feedback).toBe('READY');

    const finished = tickRound(state, ROUND_DURATION_MS);
    expect(finished.remainingMs).toBe(0);
    expect(finished.status).toBe('finished');
    expect(finished.feedback).toBe('TIME');
  });

  it('charges energy only while playing and off cooldown', () => {
    const idle = createGameState();
    expect(chargeRound(idle, 500)).toBe(idle);

    const playing = startRound(idle, () => 0.5);
    const cooling = { ...playing, cooldownMs: 200 };
    expect(chargeRound(cooling, 500)).toBe(cooling);

    const charged = chargeRound(playing, 700);
    expect(charged.energy).toBeCloseTo(0.5, 5);
    expect(chargeRound(charged, 5000).energy).toBe(1);
  });

  it('enforces minimum charge and cooldown when firing a pulse', () => {
    const playing = startRound(createGameState(), () => 0.5);
    const undercharged = chargeRound(playing, 100);
    expect(undercharged.energy).toBeLessThan(MIN_CHARGE);
    expect(firePulse(undercharged).accepted).toBe(false);

    const ready = chargeRound(playing, 700);
    const fired = firePulse(ready);
    expect(fired.accepted).toBe(true);
    expect(fired.pulse).toEqual({ id: 1, target: ready.target, energy: ready.energy });
    expect(fired.state.energy).toBe(0);
    expect(fired.state.cooldownMs).toBe(PULSE_COOLDOWN_MS);
    expect(fired.state.pulseSequence).toBe(1);

    expect(firePulse(fired.state).accepted).toBe(false);
  });

  it('checks expanding pulse ring contact accurately', () => {
    expect(pulseTouchesTarget(0.01, 0.03, 0.1, 0.04)).toBe(false);
    expect(pulseTouchesTarget(0.04, 0.08, 0.1, 0.04)).toBe(true);
    expect(pulseTouchesTarget(0.15, 0.2, 0.1, 0.04)).toBe(false);
  });

  it('resolves hits once, spawns a spaced next target, and handles misses', () => {
    const playing = startRound(createGameState(), () => 0.1);
    const hitState = resolvePulse(playing, { pulseId: 1, targetId: playing.target.id, hit: true }, () => 0.1);
    expect(hitState.score).toBe(POINTS_PER_HIT);
    expect(hitState.targetSequence).toBe(2);
    expect(hitState.feedback).toBe(`HIT +${POINTS_PER_HIT}`);
    expect(Math.hypot(hitState.target.x - playing.target.x, hitState.target.y - playing.target.y)).toBeGreaterThanOrEqual(0.28);

    // Duplicate pulseId must be ignored
    expect(resolvePulse(hitState, { pulseId: 1, targetId: hitState.target.id, hit: true })).toBe(hitState);

    // Stale targetId counts as miss
    const staleMiss = resolvePulse(hitState, { pulseId: 2, targetId: playing.target.id, hit: true });
    expect(staleMiss.score).toBe(POINTS_PER_HIT);
    expect(staleMiss.feedback).toBe('MISS');

    // Non-hit counts as miss
    const miss = resolvePulse(staleMiss, { pulseId: 3, targetId: staleMiss.target.id, hit: false });
    expect(miss.feedback).toBe('MISS');
  });

  it('spaces consecutive targets in makeTarget', () => {
    const prev = { id: 1, x: 0.2, y: 0.2, radius: TARGET_RADIUS };
    const next = makeTarget(2, () => 0.1, prev);
    expect(Math.hypot(next.x - prev.x, next.y - prev.y)).toBeGreaterThanOrEqual(0.28);
  });
});
