import { useEffect, useRef, useState } from 'react';
import { startAuraCanvas } from '../game/auraCanvas.js';
import { isPointingPose } from '../game/pointingGesture.js';

const ART_WIDTH = 1280;
const ART_HEIGHT = 720;
const MAX_HISTORY = 60;
const EMPTY_PLACEMENT = { scale: 1, horizontal: 0, vertical: 0, rotation: 0, opacity: 100 };
const TOOLS = [
  ['brush', 'Brush'], ['magic', 'Magic Ink'], ['eraser', 'Eraser'], ['circle', 'Circle'], ['star', 'Star'],
  ['heart', 'Heart'], ['line', 'Line'], ['rectangle', 'Rectangle'],
];
const LIVE_TOOL_IDS = TOOLS.map(([id]) => id);

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function renderLiveAction(context, action, width, height) {
  if (!action.points?.length) return;
  const point = ({ x, y }) => ({ x: x * width, y: y * height });
  const start = point(action.start);
  const end = point(action.end || action.start);
  const points = action.points.map(point);
  context.save();
  context.globalCompositeOperation = action.tool === 'eraser' ? 'destination-out' : 'source-over';
  context.strokeStyle = action.color;
  context.fillStyle = action.color;
  context.lineWidth = action.size * Math.min(width, height) / 800;
  if (action.tool === 'magic') {
    const first = points[0];
    const last = points[points.length - 1];
    const ink = context.createLinearGradient(first.x, first.y, last.x, last.y);
    ink.addColorStop(0, action.color);
    ink.addColorStop(.5, '#ffffff');
    ink.addColorStop(1, action.color);
    context.strokeStyle = ink;
    context.fillStyle = ink;
    context.shadowColor = action.color;
    context.shadowBlur = Math.max(7, context.lineWidth * 2.4);
  }
  context.lineCap = 'round';
  context.lineJoin = 'round';
  context.beginPath();
  if (action.tool === 'brush' || action.tool === 'magic' || action.tool === 'eraser') {
    context.moveTo(points[0].x, points[0].y);
    points.slice(1).forEach((item) => context.lineTo(item.x, item.y));
    if (points.length === 1) {
      context.arc(points[0].x, points[0].y, context.lineWidth / 2, 0, Math.PI * 2);
      context.fill();
    } else context.stroke();
  } else if (action.tool === 'line') {
    context.moveTo(start.x, start.y); context.lineTo(end.x, end.y); context.stroke();
  } else if (action.tool === 'rectangle') {
    context.strokeRect(start.x, start.y, end.x - start.x, end.y - start.y);
  } else if (action.tool === 'circle') {
    context.ellipse((start.x + end.x) / 2, (start.y + end.y) / 2, Math.abs(end.x - start.x) / 2, Math.abs(end.y - start.y) / 2, 0, 0, Math.PI * 2);
    context.stroke();
  } else if (action.tool === 'star') {
    const cx = (start.x + end.x) / 2, cy = (start.y + end.y) / 2;
    const rx = Math.abs(end.x - start.x) / 2, ry = Math.abs(end.y - start.y) / 2;
    for (let index = 0; index < 10; index += 1) {
      const radius = index % 2 ? .42 : 1, angle = -Math.PI / 2 + index * Math.PI / 5;
      const x = cx + Math.cos(angle) * rx * radius, y = cy + Math.sin(angle) * ry * radius;
      if (index === 0) context.moveTo(x, y); else context.lineTo(x, y);
    }
    context.closePath(); context.stroke();
  } else if (action.tool === 'heart') {
    const left = Math.min(start.x, end.x), right = Math.max(start.x, end.x);
    const top = Math.min(start.y, end.y), bottom = Math.max(start.y, end.y);
    const w = right - left, h = bottom - top, mid = left + w / 2;
    context.moveTo(mid, bottom);
    context.bezierCurveTo(left - w * .08, top + h * .62, left + w * .12, top - h * .08, mid, top + h * .25);
    context.bezierCurveTo(right - w * .12, top - h * .08, right + w * .08, top + h * .62, mid, bottom);
    context.stroke();
  }
  context.restore();
}

function drawAction(context, action) {
  if (action.tool === 'clear') {
    context.clearRect(0, 0, ART_WIDTH, ART_HEIGHT);
    return;
  }
  const { x: x0, y: y0 } = action.start;
  const { x: x1, y: y1 } = action.end || action.start;
  context.save();
  context.globalCompositeOperation = action.tool === 'eraser' ? 'destination-out' : 'source-over';
  context.strokeStyle = action.color;
  context.fillStyle = action.color;
  context.lineWidth = action.size;
  if (action.tool === 'magic') {
    const points = action.points?.length ? action.points : [action.start];
    const first = points[0];
    const last = points[points.length - 1];
    const ink = context.createLinearGradient(first.x, first.y, last.x, last.y);
    ink.addColorStop(0, action.color);
    ink.addColorStop(.5, '#ffffff');
    ink.addColorStop(1, action.color);
    context.strokeStyle = ink;
    context.fillStyle = ink;
    context.shadowColor = action.color;
    context.shadowBlur = Math.max(8, action.size * 2.4);
  }
  context.lineCap = 'round';
  context.lineJoin = 'round';
  context.beginPath();

  if (action.tool === 'brush' || action.tool === 'magic' || action.tool === 'eraser') {
    const points = action.points?.length ? action.points : [action.start];
    context.moveTo(points[0].x, points[0].y);
    points.slice(1).forEach((point) => context.lineTo(point.x, point.y));
    if (points.length === 1) {
      context.arc(points[0].x, points[0].y, action.size / 2, 0, Math.PI * 2);
      context.fill();
    } else context.stroke();
  } else if (action.tool === 'line') {
    context.moveTo(x0, y0); context.lineTo(x1, y1); context.stroke();
  } else if (action.tool === 'rectangle') {
    context.strokeRect(x0, y0, x1 - x0, y1 - y0);
  } else if (action.tool === 'circle') {
    context.ellipse((x0 + x1) / 2, (y0 + y1) / 2, Math.abs(x1 - x0) / 2, Math.abs(y1 - y0) / 2, 0, 0, Math.PI * 2);
    context.stroke();
  } else if (action.tool === 'star') {
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    const rx = Math.abs(x1 - x0) / 2, ry = Math.abs(y1 - y0) / 2;
    for (let index = 0; index < 10; index += 1) {
      const radius = index % 2 ? 0.42 : 1;
      const angle = -Math.PI / 2 + index * Math.PI / 5;
      const x = cx + Math.cos(angle) * rx * radius, y = cy + Math.sin(angle) * ry * radius;
      if (index === 0) context.moveTo(x, y); else context.lineTo(x, y);
    }
    context.closePath(); context.stroke();
  } else if (action.tool === 'heart') {
    const left = Math.min(x0, x1), right = Math.max(x0, x1);
    const top = Math.min(y0, y1), bottom = Math.max(y0, y1);
    const w = right - left, h = bottom - top, mid = left + w / 2;
    context.moveTo(mid, bottom);
    context.bezierCurveTo(left - w * .08, top + h * .62, left + w * .12, top - h * .08, mid, top + h * .25);
    context.bezierCurveTo(right - w * .12, top - h * .08, right + w * .08, top + h * .62, mid, bottom);
    context.stroke();
  }
  context.restore();
}

function displayStatus(tracking, cameraState) {
  if (cameraState === 'loading') return ['CAMERA STARTING', 'Allow camera access to preview your filter.'];
  if (cameraState === 'error') return ['CAMERA UNAVAILABLE', 'Check camera permission or reconnect the webcam.'];
  if (tracking.status === 'loading' || tracking.status === 'searching') return ['LOADING FACE TRACKING', 'Preparing the local face model.'];
  if (tracking.status === 'multiple') return ['ONE FACE AT A TIME', 'Ask others to step out of the preview.'];
  if (tracking.status === 'error') return ['FACE TRACKING ERROR', tracking.error || 'Retry the camera to restart local tracking.'];
  if (tracking.faceVisible) return ['FACE DETECTED', 'Your artwork is anchored to your face.'];
  return ['FACE NOT DETECTED', 'Move into the camera frame; the filter will appear when found.'];
}

export default function FilterCreator({ cameraState, cameraError, cameraStream, videoRef, faceTracking, handTracking, reducedMotion, onBack, onRetry }) {
  const [view, setView] = useState('edit');
  const [tool, setTool] = useState('brush');
  const [color, setColor] = useState('#62e7e5');
  const [brushSize, setBrushSize] = useState(9);
  const [placement, setPlacement] = useState(EMPTY_PLACEMENT);
  const [filterName, setFilterName] = useState('My Aura Filter');
  const [clearConfirm, setClearConfirm] = useState(false);
  const [canvasError, setCanvasError] = useState('');
  const [saveMessage, setSaveMessage] = useState('');
  const [liveHint, setLiveHint] = useState('');
  const [liveDrawingMode, setLiveDrawingMode] = useState('screen');
  const [capturedPhoto, setCapturedPhoto] = useState('');
  const [photoBusy, setPhotoBusy] = useState(false);
  const [liveStrokeCount, setLiveStrokeCount] = useState(0);
  const [historyVersion, setHistoryVersion] = useState(0);
  const stageRef = useRef(null);
  const artCanvasRef = useRef(null);
  const previewCanvasRef = useRef(null);
  const previewVideoRef = useRef(null);
  const gestureVideoRef = useRef(null);
  const liveDrawCanvasRef = useRef(null);
  const artboardCursorRef = useRef(null);
  const liveCursorRef = useRef(null);
  const landmarkDotsRef = useRef([]);
  const livePointerIdRef = useRef(null);
  const drawingRef = useRef(null);
  const historyRef = useRef({ past: [], future: [] });
  const inputsRef = useRef({});
  const handTrackingRef = useRef(handTracking);
  const faceTrackingRef = useRef(faceTracking);
  const liveToolRef = useRef(tool);
  const colorRef = useRef(color);
  const brushSizeRef = useRef(brushSize);
  const liveDrawingModeRef = useRef(liveDrawingMode);
  const faceArtworkCanvasRef = useRef(null);
  const liveDrawingRef = useRef({ strokes: [], faceStrokes: [], active: null, activeTarget: null, activeSource: null });
  const liveGestureRef = useRef({ candidate: null, elapsed: 0, fired: false, drawing: false, lostMs: 0, pointingMs: 0 });

  inputsRef.current = { preset: 'custom-filter', intensity: 100, faceTracking, customArtwork: artCanvasRef.current, customFaceArtwork: faceArtworkCanvasRef.current, customPlacement: placement, handTracking };
  handTrackingRef.current = handTracking;
  faceTrackingRef.current = faceTracking;
  const getLatestFace = () => faceTrackingRef.current?.latestRef?.current || faceTrackingRef.current;
  const getLatestHand = () => handTrackingRef.current?.latestRef?.current || handTrackingRef.current;
  liveToolRef.current = tool;
  colorRef.current = color;
  brushSizeRef.current = brushSize;
  liveDrawingModeRef.current = liveDrawingMode;
  const [statusTitle, statusDetail] = displayStatus(faceTracking, cameraState);
  const hasArtwork = historyRef.current.past.reduce((exists, action) => action.tool === 'clear' ? false : true, false);
  const canUndo = historyRef.current.past.length > 0;
  const canRedo = historyRef.current.future.length > 0;

  function redrawEditor(draft = null) {
    const canvas = artCanvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;
    context.clearRect(0, 0, ART_WIDTH, ART_HEIGHT);
    historyRef.current.past.forEach((action) => drawAction(context, action));
    if (draft) drawAction(context, draft);
  }

  useEffect(() => {
    if (view === 'edit') redrawEditor();
  }, [view, historyVersion]);

  function pointFromEvent(event) {
    const rect = artCanvasRef.current?.getBoundingClientRect();
    if (!rect?.width || !rect?.height) return null;
    return {
      x: clamp((event.clientX - rect.left) / rect.width, 0, 1) * ART_WIDTH,
      y: clamp((event.clientY - rect.top) / rect.height, 0, 1) * ART_HEIGHT,
    };
  }

  function startDraw(event) {
    if (event.button !== undefined && event.button !== 0) return;
    const point = pointFromEvent(event);
    if (!point) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const activeTool = tool === 'eraser' ? 'eraser' : tool;
    drawingRef.current = { tool: activeTool, color, size: brushSize, start: point, end: point, points: [point], source: 'pointer' };
    redrawEditor(drawingRef.current);
  }

  function moveDraw(event) {
    const draft = drawingRef.current;
    if (!draft) return;
    const point = pointFromEvent(event);
    if (!point) return;
    draft.end = point;
    if (draft.tool === 'brush' || draft.tool === 'magic' || draft.tool === 'eraser') {
      const previous = draft.points[draft.points.length - 1];
      if ((point.x - previous.x) ** 2 + (point.y - previous.y) ** 2 >= 2.25) draft.points.push(point);
      if (draft.points.length > 1400) draft.points = draft.points.filter((_, index) => index % 2 === 0);
    }
    redrawEditor(draft);
  }

  function finishDraw() {
    const draft = drawingRef.current;
    if (!draft) return;
    drawingRef.current = null;
    const { past, future } = historyRef.current;
    past.push(draft);
    if (past.length > MAX_HISTORY) past.shift();
    future.length = 0;
    setHistoryVersion((version) => version + 1);
    setSaveMessage('');
  }

  function undo() {
    const history = historyRef.current;
    if (!history.past.length) return;
    history.future.push(history.past.pop());
    setHistoryVersion((version) => version + 1);
  }

  function redo() {
    const history = historyRef.current;
    if (!history.future.length) return;
    history.past.push(history.future.pop());
    setHistoryVersion((version) => version + 1);
  }

  function confirmClear() {
    historyRef.current.past.push({ tool: 'clear' });
    historyRef.current.future.length = 0;
    setHistoryVersion((version) => version + 1);
    setClearConfirm(false);
    setSaveMessage('');
  }

  function savePng() {
    const canvas = artCanvasRef.current;
    if (!canvas || !hasArtwork) {
      setCanvasError('Draw something before saving your transparent PNG.');
      return;
    }
    setCanvasError('');
    setSaveMessage('');
    try {
      canvas.toBlob((blob) => {
        if (!blob || blob.type !== 'image/png') {
          setCanvasError('The browser could not create this PNG. Try again.');
          return;
        }
        const url = URL.createObjectURL(blob);
        // eslint-disable-next-line no-control-regex
        const safeName = filterName.trim().replace(/[<>:"/\\|?*\u0000-\u001f]/g, '').replace(/\s+/g, '-').slice(0, 60) || 'my-aura-filter';
        const link = document.createElement('a');
        link.href = url;
        link.download = `${safeName}.png`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
        setSaveMessage('Transparent PNG downloaded.');
      }, 'image/png');
    } catch {
      setCanvasError('This drawing could not be exported. Try clearing the canvas and drawing again.');
    }
  }

  function resetPlacement() {
    setPlacement(EMPTY_PLACEMENT);
  }

  function livePointFromEvent(event) {
    const rect = liveDrawCanvasRef.current?.getBoundingClientRect();
    if (!rect?.width || !rect?.height) return null;
    return { x: clamp((event.clientX - rect.left) / rect.width, 0, 1), y: clamp((event.clientY - rect.top) / rect.height, 0, 1) };
  }

  function videoPointToElement(point, element, video = videoRef.current) {
    const rect = element?.getBoundingClientRect();
    if (!rect?.width || !rect?.height || !video?.videoWidth || !video?.videoHeight) return point;
    const scale = Math.max(rect.width / video.videoWidth, rect.height / video.videoHeight);
    const videoWidth = video.videoWidth * scale;
    const videoHeight = video.videoHeight * scale;
    return {
      x: clamp((point.x * videoWidth + (rect.width - videoWidth) / 2) / rect.width, 0, 1),
      y: clamp((point.y * videoHeight + (rect.height - videoHeight) / 2) / rect.height, 0, 1),
    };
  }

  function cameraPoint(handPoint) {
    return videoPointToElement(handPoint, gestureVideoRef.current?.parentElement, gestureVideoRef.current);
  }

  function videoPointToStage(point) {
    return videoPointToElement(point, stageRef.current);
  }

  function stagePointToFace(point) {
    const rect = stageRef.current?.getBoundingClientRect();
    const video = videoRef.current;
    const face = getLatestFace();
    if (!rect?.width || !rect?.height || !video?.videoWidth || !video?.videoHeight || !face?.faceVisible || !face.center || !face.size?.width || !face.size?.height) return null;
    const scale = Math.max(rect.width / video.videoWidth, rect.height / video.videoHeight);
    const renderedWidth = video.videoWidth * scale;
    const renderedHeight = video.videoHeight * scale;
    const videoPoint = {
      x: (point.x * rect.width - (rect.width - renderedWidth) / 2) / renderedWidth,
      y: (point.y * rect.height - (rect.height - renderedHeight) / 2) / renderedHeight,
    };
    return {
      x: clamp((videoPoint.x - face.center.x) / face.size.width + .5, 0, 1),
      y: clamp((videoPoint.y - face.center.y) / face.size.height + .5, 0, 1),
    };
  }

  function renderLiveDrawing() {
    const canvas = liveDrawCanvasRef.current;
    const rect = canvas?.getBoundingClientRect();
    if (canvas && rect?.width && rect?.height) {
      const context = canvas.getContext('2d');
      if (context) {
        const ratio = Math.min(2, window.devicePixelRatio || 1, 1600 / rect.width, 900 / rect.height);
        const width = Math.max(1, Math.round(rect.width * ratio));
        const height = Math.max(1, Math.round(rect.height * ratio));
        if (canvas.width !== width || canvas.height !== height) {
          canvas.width = width;
          canvas.height = height;
        }
        context.setTransform(ratio, 0, 0, ratio, 0, 0);
        context.clearRect(0, 0, rect.width, rect.height);
        liveDrawingRef.current.strokes.forEach((action) => renderLiveAction(context, action, rect.width, rect.height));
        if (liveDrawingRef.current.activeTarget === 'screen' && liveDrawingRef.current.active) {
          renderLiveAction(context, liveDrawingRef.current.active, rect.width, rect.height);
        }
      }
    }

    if (!faceArtworkCanvasRef.current) {
      faceArtworkCanvasRef.current = document.createElement('canvas');
      faceArtworkCanvasRef.current.width = ART_WIDTH;
      faceArtworkCanvasRef.current.height = ART_HEIGHT;
    }
    const faceCanvas = faceArtworkCanvasRef.current;
    const faceContext = faceCanvas.getContext('2d');
    if (faceContext) {
      faceContext.clearRect(0, 0, ART_WIDTH, ART_HEIGHT);
      liveDrawingRef.current.faceStrokes.forEach((action) => renderLiveAction(faceContext, action, ART_WIDTH, ART_HEIGHT));
      if (liveDrawingRef.current.activeTarget === 'face' && liveDrawingRef.current.active) {
        renderLiveAction(faceContext, liveDrawingRef.current.active, ART_WIDTH, ART_HEIGHT);
      }
      inputsRef.current.customFaceArtwork = faceCanvas;
    }
  }

  function beginLiveStroke(point, target = liveDrawingModeRef.current, source = 'gesture') {
    if (!point || capturedPhoto) return;
    const stagePoint = source === 'pointer' ? point : videoPointToStage(point);
    const normalizedPoint = target === 'face' ? stagePointToFace(stagePoint) : stagePoint;
    if (!normalizedPoint) {
      setLiveHint('Face tracking is needed for face-follow drawing.');
      return;
    }
    const active = { tool: liveToolRef.current, color: colorRef.current, size: brushSizeRef.current, start: normalizedPoint, end: normalizedPoint, points: [normalizedPoint] };
    liveDrawingRef.current.active = active;
    liveDrawingRef.current.activeTarget = target;
    liveDrawingRef.current.activeSource = source;
    renderLiveDrawing();
  }

  function extendLiveStroke(point, source = 'gesture') {
    const active = liveDrawingRef.current.active;
    if (!active || !point || liveDrawingRef.current.activeSource !== source) return;
    const stagePoint = source === 'pointer' ? point : videoPointToStage(point);
    const normalizedPoint = liveDrawingRef.current.activeTarget === 'face' ? stagePointToFace(stagePoint) : stagePoint;
    if (!normalizedPoint) return;
    active.end = normalizedPoint;
    if (active.tool === 'brush' || active.tool === 'magic' || active.tool === 'eraser') {
      const previous = active.points[active.points.length - 1];
      if ((normalizedPoint.x - previous.x) ** 2 + (normalizedPoint.y - previous.y) ** 2 > .000003) active.points.push(normalizedPoint);
      if (active.points.length > 1400) active.points = active.points.filter((_, index) => index % 2 === 0);
    } else if (active.points.length === 1) active.points.push(normalizedPoint);
    renderLiveDrawing();
  }

  function finishLiveStroke(source) {
    const active = liveDrawingRef.current.active;
    if (!active || (source && liveDrawingRef.current.activeSource !== source)) return;
    liveDrawingRef.current.active = null;
    const target = liveDrawingRef.current.activeTarget;
    if (target === 'face') liveDrawingRef.current.faceStrokes.push(active);
    else liveDrawingRef.current.strokes.push(active);
    liveDrawingRef.current.activeTarget = null;
    liveDrawingRef.current.activeSource = null;
    if (liveDrawingRef.current.strokes.length > MAX_HISTORY) liveDrawingRef.current.strokes.shift();
    if (liveDrawingRef.current.faceStrokes.length > MAX_HISTORY) liveDrawingRef.current.faceStrokes.shift();
    setLiveStrokeCount(liveDrawingRef.current.strokes.length + liveDrawingRef.current.faceStrokes.length);
    renderLiveDrawing();
  }

  function startLivePointer(event) {
    if (event.button !== undefined && event.button !== 0) return;
    if (livePointerIdRef.current !== null) return;
    const point = livePointFromEvent(event);
    if (!point) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    livePointerIdRef.current = event.pointerId;
    beginLiveStroke(point, liveDrawingModeRef.current, 'pointer');
  }

  function moveLivePointer(event) {
    extendLiveStroke(livePointFromEvent(event), 'pointer');
  }

  function finishLivePointer(event) {
    if (livePointerIdRef.current !== event.pointerId) return;
    livePointerIdRef.current = null;
    finishLiveStroke('pointer');
  }

  function beginArtGesture(point) {
    if (drawingRef.current || capturedPhoto) return;
    const pixelPoint = { x: point.x * ART_WIDTH, y: point.y * ART_HEIGHT };
    drawingRef.current = { tool: liveToolRef.current, color: colorRef.current, size: brushSizeRef.current, start: pixelPoint, end: pixelPoint, points: [pixelPoint], source: 'gesture' };
    redrawEditor(drawingRef.current);
  }

  function extendArtGesture(point) {
    const draft = drawingRef.current;
    if (!draft) return;
    const pixelPoint = { x: point.x * ART_WIDTH, y: point.y * ART_HEIGHT };
    draft.end = pixelPoint;
    if (draft.tool === 'brush' || draft.tool === 'magic' || draft.tool === 'eraser') {
      const previous = draft.points[draft.points.length - 1];
      if ((pixelPoint.x - previous.x) ** 2 + (pixelPoint.y - previous.y) ** 2 >= 2.25) draft.points.push(pixelPoint);
      if (draft.points.length > 1400) draft.points = draft.points.filter((_, index) => index % 2 === 0);
    } else if (draft.points.length === 1) draft.points.push(pixelPoint);
    redrawEditor(draft);
  }

  function finishGestureStroke() {
    if (view === 'edit') {
      if (drawingRef.current?.source === 'gesture') finishDraw();
    }
    else finishLiveStroke('gesture');
  }

  function setDrawingMode(mode) {
    if (liveDrawingRef.current.active) finishLiveStroke();
    liveDrawingModeRef.current = mode;
    setLiveDrawingMode(mode);
    setLiveHint(mode === 'face' ? 'New live strokes follow your face.' : 'New live strokes stay fixed on the camera preview.');
  }

  function clearLiveDrawing() {
    liveDrawingRef.current = { strokes: [], faceStrokes: [], active: null, activeTarget: null, activeSource: null };
    liveGestureRef.current.drawing = false;
    setLiveStrokeCount(0);
    renderLiveDrawing();
    setLiveHint('Live drawing cleared.');
  }

  function cycleLiveTool(direction) {
    const index = LIVE_TOOL_IDS.indexOf(liveToolRef.current);
    const next = LIVE_TOOL_IDS[(index + direction + LIVE_TOOL_IDS.length) % LIVE_TOOL_IDS.length];
    liveToolRef.current = next;
    setTool(next);
    setLiveHint(`${TOOLS.find(([id]) => id === next)?.[1]} selected.`);
  }

  function stopLivePhoto() {
    if (capturedPhoto) URL.revokeObjectURL(capturedPhoto);
    setCapturedPhoto('');
  }

  async function captureLivePhoto() {
    if (photoBusy) return;
    if (liveDrawingRef.current.active) finishLiveStroke();
    const stage = stageRef.current;
    const video = previewVideoRef.current;
    const filterCanvas = previewCanvasRef.current;
    const drawingCanvas = liveDrawCanvasRef.current;
    if (!stage || !video || !filterCanvas || !drawingCanvas || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || !video.videoWidth || !video.videoHeight) {
      setCanvasError('The camera frame is not ready yet. Wait a moment and try again.');
      return;
    }
    setPhotoBusy(true);
    try {
      const rect = stage.getBoundingClientRect();
      const aspect = rect.width / rect.height;
      const width = Math.min(1920, Math.max(640, video.videoWidth));
      const height = Math.round(width / aspect);
      const photo = document.createElement('canvas');
      photo.width = width;
      photo.height = height;
      const context = photo.getContext('2d');
      if (!context) throw new Error('Photo capture is unavailable in this browser.');
      let sx = 0, sy = 0, sw = video.videoWidth, sh = video.videoHeight;
      if (sw / sh > aspect) { sw = sh * aspect; sx = (video.videoWidth - sw) / 2; }
      else { sh = sw / aspect; sy = (video.videoHeight - sh) / 2; }
      context.save();
      context.translate(width, 0);
      context.scale(-1, 1);
      context.drawImage(video, sx, sy, sw, sh, 0, 0, width, height);
      context.restore();
      context.drawImage(filterCanvas, 0, 0, width, height);
      context.drawImage(drawingCanvas, 0, 0, width, height);
      const blob = await new Promise((resolve, reject) => photo.toBlob((result) => result ? resolve(result) : reject(new Error('The browser could not encode this photo. Try again.')), 'image/jpeg', .92));
      stopLivePhoto();
      setCapturedPhoto(URL.createObjectURL(blob));
      setCanvasError('');
    } catch (error) {
      setCanvasError(error?.message || 'Photo capture failed. Please try again.');
    } finally {
      setPhotoBusy(false);
    }
  }

  function downloadLivePhoto() {
    if (!capturedPhoto) return;
    const link = document.createElement('a');
    link.href = capturedPhoto;
    link.download = `iqra-filter-creator-${new Date().toISOString().replace(/[:.]/g, '-')}.jpg`;
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  useEffect(() => {
    if (cameraState !== 'ready' || capturedPhoto) return undefined;
    let previousAt = performance.now();
    const timer = window.setInterval(() => {
      const now = performance.now();
      const dt = Math.min(100, now - previousAt);
      previousAt = now;
      const hand = getLatestHand();
      const gestureState = liveGestureRef.current;
      const hands = hand?.hands || [];
      const drawingHandIndex = hands.findIndex(isPointingPose);
      const gesture = hand?.handVisible && (Number(hand.confidence) || 0) >= .62 ? hand.gesture : null;
      if (drawingHandIndex >= 0) {
        gestureState.candidate = null;
        gestureState.elapsed = 0;
        gestureState.fired = false;
        gestureState.lostMs = 0;
        gestureState.pointingMs += dt;
        const drawingHand = hands[drawingHandIndex];
        const rawPoint = drawingHand.indexTip || drawingHand.landmarks?.[8];
        if (gestureState.pointingMs >= 120 && view === 'edit') {
          const point = rawPoint ? videoPointToElement(rawPoint, artCanvasRef.current) : null;
          if (drawingRef.current?.source === 'pointer') gestureState.drawing = false;
          else if (point) {
            if (!gestureState.drawing) beginArtGesture(point);
            else extendArtGesture(point);
            gestureState.drawing = drawingRef.current?.source === 'gesture';
          }
        } else if (gestureState.pointingMs >= 120 && liveDrawingRef.current.activeSource !== 'pointer' && rawPoint) {
          if (!gestureState.drawing) beginLiveStroke(rawPoint, liveDrawingModeRef.current, 'gesture');
          else extendLiveStroke(rawPoint, 'gesture');
          gestureState.drawing = liveDrawingRef.current.activeSource === 'gesture';
        }
      } else if (gesture === 'Thumb_Up' || gesture === 'Thumb_Down') {
        gestureState.pointingMs = 0;
        gestureState.lostMs = 0;
        if (gestureState.candidate === gesture) gestureState.elapsed += dt;
        else { gestureState.candidate = gesture; gestureState.elapsed = dt; gestureState.fired = false; }
        if (gestureState.elapsed >= 420 && !gestureState.fired) {
          cycleLiveTool(gesture === 'Thumb_Up' ? 1 : -1);
          gestureState.fired = true;
        }
        if (gestureState.drawing) finishGestureStroke();
        gestureState.drawing = false;
      } else {
        gestureState.pointingMs = 0;
        gestureState.candidate = null;
        gestureState.elapsed = 0;
        gestureState.fired = false;
        if (gestureState.drawing) finishGestureStroke();
        gestureState.drawing = false;
        gestureState.lostMs = 0;
      }
    }, 50);
    return () => {
      window.clearInterval(timer);
      if (liveGestureRef.current.drawing) finishGestureStroke();
      liveGestureRef.current = { candidate: null, elapsed: 0, fired: false, drawing: false, lostMs: 0, pointingMs: 0 };
    };
  }, [view, cameraState, capturedPhoto]);

  useEffect(() => {
    if (!cameraStream) return;
    [videoRef.current, gestureVideoRef.current, previewVideoRef.current].forEach((video) => {
      if (!video || video.srcObject === cameraStream) return;
      video.srcObject = cameraStream;
      video.play().catch(() => {});
    });
  }, [cameraStream, cameraState, view, videoRef]);

  useEffect(() => {
    if (view !== 'preview' || capturedPhoto) return undefined;
    renderLiveDrawing();
    const canvas = liveDrawCanvasRef.current;
    if (!canvas) return undefined;
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(renderLiveDrawing);
    observer?.observe(canvas);
    if (!observer) window.addEventListener('resize', renderLiveDrawing);
    return () => {
      observer?.disconnect();
      if (!observer) window.removeEventListener('resize', renderLiveDrawing);
    };
  }, [view, capturedPhoto]);

  useEffect(() => () => {
    if (capturedPhoto) URL.revokeObjectURL(capturedPhoto);
  }, [capturedPhoto]);

  useEffect(() => {
    if (view !== 'preview' || cameraState !== 'ready') return undefined;
    return startAuraCanvas(
      previewCanvasRef.current,
      () => ({ ...inputsRef.current, faceTracking: getLatestFace(), handTracking: getLatestHand() }),
      reducedMotion,
    );
  }, [view, cameraState, reducedMotion]);

  useEffect(() => {
    const hideOverlays = () => {
      if (artboardCursorRef.current) artboardCursorRef.current.style.display = 'none';
      if (liveCursorRef.current) liveCursorRef.current.style.display = 'none';
      landmarkDotsRef.current.forEach((dot) => {
        if (dot) dot.style.display = 'none';
      });
    };

    if (cameraState !== 'ready' || capturedPhoto) {
      hideOverlays();
      return undefined;
    }

    let frameId = 0;
    const syncOverlays = () => {
      frameId = requestAnimationFrame(syncOverlays);
      const latestHand = getLatestHand();
      const hands = latestHand?.hands || [];
      const pointing = hands.find(isPointingPose);
      const cursorHand = pointing || hands[0];
      const tip = cursorHand?.indexTip || cursorHand?.landmarks?.[8] || null;
      const isPointing = Boolean(pointing);

      if (artboardCursorRef.current) {
        if (view === 'edit' && tip) {
          const pos = videoPointToElement(tip, artCanvasRef.current);
          artboardCursorRef.current.style.display = 'block';
          artboardCursorRef.current.style.left = `${pos.x * 100}%`;
          artboardCursorRef.current.style.top = `${pos.y * 100}%`;
          artboardCursorRef.current.classList.toggle('drawing', isPointing);
        } else {
          artboardCursorRef.current.style.display = 'none';
        }
      }

      if (liveCursorRef.current) {
        if (view === 'preview' && tip) {
          const pos = videoPointToStage(tip);
          liveCursorRef.current.style.display = 'block';
          liveCursorRef.current.style.left = `${pos.x * 100}%`;
          liveCursorRef.current.style.top = `${pos.y * 100}%`;
          liveCursorRef.current.classList.toggle('drawing', isPointing);
        } else {
          liveCursorRef.current.style.display = 'none';
        }
      }

      const firstLandmarks = view === 'edit' ? hands[0]?.landmarks : null;
      for (let index = 0; index < 21; index += 1) {
        const dot = landmarkDotsRef.current[index];
        if (!dot) continue;
        const landmark = firstLandmarks?.[index];
        if (!landmark) {
          dot.style.display = 'none';
        } else {
          const point = cameraPoint(landmark);
          dot.style.display = 'block';
          dot.style.left = `${point.x * 100}%`;
          dot.style.top = `${point.y * 100}%`;
        }
      }
    };

    frameId = requestAnimationFrame(syncOverlays);
    return () => {
      cancelAnimationFrame(frameId);
      hideOverlays();
    };
  }, [cameraState, view, capturedPhoto]);

  return <section className={`filter-creator-screen ${view === 'edit' ? 'editing-design' : 'previewing-design'}`}>
    <video ref={videoRef} autoPlay muted playsInline className="filter-tracking-video" aria-hidden="true" />
    <div className="filter-creator-heading">
      <div><span className="eyebrow"><i /> KELAB IQRA CREATIVE STUDIO</span><h1>Filter <em>Creator</em></h1><p>Draw a transparent face filter, then position it on your live preview.</p></div>
      <div className="filter-creator-heading-actions"><button className="outline-button" onClick={onBack}>← Back to experiences</button></div>
    </div>

    <div className="filter-creator-tabs" role="tablist" aria-label="Filter Creator steps">
      <button role="tab" aria-selected={view === 'edit'} className={view === 'edit' ? 'active' : ''} onClick={() => setView('edit')}>01 · EDIT DESIGN</button>
      <button role="tab" aria-selected={view === 'preview'} className={view === 'preview' ? 'active' : ''} onClick={() => setView('preview')}>02 · PREVIEW ON FACE</button>
      <span>ARTWORK STAYS IN THIS BROWSER</span>
    </div>
    {view === 'edit' && <div className={`filter-camera-notice ${cameraState === 'error' || faceTracking.status === 'error' ? 'error' : ''}`} role="status"><b>{cameraState === 'error' ? 'CAMERA PERMISSION NEEDED' : statusTitle}</b><span>{cameraState === 'error' ? cameraError || statusDetail : statusDetail}</span>{(cameraState === 'error' || faceTracking.status === 'error') && <button className="outline-button" onClick={onRetry}>Retry camera & tracking</button>}</div>}

    <div className="filter-creator-layout">
      <div className={`filter-editor-panel ${view === 'edit' ? '' : 'is-hidden'}`}>
        <div className="filter-panel-top"><div><span className="eyebrow">TRANSPARENT ARTBOARD</span><small>Point with your index finger to draw; keep the other fingers folded and relax your hand to stop. Mouse/touch drag also works.</small></div><div className="filter-history-actions"><button className="outline-button" onClick={undo} disabled={!canUndo} aria-label="Undo stroke">↶ Undo</button><button className="outline-button" onClick={redo} disabled={!canRedo} aria-label="Redo stroke">↷ Redo</button></div></div>
        <div className="filter-artboard-wrap">
          <div className="filter-artboard-guide"><span className="filter-face-guide" /><span className="filter-artboard-center" /></div>
          <canvas ref={artCanvasRef} className="filter-artboard" width={ART_WIDTH} height={ART_HEIGHT} aria-label="Transparent filter drawing canvas" onPointerDown={startDraw} onPointerMove={moveDraw} onPointerUp={finishDraw} onPointerCancel={finishDraw} />
          <span ref={artboardCursorRef} className="filter-hand-cursor artboard-hand-cursor" style={{ display: 'none' }} aria-hidden="true" />
          {!hasArtwork && <span className="filter-artboard-hint" aria-hidden="true">DRAW YOUR FILTER</span>}
        </div>
        <div className="filter-editor-footer"><span>PNG · {ART_WIDTH} × {ART_HEIGHT} · TRANSPARENT</span><span>{handTracking?.status === 'error' ? 'HAND TRACKING ERROR' : handTracking?.handVisible ? `${handTracking.gesture?.replaceAll('_', ' ') || 'HAND DETECTED'} · POINT TO DRAW · THUMBS TO CHANGE TOOLS` : 'POINT TO DRAW · THUMBS TO CHANGE TOOLS'}</span><span>{historyRef.current.past.length} ACTION{historyRef.current.past.length === 1 ? '' : 'S'}</span></div>
      </div>

      <aside className={`filter-tools-panel ${view === 'edit' ? '' : 'is-hidden'}`}>
        <div className="filter-tools-heading"><span className="eyebrow">DRAWING TOOLS</span><h2>Create your<br /><em>aura.</em></h2></div>
        <div className={`filter-gesture-camera ${cameraState === 'ready' ? '' : 'unavailable'}`} aria-label="Live gesture drawing preview">
          {cameraState === 'ready' && <video ref={gestureVideoRef} autoPlay muted playsInline className="filter-gesture-video" />}
          <div className="filter-gesture-camera-overlay">
            {Array.from({ length: 21 }, (_, index) => (
              <i
                key={index}
                ref={(element) => { landmarkDotsRef.current[index] = element; }}
                className={`filter-gesture-landmark ${index === 8 ? 'drawing-tip' : ''}`}
                style={{ display: 'none' }}
              />
            ))}
          </div>
          <span className={`filter-gesture-status ${handTracking?.pointingActive ? 'drawing' : ''}`}>
            {cameraState !== 'ready' ? cameraState === 'error' ? 'CAMERA UNAVAILABLE' : 'STARTING CAMERA'
              : handTracking?.status === 'error' ? 'HAND TRACKING ERROR'
                : handTracking?.pointingActive ? 'POINTING · DRAWING'
                  : handTracking?.handVisible ? `${handTracking.gesture?.replaceAll('_', ' ') || 'HAND DETECTED'} · POINT TO DRAW` : 'SHOW HAND · POINT TO DRAW'}
          </span>
        </div>
        <div className="filter-tool-grid" role="group" aria-label="Drawing tools">{TOOLS.map(([id, label]) => <button key={id} className={tool === id ? 'selected' : ''} onClick={() => setTool(id)} aria-pressed={tool === id}><span>{id === 'brush' ? '✎' : id === 'magic' ? '✦' : id === 'eraser' ? '⌫' : id === 'circle' ? '◯' : id === 'star' ? '☆' : id === 'heart' ? '♡' : id === 'line' ? '／' : '□'}</span>{label}</button>)}</div>
        <label className="filter-color-control"><span>Brush color</span><input type="color" value={color} onChange={(event) => setColor(event.target.value)} disabled={tool === 'eraser'} /></label>
        <label className="filter-range-control"><span>Brush size <b>{brushSize}px</b></span><input type="range" min="2" max="42" value={brushSize} onChange={(event) => setBrushSize(Number(event.target.value))} /></label>
        <div className="filter-editor-buttons"><button className="outline-button" onClick={() => setClearConfirm(true)} disabled={!hasArtwork}>Clear canvas</button><button className="outline-button" onClick={resetPlacement}>Reset placement</button></div>
        <label className="filter-name-control"><span>Filter name</span><input type="text" maxLength={48} value={filterName} onChange={(event) => setFilterName(event.target.value)} placeholder="Name your creation" /></label>
        <div className="filter-primary-actions"><button className="primary-button" onClick={() => { setView('preview'); setCanvasError(''); }}>Preview on face <span>↗</span></button><button className="outline-button" onClick={savePng}>Save transparent PNG</button></div>
      </aside>

      <div className={`filter-preview-panel ${view === 'preview' ? '' : 'is-hidden'}`}>
        <div className="filter-preview-stage" ref={stageRef}>
          <video ref={previewVideoRef} autoPlay muted playsInline className="filter-preview-video" />
          <canvas ref={previewCanvasRef} className="filter-preview-canvas" aria-label="Custom drawing anchored to the detected face" />
          {!capturedPhoto && <canvas ref={liveDrawCanvasRef} className="filter-live-drawing-canvas" aria-label="Draw directly over the live camera preview" onPointerDown={startLivePointer} onPointerMove={moveLivePointer} onPointerUp={finishLivePointer} onPointerCancel={finishLivePointer} onLostPointerCapture={finishLivePointer} />}
          <span ref={liveCursorRef} className="filter-hand-cursor live-hand-cursor" style={{ display: 'none' }} aria-hidden="true" />
          {capturedPhoto && <img className="filter-live-captured-photo" src={capturedPhoto} alt="Captured filter drawing photo" />}
          <div className="filter-preview-frame-overlay"><span className="frame-corner tl" /><span className="frame-corner tr" /><span className="frame-corner bl" /><span className="frame-corner br" /><span className="filter-preview-label">{filterName || 'UNTITLED FILTER'} · LOCAL PREVIEW</span></div>
          {!capturedPhoto && cameraState === 'ready' && <div className="filter-live-toolbar" aria-label="Live drawing tool selection">
            <span>LIVE TOOL · <b>{TOOLS.find(([id]) => id === tool)?.[1].toUpperCase()}</b></span>
            <button className="outline-button" onClick={() => cycleLiveTool(-1)} aria-label="Select previous drawing tool">‹</button>
            <button className="outline-button" onClick={() => cycleLiveTool(1)} aria-label="Select next drawing tool">›</button>
            <button className="outline-button" onClick={clearLiveDrawing} disabled={!liveStrokeCount}>Clear</button>
          </div>}
          {capturedPhoto && <div className="filter-live-toolbar"><span>PHOTO CAPTURED · {liveStrokeCount} LIVE STROKE{liveStrokeCount === 1 ? '' : 'S'}</span></div>}
          {cameraState !== 'ready' && <div className="filter-preview-message"><b>{cameraState === 'error' ? 'Camera unavailable' : 'Starting camera'}</b><p>{cameraError || 'Allow camera access to preview your artwork.'}</p>{cameraState === 'error' && <button className="primary-button" onClick={onRetry}>Retry camera</button>}</div>}
          {!capturedPhoto && cameraState === 'ready' && <div className={`filter-face-status ${faceTracking.faceVisible ? 'detected' : ''}`} role="status"><i />{statusTitle}<small>{faceTracking.faceVisible ? 'FILTER ATTACHED' : statusDetail}</small>{faceTracking.status === 'error' && <button className="filter-tracking-retry" onClick={onRetry}>Retry tracking</button>}</div>}
        </div>
        <aside className="filter-placement-panel">
          <div className="filter-tools-heading"><span className="eyebrow">LIVE FACE PREVIEW</span><h2>Fine-tune<br /><em>placement.</em></h2><p>The face filter follows your head. Point with your index finger and fold the others to draw; the fingertip cursor is shown on the canvas. Mouse and touchscreen drawing also work.</p></div>
          <div className="filter-live-instructions"><b>LIVE DRAWING CONTROLS</b><span>Point with your index finger and fold the other fingers to draw · relax your hand to stop · Thumb_Up / Thumb_Down to cycle tools · Mouse or touchscreen drag also draws.</span><small>{liveHint || (handTracking?.status === 'error' ? handTracking.error : handTracking?.status === 'loading' ? 'Loading the local hand tracker.' : handTracking?.handVisible ? `Hand detected${handTracking.gesture ? ` · ${handTracking.gesture.replaceAll('_', ' ')}` : ''}. Point to draw. Select color and size in Edit Design.` : 'Show a hand and point with your index finger to draw. Mouse and touchscreen drawing remain available.')}</small></div>
          <div className="filter-live-mode-control" role="group" aria-label="Live drawing placement">
            <b>LIVE DRAWING PLACEMENT</b>
            <button className={liveDrawingMode === 'face' ? 'selected' : ''} onClick={() => setDrawingMode('face')} aria-pressed={liveDrawingMode === 'face'}>Follow my face</button>
            <button className={liveDrawingMode === 'screen' ? 'selected' : ''} onClick={() => setDrawingMode('screen')} aria-pressed={liveDrawingMode === 'screen'}>Stay on camera</button>
            <small>{liveDrawingMode === 'face' ? 'New strokes move with your face.' : 'New strokes stay fixed in the camera frame.'}</small>
          </div>
          {[
            ['scale', 'Filter scale', .45, 1.8, .01, `${placement.scale.toFixed(2)}×`],
            ['horizontal', 'Horizontal position', -.7, .7, .01, `${Math.round(placement.horizontal * 100)}%`],
            ['vertical', 'Vertical position', -.8, .8, .01, `${Math.round(placement.vertical * 100)}%`],
            ['rotation', 'Rotation', -45, 45, 1, `${placement.rotation}°`],
            ['opacity', 'Opacity', 20, 100, 1, `${placement.opacity}%`],
          ].map(([key, label, min, max, step, value]) => <label className="filter-range-control" key={key}><span>{label}<b>{value}</b></span><input type="range" min={min} max={max} step={step} value={placement[key]} onChange={(event) => setPlacement((current) => ({ ...current, [key]: Number(event.target.value) }))} /></label>)}
          <div className="filter-placement-actions"><button className="outline-button" onClick={resetPlacement}>Reset placement</button><button className="outline-button" onClick={() => setView('edit')}>← Edit design</button></div>
          <label className="filter-name-control"><span>Filter name</span><input type="text" maxLength={48} value={filterName} onChange={(event) => setFilterName(event.target.value)} /></label>
          <div className="filter-live-photo-actions">{capturedPhoto ? <><button className="primary-button" onClick={downloadLivePhoto}>Download photo <span>↓</span></button><button className="outline-button" onClick={stopLivePhoto}>Retake</button></> : <button className="primary-button" onClick={captureLivePhoto} disabled={cameraState !== 'ready' || photoBusy}>{photoBusy ? 'Preparing photo…' : 'Capture drawing photo'} <span>◉</span></button>}</div>
          <button className="outline-button filter-save-preview" onClick={savePng}>Save transparent PNG <span>↓</span></button>
          <p className="filter-privacy-note">{capturedPhoto ? 'The photo includes the camera preview, face filter and live drawing. It is only downloaded when you choose Download photo.' : 'Camera video and gesture tracking stay on this device. Photo capture includes your face filter and live drawing.'}</p>
        </aside>
      </div>
    </div>

    {canvasError && <p className="filter-creator-message error" role="alert">{canvasError}</p>}
    {saveMessage && <p className="filter-creator-message success" role="status">{saveMessage}</p>}
    {clearConfirm && <div className="filter-confirm-backdrop" role="presentation"><div className="filter-confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="clear-filter-title"><span className="eyebrow">CLEAR ARTBOARD</span><h2 id="clear-filter-title">Erase this design?</h2><p>This can be undone with Undo, or canceled to keep your drawing.</p><div><button className="outline-button" onClick={() => setClearConfirm(false)}>Cancel</button><button className="primary-button" onClick={confirmClear}>Clear canvas</button></div></div></div>}
  </section>;
}
