const MAX_DPR = 1.5;

/** Optional landmark inspector; inference remains in useFaceTracking. */
export function startFaceDebugCanvas(canvas, video, getTracking) {
  const context = canvas?.getContext('2d', { alpha: true });
  if (!canvas || !context) return () => {};
  let width = 0;
  let height = 0;
  let ratio = 1;
  let frameId = 0;
  let lastDrawAt = 0;

  function resize() {
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    ratio = Math.min(MAX_DPR, window.devicePixelRatio || 1, 1280 / rect.width, 720 / rect.height);
    const nextWidth = Math.max(1, Math.round(rect.width * ratio));
    const nextHeight = Math.max(1, Math.round(rect.height * ratio));
    if (canvas.width === nextWidth && canvas.height === nextHeight) return;
    canvas.width = nextWidth;
    canvas.height = nextHeight;
    width = rect.width;
    height = rect.height;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
  }

  resize();
  const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(resize);
  observer?.observe(canvas);
  if (!observer) window.addEventListener('resize', resize);

  function render(now) {
    frameId = requestAnimationFrame(render);
    if (now - lastDrawAt < 40) return;
    lastDrawAt = now;
    resize();
    if (!width || !height) return;
    context.clearRect(0, 0, width, height);
    const tracking = getTracking();
    if (!tracking?.faceVisible || !tracking.landmarks?.length) return;

    const sourceWidth = video?.videoWidth || width;
    const sourceHeight = video?.videoHeight || height;
    const scale = Math.max(width / sourceWidth, height / sourceHeight);
    const renderedWidth = sourceWidth * scale;
    const renderedHeight = sourceHeight * scale;
    const offsetX = (width - renderedWidth) / 2;
    const offsetY = (height - renderedHeight) / 2;
    const toCanvas = (point) => ({
      x: point.x * renderedWidth + offsetX,
      y: point.y * renderedHeight + offsetY,
    });

    const faces = tracking.faces?.length ? tracking.faces : [tracking];
    context.save();
    faces.forEach((face, faceIndex) => {
      context.fillStyle = faceIndex % 2 ? 'rgba(126, 153, 255, .84)' : 'rgba(98, 231, 229, .84)';
      for (let index = 0; index < face.landmarks.length; index += 3) {
        const point = toCanvas(face.landmarks[index]);
        context.beginPath();
        context.arc(point.x, point.y, 1.35, 0, Math.PI * 2);
        context.fill();
      }

      if (!face.center) return;
      const center = toCanvas(face.center);
      const sizeWidth = (face.size?.width || 0) * renderedWidth;
      const sizeHeight = (face.size?.height || 0) * renderedHeight;
      context.strokeStyle = faceIndex % 2 ? '#dce2ff' : '#d7ffff';
      context.lineWidth = 1.5;
      context.setLineDash([5, 4]);
      context.beginPath();
      context.ellipse(center.x, center.y, sizeWidth / 2, sizeHeight / 2, 0, 0, Math.PI * 2);
      context.stroke();
      context.setLineDash([]);
      context.beginPath();
      context.arc(center.x, center.y, 5, 0, Math.PI * 2);
      context.fillStyle = '#ffffff';
      context.fill();
      context.beginPath();
      context.moveTo(center.x - 12, center.y);
      context.lineTo(center.x + 12, center.y);
      context.moveTo(center.x, center.y - 12);
      context.lineTo(center.x, center.y + 12);
      context.stroke();
    });
    context.restore();
  }

  frameId = requestAnimationFrame(render);
  return () => {
    cancelAnimationFrame(frameId);
    observer?.disconnect();
    if (!observer) window.removeEventListener('resize', resize);
    context.clearRect(0, 0, width, height);
  };
}
