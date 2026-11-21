import { clamp } from './canvasHelpers.js';

export function renderCustomArtwork(ctx, customRolls, { canvas, anchor, width, height, input, alpha, dt, faceIndex = 0, mapPoint }) {
  const artwork = input.customArtwork;
  const faceArtwork = input.customFaceArtwork;
  const placement = input.customPlacement || {};
  if (!anchor || (!artwork && !faceArtwork) || alpha < 0.01) return;

  const left = mapPoint(anchor.landmarks?.[33]);
  const right = mapPoint(anchor.landmarks?.[263]);
  let targetRoll = anchor.orientation?.roll ? (anchor.orientation.roll * Math.PI) / 180 : 0;
  if (left && right) {
    targetRoll = Math.atan2(right.y - left.y, right.x - left.x);
    if (targetRoll > Math.PI / 2) targetRoll -= Math.PI;
    if (targetRoll < -Math.PI / 2) targetRoll += Math.PI;
  }

  if (!Number.isFinite(customRolls[faceIndex])) {
    customRolls[faceIndex] = targetRoll;
  } else {
    let delta = targetRoll - customRolls[faceIndex];
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    customRolls[faceIndex] += delta * (1 - Math.exp(-dt * 8));
  }

  const video = canvas.parentElement?.querySelector('video');
  const sourceWidth = video?.videoWidth || width;
  const sourceHeight = video?.videoHeight || height;
  const coverScale = Math.max(width / sourceWidth, height / sourceHeight);
  const faceWidth = anchor.size.width * sourceWidth * coverScale;
  const faceHeight = anchor.size.height * sourceHeight * coverScale;
  if (!Number.isFinite(faceWidth) || faceWidth <= 0 || !Number.isFinite(faceHeight) || faceHeight <= 0) return;

  const scale = clamp(Number(placement.scale) || 1, 0.1, 3);
  const x = anchor.x + faceWidth * (Number(placement.horizontal) || 0);
  const y = anchor.y + faceHeight * (Number(placement.vertical) || 0);
  const rotation = ((Number(placement.rotation) || 0) * Math.PI) / 180;
  const opacity = clamp(Number(placement.opacity ?? 100), 0, 100) / 100;

  ctx.save();
  ctx.globalAlpha = alpha * opacity;
  ctx.translate(x, y);
  ctx.rotate(customRolls[faceIndex] + rotation);
  if (artwork?.width && artwork.height) {
    const artworkWidth = faceWidth * scale;
    const artworkHeight = (artworkWidth * artwork.height) / artwork.width;
    try {
      ctx.drawImage(artwork, -artworkWidth / 2, -artworkHeight / 2, artworkWidth, artworkHeight);
    } catch {
      /* An unavailable canvas bitmap is ignored safely. */
    }
  }
  if (faceArtwork?.width && faceArtwork.height) {
    try {
      ctx.drawImage(faceArtwork, (-faceWidth * scale) / 2, (-faceHeight * scale) / 2, faceWidth * scale, faceHeight * scale);
    } catch {
      /* An unavailable canvas bitmap is ignored safely. */
    }
  }
  ctx.restore();
}
