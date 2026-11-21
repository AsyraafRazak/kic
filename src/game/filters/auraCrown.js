import { clamp, lerp } from './canvasHelpers.js';

export function createCrownState() {
  return {
    handInfluence: 0,
    spin: 0,
    spinHoldMs: 0,
    bursts: [],
    trail: [],
    previousHand: null,
  };
}

export function clearCrownState(state) {
  state.bursts.length = 0;
  state.trail.length = 0;
  state.previousHand = null;
  state.spinHoldMs = 0;
  state.handInfluence = 0;
  state.spin = 0;
}

export function updateCrownGesture(state, { anchors, input, width, height, dt, mapPoint }) {
  const hands = input.handTracking?.hands || [];
  const fist = hands.find((item) => item.gesture === 'Closed_Fist');
  const legacyFist = input.handTracking?.gesture === 'Closed_Fist';
  const handPosition = fist?.position || (legacyFist ? input.handTracking?.position : null);
  const point = input.handTracking?.handVisible && handPosition ? mapPoint(handPosition) : null;
  const proximity = point
    ? anchors.reduce((nearest, anchor) => {
        const crownY = anchor.y - anchor.size.height * height * 0.65;
        const distance = Math.hypot(point.x - anchor.x, point.y - crownY);
        return Math.max(nearest, clamp(1 - (distance / Math.min(width, height)) * 2.8, 0, 1));
      }, 0)
    : 0;
  const active = input.faceTracking?.faceVisible && (fist || legacyFist) && proximity > 0.25;
  state.handInfluence = lerp(state.handInfluence, proximity, 1 - Math.exp(-dt * 5));
  state.spinHoldMs = active ? state.spinHoldMs + dt * 1000 : 0;
  const chargeSpeed = 1.8 + clamp(state.spinHoldMs / 1000, 0, 3) * 2.7;
  state.spin = (state.spin + (active ? dt * chargeSpeed : 0)) % (Math.PI * 2);
}

export function decayCrownState(state, dt) {
  state.spinHoldMs = 0;
  state.handInfluence = lerp(state.handInfluence, 0, 1 - Math.exp(-dt * 4));
}

export function pushCrownPulseBursts(state, { anchor, handPoint, height }) {
  if (!anchor || !handPoint) return;
  const angle = Math.atan2(handPoint.y - anchor.y, handPoint.x - anchor.x);
  for (let i = 0; i < 8 && state.bursts.length < 16; i += 1) {
    state.bursts.push({
      age: 0,
      offsetX: Math.cos(angle + (i - 3.5) * 0.23) * 9,
      offsetY: -anchor.size.height * height * 0.65 + Math.sin(angle + (i - 3.5) * 0.23) * 8,
    });
  }
}

export function updateCrownTrail(state, { anchor, hand, width, height, amount, reducedMotion, mapPoint }) {
  if (!anchor || !hand?.handVisible || !hand.position || reducedMotion) {
    state.previousHand = null;
    return;
  }
  const point = mapPoint(hand.position);
  const crownY = anchor.y - anchor.size.height * height * 0.65;
  const nearCrown = point && Math.hypot(point.x - anchor.x, point.y - crownY) < Math.min(width, height) * 0.34;
  if (!nearCrown) return;

  if (state.previousHand) {
    const moved = Math.hypot(point.x - state.previousHand.x, point.y - state.previousHand.y);
    if (moved > 2) {
      const centerY = anchor.y - anchor.size.height * height * 0.65;
      const angle = Math.atan2(point.y - centerY, point.x - anchor.x);
      const ringX = anchor.x + Math.cos(angle) * Math.min(width, height) * 0.13;
      const ringY = centerY + Math.sin(angle) * Math.min(width, height) * 0.045;
      if (state.trail.length < 32) {
        state.trail.push({ x: ringX, y: ringY, life: 0.42, max: 0.42, radius: 1.3 + amount * 1.8 });
      }
    }
  }
  state.previousHand = point;
}

export function renderCrown(ctx, state, { anchor, width, height, now, input, alpha, amount, color, dt, reducedMotion }) {
  if (!anchor || alpha < 0.01) {
    state.spinHoldMs = 0;
    return;
  }
  const { x, y, size } = anchor;
  const widthPx = clamp(size.width * width * 1.08, 60, width * 0.62);
  const charge = input.filterInteraction?.charge || 0;
  const bob = reducedMotion ? 0 : Math.sin(now * 0.0012) * 2;
  const cx = x;
  const cy = y - size.height * height * 0.65 - bob;
  const lift = state.handInfluence;
  const power = clamp(state.spinHoldMs / 1100, 0, 1);
  const rx = widthPx * (0.48 + lift * 0.035 + charge * 0.06);
  const ry = rx * (0.24 + charge * 0.035);

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(((anchor.orientation?.roll || 0) * Math.PI) / 180);
  ctx.translate(-cx, -cy);
  ctx.globalAlpha = alpha * clamp(0.12 + amount * 0.65 + charge * 0.25 + lift * 0.24, 0, 1);
  ctx.shadowColor = `rgb(${color[0]})`;
  ctx.shadowBlur = reducedMotion ? 0 : 8 + charge * 12;
  ctx.strokeStyle = `rgba(${color[0]},.96)`;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, Math.PI, Math.PI * 2);
  ctx.stroke();

  ctx.shadowBlur = 0;
  ctx.strokeStyle = `rgba(${color[1]},.86)`;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.ellipse(cx, cy + 2, rx * 0.86, ry * 0.68, 0, Math.PI, Math.PI * 2);
  ctx.stroke();

  const pts = [-1, -0.5, 0, 0.5, 1].map((v, i) => ({
    x: cx + rx * v,
    y: cy - ry * (i === 2 ? 1.1 : i % 2 ? 0.62 : 0.18),
  }));
  ctx.beginPath();
  pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
  ctx.stroke();
  ctx.lineTo(cx - rx, cy);
  ctx.closePath();

  const crownFill = ctx.createLinearGradient(cx, cy - ry, cx, cy + ry);
  crownFill.addColorStop(0, `rgba(${color[0]},.16)`);
  crownFill.addColorStop(1, `rgba(${color[1]},.025)`);
  ctx.fillStyle = crownFill;
  ctx.fill();

  for (let i = 0; i < pts.length; i += 1) {
    const jewel = pts[i];
    const jewelRadius = i === 2 ? 4.2 : 2.5;
    ctx.beginPath();
    ctx.arc(jewel.x, jewel.y + 2, jewelRadius + (i === 2 ? power : 0), 0, Math.PI * 2);
    ctx.fillStyle = i === 2 ? '#f5ffff' : `rgb(${color[1]})`;
    ctx.shadowColor = `rgb(${color[0]})`;
    ctx.shadowBlur = reducedMotion ? 0 : 6 + charge * 10;
    ctx.fill();
  }

  ctx.shadowBlur = 0;
  const orbitRadius = 1.12 + power * 0.82 + charge * 0.14;
  const orbitSpeed = reducedMotion ? 0 : 0.00045 + power * 0.0032;
  ctx.fillStyle = `rgba(${color[1]},${0.45 + amount * 0.35 + charge * 0.2})`;
  for (let i = 0; i < 10; i += 1) {
    const a = now * orbitSpeed + (i * Math.PI * 2) / 10;
    const orbitY = Math.sin(a) * ry * (1.8 + power * 0.8);
    ctx.beginPath();
    ctx.arc(cx + Math.cos(a) * rx * orbitRadius, cy + orbitY, 1.5 + amount + charge + power, 0, Math.PI * 2);
    ctx.fill();
  }

  if (power > 0.02) {
    ctx.globalAlpha *= power;
    ctx.strokeStyle = `rgba(${color[0]},.52)`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx * (1.08 + power * 0.34), ry * (1.45 + power * 0.35), 0, Math.PI, Math.PI * 2);
    ctx.stroke();
  }
  if (lift > 0.04) {
    ctx.globalAlpha *= 0.55 * lift;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx * 1.12, ry * 1.35, 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  for (let i = state.trail.length - 1; i >= 0; i -= 1) {
    const particle = state.trail[i];
    particle.life -= dt;
    if (particle.life <= 0) {
      state.trail.splice(i, 1);
      continue;
    }
    ctx.globalAlpha = alpha * amount * clamp(particle.life / particle.max, 0, 1) * 0.7;
    ctx.beginPath();
    ctx.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2);
    ctx.fill();
  }

  for (let i = state.bursts.length - 1; i >= 0; i -= 1) {
    const burst = state.bursts[i];
    burst.age += 0.016;
    if (burst.age > 0.65) {
      state.bursts.splice(i, 1);
      continue;
    }
    ctx.globalAlpha = alpha * (1 - burst.age / 0.65) * amount * 0.8;
    ctx.beginPath();
    ctx.arc(cx + burst.offsetX, cy + burst.offsetY, 1.4 + burst.age * 9, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  if (state.spinHoldMs >= 1100) {
    const laserTop = 0;
    const laserStart = cy - ry * 1.2;
    const laser = ctx.createLinearGradient(cx, laserStart, cx, laserTop);
    laser.addColorStop(0, `rgba(${color[0]},.95)`);
    laser.addColorStop(0.2, `rgba(${color[0]},.8)`);
    laser.addColorStop(1, `rgba(${color[1]},.08)`);
    ctx.save();
    ctx.globalAlpha = alpha * (0.62 + amount * 0.3);
    ctx.strokeStyle = laser;
    ctx.lineCap = 'round';
    ctx.shadowColor = `rgb(${color[0]})`;
    ctx.shadowBlur = reducedMotion ? 0 : 20;
    ctx.lineWidth = Math.max(8, widthPx * 0.035);
    ctx.beginPath();
    ctx.moveTo(cx, laserStart);
    ctx.lineTo(cx, laserTop);
    ctx.stroke();

    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(230,255,255,.96)';
    ctx.lineWidth = Math.max(2, widthPx * 0.008);
    ctx.beginPath();
    ctx.moveTo(cx, laserStart);
    ctx.lineTo(cx, laserTop);
    ctx.stroke();
    ctx.restore();
  }
}
