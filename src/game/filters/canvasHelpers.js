export const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
export const lerp = (a, b, t) => a + (b - a) * t;

export const DEFAULT_FILTER_COLORS = {
  'aura-crown': ['98, 231, 229', '84, 142, 255'],
  'energy-hands': ['98, 231, 229', '85, 183, 255'],
  'guardian-visor': ['126, 210, 255', '132, 153, 255'],
};

export function drawPolygon(ctx, points, fill, stroke, lineWidth = 1) {
  ctx.beginPath();
  points.forEach((point, index) => (index ? ctx.lineTo(point.x, point.y) : ctx.moveTo(point.x, point.y)));
  ctx.closePath();
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lineWidth;
    ctx.stroke();
  }
}

/** Maps mirrored normalized coordinates (0..1) into canvas space matching `object-fit: cover`. */
export function mapVideoPoint(canvas, width, height, point) {
  if (!point) return null;
  const video = canvas.parentElement?.querySelector('video');
  const sourceWidth = video?.videoWidth || width;
  const sourceHeight = video?.videoHeight || height;
  const scale = Math.max(width / sourceWidth, height / sourceHeight);
  return {
    x: point.x * sourceWidth * scale + (width - sourceWidth * scale) / 2,
    y: point.y * sourceHeight * scale + (height - sourceHeight * scale) / 2,
  };
}
