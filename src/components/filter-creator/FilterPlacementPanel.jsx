export default function FilterPlacementPanel({
  liveDrawingMode,
  liveHint,
  handTracking,
  placement,
  filterName,
  capturedPhoto,
  cameraState,
  photoBusy,
  onSetDrawingMode,
  onPlacementChange,
  onResetPlacement,
  onEditDesign,
  onFilterNameChange,
  onDownloadLivePhoto,
  onRetakeLivePhoto,
  onCaptureLivePhoto,
  onSavePng,
}) {
  const sliders = [
    ['scale', 'Filter scale', 0.45, 1.8, 0.01, `${placement.scale.toFixed(2)}×`],
    ['horizontal', 'Horizontal position', -0.7, 0.7, 0.01, `${Math.round(placement.horizontal * 100)}%`],
    ['vertical', 'Vertical position', -0.8, 0.8, 0.01, `${Math.round(placement.vertical * 100)}%`],
    ['rotation', 'Rotation', -45, 45, 1, `${placement.rotation}°`],
    ['opacity', 'Opacity', 20, 100, 1, `${placement.opacity}%`],
  ];

  return (
    <aside className="filter-placement-panel">
      <div className="filter-tools-heading">
        <span className="eyebrow">LIVE FACE PREVIEW</span>
        <h2>Fine-tune<br /><em>placement.</em></h2>
        <p>The face filter follows your head. Point with your index finger and fold the others to draw; the fingertip cursor is shown on the canvas. Mouse and touchscreen drawing also work.</p>
      </div>
      <div className="filter-live-instructions">
        <b>LIVE DRAWING CONTROLS</b>
        <span>Point with your index finger and fold the other fingers to draw · relax your hand to stop · Thumb_Up / Thumb_Down to cycle tools · Mouse or touchscreen drag also draws.</span>
        <small>
          {liveHint || (handTracking?.status === 'error'
            ? handTracking.error
            : handTracking?.status === 'loading'
              ? 'Loading the local hand tracker.'
              : handTracking?.handVisible
                ? `Hand detected${handTracking.gesture ? ` · ${handTracking.gesture.replaceAll('_', ' ')}` : ''}. Point to draw. Select color and size in Edit Design.`
                : 'Show a hand and point with your index finger to draw. Mouse and touchscreen drawing remain available.')}
        </small>
      </div>
      <div className="filter-live-mode-control" role="group" aria-label="Live drawing placement">
        <b>LIVE DRAWING PLACEMENT</b>
        <button className={liveDrawingMode === 'face' ? 'selected' : ''} onClick={() => onSetDrawingMode('face')} aria-pressed={liveDrawingMode === 'face'}>Follow my face</button>
        <button className={liveDrawingMode === 'screen' ? 'selected' : ''} onClick={() => onSetDrawingMode('screen')} aria-pressed={liveDrawingMode === 'screen'}>Stay on camera</button>
        <small>{liveDrawingMode === 'face' ? 'New strokes move with your face.' : 'New strokes stay fixed in the camera frame.'}</small>
      </div>
      {sliders.map(([key, label, min, max, step, value]) => (
        <label className="filter-range-control" key={key}>
          <span>{label}<b>{value}</b></span>
          <input type="range" min={min} max={max} step={step} value={placement[key]} onChange={(event) => onPlacementChange(key, Number(event.target.value))} />
        </label>
      ))}
      <div className="filter-placement-actions">
        <button className="outline-button" onClick={onResetPlacement}>Reset placement</button>
        <button className="outline-button" onClick={onEditDesign}>← Edit design</button>
      </div>
      <label className="filter-name-control"><span>Filter name</span><input type="text" maxLength={48} value={filterName} onChange={(event) => onFilterNameChange(event.target.value)} /></label>
      <div className="filter-live-photo-actions">
        {capturedPhoto ? (
          <>
            <button className="primary-button" onClick={onDownloadLivePhoto}>Download photo <span>↓</span></button>
            <button className="outline-button" onClick={onRetakeLivePhoto}>Retake</button>
          </>
        ) : (
          <button className="primary-button" onClick={onCaptureLivePhoto} disabled={cameraState !== 'ready' || photoBusy}>
            {photoBusy ? 'Preparing photo…' : 'Capture drawing photo'} <span>◉</span>
          </button>
        )}
      </div>
      <button className="outline-button filter-save-preview" onClick={onSavePng}>Save transparent PNG <span>↓</span></button>
      <p className="filter-privacy-note">
        {capturedPhoto
          ? 'The photo includes the camera preview, face filter and live drawing. It is only downloaded when you choose Download photo.'
          : 'Camera video and gesture tracking stay on this device. Photo capture includes your face filter and live drawing.'}
      </p>
    </aside>
  );
}
