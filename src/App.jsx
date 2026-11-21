import { useEffect, useRef, useState } from 'react';
import LandingScreen from './components/LandingScreen.jsx';
import CameraView from './components/CameraView.jsx';
import GameHUD from './components/GameHUD.jsx';
import ResultScreen from './components/ResultScreen.jsx';
import ModeSelectionScreen from './components/ModeSelectionScreen.jsx';
import AuraMirror from './components/AuraMirror.jsx';
import FilterCreator from './components/FilterCreator.jsx';
import useHandTracking from './hooks/useHandTracking.js';
import useFaceTracking from './hooks/useFaceTracking.js';
import { createGameAudio } from './game/gameAudio.js';
import {
  chargeRound,
  createGameState,
  endRound,
  firePulse,
  pauseRound,
  resolvePulse,
  resumeRound,
  startRound,
  tickRound,
} from './game/gameState.js';

export default function App() {
  const [screen, setScreen] = useState('mode-select');
  const [cameraState, setCameraState] = useState('idle');
  const [inputMode, setInputMode] = useState('camera');
  const [auraPreset, setAuraPreset] = useState('aura-crown');
  const [cameraError, setCameraError] = useState('');
  const [stream, setStream] = useState(null);
  const [game, setGame] = useState(createGameState);
  const [muted, setMuted] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [pageVisible, setPageVisible] = useState(true);
  const videoRef = useRef(null);
  const cameraRequestRef = useRef(0);
  const gameRef = useRef(game);
  const audioRef = useRef(null);
  const tracking = useHandTracking({ videoRef, enabled: ((screen === 'camera' && inputMode === 'camera') || screen === 'aura-mirror' || screen === 'filter-creator') && cameraState === 'ready' && !!stream && pageVisible });
  const faceTracking = useFaceTracking({
    videoRef,
    enabled: ['aura-mirror', 'filter-creator'].includes(screen) && cameraState === 'ready' && !!stream && pageVisible,
    readoutIntervalMs: screen === 'aura-mirror' ? 250 : Infinity,
  });

  function commitGame(nextGame) {
    if (nextGame === gameRef.current) return nextGame;
    gameRef.current = nextGame;
    setGame(nextGame);
    return nextGame;
  }

  function ensureAudio() {
    if (!audioRef.current) audioRef.current = createGameAudio();
    audioRef.current.setMuted(muted);
    return audioRef.current;
  }

  function stopCamera() {
    cameraRequestRef.current += 1;
    stream?.getTracks().forEach((track) => track.stop());
    setStream(null);
    setCameraState('idle');
  }

  function closeAudio() {
    audioRef.current?.close();
    audioRef.current = null;
  }

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
      videoRef.current.play().catch(() => {});
    }
  }, [stream, screen]);

  useEffect(() => () => stream?.getTracks().forEach((track) => track.stop()), [stream]);
  useEffect(() => () => audioRef.current?.close(), []);

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const updatePreference = () => setReducedMotion(query.matches);
    updatePreference();
    query.addEventListener?.('change', updatePreference);
    return () => query.removeEventListener?.('change', updatePreference);
  }, []);

  useEffect(() => {
    const updateVisibility = () => setPageVisible(document.visibilityState === 'visible');
    updateVisibility();
    document.addEventListener('visibilitychange', updateVisibility);
    return () => document.removeEventListener('visibilitychange', updateVisibility);
  }, []);

  async function requestCamera() {
    const requestId = ++cameraRequestRef.current;
    setCameraState('loading');
    setCameraError('');

    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError('Camera access is unavailable. Open this page in a modern browser over HTTPS or localhost.');
      setCameraState('error');
      return;
    }

    try {
      const nextStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      if (requestId !== cameraRequestRef.current) {
        nextStream.getTracks().forEach((track) => track.stop());
        return;
      }
      setStream(nextStream);
      setCameraState('ready');
    } catch (error) {
      if (requestId !== cameraRequestRef.current) return;
      const isDenied = error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError';
      const isMissing = error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError';
      setCameraError(isDenied
        ? 'Camera permission was declined. Allow camera access in your browser settings and try again.'
        : isMissing
          ? 'No camera was found. Connect a webcam and try again.'
          : 'We could not start your camera. Check that it is connected and not in use by another app.');
      setCameraState('error');
    }
  }

  function begin() {
    setInputMode('camera');
    ensureAudio().unlock();
    commitGame(createGameState());
    setScreen('camera');
    requestCamera();
  }

  function beginAuraMirror() {
    closeAudio();
    commitGame(createGameState());
    setInputMode('camera');
    setAuraPreset('aura-crown');
    setScreen('aura-mirror');
    requestCamera();
  }

  function retryAuraCamera() {
    stopCamera();
    setCameraError('');
    setScreen('aura-mirror');
    requestCamera();
  }

  function beginFilterCreator() {
    closeAudio();
    commitGame(createGameState());
    setInputMode('camera');
    setScreen('filter-creator');
    requestCamera();
  }

  function retryFilterCreatorCamera() {
    stopCamera();
    setCameraError('');
    setScreen('filter-creator');
    requestCamera();
  }

  function startDemoMode() {
    stopCamera();
    closeAudio();
    setInputMode('demo');
    commitGame(createGameState());
    setCameraError('');
    ensureAudio().unlock();
    setScreen('camera');
  }

  function recoverCamera() {
    stopCamera();
    closeAudio();
    setInputMode('camera');
    commitGame(createGameState());
    setScreen('camera');
    requestCamera();
  }

  function handleCharge(elapsedMs) {
    commitGame(chargeRound(gameRef.current, elapsedMs));
  }

  function handleFirePulse() {
    const result = firePulse(gameRef.current);
    if (!result.accepted) return result;
    commitGame(result.state);
    audioRef.current?.play('pulse');
    return result;
  }

  function handlePulseResult(result) {
    const previous = gameRef.current;
    const next = resolvePulse(previous, result);
    if (next === previous) return;
    commitGame(next);
    if (next.feedback.startsWith('HIT')) audioRef.current?.play('hit');
    else if (next.feedback === 'MISS') audioRef.current?.play('miss');
  }

  function toggleMute() {
    const nextMuted = !muted;
    setMuted(nextMuted);
    ensureAudio().setMuted(nextMuted);
  }

  const gameScreenActive = screen === 'camera' && pageVisible && (inputMode === 'demo' || (cameraState === 'ready' && !!stream && tracking.status === 'ready'));

  useEffect(() => {
    const current = gameRef.current;
    if (gameScreenActive) {
      if (current.status === 'idle') commitGame(startRound(current));
      else if (current.status === 'paused') commitGame(resumeRound(current));
    } else if (current.status === 'playing') {
      commitGame(pauseRound(current));
    }
  }, [gameScreenActive]);

  useEffect(() => {
    if (!gameScreenActive || game.status !== 'playing') return undefined;
    let lastTick = performance.now();
    const timer = window.setInterval(() => {
      const now = performance.now();
      if (document.visibilityState !== 'visible') {
        lastTick = now;
        return;
      }
      const elapsed = now - lastTick;
      lastTick = now;
      commitGame(tickRound(gameRef.current, elapsed));
    }, 100);
    return () => window.clearInterval(timer);
  }, [gameScreenActive, game.status]);

  useEffect(() => {
    if (!gameScreenActive || game.status !== 'playing' || inputMode !== 'camera' || !tracking.handVisible || tracking.gesture !== 'Open_Palm') return undefined;
    const chargeTimer = window.setInterval(() => {
      commitGame(chargeRound(gameRef.current, 100));
    }, 100);
    return () => window.clearInterval(chargeTimer);
  }, [gameScreenActive, game.status, inputMode, tracking.handVisible, tracking.gesture]);

  useEffect(() => {
    if (game.status !== 'finished' || screen !== 'camera') return;
    setScreen('results');
    stopCamera();
    closeAudio();
  }, [game.status, screen]);

  function finish() {
    commitGame(endRound(gameRef.current));
  }

  function reset() {
    stopCamera();
    closeAudio();
    commitGame(createGameState());
    setCameraError('');
    setScreen('mode-select');
  }

  return <main className="app-shell">
    <div className="ambient ambient-one" /><div className="ambient ambient-two" />
    <header className="topbar">
      <a className="brand" href="#home" onClick={(event) => { event.preventDefault(); reset(); }} aria-label="Iqra' Gesture Lab home">
        <span className="brand-mark"><span /></span><span className="brand-copy"><b>IQRA'</b><small>GESTURE LAB</small></span>
      </a>
      <div className="topbar-right"><span className="edition">UNIVERSITY SHOWCASE</span><span className="live-dot" /> <span className="phase-label">PHASE 05</span><button className="restart-button" onClick={reset}>RESTART BOOTH</button></div>
    </header>
    {screen === 'mode-select' && <ModeSelectionScreen onSelectGame={() => setScreen('landing')} onSelectAuraMirror={beginAuraMirror} onSelectFilterCreator={beginFilterCreator} />}
    {screen === 'landing' && <LandingScreen onStart={begin} onStartDemo={startDemoMode} />}
    {screen === 'aura-mirror' && <AuraMirror cameraState={cameraState} cameraError={cameraError} videoRef={videoRef} faceTracking={faceTracking} handTracking={tracking} preset={auraPreset} onPresetChange={setAuraPreset} onCaptureFreeze={stopCamera} reducedMotion={reducedMotion} onBack={reset} onRetry={retryAuraCamera} />}
    {screen === 'filter-creator' && <FilterCreator cameraState={cameraState} cameraError={cameraError} cameraStream={stream} videoRef={videoRef} faceTracking={faceTracking} handTracking={tracking} reducedMotion={reducedMotion} onBack={reset} onRetry={retryFilterCreatorCamera} />}
    {screen === 'camera' && <section className="play-screen">
      {(inputMode === 'camera' && (cameraState === 'loading' || (cameraState === 'ready' && ['idle', 'loading'].includes(tracking.status)))) && <div className="session-state-screen session-overlay" aria-live="polite"><div className="session-state-card"><span className="eyebrow"><i /> LOCAL INITIALIZATION</span><div className="session-spinner" /><h1>{cameraState === 'loading' ? 'Starting your camera.' : 'Preparing gesture tracking.'}</h1><p>{cameraState === 'loading' ? 'Approve the browser camera prompt to continue.' : 'Loading the gesture model and MediaPipe runtime from this device.'}</p><div className="privacy-callout">Camera video is processed on this device only. It is never recorded, saved, or uploaded.</div><button className="outline-button" onClick={startDemoMode}>Enter Demo Mode</button></div></div>}
      {(inputMode === 'camera' && (cameraState === 'error' || tracking.status === 'error')) && <div className="session-state-screen session-overlay" aria-live="assertive"><div className="session-state-card error-state"><span className="eyebrow">CAMERA / TRACKING NEEDS ATTENTION</span><div className="session-error-mark">!</div><h1>Let’s get you back in.</h1><p>{tracking.status === 'error' ? tracking.error : cameraError}</p><div className="privacy-callout">Your camera feed stays on this device. Nothing is recorded, saved, or uploaded.</div><div className="session-actions"><button className="primary-button" onClick={recoverCamera}>Try camera again <span className="button-arrow">↻</span></button><button className="outline-button" onClick={startDemoMode}>Use Demo Mode</button></div></div></div>}
      <div className="play-content">
        <div className="play-heading"><div><span className="eyebrow">30-SECOND TARGET CHALLENGE <i /></span><h1>{inputMode === 'demo' ? 'Demo mode.' : 'Ready when'} <em>{inputMode === 'demo' ? 'Mouse aim.' : 'you are.'}</em></h1><p>{inputMode === 'demo' ? 'Move your mouse to aim. Energy charges automatically; click to release a pulse. This is a simulation, not hand tracking.' : 'Open palm to charge, move your hand over the target, then close your fist to release.'}</p></div><button className="text-button" onClick={finish}>End round</button></div>
        <div className="play-layout"><CameraView videoRef={videoRef} hasCamera={!!stream} active={gameScreenActive} demoMode={inputMode === 'demo'} tracking={tracking} game={game} onCharge={handleCharge} onFirePulse={handleFirePulse} onPulseResult={handlePulseResult} reducedMotion={reducedMotion} /><GameHUD tracking={tracking} game={game} muted={muted} onToggleMute={toggleMute} demoMode={inputMode === 'demo'} /></div>
        <div className="play-foot"><span><span className="status-dot" /> {inputMode === 'demo' ? 'DEMO MODE · NO CAMERA' : 'CAMERA CONNECTED'}</span><span>{inputMode === 'demo' ? 'MOUSE AIM · CLICK TO PULSE' : `HAND TRACKING ${tracking.status === 'ready' ? 'ACTIVE' : 'INITIALIZING'}`}</span><span>NOT RECORDED · NOT SAVED · NOT UPLOADED</span></div>
      </div>
    </section>}\r\n    {screen === 'results' && <ResultScreen score={game.score} onReplay={inputMode === 'demo' ? startDemoMode : begin} />}
    <footer className="footer"><span>AN EXPERIENCE BY <b>KELAB IQRA</b></span><span>READ · REACH · REPEAT</span></footer>
  </main>;
}
