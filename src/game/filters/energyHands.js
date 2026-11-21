import { clamp, lerp } from './canvasHelpers.js';

export function createEnergyHandsState() {
  return {
    handAnchor: null,
    handAlpha: 0,
    particles: [],
  };
}

export function clearEnergyHandsState(state) {
  state.particles.length = 0;
  state.handAnchor = null;
  state.handAlpha = 0;
}

export function renderEnergyHands(ctx, state, { width, height, now, input, dt, alpha, amount, color, reducedMotion, mapPoint }) {
  const hand = input.handTracking;
  const charge = input.filterInteraction?.charge || 0;
  const trackedHands = (hand?.hands || []).filter((item) => (Number(item.confidence) || 0) >= 0.58).slice(0, 2);
  const handPoints = trackedHands.map((item) => mapPoint(item.position)).filter(Boolean);
  const twoHands = handPoints.length === 2;
  const centerPoint = twoHands
    ? { x: (handPoints[0].x + handPoints[1].x) / 2, y: (handPoints[0].y + handPoints[1].y) / 2 }
    : hand?.handVisible && hand.position
      ? mapPoint(hand.position)
      : null;

  let speed = 0;
  if (centerPoint) {
    if (!state.handAnchor) state.handAnchor = centerPoint;
    const previousX = state.handAnchor.x;
    const previousY = state.handAnchor.y;
    const blend = 1 - Math.exp(-dt * 12);
    state.handAnchor = {
      x: lerp(state.handAnchor.x, centerPoint.x, blend),
      y: lerp(state.handAnchor.y, centerPoint.y, blend),
    };
    speed = clamp(Math.hypot(state.handAnchor.x - previousX, state.handAnchor.y - previousY) / Math.max(dt, 0.001) / 700, 0, 1);
    state.handAlpha = lerp(state.handAlpha, 1, 1 - Math.exp(-dt * 7));
    if (!reducedMotion && Math.hypot(centerPoint.x - previousX, centerPoint.y - previousY) > 1.2) {
      const count = Math.round(1 + amount * 2 + speed * 3);
      for (let i = 0; i < count && state.particles.length < 48; i += 1) {
        state.particles.push({
          kind: 'hand',
          x: state.handAnchor.x + (Math.random() - 0.5) * 10,
          y: state.handAnchor.y + (Math.random() - 0.5) * 10,
          vx: (Math.random() - 0.5) * (20 + speed * 45),
          vy: (Math.random() - 0.5) * (20 + speed * 45) - 8,
          life: 0.45 + speed * 0.6 + Math.random() * 0.3,
          max: 1.35,
          color: i % 2 ? color[0] : color[1],
          speed,
        });
      }
    }
  } else {
    state.handAlpha = lerp(state.handAlpha, 0, 1 - Math.exp(-dt * 3));
  }

  if (!twoHands && state.handAnchor && state.handAlpha > 0.01) {
    ctx.save();
    ctx.globalAlpha = alpha * state.handAlpha * (0.08 + amount * 0.62 + charge * 0.3);
    ctx.strokeStyle = `rgba(${color[0]},.9)`;
    ctx.lineWidth = 1.5 + charge * 1.2;
    const radius = clamp(Math.min(width, height) * 0.055, 19, 44) * (1 + charge * 0.48);
    ctx.beginPath();
    ctx.arc(state.handAnchor.x, state.handAnchor.y, radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha *= 0.6;
    ctx.beginPath();
    ctx.arc(state.handAnchor.x, state.handAnchor.y, radius * 0.68, 0, Math.PI * 2);
    ctx.stroke();
    if (charge > 0) {
      ctx.fillStyle = `rgba(${color[1]},${charge * 0.2})`;
      ctx.beginPath();
      ctx.arc(state.handAnchor.x, state.handAnchor.y, radius * 0.55, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  for (let i = state.particles.length - 1; i >= 0; i -= 1) {
    const p = state.particles[i];
    p.life -= dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += 9 * dt;
    if (p.life <= 0) {
      state.particles.splice(i, 1);
      continue;
    }
    if (p.kind !== 'hand') continue;
    ctx.globalAlpha = alpha * state.handAlpha * clamp(p.life / p.max, 0, 1) * amount * (0.45 + (p.speed || 0) * 0.55);
    ctx.fillStyle = `rgb(${p.color})`;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 1 + amount * (1.2 + (p.speed || 0) * 2), 0, Math.PI * 2);
    ctx.fill();
  }

  const bothFists = trackedHands.length === 2 && trackedHands.every((item) => item.gesture === 'Closed_Fist');
  const handGap = twoHands
    ? Math.hypot(trackedHands[0].position.x - trackedHands[1].position.x, trackedHands[0].position.y - trackedHands[1].position.y)
    : Infinity;
  const chargingPalm = !twoHands && state.handAlpha > 0.01 && charge > 0.02;

  if (twoHands || chargingPalm) {
    const convergence = twoHands ? clamp(1 - handGap / 0.48, 0, 1) : charge;
    const center = twoHands ? centerPoint : state.handAnchor;
    const breath = reducedMotion ? 1 : 1 + Math.sin(now * 0.008) * 0.035;
    const radius = clamp(
      Math.min(width, height) * (0.045 + convergence * 0.085 + charge * 0.045 + (bothFists ? 0.025 : 0)) * breath,
      26,
      Math.min(width, height) * 0.2,
    );
    const rotation = reducedMotion ? 0 : now * (0.0011 + charge * 0.0018);

    ctx.save();
    ctx.translate(center.x, center.y);
    ctx.globalAlpha = alpha * (0.54 + amount * 0.38);
    ctx.shadowColor = `rgb(${color[0]})`;
    ctx.shadowBlur = reducedMotion ? 0 : 18 + charge * 26;
    const aura = ctx.createRadialGradient(0, 0, radius * 0.12, 0, 0, radius * 1.55);
    aura.addColorStop(0, 'rgba(255,255,255,.95)');
    aura.addColorStop(0.16, `rgba(${color[0]},.92)`);
    aura.addColorStop(0.48, `rgba(${color[0]},.58)`);
    aura.addColorStop(0.78, `rgba(${color[1]},.3)`);
    aura.addColorStop(1, `rgba(${color[1]},0)`);
    ctx.fillStyle = aura;
    ctx.beginPath();
    ctx.arc(0, 0, radius * 1.55, 0, Math.PI * 2);
    ctx.fill();

    const core = ctx.createRadialGradient(-radius * 0.16, -radius * 0.18, radius * 0.04, 0, 0, radius * 0.82);
    core.addColorStop(0, 'rgba(255,255,255,.98)');
    core.addColorStop(0.3, `rgba(${color[0]},.9)`);
    core.addColorStop(0.76, `rgba(${color[1]},.55)`);
    core.addColorStop(1, `rgba(${color[1]},.08)`);
    ctx.shadowBlur = reducedMotion ? 0 : 10 + charge * 16;
    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.arc(0, 0, radius * (0.78 + charge * 0.08), 0, Math.PI * 2);
    ctx.fill();

    ctx.shadowBlur = 0;
    for (let index = 0; index < 3; index += 1) {
      ctx.save();
      ctx.rotate(rotation * (index % 2 ? -1 : 1) + (index * Math.PI) / 3);
      ctx.beginPath();
      ctx.ellipse(0, 0, radius * (1.08 + index * 0.11), radius * (0.36 + index * 0.035), 0, 0.28, Math.PI * 1.82);
      ctx.strokeStyle = index === 1 ? `rgba(${color[1]},.82)` : `rgba(${color[0]},.92)`;
      ctx.lineWidth = Math.max(1.4, radius * 0.045);
      ctx.stroke();
      ctx.restore();
    }
    for (let index = 0; index < 5; index += 1) {
      const angle = rotation * 1.7 + (index * Math.PI * 2) / 5;
      const orbit = radius * (1.18 + (index % 2) * 0.14);
      ctx.beginPath();
      ctx.arc(Math.cos(angle) * orbit, Math.sin(angle) * orbit * 0.58, 1.8 + charge * 1.6, 0, Math.PI * 2);
      ctx.fillStyle = index % 2 ? `rgb(${color[0]})` : '#f3ffff';
      ctx.fill();
    }
    if (charge > 0.02) {
      ctx.beginPath();
      ctx.arc(0, 0, radius * 1.34, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * charge);
      ctx.strokeStyle = 'rgba(255,255,255,.94)';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    ctx.restore();

    if (bothFists) {
      const direction = center.x < width / 2 ? 1 : -1;
      const beamEnd = direction > 0 ? width : 0;
      const beamWidth = clamp(Math.min(width, height) * 0.2, 58, 180);
      const pulse = reducedMotion ? 0 : Math.sin(now * 0.02) * 6;
      const start = { x: center.x + direction * radius * 0.55, y: center.y };
      const endY = center.y + pulse;

      ctx.save();
      ctx.globalAlpha = alpha * (0.56 + amount * 0.4);
      const beam = ctx.createLinearGradient(start.x, start.y, beamEnd, endY);
      beam.addColorStop(0, 'rgba(221,255,255,.96)');
      beam.addColorStop(0.15, `rgba(${color[0]},.78)`);
      beam.addColorStop(1, `rgba(${color[1]},0)`);
      ctx.fillStyle = beam;
      ctx.shadowColor = `rgb(${color[0]})`;
      ctx.shadowBlur = reducedMotion ? 0 : 22;
      ctx.beginPath();
      ctx.moveTo(start.x, start.y - beamWidth * 0.16);
      ctx.lineTo(beamEnd, endY - beamWidth * 0.5);
      ctx.lineTo(beamEnd, endY + beamWidth * 0.5);
      ctx.lineTo(start.x, start.y + beamWidth * 0.16);
      ctx.closePath();
      ctx.fill();

      ctx.strokeStyle = 'rgba(224,255,255,.95)';
      ctx.lineWidth = Math.max(3, beamWidth * 0.055);
      ctx.beginPath();
      ctx.moveTo(start.x, start.y);
      ctx.lineTo(beamEnd, endY);
      ctx.stroke();
      ctx.restore();
    }
  }
}
