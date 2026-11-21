import { useEffect, useRef } from 'react';
import { startEffectsCanvas } from '../game/effectsCanvas.js';

export default function CameraView({ videoRef, hasCamera, active, demoMode, tracking, game, onCharge, onFirePulse, onPulseResult, reducedMotion }) {
  const canvasRef = useRef(null);
  const inputsRef = useRef({});
  inputsRef.current = { tracking, game, onCharge, onFirePulse, onPulseResult, reducedMotion, demoMode };

  useEffect(() => {
    if (!active) return undefined;
    return startEffectsCanvas(
      canvasRef.current,
      () => inputsRef.current.tracking,
      () => inputsRef.current.game,
      (elapsedMs) => inputsRef.current.onCharge(elapsedMs),
      () => inputsRef.current.onFirePulse(),
      (result) => inputsRef.current.onPulseResult(result),
      demoMode ? null : videoRef.current,
      () => inputsRef.current.reducedMotion,
      () => inputsRef.current.demoMode,
    );
  }, [active, videoRef]);

  return <div className={`camera-card ${demoMode ? 'demo-active' : ''}`}>
    <div className="camera-top"><span><i className={active && !demoMode ? 'status-dot active' : 'status-dot'} /> {demoMode ? 'DEMO MODE · SIMULATED INPUT' : 'LIVE CAMERA'}</span><span className="camera-tag">{demoMode ? 'MOUSE AIM · NOT TRACKING' : tracking.status === 'ready' ? 'TRACKING READY' : 'LOCAL PREVIEW'}</span></div>
    <div className="camera-frame">
      {hasCamera && !demoMode && <video ref={videoRef} autoPlay muted playsInline />}
      {active && <>
        <canvas ref={canvasRef} className="canvas-overlay" aria-label={demoMode ? 'Demo mode. Move the mouse to aim and click to release a pulse.' : 'Gesture reactive energy effects and local hand tracking overlay'} />
        <div className="camera-overlay"><span className="frame-corner tl" /><span className="frame-corner tr" /><span className="frame-corner bl" /><span className="frame-corner br" /><span className="scan-line" /><span className="overlay-label">{demoMode ? 'DEMO INPUT · MOUSE ONLY' : 'GESTURE TRACKING · LOCAL'}</span></div>
      </>}
    </div>
    <div className="camera-bottom"><span>{demoMode ? 'Simulation only · no camera feed' : 'Camera video is never recorded, saved, or uploaded'}</span><span>16:9 · {demoMode ? 'DEMO' : 'LOCAL PREVIEW'}</span></div>
  </div>;
}
