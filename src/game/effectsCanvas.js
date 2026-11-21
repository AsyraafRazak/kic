import { MIN_CHARGE, pulseTouchesTarget } from './gameState.js';

const MAX_DPR = 1.5;
const MAX_WIDTH = 1280;
const MAX_HEIGHT = 720;
const MAX_PARTICLES = 14;
const MAX_TRAIL_POINTS = 8;
const GESTURE_STABILITY_MS = 150;

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const randomBetween = (min, max) => min + Math.random() * (max - min);

function makeParticle(x, y, angle = randomBetween(0, Math.PI * 2), speed = randomBetween(28, 105)) {
  const life = randomBetween(0.32, 0.72);
  return {
    x, y,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    size: randomBetween(1, 2.5),
    age: 0,
    life,
    color: Math.random() > 0.35 ? '98, 231, 229' : '95, 154, 255',
  };
}

/** Starts an imperative canvas effect layer. Returns a complete teardown. */
export function startEffectsCanvas(canvas, getTracking, getGame, onCharge, onFirePulse, onPulseResult, video, getReducedMotion = () => false, getDemoMode = () => false) {
  const context = canvas?.getContext('2d', { alpha: true });
  if (!canvas || !context) return () => {};

  let width = 0;
  let height = 0;
  let ratio = 1;
  let frameId = 0;
  let previousFrame = 0;
  let lastTrailAt = 0;
  let lastParticleAt = 0;
  let visibleAlpha = 0;
  let handPoint = null;
  let candidateGesture = null;
  let candidateSince = 0;
  let stableGesture = null;
  let lastChargeAt = 0;
  let trail = [];
  let particles = [];
  let pulses = [];
  let flash = null;
  let reducedMotion = false;
  let demoPoint = null;
  let demoClicks = 0;
  let handledDemoClicks = 0;
  const trackDemoPointer = (event) => {
    if (!getDemoMode()) return;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    demoPoint = { x: clamp((event.clientX - rect.left) / rect.width, 0, 1), y: clamp((event.clientY - rect.top) / rect.height, 0, 1) };
  };
  const clickDemoPointer = (event) => {
    if (!getDemoMode()) return;
    trackDemoPointer(event);
    demoClicks += 1;
  };
  canvas.addEventListener('pointermove', trackDemoPointer);
  canvas.addEventListener('pointerdown', clickDemoPointer);

  function resize() {
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const nativeRatio = window.devicePixelRatio || 1;
    ratio = Math.min(MAX_DPR, nativeRatio, MAX_WIDTH / rect.width, MAX_HEIGHT / rect.height);
    const nextWidth = Math.max(1, Math.round(rect.width * ratio));
    const nextHeight = Math.max(1, Math.round(rect.height * ratio));
    if (canvas.width === nextWidth && canvas.height === nextHeight) return;
    canvas.width = nextWidth;
    canvas.height = nextHeight;
    width = rect.width;
    height = rect.height;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, width, height);
  }

  resize();
  const resizeObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(resize);
  resizeObserver?.observe(canvas);
  if (!resizeObserver) window.addEventListener('resize', resize);

  function addBurst(x, y, count = 9) {
    if (reducedMotion) return;
    for (let i = 0; i < count && particles.length < MAX_PARTICLES; i += 1) {
      const angle = (i / count) * Math.PI * 2 + randomBetween(-0.18, 0.18);
      particles.push(makeParticle(x, y, angle, randomBetween(55, 155)));
    }
  }

  function trackStableGesture(gesture, now) {
    if (gesture !== candidateGesture) {
      candidateGesture = gesture;
      candidateSince = now;
    }
    if (now - candidateSince < GESTURE_STABILITY_MS || stableGesture === candidateGesture) return;

    const previousGesture = stableGesture;
    stableGesture = candidateGesture;
    return stableGesture === 'Closed_Fist' && previousGesture !== 'Closed_Fist';
  }

  function canvasPoint(normalized) {
    if (!normalized) return null;
    const sourceWidth = video?.videoWidth || width;
    const sourceHeight = video?.videoHeight || height;
    const scale = Math.max(width / sourceWidth, height / sourceHeight);
    const renderedWidth = sourceWidth * scale;
    const renderedHeight = sourceHeight * scale;
    return {
      x: normalized.x * renderedWidth + (width - renderedWidth) / 2,
      y: normalized.y * renderedHeight + (height - renderedHeight) / 2,
    };
  }

  function drawTarget(target, aiming) {
    context.save();
    context.globalAlpha = aiming ? 0.98 : 0.76;
    const glow = context.createRadialGradient(target.x, target.y, 1, target.x, target.y, target.radius * 2.2);
    glow.addColorStop(0, 'rgba(96, 244, 233, .24)');
    glow.addColorStop(0.55, 'rgba(64, 171, 239, .09)');
    glow.addColorStop(1, 'rgba(45, 123, 210, 0)');
    context.fillStyle = glow;
    context.beginPath();
    context.arc(target.x, target.y, target.radius * 2.2, 0, Math.PI * 2);
    context.fill();
    context.strokeStyle = '#72eced';
    context.lineWidth = 1.4;
    context.beginPath();
    context.arc(target.x, target.y, target.radius * 0.68, 0, Math.PI * 2);
    context.stroke();
    context.beginPath();
    context.arc(target.x, target.y, target.radius + 6, 0, Math.PI * 2);
    context.setLineDash([3, 5]);
    context.strokeStyle = 'rgba(112, 221, 249, .72)';
    context.lineWidth = 1;
    context.stroke();
    context.setLineDash([]);
    context.beginPath();
    context.arc(target.x, target.y, 2.5, 0, Math.PI * 2);
    context.fillStyle = '#d7ffff';
    context.fill();
    if (aiming) {
      context.fillStyle = '#b9ffff';
      context.beginPath();
      context.arc(target.x, target.y, target.radius + 12, 0, Math.PI * 2);
      context.strokeStyle = '#b9ffff';
      context.lineWidth = 1;
      context.stroke();
      context.beginPath();
      context.arc(target.x, target.y, 2, 0, Math.PI * 2);
      context.fill();
    }
    context.restore();
  }

  function drawOrb(point, radius, alpha, charge) {
    const aura = context.createRadialGradient(point.x, point.y, radius * 0.15, point.x, point.y, radius * 2.15);
    aura.addColorStop(0, `rgba(98, 231, 229, ${0.2 * alpha})`);
    aura.addColorStop(0.42, `rgba(58, 171, 242, ${0.1 * alpha})`);
    aura.addColorStop(1, 'rgba(40, 110, 210, 0)');
    context.fillStyle = aura;
    context.beginPath();
    context.arc(point.x, point.y, radius * 2.15, 0, Math.PI * 2);
    context.fill();

    context.globalAlpha = alpha;
    context.beginPath();
    context.arc(point.x, point.y, radius, 0, Math.PI * 2);
    context.strokeStyle = 'rgba(117, 250, 245, .9)';
    context.lineWidth = 1.5;
    context.stroke();
    context.beginPath();
    context.arc(point.x, point.y, Math.max(3, radius * 0.37), 0, Math.PI * 2);
    context.fillStyle = 'rgba(211, 255, 255, .82)';
    context.fill();

    if (charge > 0.04) {
      context.beginPath();
      context.arc(point.x, point.y, radius + 4, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * charge);
      context.strokeStyle = 'rgba(159, 255, 242, .95)';
      context.lineWidth = 2;
      context.stroke();
    }
    context.globalAlpha = 1;
  }

  function drawMotionTrail(now) {
    if (reducedMotion || trail.length < 2) return;
    context.save();
    context.lineCap = 'round';
    for (let i = 1; i < trail.length; i += 1) {
      const current = trail[i];
      const age = (now - current.time) / 460;
      const strength = (1 - age) * visibleAlpha;
      if (strength <= 0) continue;
      context.globalAlpha = strength * 0.48;
      context.strokeStyle = '#62e7e5';
      context.lineWidth = 1 + (i / trail.length) * 2;
      context.beginPath();
      context.moveTo(trail[i - 1].x, trail[i - 1].y);
      context.lineTo(current.x, current.y);
      context.stroke();
    }
    context.restore();
  }

  function drawParticles(delta) {
    for (let i = particles.length - 1; i >= 0; i -= 1) {
      const particle = particles[i];
      particle.age += delta;
      if (particle.age >= particle.life) {
        particles.splice(i, 1);
        continue;
      }
      particle.x += particle.vx * delta;
      particle.y += particle.vy * delta;
      particle.vx *= 0.985;
      particle.vy *= 0.985;
      context.globalAlpha = 1 - particle.age / particle.life;
      context.fillStyle = `rgba(${particle.color}, ${context.globalAlpha})`;
      context.beginPath();
      context.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
      context.fill();
    }
    context.globalAlpha = 1;
  }

  function drawPulses(delta, now) {
    for (let i = pulses.length - 1; i >= 0; i -= 1) {
      const pulse = pulses[i];
      const previousRadius = pulse.radius;
      if (!pulse.resolvedAt) pulse.radius += pulse.speed * delta * (reducedMotion ? 2.5 : 1);
      context.globalAlpha = pulse.resolvedAt ? clamp(1 - (now - pulse.resolvedAt) / 170, 0, 0.75) : clamp(1 - pulse.radius / pulse.maxRadius, 0.12, 0.9);
      context.beginPath();
      context.arc(pulse.x, pulse.y, pulse.radius, 0, Math.PI * 2);
      context.strokeStyle = '#78f5f2';
      context.lineWidth = 2;
      context.stroke();
      context.globalAlpha = 1;

      if (!pulse.resolvedAt && pulseTouchesTarget(previousRadius, pulse.radius, pulse.distance, pulse.target.radius)) {
        pulse.resolvedAt = now;
        const hit = getGame()?.target?.id === pulse.targetId;
        flash = { x: pulse.target.x, y: pulse.target.y, startedAt: now, hit };
        addBurst(pulse.target.x, pulse.target.y, hit ? 12 : 5);
        onPulseResult({ pulseId: pulse.id, targetId: pulse.targetId, hit });
      }
      if (!pulse.resolvedAt && pulse.radius >= pulse.maxRadius) {
        pulse.resolvedAt = now;
        flash = { x: pulse.x, y: pulse.y, startedAt: now, hit: false };
        addBurst(pulse.x, pulse.y, 5);
        onPulseResult({ pulseId: pulse.id, targetId: pulse.targetId, hit: false });
      }
      if (pulse.resolvedAt && now - pulse.resolvedAt > 190) pulses.splice(i, 1);
    }
  }

  function drawImpact(now) {
    if (!flash) return;
    const age = (now - flash.startedAt) / 260;
    if (age >= 1) {
      flash = null;
      return;
    }
    const radius = 7 + age * 32;
    context.globalAlpha = 1 - age;
    context.strokeStyle = flash.hit ? '#b9ffff' : '#82a8c8';
    context.lineWidth = 2;
    context.beginPath();
    context.arc(flash.x, flash.y, radius, 0, Math.PI * 2);
    context.stroke();
    context.fillStyle = flash.hit ? 'rgba(112, 240, 238, .18)' : 'rgba(87, 123, 156, .14)';
    context.beginPath();
    context.arc(flash.x, flash.y, radius * 0.55, 0, Math.PI * 2);
    context.fill();
    context.globalAlpha = 1;
  }

  function drawDebug(tracking) {
    context.save();
    context.globalAlpha = 0.92;
    context.fillStyle = 'rgba(7, 16, 29, .76)';
    context.fillRect(10, 10, 190, 43);
    context.font = '10px "DM Mono", monospace';
    context.fillStyle = '#62e7e5';
    const demoMode = Boolean(getDemoMode());
    context.fillText(demoMode ? 'DEMO MODE · MOUSE AIM' : `GESTURE  ${tracking.gesture || '--'}`, 18, 27);
    context.fillStyle = '#b7c8d6';
    const handText = demoMode && demoPoint
      ? `MOUSE  X ${demoPoint.x.toFixed(2)}  Y ${demoPoint.y.toFixed(2)}`
      : tracking.handVisible && tracking.position
      ? `HAND  X ${tracking.position.x.toFixed(2)}  Y ${tracking.position.y.toFixed(2)}  ${(tracking.confidence * 100).toFixed(0)}%`
      : tracking.status === 'error' ? 'TRACKING ERROR' : 'HAND  NOT DETECTED';
    context.fillText(handText, 18, 44);
    context.restore();
  }

  function render(now) {
    frameId = requestAnimationFrame(render);
    reducedMotion = Boolean(getReducedMotion());
    resize();
    if (!width || !height) return;

    const delta = previousFrame ? clamp((now - previousFrame) / 1000, 0, 0.04) : 0;
    previousFrame = now;
    const tracking = getTracking() || {};
    const game = getGame() || {};
    const isPlaying = game.status === 'playing';
    const demoMode = Boolean(getDemoMode());
    const hasRealHand = Boolean(tracking.handVisible && tracking.position);
    const hasHand = demoMode ? Boolean(demoPoint) : hasRealHand;
    const targetAlpha = hasHand ? 1 : 0;
    visibleAlpha += (targetAlpha - visibleAlpha) * (1 - Math.exp(-delta * 7));

    // Erase old pixels gradually to leave a short trail on a transparent layer.
    context.save();
    context.globalCompositeOperation = 'destination-out';
    context.fillStyle = 'rgba(0, 0, 0, .19)';
    context.fillRect(0, 0, width, height);
    context.restore();

    if (hasHand) {
      const nextPoint = canvasPoint(demoMode ? demoPoint : tracking.position);
      const follow = reducedMotion ? 1 : 1 - Math.exp(-delta * 15);
      handPoint = handPoint
        ? { x: handPoint.x + (nextPoint.x - handPoint.x) * follow, y: handPoint.y + (nextPoint.y - handPoint.y) * follow }
        : nextPoint;
    }

    const target = game.target ? {
      id: game.target.id,
      x: game.target.x * width,
      y: game.target.y * height,
      radius: game.target.radius * Math.min(width, height),
    } : null;
    const gesture = !demoMode && isPlaying && hasHand && ['Open_Palm', 'Closed_Fist', 'Pointing_Up'].includes(tracking.gesture) ? tracking.gesture : null;
    const stableTransition = trackStableGesture(gesture, now);

    if (!isPlaying) {
      stableGesture = null;
      candidateGesture = null;
      candidateSince = now;
      lastChargeAt = now;
    } else if (demoMode && hasHand) {
      if (lastChargeAt && now - lastChargeAt >= 90) onCharge(Math.min(160, now - lastChargeAt));
      lastChargeAt = now;
    } else {
      lastChargeAt = now;
    }

    if (isPlaying && demoMode && demoClicks !== handledDemoClicks && handPoint) {
      handledDemoClicks = demoClicks;
      const fired = onFirePulse();
      if (fired?.accepted && target) {
        const pulseTarget = { x: fired.pulse.target.x * width, y: fired.pulse.target.y * height, radius: fired.pulse.target.radius * Math.min(width, height) };
        pulses.push({ id: fired.pulse.id, targetId: fired.pulse.target.id, x: handPoint.x, y: handPoint.y, target: pulseTarget, distance: Math.hypot(pulseTarget.x - handPoint.x, pulseTarget.y - handPoint.y), radius: 0, maxRadius: 56 + pulseTarget.radius, speed: 560 + fired.pulse.energy * 80, resolvedAt: 0 });
        if (pulses.length > 3) pulses.shift();
      }
    }

    if (isPlaying && stableTransition && stableGesture === 'Closed_Fist' && handPoint && game.energy >= MIN_CHARGE && game.cooldownMs <= 0 && target) {
      const fired = onFirePulse();
      if (fired?.accepted) {
        const pulseTarget = {
          x: fired.pulse.target.x * width,
          y: fired.pulse.target.y * height,
          radius: fired.pulse.target.radius * Math.min(width, height),
        };
        pulses.push({
          id: fired.pulse.id,
          targetId: fired.pulse.target.id,
          x: handPoint.x,
          y: handPoint.y,
          target: pulseTarget,
          distance: Math.hypot(pulseTarget.x - handPoint.x, pulseTarget.y - handPoint.y),
          radius: 0,
          maxRadius: 56 + pulseTarget.radius,
          speed: 560 + fired.pulse.energy * 80,
          resolvedAt: 0,
        });
        if (pulses.length > 3) pulses.shift();
      }
    }

    if (hasHand && handPoint && isPlaying) {
      if (!reducedMotion && now - lastTrailAt > 34) {
        trail.push({ x: handPoint.x, y: handPoint.y, time: now });
        if (trail.length > MAX_TRAIL_POINTS) trail.shift();
        lastTrailAt = now;
      }
      if (!reducedMotion && now - lastParticleAt > 180 && particles.length < MAX_PARTICLES) {
        particles.push(makeParticle(handPoint.x + randomBetween(-3, 3), handPoint.y + randomBetween(-3, 3)));
        lastParticleAt = now;
      }
    }

    trail = trail.filter((point) => now - point.time < 500);
    drawMotionTrail(now);

    if (stableGesture === 'Pointing_Up' && handPoint && visibleAlpha > 0.03 && isPlaying) {
      context.save();
      context.globalAlpha = visibleAlpha * 0.82;
      context.strokeStyle = '#62e7e5';
      context.lineWidth = 1.4;
      context.beginPath();
      context.arc(handPoint.x, handPoint.y, 23, 0, Math.PI * 2);
      context.moveTo(handPoint.x, handPoint.y - 38);
      context.lineTo(handPoint.x, handPoint.y - 26);
      context.moveTo(handPoint.x - 5, handPoint.y - 33);
      context.lineTo(handPoint.x, handPoint.y - 38);
      context.lineTo(handPoint.x + 5, handPoint.y - 33);
      context.stroke();
      context.restore();
    }

    if (target) drawTarget(target, stableGesture === 'Pointing_Up' && visibleAlpha > 0.03 && isPlaying);
    if (isPlaying) drawPulses(delta, now);
    drawImpact(now);

    if (handPoint && visibleAlpha > 0.01) {
      const energy = isPlaying ? game.energy || 0 : 0;
      const orbRadius = 13 + energy * 20;
      drawOrb(handPoint, orbRadius, visibleAlpha, energy);
      if (stableGesture === 'Pointing_Up' && visibleAlpha > 0.03 && isPlaying) {
        context.globalAlpha = visibleAlpha;
        context.beginPath();
        context.moveTo(handPoint.x, handPoint.y + 18);
        context.lineTo(handPoint.x, handPoint.y + 29);
      context.strokeStyle = '#62e7e5';
        context.lineWidth = 1.5;
        context.stroke();
        context.globalAlpha = 1;
      }
    }

    if (isPlaying) drawParticles(delta);
    drawDebug(tracking);
  }

  frameId = requestAnimationFrame(render);
  return () => {
    cancelAnimationFrame(frameId);
    canvas.removeEventListener('pointermove', trackDemoPointer);
    canvas.removeEventListener('pointerdown', clickDemoPointer);
    resizeObserver?.disconnect();
    if (!resizeObserver) window.removeEventListener('resize', resize);
    trail = [];
    particles = [];
    pulses = [];
    context.clearRect(0, 0, canvas.width / ratio, canvas.height / ratio);
  };
}

