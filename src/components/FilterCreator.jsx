import { useEffect, useRef, useState } from 'react';
import { startAuraCanvas } from '../game/auraCanvas.js';
import {
  ART_HEIGHT,
  ART_WIDTH,
  DRAWING_TOOLS,
  DRAWING_TOOL_IDS,
  renderDrawingAction,
} from '../game/drawingRenderer.js';
import { isPointingPose } from '../game/pointingGesture.js';
import useFilterHistory from '../hooks/useFilterHistory.js';
import {
  buildTimestampFilename,
  captureCompositePhoto,
  sanitizeFilename,
  triggerBlobDownload,
  triggerDownloadUrl,
} from '../utils/photoCapture.js';
import FilterArtboard from './filter-creator/FilterArtboard.jsx';
import FilterToolPanel from './filter-creator/FilterToolPanel.jsx';
import FilterPreviewStage from './filter-creator/FilterPreviewStage.jsx';
import FilterPlacementPanel from './filter-creator/FilterPlacementPanel.jsx';

const MAX_LIVE_HISTORY = 60;
const EMPTY_PLACEMENT = { scale: 1, horizontal: 0, vertical: 0, rotation: 0, opacity: 100 };

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function videoPointToElement(point, element, video) {
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

  const {
    historyRef,
    historyVersion,
    hasArtwork,
    canUndo,
    canRedo,
    actionCount,
    commitAction,
    pushClear,
    undo,
    redo,
  } = useFilterHistory();

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

  inputsRef.current = {
    preset: 'custom-filter',
    intensity: 100,
    faceTracking,
    customArtwork: artCanvasRef.current,
    customFaceArtwork: faceArtworkCanvasRef.current,
    customPlacement: placement,
    handTracking,
  };
  handTrackingRef.current = handTracking;
  faceTrackingRef.current = faceTracking;
  const getLatestFace = () => faceTrackingRef.current?.latestRef?.current || faceTrackingRef.current;
  const getLatestHand = () => handTrackingRef.current?.latestRef?.current || handTrackingRef.current;
  liveToolRef.current = tool;
  colorRef.current = color;
  brushSizeRef.current = brushSize;
  liveDrawingModeRef.current = liveDrawingMode;
  const [statusTitle, statusDetail] = displayStatus(faceTracking, cameraState);

  function redrawEditor(draft = null) {
    const canvas = artCanvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;
    context.clearRect(0, 0, ART_WIDTH, ART_HEIGHT);
    historyRef.current.past.forEach((action) => renderDrawingAction(context, action, { width: ART_WIDTH, height: ART_HEIGHT }));
    if (draft) renderDrawingAction(context, draft, { width: ART_WIDTH, height: ART_HEIGHT });
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
    commitAction(draft);
    setSaveMessage('');
  }

  function confirmClear() {
    pushClear();
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
        triggerBlobDownload(blob, `${sanitizeFilename(filterName)}.png`);
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
      x: clamp((videoPoint.x - face.center.x) / face.size.width + 0.5, 0, 1),
      y: clamp((videoPoint.y - face.center.y) / face.size.height + 0.5, 0, 1),
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
        liveDrawingRef.current.strokes.forEach((action) => renderDrawingAction(context, action, { width: rect.width, height: rect.height, normalized: true }));
        if (liveDrawingRef.current.activeTarget === 'screen' && liveDrawingRef.current.active) {
          renderDrawingAction(context, liveDrawingRef.current.active, { width: rect.width, height: rect.height, normalized: true });
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
      liveDrawingRef.current.faceStrokes.forEach((action) => renderDrawingAction(faceContext, action, { width: ART_WIDTH, height: ART_HEIGHT, normalized: true }));
      if (liveDrawingRef.current.activeTarget === 'face' && liveDrawingRef.current.active) {
        renderDrawingAction(faceContext, liveDrawingRef.current.active, { width: ART_WIDTH, height: ART_HEIGHT, normalized: true });
      }
      inputsRef.current.customFaceArtwork = faceCanvas;
    }
  }

  function beginLiveStroke(point, target = liveDrawingModeRef.current, source = 'gesture') {
    if (!point || capturedPhoto) return;
    const stagePoint = source === 'pointer' ? point : videoPointToElement(point, stageRef.current, videoRef.current);
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
    const stagePoint = source === 'pointer' ? point : videoPointToElement(point, stageRef.current, videoRef.current);
    const normalizedPoint = liveDrawingRef.current.activeTarget === 'face' ? stagePointToFace(stagePoint) : stagePoint;
    if (!normalizedPoint) return;
    active.end = normalizedPoint;
    if (active.tool === 'brush' || active.tool === 'magic' || active.tool === 'eraser') {
      const previous = active.points[active.points.length - 1];
      if ((normalizedPoint.x - previous.x) ** 2 + (normalizedPoint.y - previous.y) ** 2 > 0.000003) active.points.push(normalizedPoint);
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
    if (liveDrawingRef.current.strokes.length > MAX_LIVE_HISTORY) liveDrawingRef.current.strokes.shift();
    if (liveDrawingRef.current.faceStrokes.length > MAX_LIVE_HISTORY) liveDrawingRef.current.faceStrokes.shift();
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
    } else finishLiveStroke('gesture');
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
    const index = DRAWING_TOOL_IDS.indexOf(liveToolRef.current);
    const next = DRAWING_TOOL_IDS[(index + direction + DRAWING_TOOL_IDS.length) % DRAWING_TOOL_IDS.length];
    liveToolRef.current = next;
    setTool(next);
    setLiveHint(`${DRAWING_TOOLS.find(([id]) => id === next)?.[1]} selected.`);
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
    if (!stage || !video || !filterCanvas || !drawingCanvas) {
      setCanvasError('The camera frame is not ready yet. Wait a moment and try again.');
      return;
    }
    setPhotoBusy(true);
    try {
      const blob = await captureCompositePhoto({
        video,
        container: stage,
        layers: [filterCanvas, drawingCanvas],
      });
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
    triggerDownloadUrl(capturedPhoto, buildTimestampFilename('iqra-filter-creator'));
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
      const gesture = hand?.handVisible && (Number(hand.confidence) || 0) >= 0.62 ? hand.gesture : null;
      if (drawingHandIndex >= 0) {
        gestureState.candidate = null;
        gestureState.elapsed = 0;
        gestureState.fired = false;
        gestureState.lostMs = 0;
        gestureState.pointingMs += dt;
        const drawingHand = hands[drawingHandIndex];
        const rawPoint = drawingHand.indexTip || drawingHand.landmarks?.[8];
        if (gestureState.pointingMs >= 120 && view === 'edit') {
          const point = rawPoint ? videoPointToElement(rawPoint, artCanvasRef.current, videoRef.current) : null;
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
          const pos = videoPointToElement(tip, artCanvasRef.current, videoRef.current);
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
          const pos = videoPointToElement(tip, stageRef.current, videoRef.current);
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
          const point = videoPointToElement(landmark, gestureVideoRef.current?.parentElement, gestureVideoRef.current);
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
  }, [cameraState, view, capturedPhoto, videoRef]);

  return (
    <section className={`filter-creator-screen ${view === 'edit' ? 'editing-design' : 'previewing-design'}`}>
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
      {view === 'edit' && (
        <div className={`filter-camera-notice ${cameraState === 'error' || faceTracking.status === 'error' ? 'error' : ''}`} role="status">
          <b>{cameraState === 'error' ? 'CAMERA PERMISSION NEEDED' : statusTitle}</b>
          <span>{cameraState === 'error' ? cameraError || statusDetail : statusDetail}</span>
          {(cameraState === 'error' || faceTracking.status === 'error') && <button className="outline-button" onClick={onRetry}>Retry camera & tracking</button>}
        </div>
      )}

      <div className="filter-creator-layout">
        <FilterArtboard
          isVisible={view === 'edit'}
          artCanvasRef={artCanvasRef}
          artboardCursorRef={artboardCursorRef}
          canUndo={canUndo}
          canRedo={canRedo}
          hasArtwork={hasArtwork}
          actionCount={actionCount}
          handTracking={handTracking}
          onUndo={undo}
          onRedo={redo}
          onPointerDown={startDraw}
          onPointerMove={moveDraw}
          onPointerUp={finishDraw}
          onPointerCancel={finishDraw}
        />

        <FilterToolPanel
          isVisible={view === 'edit'}
          cameraState={cameraState}
          gestureVideoRef={gestureVideoRef}
          landmarkDotsRef={landmarkDotsRef}
          handTracking={handTracking}
          tool={tool}
          color={color}
          brushSize={brushSize}
          hasArtwork={hasArtwork}
          filterName={filterName}
          onSelectTool={setTool}
          onColorChange={setColor}
          onBrushSizeChange={setBrushSize}
          onRequestClear={() => setClearConfirm(true)}
          onResetPlacement={resetPlacement}
          onFilterNameChange={setFilterName}
          onPreview={() => { setView('preview'); setCanvasError(''); }}
          onSavePng={savePng}
        />

        <div className={`filter-preview-panel ${view === 'preview' ? '' : 'is-hidden'}`}>
          <FilterPreviewStage
            stageRef={stageRef}
            previewVideoRef={previewVideoRef}
            previewCanvasRef={previewCanvasRef}
            liveDrawCanvasRef={liveDrawCanvasRef}
            liveCursorRef={liveCursorRef}
            capturedPhoto={capturedPhoto}
            filterName={filterName}
            cameraState={cameraState}
            cameraError={cameraError}
            faceTracking={faceTracking}
            statusTitle={statusTitle}
            statusDetail={statusDetail}
            tool={tool}
            liveStrokeCount={liveStrokeCount}
            onRetry={onRetry}
            onStartLivePointer={startLivePointer}
            onMoveLivePointer={moveLivePointer}
            onFinishLivePointer={finishLivePointer}
            onCycleTool={cycleLiveTool}
            onClearLiveDrawing={clearLiveDrawing}
          />
          <FilterPlacementPanel
            liveDrawingMode={liveDrawingMode}
            liveHint={liveHint}
            handTracking={handTracking}
            placement={placement}
            filterName={filterName}
            capturedPhoto={capturedPhoto}
            cameraState={cameraState}
            photoBusy={photoBusy}
            onSetDrawingMode={setDrawingMode}
            onPlacementChange={(key, value) => setPlacement((current) => ({ ...current, [key]: value }))}
            onResetPlacement={resetPlacement}
            onEditDesign={() => setView('edit')}
            onFilterNameChange={setFilterName}
            onDownloadLivePhoto={downloadLivePhoto}
            onRetakeLivePhoto={stopLivePhoto}
            onCaptureLivePhoto={captureLivePhoto}
            onSavePng={savePng}
          />
        </div>
      </div>

      {canvasError && <p className="filter-creator-message error" role="alert">{canvasError}</p>}
      {saveMessage && <p className="filter-creator-message success" role="status">{saveMessage}</p>}
      {clearConfirm && (
        <div className="filter-confirm-backdrop" role="presentation">
          <div className="filter-confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="clear-filter-title">
            <span className="eyebrow">CLEAR ARTBOARD</span>
            <h2 id="clear-filter-title">Erase this design?</h2>
            <p>This can be undone with Undo, or canceled to keep your drawing.</p>
            <div>
              <button className="outline-button" onClick={() => setClearConfirm(false)}>Cancel</button>
              <button className="primary-button" onClick={confirmClear}>Clear canvas</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
