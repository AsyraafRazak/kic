export const ART_WIDTH = 1280;
export const ART_HEIGHT = 720;

export const DRAWING_TOOLS = [
  ['brush', 'Brush'],
  ['magic', 'Magic Ink'],
  ['eraser', 'Eraser'],
  ['circle', 'Circle'],
  ['star', 'Star'],
  ['heart', 'Heart'],
  ['line', 'Line'],
  ['rectangle', 'Rectangle'],
];

export const DRAWING_TOOL_IDS = DRAWING_TOOLS.map(([id]) => id);

/**
 * Renders one drawing or clear action onto a 2D canvas context.
 * Supports both fixed artboard pixel coordinates (`normalized: false`)
 * and 0..1 normalized live-overlay coordinates (`normalized: true`).
 */
export function renderDrawingAction(context, action, { width = ART_WIDTH, height = ART_HEIGHT, normalized = false } = {}) {
  if (!context || !action) return;
  if (action.tool === 'clear') {
    context.clearRect(0, 0, width, height);
    return;
  }
  if (normalized && !action.points?.length) return;

  const mapPoint = (point) => (normalized ? { x: point.x * width, y: point.y * height } : { x: point.x, y: point.y });
  const start = mapPoint(action.start);
  const end = mapPoint(action.end || action.start);
  const points = action.points?.length ? action.points.map(mapPoint) : [start];
  const lineWidth = normalized ? (action.size * Math.min(width, height)) / 800 : action.size;

  context.save();
  context.globalCompositeOperation = action.tool === 'eraser' ? 'destination-out' : 'source-over';
  context.strokeStyle = action.color;
  context.fillStyle = action.color;
  context.lineWidth = lineWidth;

  if (action.tool === 'magic') {
    const first = points[0];
    const last = points[points.length - 1];
    const ink = context.createLinearGradient(first.x, first.y, last.x, last.y);
    ink.addColorStop(0, action.color);
    ink.addColorStop(0.5, '#ffffff');
    ink.addColorStop(1, action.color);
    context.strokeStyle = ink;
    context.fillStyle = ink;
    context.shadowColor = action.color;
    context.shadowBlur = Math.max(normalized ? 7 : 8, lineWidth * 2.4);
  }

  context.lineCap = 'round';
  context.lineJoin = 'round';
  context.beginPath();

  if (action.tool === 'brush' || action.tool === 'magic' || action.tool === 'eraser') {
    context.moveTo(points[0].x, points[0].y);
    points.slice(1).forEach((item) => context.lineTo(item.x, item.y));
    if (points.length === 1) {
      context.arc(points[0].x, points[0].y, lineWidth / 2, 0, Math.PI * 2);
      context.fill();
    } else {
      context.stroke();
    }
  } else if (action.tool === 'line') {
    context.moveTo(start.x, start.y);
    context.lineTo(end.x, end.y);
    context.stroke();
  } else if (action.tool === 'rectangle') {
    context.strokeRect(start.x, start.y, end.x - start.x, end.y - start.y);
  } else if (action.tool === 'circle') {
    context.ellipse(
      (start.x + end.x) / 2,
      (start.y + end.y) / 2,
      Math.abs(end.x - start.x) / 2,
      Math.abs(end.y - start.y) / 2,
      0,
      0,
      Math.PI * 2,
    );
    context.stroke();
  } else if (action.tool === 'star') {
    const cx = (start.x + end.x) / 2;
    const cy = (start.y + end.y) / 2;
    const rx = Math.abs(end.x - start.x) / 2;
    const ry = Math.abs(end.y - start.y) / 2;
    for (let index = 0; index < 10; index += 1) {
      const radius = index % 2 ? 0.42 : 1;
      const angle = -Math.PI / 2 + (index * Math.PI) / 5;
      const x = cx + Math.cos(angle) * rx * radius;
      const y = cy + Math.sin(angle) * ry * radius;
      if (index === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    }
    context.closePath();
    context.stroke();
  } else if (action.tool === 'heart') {
    const left = Math.min(start.x, end.x);
    const right = Math.max(start.x, end.x);
    const top = Math.min(start.y, end.y);
    const bottom = Math.max(start.y, end.y);
    const w = right - left;
    const h = bottom - top;
    const mid = left + w / 2;
    context.moveTo(mid, bottom);
    context.bezierCurveTo(left - w * 0.08, top + h * 0.62, left + w * 0.12, top - h * 0.08, mid, top + h * 0.25);
    context.bezierCurveTo(right - w * 0.12, top - h * 0.08, right + w * 0.08, top + h * 0.62, mid, bottom);
    context.stroke();
  }

  context.restore();
}
