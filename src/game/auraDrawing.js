/** Transparent, preview-sized artwork layer for freehand Aura Mirror drawing. */
export function resizeDrawingCanvas(canvas) {
  if (!canvas) return null;
  const rect = canvas.getBoundingClientRect();
  if (!rect.width || !rect.height) return null;
  const ratio = Math.min(2, window.devicePixelRatio || 1, 1600 / rect.width, 900 / rect.height);
  const width = Math.max(1, Math.round(rect.width * ratio));
  const height = Math.max(1, Math.round(rect.height * ratio));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  const context = canvas.getContext('2d');
  context?.setTransform(ratio, 0, 0, ratio, 0, 0);
  return { context, width: rect.width, height: rect.height };
}

export function renderAuraDrawing(canvas, strokes) {
  const size = resizeDrawingCanvas(canvas);
  if (!size?.context) return;
  const { context, width, height } = size;
  context.clearRect(0, 0, width, height);
  for (const stroke of strokes) {
    if (!stroke.points?.length) continue;
    context.save();
    context.globalCompositeOperation = stroke.tool === 'eraser' ? 'destination-out' : 'source-over';
    context.strokeStyle = stroke.color;
    context.lineWidth = stroke.size;
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.beginPath();
    const first = stroke.points[0];
    context.moveTo(first.x * width, first.y * height);
    if (stroke.points.length === 1) {
      context.lineTo(first.x * width + 0.01, first.y * height + 0.01);
    } else {
      for (let index = 1; index < stroke.points.length; index += 1) {
        const point = stroke.points[index];
        context.lineTo(point.x * width, point.y * height);
      }
    }
    context.stroke();
    context.restore();
  }
}
