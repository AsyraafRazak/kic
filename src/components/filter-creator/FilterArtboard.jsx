import { ART_HEIGHT, ART_WIDTH } from '../../game/drawingRenderer.js';

export default function FilterArtboard({
  isVisible,
  artCanvasRef,
  artboardCursorRef,
  canUndo,
  canRedo,
  hasArtwork,
  actionCount,
  handTracking,
  onUndo,
  onRedo,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
}) {
  return (
    <div className={`filter-editor-panel ${isVisible ? '' : 'is-hidden'}`}>
      <div className="filter-panel-top">
        <div>
          <span className="eyebrow">TRANSPARENT ARTBOARD</span>
          <small>Point with your index finger to draw; keep the other fingers folded and relax your hand to stop. Mouse/touch drag also works.</small>
        </div>
        <div className="filter-history-actions">
          <button className="outline-button" onClick={onUndo} disabled={!canUndo} aria-label="Undo stroke">↶ Undo</button>
          <button className="outline-button" onClick={onRedo} disabled={!canRedo} aria-label="Redo stroke">↷ Redo</button>
        </div>
      </div>
      <div className="filter-artboard-wrap">
        <div className="filter-artboard-guide"><span className="filter-face-guide" /><span className="filter-artboard-center" /></div>
        <canvas
          ref={artCanvasRef}
          className="filter-artboard"
          width={ART_WIDTH}
          height={ART_HEIGHT}
          aria-label="Transparent filter drawing canvas"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerCancel}
        />
        <span ref={artboardCursorRef} className="filter-hand-cursor artboard-hand-cursor" style={{ display: 'none' }} aria-hidden="true" />
        {!hasArtwork && <span className="filter-artboard-hint" aria-hidden="true">DRAW YOUR FILTER</span>}
      </div>
      <div className="filter-editor-footer">
        <span>PNG · {ART_WIDTH} × {ART_HEIGHT} · TRANSPARENT</span>
        <span>{handTracking?.status === 'error' ? 'HAND TRACKING ERROR' : handTracking?.handVisible ? `${handTracking.gesture?.replaceAll('_', ' ') || 'HAND DETECTED'} · POINT TO DRAW · THUMBS TO CHANGE TOOLS` : 'POINT TO DRAW · THUMBS TO CHANGE TOOLS'}</span>
        <span>{actionCount} ACTION{actionCount === 1 ? '' : 'S'}</span>
      </div>
    </div>
  );
}
