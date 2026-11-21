import { clamp, drawPolygon } from './canvasHelpers.js';

export function renderVisor(ctx, { anchor, width, height, input, alpha, amount, color, now, transitionAt, reducedMotion, mapPoint }) {
  if (!anchor || alpha < 0.01) return;
  const landmarks = anchor.landmarks;
  const left = mapPoint(landmarks?.[33]);
  const right = mapPoint(landmarks?.[263]);
  const center =
    left && right
      ? { x: (left.x + right.x) / 2, y: (left.y + right.y) / 2 }
      : { x: anchor.x, y: anchor.y - anchor.size.height * height * 0.12 };
  const dx = left && right ? right.x - left.x : anchor.size.width * width * 0.48;
  const dy = left && right ? right.y - left.y : 0;
  const w = clamp(Math.hypot(dx, dy) * 1.48, 70, width * 0.7);
  const h = w * 0.32;
  const angle = Math.atan2(dy, dx) + (((anchor.orientation?.roll || 0) * Math.PI) / 180) * 0.24;
  const activation = clamp((now - transitionAt) / 480, 0, 1);
  const scale = 0.84 + activation * 0.16;

  const trackedHands = input.handTracking?.hands || [];
  const confidentHands = trackedHands.filter((hand) => (Number(hand.confidence) || 0) >= 0.58);
  const shieldActive = confidentHands.length >= 2 && confidentHands.slice(0, 2).every((hand) => hand.gesture === 'Open_Palm');
  const nearbyFists = confidentHands
    .filter((hand) => hand.gesture === 'Closed_Fist')
    .map((hand) => mapPoint(hand.position))
    .filter((point) => point && Math.hypot(point.x - center.x, point.y - center.y) < w * 0.72)
    .slice(0, 2);

  ctx.save();
  ctx.translate(center.x, center.y + h * 0.12);
  ctx.rotate(angle);
  ctx.scale(scale, scale);
  ctx.globalAlpha = alpha * (0.06 + amount * 0.9) * (0.72 + activation * 0.28);

  const shell = ctx.createLinearGradient(0, -h * 0.55, 0, h * 0.55);
  shell.addColorStop(0, `rgba(${color[0]},.24)`);
  shell.addColorStop(0.45, `rgba(${color[1]},.31)`);
  shell.addColorStop(1, `rgba(${color[0]},.1)`);
  drawPolygon(
    ctx,
    [
      { x: -w * 0.5, y: -h * 0.28 },
      { x: -w * 0.39, y: -h * 0.52 },
      { x: w * 0.39, y: -h * 0.52 },
      { x: w * 0.5, y: -h * 0.28 },
      { x: w * 0.43, y: h * 0.34 },
      { x: w * 0.29, y: h * 0.5 },
      { x: -w * 0.29, y: h * 0.5 },
      { x: -w * 0.43, y: h * 0.34 },
    ],
    shell,
    `rgba(${color[0]},.96)`,
    2,
  );

  ctx.strokeStyle = `rgba(${color[0]},.88)`;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(-w * 0.47, -h * 0.2);
  ctx.lineTo(-w * 0.57, -h * 0.02);
  ctx.lineTo(-w * 0.48, h * 0.08);
  ctx.moveTo(w * 0.47, -h * 0.2);
  ctx.lineTo(w * 0.57, -h * 0.02);
  ctx.lineTo(w * 0.48, h * 0.08);
  ctx.moveTo(-w * 0.38, -h * 0.17);
  ctx.lineTo(-w * 0.12, -h * 0.1);
  ctx.lineTo(0, -h * 0.13);
  ctx.lineTo(w * 0.12, -h * 0.1);
  ctx.lineTo(w * 0.38, -h * 0.17);
  ctx.stroke();

  ctx.fillStyle = `rgba(${color[0]},.16)`;
  ctx.beginPath();
  ctx.ellipse(-w * 0.2, 0, w * 0.18, h * 0.2, 0, 0, Math.PI * 2);
  ctx.ellipse(w * 0.2, 0, w * 0.18, h * 0.2, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = `rgba(${color[0]},.9)`;
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  ctx.ellipse(-w * 0.2, 0, w * 0.18, h * 0.2, 0, 0, Math.PI * 2);
  ctx.ellipse(w * 0.2, 0, w * 0.18, h * 0.2, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  if (shieldActive) {
    const pulse = reducedMotion ? 0 : Math.sin(now * 0.006) * 0.025;
    const shieldWidth = anchor.size.width * width * (0.82 + pulse);
    const shieldHeight = anchor.size.height * height * (0.78 + pulse);
    ctx.save();
    ctx.globalAlpha = alpha * (0.28 + amount * 0.42);
    ctx.translate(anchor.x, anchor.y);
    ctx.rotate(((anchor.orientation?.roll || 0) * Math.PI) / 180);
    const gradient = ctx.createRadialGradient(0, 0, shieldWidth * 0.2, 0, 0, shieldWidth);
    gradient.addColorStop(0, `rgba(${color[0]},.03)`);
    gradient.addColorStop(0.72, `rgba(${color[1]},.1)`);
    gradient.addColorStop(1, `rgba(${color[0]},.48)`);
    ctx.fillStyle = gradient;
    ctx.strokeStyle = `rgba(${color[0]},.92)`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(0, 0, shieldWidth, shieldHeight, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.globalAlpha *= 0.7;
    ctx.beginPath();
    ctx.ellipse(0, 0, shieldWidth * 0.9, shieldHeight * 0.9, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  if (nearbyFists.length) {
    ctx.save();
    ctx.globalAlpha = alpha * (0.72 + amount * 0.28);
    ctx.shadowColor = `rgb(${color[0]})`;
    ctx.shadowBlur = reducedMotion ? 0 : 18;
    ctx.lineCap = 'round';
    const sides = nearbyFists.length > 1 ? [-1, 1] : [nearbyFists[0].x < center.x ? -1 : 1];
    for (const side of sides) {
      const startX = center.x + side * w * 0.2;
      const startY = center.y + h * 0.12;
      const endX = center.x + side * width * 0.42;
      const endY = height;
      const gradient = ctx.createLinearGradient(startX, startY, endX, endY);
      gradient.addColorStop(0, `rgba(${color[0]},.96)`);
      gradient.addColorStop(0.2, `rgba(${color[0]},.78)`);
      gradient.addColorStop(1, `rgba(${color[1]},0)`);
      ctx.strokeStyle = gradient;
      ctx.lineWidth = Math.max(8, h * 0.19);
      ctx.beginPath();
      ctx.moveTo(startX, startY);
      ctx.lineTo(endX, endY);
      ctx.stroke();

      ctx.shadowBlur = 0;
      ctx.strokeStyle = 'rgba(226,255,255,.98)';
      ctx.lineWidth = Math.max(2, h * 0.045);
      ctx.beginPath();
      ctx.moveTo(startX, startY);
      ctx.lineTo(endX, endY);
      ctx.stroke();
    }
    ctx.restore();
  }
}
