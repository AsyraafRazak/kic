import { DRAWING_TOOLS } from '../../game/drawingRenderer.js';

export default function FilterPreviewStage({
  stageRef,
  previewVideoRef,
  previewCanvasRef,
  liveDrawCanvasRef,
  liveCursorRef,
  capturedPhoto,
  filterName,
  cameraState,
  cameraError,
  faceTracking,
  statusTitle,
  statusDetail,
  tool,
  liveStrokeCount,
  onRetry,
  onStartLivePointer,
  onMoveLivePointer,
  onFinishLivePointer,
  onCycleTool,
  onClearLiveDrawing,
}) {
  return (
    <div className="filter-preview-stage" ref={stageRef}>
      <video ref={previewVideoRef} autoPlay muted playsInline className="filter-preview-video" />
      <canvas ref={previewCanvasRef} className="filter-preview-canvas" aria-label="Custom drawing anchored to the detected face" />
      {!capturedPhoto && (
        <canvas
          ref={liveDrawCanvasRef}
          className="filter-live-drawing-canvas"
          aria-label="Draw directly over the live camera preview"
          onPointerDown={onStartLivePointer}
          onPointerMove={onMoveLivePointer}
          onPointerUp={onFinishLivePointer}
          onPointerCancel={onFinishLivePointer}
          onLostPointerCapture={onFinishLivePointer}
        />
      )}
      <span ref={liveCursorRef} className="filter-hand-cursor live-hand-cursor" style={{ display: 'none' }} aria-hidden="true" />
      {capturedPhoto && <img className="filter-live-captured-photo" src={capturedPhoto} alt="Captured filter drawing photo" />}
      <div className="filter-preview-frame-overlay">
        <span className="frame-corner tl" />
        <span className="frame-corner tr" />
        <span className="frame-corner bl" />
        <span className="frame-corner br" />
        <span className="filter-preview-label">{filterName || 'UNTITLED FILTER'} · LOCAL PREVIEW</span>
      </div>
      {!capturedPhoto && cameraState === 'ready' && (
        <div className="filter-live-toolbar" aria-label="Live drawing tool selection">
          <span>LIVE TOOL · <b>{DRAWING_TOOLS.find(([id]) => id === tool)?.[1].toUpperCase()}</b></span>
          <button className="outline-button" onClick={() => onCycleTool(-1)} aria-label="Select previous drawing tool">‹</button>
          <button className="outline-button" onClick={() => onCycleTool(1)} aria-label="Select next drawing tool">›</button>
          <button className="outline-button" onClick={onClearLiveDrawing} disabled={!liveStrokeCount}>Clear</button>
        </div>
      )}
      {capturedPhoto && (
        <div className="filter-live-toolbar">
          <span>PHOTO CAPTURED · {liveStrokeCount} LIVE STROKE{liveStrokeCount === 1 ? '' : 'S'}</span>
        </div>
      )}
      {cameraState !== 'ready' && (
        <div className="filter-preview-message">
          <b>{cameraState === 'error' ? 'Camera unavailable' : 'Starting camera'}</b>
          <p>{cameraError || 'Allow camera access to preview your artwork.'}</p>
          {cameraState === 'error' && <button className="primary-button" onClick={onRetry}>Retry camera</button>}
        </div>
      )}
      {!capturedPhoto && cameraState === 'ready' && (
        <div className={`filter-face-status ${faceTracking.faceVisible ? 'detected' : ''}`} role="status">
          <i />
          {statusTitle}
          <small>{faceTracking.faceVisible ? 'FILTER ATTACHED' : statusDetail}</small>
          {faceTracking.status === 'error' && <button className="filter-tracking-retry" onClick={onRetry}>Retry tracking</button>}
        </div>
      )}
    </div>
  );
}
