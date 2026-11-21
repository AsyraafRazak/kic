import { DRAWING_TOOLS } from '../../game/drawingRenderer.js';

const TOOL_ICONS = {
  brush: '✎',
  magic: '✦',
  eraser: '⌫',
  circle: '◯',
  star: '☆',
  heart: '♡',
  line: '／',
  rectangle: '□',
};

export default function FilterToolPanel({
  isVisible,
  cameraState,
  gestureVideoRef,
  landmarkDotsRef,
  handTracking,
  tool,
  color,
  brushSize,
  hasArtwork,
  filterName,
  onSelectTool,
  onColorChange,
  onBrushSizeChange,
  onRequestClear,
  onResetPlacement,
  onFilterNameChange,
  onPreview,
  onSavePng,
}) {
  return (
    <aside className={`filter-tools-panel ${isVisible ? '' : 'is-hidden'}`}>
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
      <div className="filter-tool-grid" role="group" aria-label="Drawing tools">
        {DRAWING_TOOLS.map(([id, label]) => (
          <button key={id} className={tool === id ? 'selected' : ''} onClick={() => onSelectTool(id)} aria-pressed={tool === id}>
            <span>{TOOL_ICONS[id]}</span>
            {label}
          </button>
        ))}
      </div>
      <label className="filter-color-control"><span>Brush color</span><input type="color" value={color} onChange={(event) => onColorChange(event.target.value)} disabled={tool === 'eraser'} /></label>
      <label className="filter-range-control"><span>Brush size <b>{brushSize}px</b></span><input type="range" min="2" max="42" value={brushSize} onChange={(event) => onBrushSizeChange(Number(event.target.value))} /></label>
      <div className="filter-editor-buttons">
        <button className="outline-button" onClick={onRequestClear} disabled={!hasArtwork}>Clear canvas</button>
        <button className="outline-button" onClick={onResetPlacement}>Reset placement</button>
      </div>
      <label className="filter-name-control"><span>Filter name</span><input type="text" maxLength={48} value={filterName} onChange={(event) => onFilterNameChange(event.target.value)} placeholder="Name your creation" /></label>
      <div className="filter-primary-actions">
        <button className="primary-button" onClick={onPreview}>Preview on face <span>↗</span></button>
        <button className="outline-button" onClick={onSavePng}>Save transparent PNG</button>
      </div>
    </aside>
  );
}
