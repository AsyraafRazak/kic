import { useEffect, useRef, useState } from 'react';
import { startAuraCanvas } from '../game/auraCanvas.js';
import { startFaceDebugCanvas } from '../game/faceDebugCanvas.js';
import { AURA_MARKERS, createAuraChallenge, startAuraChallenge, tickAuraChallenge } from '../game/auraInteraction.js';
import {
  GESTURE_ACTION,
  GESTURE_CONFIG,
  GESTURE_MODE,
  createGestureControllerState,
  cancelFilterSelection,
  enterChallengeMode,
  enterSelectionMode,
  exitChallengeMode,
  exitSelectionMode,
  tickGestureController,
} from '../game/gestureInteraction.js';
import { createGameAudio } from '../game/gameAudio.js';
import { createAuraFilterInteraction, tickAuraFilterInteraction } from '../game/auraFilterInteraction.js';

const FILTERS = [
  { id: 'aura-crown', name: 'AURA CROWN', swatches: ['#62e7e5', '#548eff'], description: 'Halo follows above your head' },
  { id: 'energy-hands', name: 'ENERGY HANDS', swatches: ['#62e7e5', '#55b7ff'], description: 'Gather a spiraling energy sphere' },
  { id: 'guardian-visor', name: 'GUARDIAN VISOR', swatches: ['#7ed2ff', '#8499ff'], description: 'Armored visor with shield and laser' },
];
const DEFAULT_FILTER_COLORS = Object.fromEntries(FILTERS.map((filter) => [filter.id, filter.swatches]));

function colorChannels(hex) {
  const value = hex.replace('#', '');
  return [0, 2, 4].map((index) => Number.parseInt(value.slice(index, index + 2), 16)).join(', ');
}

export default function AuraMirror({ cameraState, cameraError, videoRef, faceTracking, handTracking, preset, onPresetChange, onCaptureFreeze, reducedMotion, onBack, onRetry }) {
  const canvasRef = useRef(null);
  const debugCanvasRef = useRef(null);
  const previewFrameRef = useRef(null);
  const captureRequestRef = useRef(0);
  const captureUrlRef = useRef('');
  const audioRef = useRef(null);
  const inputsRef = useRef({});
  const faceTrackingRef = useRef(faceTracking);
  const handTrackingRef = useRef(handTracking);
  const [intensity, setIntensity] = useState(60);
  const [filterColors, setFilterColors] = useState(DEFAULT_FILTER_COLORS);
  const [debugMode, setDebugMode] = useState(false);
  const [challenge, setChallenge] = useState(createAuraChallenge);
  const [showcaseAt, setShowcaseAt] = useState(0);
  const [captureUrl, setCaptureUrl] = useState('');
  const [captureError, setCaptureError] = useState('');
  const [captureBusy, setCaptureBusy] = useState(false);
  const [muted, setMuted] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectionIndex, setSelectionIndex] = useState(0);
  const [selectionRemainingMs, setSelectionRemainingMs] = useState(GESTURE_CONFIG.selectionTimeoutMs);
  const [gestureHint, setGestureHint] = useState('');
  const [handLost, setHandLost] = useState(false);
  const [effectStatus, setEffectStatus] = useState({ charge: 0, chargeReady: false, cooldownMs: 0 });
  const challengeRef = useRef(challenge);
  const trackingRef = useRef({ faceTracking, handTracking });
  const showcaseTimerRef = useRef(0);
  const gestureHintTimerRef = useRef(0);
  const gestureControllerRef = useRef(createGestureControllerState());
  const previousHandRef = useRef(null);
  const presetRef = useRef(preset);
  const onPresetChangeRef = useRef(onPresetChange);
  const mutedRef = useRef(muted);
  const filterInteractionRef = useRef(createAuraFilterInteraction());
  const effectFeedbackRef = useRef({ chargeReady: false, pulseId: 0, chargeBucket: -1, cooldownBucket: -1 });
  const selectionNeutralMsRef = useRef(0);
  const requireNeutralAfterSelectionRef = useRef(false);
  const selectedFilter = FILTERS.find((item) => item.id === preset) || FILTERS[0];
  const selectedColors = filterColors[preset] || DEFAULT_FILTER_COLORS[preset] || FILTERS[0].swatches;
  faceTrackingRef.current = faceTracking;
  handTrackingRef.current = handTracking;
  trackingRef.current = { faceTracking, handTracking };
  challengeRef.current = challenge;
  presetRef.current = preset;
  onPresetChangeRef.current = onPresetChange;
  mutedRef.current = muted;
  inputsRef.current = {
    preset, intensity, faceTracking, handTracking, interaction: challenge,
    filterInteraction: filterInteractionRef.current, filterColors: Object.fromEntries(
      Object.entries(filterColors).map(([id, colors]) => [id, colors.map(colorChannels)]),
    ), markers: AURA_MARKERS, showcaseAt,
  };

  function getAudio() {
    if (!audioRef.current) audioRef.current = createGameAudio();
    audioRef.current.setMuted(mutedRef.current);
    audioRef.current.unlock();
    return audioRef.current;
  }

  useEffect(() => {
    if (cameraState !== 'ready' || captureUrl) return undefined;
    return startAuraCanvas(canvasRef.current, () => inputsRef.current, reducedMotion);
  }, [cameraState, reducedMotion, captureUrl]);
  useEffect(() => {
    if (cameraState !== 'ready' || !debugMode) return undefined;
    return startFaceDebugCanvas(debugCanvasRef.current, videoRef.current, () => faceTrackingRef.current);
  }, [cameraState, debugMode, videoRef]);

  useEffect(() => {
    if (challenge.status !== 'playing') return undefined;
    let previous = performance.now();
    const timer = window.setInterval(() => {
      const now = performance.now();
      const { faceTracking: face, handTracking: hand } = trackingRef.current;
      const next = tickAuraChallenge(challengeRef.current, hand, !!face.faceVisible, now - previous);
      previous = now;
      challengeRef.current = next;
      setChallenge(next);
      if (next.status !== 'playing' && gestureControllerRef.current.mode === GESTURE_MODE.CHALLENGE) {
        gestureControllerRef.current = exitChallengeMode(gestureControllerRef.current);
        requireNeutralAfterSelectionRef.current = true;
        selectionNeutralMsRef.current = 0;
        showGestureHint(next.status === 'complete' ? 'Challenge complete. Relax your hand, then use thumbs or hold Pointing_Up to open selection.' : 'Challenge ended. Relax your hand, then use thumbs or hold Pointing_Up to open selection.');
      }
    }, 100);
    return () => window.clearInterval(timer);
  }, [challenge.status]);

  useEffect(() => {
    if (cameraState !== 'ready' || captureUrl) return undefined;
    let previousAt = performance.now();
    const timer = window.setInterval(() => {
      const now = performance.now();
      const dt = Math.min(200, now - previousAt);
      previousAt = now;
      const hand = handTrackingRef.current;
      const visible = Boolean(hand?.handVisible && hand.position);
      const wasVisible = Boolean(previousHandRef.current?.handVisible && previousHandRef.current?.position);
      if (wasVisible && !visible) setHandLost(true);
      else if (!wasVisible && visible) setHandLost(false);
      previousHandRef.current = hand;

      let controller = gestureControllerRef.current;
      const challengeActive = challengeRef.current.status === 'playing';
      if (challengeActive && controller.mode !== GESTURE_MODE.CHALLENGE) controller = enterChallengeMode(controller);
      else if (!challengeActive && controller.mode === GESTURE_MODE.CHALLENGE) controller = exitChallengeMode(controller);

      const result = tickGestureController(controller, hand, dt);
      controller = result.state;
      gestureControllerRef.current = controller;
      if (controller.mode === GESTURE_MODE.SELECTION) setSelectionRemainingMs(controller.selection.remainingMs);

      let consumedSelectionGesture = false;
      for (const action of result.actions) {
        if (action === GESTURE_ACTION.OPEN_SELECTION) {
          consumedSelectionGesture = true;
          const activeIndex = Math.max(0, FILTERS.findIndex((filter) => filter.id === presetRef.current));
          controller = enterSelectionMode(controller, FILTERS.length, activeIndex, hand.position);
          gestureControllerRef.current = controller;
          setSelectionMode(true);
          setSelectionIndex(activeIndex);
          setSelectionRemainingMs(GESTURE_CONFIG.selectionTimeoutMs);
          showGestureHint('Selection open. Hold Thumb_Up or Thumb_Down to highlight; hold Open_Palm to apply.');
        } else if (action === GESTURE_ACTION.NEXT_FILTER || action === GESTURE_ACTION.PREVIOUS_FILTER) {
          if (controller.mode === GESTURE_MODE.SELECTION) {
            const direction = action === GESTURE_ACTION.NEXT_FILTER ? 1 : -1;
            const highlightedIndex = (controller.selection.index + direction + FILTERS.length) % FILTERS.length;
            controller = { ...controller, selection: { ...controller.selection, index: highlightedIndex } };
            gestureControllerRef.current = controller;
            setSelectionIndex(highlightedIndex);
            showGestureHint(`Highlighted ${FILTERS[highlightedIndex].name}. Hold Open_Palm to apply.`);
          } else {
            const currentIndex = FILTERS.findIndex((filter) => filter.id === presetRef.current);
            const direction = action === GESTURE_ACTION.NEXT_FILTER ? 1 : -1;
            const nextIndex = (currentIndex + direction + FILTERS.length) % FILTERS.length;
            chooseFilter(FILTERS[nextIndex].id);
          }
        } else if (action === GESTURE_ACTION.CONFIRM_SELECTION) {
          consumedSelectionGesture = true;
          const index = controller.selection.index;
          applyGestureFilter(FILTERS[index].id);
          controller = exitSelectionMode(controller);
          gestureControllerRef.current = controller;
          requireNeutralAfterSelectionRef.current = true;
          selectionNeutralMsRef.current = 0;
          setSelectionMode(false);
          showGestureHint(`${FILTERS[index].name} applied.`);
        } else if (action === GESTURE_ACTION.SELECTION_TIMEOUT) {
          controller = exitSelectionMode(controller);
          gestureControllerRef.current = controller;
          requireNeutralAfterSelectionRef.current = true;
          selectionNeutralMsRef.current = 0;
          setSelectionMode(false);
          showGestureHint('Selection timed out. The current filter is unchanged.');
        }
      }

      // The normal filter charge/release controller is suspended while selection
      // or the challenge owns gestures. This prevents one palm from confirming
      // a filter and charging it at the same time.
      if (requireNeutralAfterSelectionRef.current) {
        const neutral = !hand?.handVisible || !hand.gesture || (Number(hand.confidence) || 0) < GESTURE_CONFIG.gestureConfidence;
        selectionNeutralMsRef.current = neutral ? selectionNeutralMsRef.current + dt : 0;
        if (selectionNeutralMsRef.current >= 250) requireNeutralAfterSelectionRef.current = false;
      }
      if (challengeActive || controller.mode !== GESTURE_MODE.AR || consumedSelectionGesture || requireNeutralAfterSelectionRef.current) {
        filterInteractionRef.current = createAuraFilterInteraction();
      } else {
        filterInteractionRef.current = tickAuraFilterInteraction(filterInteractionRef.current, hand, dt, !!trackingRef.current.faceTracking.faceVisible);
      }
      const effect = filterInteractionRef.current;
      inputsRef.current.filterInteraction = effect;
      const chargeBucket = Math.floor((effect.charge || 0) * 20);
      const cooldownBucket = Math.ceil((effect.cooldownMs || 0) / 100);
      if (chargeBucket !== effectFeedbackRef.current.chargeBucket || cooldownBucket !== effectFeedbackRef.current.cooldownBucket || effect.chargeReady !== effectFeedbackRef.current.chargeReady) {
        effectFeedbackRef.current.chargeBucket = chargeBucket;
        effectFeedbackRef.current.cooldownBucket = cooldownBucket;
        effectFeedbackRef.current.chargeReady = effect.chargeReady;
        setEffectStatus({ charge: effect.charge || 0, chargeReady: !!effect.chargeReady, cooldownMs: effect.cooldownMs || 0 });
      }
      if (effect.chargeReady && !effectFeedbackRef.current.wasReady) showGestureHint('Charge ready. Close your fist to release one pulse.');
      if (effect.pulse && effect.pulse.id !== effectFeedbackRef.current.pulseId) {
        effectFeedbackRef.current.pulseId = effect.pulse.id;
        showGestureHint('Energy pulse released. Hold Open_Palm to charge again.');
        getAudio().play('activate');
      }
      effectFeedbackRef.current.wasReady = !!effect.chargeReady;
    }, 100);
    return () => window.clearInterval(timer);
  }, [cameraState, captureUrl]);

  useEffect(() => {
    if (!selectionMode) return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        cancelSelection();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectionMode]);

  useEffect(() => () => {
    window.clearTimeout(showcaseTimerRef.current);
    window.clearTimeout(gestureHintTimerRef.current);
  }, []);
  useEffect(() => () => {
    captureRequestRef.current += 1;
    if (captureUrlRef.current) URL.revokeObjectURL(captureUrlRef.current);
    audioRef.current?.close();
  }, []);

  function startChallenge() {
    if (gestureControllerRef.current.mode === GESTURE_MODE.SELECTION) {
      gestureControllerRef.current = exitSelectionMode(gestureControllerRef.current);
      setSelectionMode(false);
    }
    challengeRef.current = { ...createAuraChallenge(), status: 'instructions' };
    setChallenge(challengeRef.current);
  }
  function beginChallenge() {
    if (!challengeRef.current.filterActivated) return;
    gestureControllerRef.current = enterChallengeMode(gestureControllerRef.current);
    challengeRef.current = startAuraChallenge(challengeRef.current.filterId || presetRef.current);
    setChallenge(challengeRef.current);
    getAudio().play('activate');
  }
  function replayChallenge() {
    challengeRef.current = { ...createAuraChallenge(), status: 'instructions' };
    setChallenge(challengeRef.current);
  }
  function returnToFilters() {
    if (gestureControllerRef.current.mode === GESTURE_MODE.CHALLENGE) {
      gestureControllerRef.current = exitChallengeMode(gestureControllerRef.current);
      requireNeutralAfterSelectionRef.current = true;
      selectionNeutralMsRef.current = 0;
    }
    challengeRef.current = { ...createAuraChallenge(), status: 'skipped' };
    setChallenge(challengeRef.current);
  }
  function skipChallenge() {
    if (gestureControllerRef.current.mode === GESTURE_MODE.CHALLENGE) {
      gestureControllerRef.current = exitChallengeMode(gestureControllerRef.current);
      requireNeutralAfterSelectionRef.current = true;
      selectionNeutralMsRef.current = 0;
    }
    const next = { ...createAuraChallenge(), status: 'skipped' };
    challengeRef.current = next;
    setChallenge(next);
  }
  function playShowcase() {
    const startedAt = performance.now();
    window.clearTimeout(showcaseTimerRef.current);
    setShowcaseAt(startedAt);
    showcaseTimerRef.current = window.setTimeout(() => setShowcaseAt((current) => current === startedAt ? 0 : current), 7200);
  }

  function releaseCapture() {
    captureRequestRef.current += 1;
    if (captureUrlRef.current) URL.revokeObjectURL(captureUrlRef.current);
    captureUrlRef.current = '';
    setCaptureUrl('');
    setCaptureError('');
    setCaptureBusy(false);
  }

  async function capturePhoto() {
    if (captureBusy) return;
    setCaptureError('');
    const video = videoRef.current;
    const effectCanvas = canvasRef.current;
    const frame = previewFrameRef.current;
    if (!video || !effectCanvas || !frame || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || !video.videoWidth || !video.videoHeight) {
      setCaptureError('The camera frame is not ready yet. Wait a moment and try again.');
      return;
    }
    const requestId = ++captureRequestRef.current;
    setCaptureBusy(true);
    getAudio();
    try {
      const rect = frame.getBoundingClientRect();
      const aspect = rect.width && rect.height ? rect.width / rect.height : 16 / 9;
      const outputWidth = Math.min(1920, Math.max(640, video.videoWidth));
      const outputHeight = Math.round(outputWidth / aspect);
      const photo = document.createElement('canvas');
      photo.width = outputWidth;
      photo.height = outputHeight;
      const context = photo.getContext('2d');
      if (!context) throw new Error('Canvas capture is unavailable in this browser.');

      let sx = 0, sy = 0, sw = video.videoWidth, sh = video.videoHeight;
      if (sw / sh > aspect) { sw = sh * aspect; sx = (video.videoWidth - sw) / 2; }
      else { sh = sw / aspect; sy = (video.videoHeight - sh) / 2; }
      context.save();
      context.translate(outputWidth, 0);
      context.scale(-1, 1);
      context.drawImage(video, sx, sy, sw, sh, 0, 0, outputWidth, outputHeight);
      context.restore();
      context.drawImage(effectCanvas, 0, 0, outputWidth, outputHeight);

      const blob = await new Promise((resolve, reject) => photo.toBlob((result) => result ? resolve(result) : reject(new Error('The browser could not encode this photo. Try again.')), 'image/jpeg', 0.92));
      if (requestId !== captureRequestRef.current) return;
      releaseCapture();
      const url = URL.createObjectURL(blob);
      captureUrlRef.current = url;
      setCaptureUrl(url);
      const idleChallenge = createAuraChallenge();
      challengeRef.current = idleChallenge;
      setChallenge(idleChallenge);
      gestureControllerRef.current = createGestureControllerState();
      setSelectionMode(false);
      setSelectionIndex(0);
      setSelectionRemainingMs(GESTURE_CONFIG.selectionTimeoutMs);
      setGestureHint('');
      setHandLost(false);
      previousHandRef.current = null;
      onCaptureFreeze();
      audioRef.current?.play('capture');
    } catch (error) {
      if (requestId === captureRequestRef.current) setCaptureError(error?.message || 'Photo capture failed. Please try again.');
    } finally {
      if (requestId === captureRequestRef.current) setCaptureBusy(false);
    }
  }

  function retakePhoto() {
    releaseCapture();
    onRetry();
  }

  function downloadPhoto() {
    if (!captureUrl) return;
    const link = document.createElement('a');
    link.href = captureUrl;
    link.download = `iqra-aura-${new Date().toISOString().replace(/[:.]/g, '-')}.jpg`;
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  function resetExperience() {
    const needsCamera = !!captureUrl;
    releaseCapture();
    setIntensity(60);
    setFilterColors(DEFAULT_FILTER_COLORS);
    setDebugMode(false);
    setShowcaseAt(0);
    setMuted(false);
    const idleChallenge = createAuraChallenge();
    challengeRef.current = idleChallenge;
    setChallenge(idleChallenge);
    gestureControllerRef.current = createGestureControllerState();
    setSelectionMode(false);
    setSelectionIndex(0);
    setSelectionRemainingMs(GESTURE_CONFIG.selectionTimeoutMs);
    setGestureHint('');
    filterInteractionRef.current = createAuraFilterInteraction();
    effectFeedbackRef.current = { chargeReady: false, pulseId: 0, chargeBucket: -1, cooldownBucket: -1, wasReady: false };
    setEffectStatus({ charge: 0, chargeReady: false, cooldownMs: 0 });
    setHandLost(false);
    previousHandRef.current = null;
    presetRef.current = 'aura-crown';
    onPresetChangeRef.current('aura-crown');
    audioRef.current?.setMuted(false);
    if (needsCamera) onRetry();
  }

  function chooseFilter(id) {
    if (gestureControllerRef.current.mode === GESTURE_MODE.SELECTION) {
      gestureControllerRef.current = exitSelectionMode(gestureControllerRef.current);
      requireNeutralAfterSelectionRef.current = true;
      selectionNeutralMsRef.current = 0;
      setSelectionMode(false);
    }

    if (challengeRef.current.status === 'instructions') {
      challengeRef.current = { ...challengeRef.current, filterActivated: true, filterId: id };
      setChallenge(challengeRef.current);
    }
    if (id === presetRef.current) return;
    getAudio().play('activate');
    presetRef.current = id;
    onPresetChangeRef.current(id);
    showGestureHint(`${FILTERS.find((item) => item.id === id)?.name || 'Filter'} selected.`);
  }

  function updateFilterColor(index, color) {
    setFilterColors((current) => {
      const currentColors = current[preset] || DEFAULT_FILTER_COLORS[preset] || FILTERS[0].swatches;
      const nextColors = [...currentColors];
      nextColors[index] = color;
      return { ...current, [preset]: nextColors };
    });
  }

  function applyGestureFilter(id) {
    chooseFilter(id);
  }

  function showGestureHint(message) {
    window.clearTimeout(gestureHintTimerRef.current);
    setGestureHint(message);
    gestureHintTimerRef.current = window.setTimeout(() => setGestureHint(''), 2600);
  }

  function cancelSelection() {
    const result = cancelFilterSelection(gestureControllerRef.current);
    if (!result.actions.includes(GESTURE_ACTION.CANCEL_SELECTION)) return;
    gestureControllerRef.current = result.state;
    requireNeutralAfterSelectionRef.current = true;
    selectionNeutralMsRef.current = 0;
    setSelectionMode(false);
    showGestureHint('Selection canceled. Relax your hand briefly to rearm. The current filter is unchanged.');
  }

  const trackingMessages = {
    loading: ['Loading local face model', 'Preparing the on-device Face Landmarker and WASM runtime.'],
    searching: ['Looking for faces', 'Face filters will follow up to four people in view.'],
    'no-face': ['No face in frame', 'Move into the preview area to begin landmark tracking.'],
    lost: ['Face tracking paused', 'Faces left the frame. Effects fade until tracking resumes.'],
    multiple: ['Multiple faces detected', 'Face filters are applied to each detected person.'],
    tracking: ['Face tracking active', 'Face filters follow up to four people locally on this device.'],
    error: ['Face tracking unavailable', faceTracking.error || 'Check the local model and runtime, then retry.'],
  };
  const [trackingTitle, trackingDescription] = trackingMessages[faceTracking.status] || ['Camera permission pending', 'Allow camera access to start face tracking.'];
  const faceStatusLabel = captureUrl ? 'PHOTO FROZEN' : faceTracking.faceVisible ? `${faceTracking.facesDetected || 1} ${faceTracking.facesDetected === 1 ? 'FACE' : 'FACES'} DETECTED` : faceTracking.status === 'error' ? 'TRACKING ERROR' : faceTracking.status === 'loading' ? 'LOADING MODEL' : 'SEARCHING FOR FACES';
  const handDescription = handTracking.status === 'error' ? handTracking.error
    : handTracking.handVisible ? `Hand detected${handTracking.gesture ? ` · ${handTracking.gesture.replaceAll('_', ' ')}` : ''}.`
      : handTracking.status === 'loading' ? 'Loading the local one-hand tracker.' : 'Show one hand in the preview to enable gesture controls.';

  return <section className="aura-screen">
    <div className="aura-heading">
      <div><span className="eyebrow"><i /> LIVE PREVIEW · INTERACTIVE</span><h1>IQRA' <em>Aura Mirror</em></h1><p>Explore face filters or try the short gesture challenge.</p></div>
      <div className="aura-header-actions"><button className="outline-button aura-reset" onClick={resetExperience}>Reset Experience</button><button className="outline-button aura-back" onClick={onBack}>← Back to experiences</button></div>
    </div>
    <div className="aura-layout">
      <div className="aura-preview-card">
        <div className="camera-top"><span><i className={`status-dot ${cameraState === 'ready' ? 'active' : ''}`} /> {captureUrl ? 'FROZEN PHOTO PREVIEW' : cameraState === 'ready' ? 'LOCAL CAMERA PREVIEW' : cameraState === 'loading' ? 'WAITING FOR CAMERA PERMISSION' : 'CAMERA UNAVAILABLE'}</span><div className="aura-preview-tools"><span className={`aura-face-status ${faceTracking.faceVisible && !captureUrl ? 'detected' : faceTracking.status === 'error' ? 'error' : ''}`}><i />{faceStatusLabel}</span><span className="camera-tag">MIRRORED · ON DEVICE</span>{cameraState === 'ready' && <button className={`aura-debug-toggle ${debugMode ? 'enabled' : ''}`} onClick={() => setDebugMode((current) => !current)} aria-pressed={debugMode}>{debugMode ? 'LANDMARK DEBUG ON' : 'LANDMARK DEBUG'}</button>}</div></div>
        <div className={`aura-preview-frame ${captureUrl ? 'captured' : ''}`} ref={previewFrameRef}>
          {captureUrl ? <img className="aura-captured-image" src={captureUrl} alt="Captured Aura Mirror photo preview" /> : cameraState === 'ready' && <>
            <video ref={videoRef} autoPlay muted playsInline className="aura-video" />
            <canvas ref={canvasRef} className="aura-canvas" aria-label={`${selectedFilter.name} face tracking effect`} />
            {debugMode && <canvas ref={debugCanvasRef} className="face-debug-canvas" aria-label="Detected face landmarks and estimated face center" />}
            <div className="camera-overlay"><span className="frame-corner tl" /><span className="frame-corner tr" /><span className="frame-corner bl" /><span className="frame-corner br" /><span className="overlay-label">{selectedFilter.name} · {debugMode ? 'LANDMARK DEBUG' : 'LIVE EFFECT'}</span></div>
            {challenge.status === 'instructions' && <div className="aura-challenge-overlay" role="dialog" aria-modal="true" aria-labelledby="aura-challenge-instruction-title"><div className="aura-challenge-modal"><span className="eyebrow">OPTIONAL · 30 SECOND CHALLENGE</span><h2 id="aura-challenge-instruction-title">Charge. Aim. <em>Release.</em></h2><p>Choose one of the filters on the right to activate it, then hit all three energy markers before time runs out.</p><ol><li>Hold <b>Open_Palm</b> to charge your aura.</li><li>Move your hand over a glowing target to aim.</li><li>Close your fist to release one pulse.</li></ol><div className="aura-challenge-modal-actions"><button className="primary-button" disabled={!challenge.filterActivated} onClick={beginChallenge}>{challenge.filterActivated ? 'Begin challenge' : 'Choose a filter first'}</button><button className="outline-button" onClick={returnToFilters}>Back to filters</button></div></div></div>}
            {(challenge.status === 'complete' || challenge.status === 'finished') && <div className="aura-challenge-overlay" role="dialog" aria-modal="true" aria-labelledby="aura-challenge-result-title"><div className="aura-challenge-modal"><span className="eyebrow">CHALLENGE RESULTS · {challenge.activated.length}/3 TARGETS</span><h2 id="aura-challenge-result-title">{challenge.status === 'complete' ? 'Aura activated.' : 'Time is up.'}</h2><p>{challenge.status === 'complete' ? 'All three markers are active. Your filter remains ready for photos or free play.' : `${challenge.activated.length} of 3 energy markers activated. Charge up and try another round.`}</p><div className="aura-challenge-modal-actions"><button className="primary-button" onClick={replayChallenge}>Play again</button><button className="outline-button" onClick={returnToFilters}>Return to filters</button></div></div></div>}
            {showcaseAt > 0 && <div className="aura-showcase-label">SHOWCASE ANIMATION · NO TRACKING INPUT</div>}
            {selectionMode && <div className="aura-selection-carousel" role="dialog" aria-label="Gesture filter selection">
              <div className="aura-selection-top"><b>FILTER SELECTION</b><span>{Math.ceil(selectionRemainingMs / 1000)}s</span><button className="aura-selection-cancel" onClick={cancelSelection}>Cancel · Esc</button></div>
              <div className="aura-selection-options">{FILTERS.map((item, index) => { const colors = filterColors[item.id] || item.swatches; return <button key={item.id} className={selectionIndex === index ? 'highlighted' : ''} onClick={() => chooseFilter(item.id)} aria-pressed={selectionIndex === index}><i style={{ background: `linear-gradient(135deg,${colors[0]},${colors[1]})` }} /><span>{item.name}</span></button>; })}</div>
              <small>Thumb_Up / Thumb_Down to highlight · Open_Palm to apply · relax briefly to rearm</small>
            </div>}
          </>}
          {!captureUrl && cameraState === 'loading' && <div className="aura-preview-state"><span className="session-spinner" /><b>Requesting camera access</b><p>Allow the browser permission prompt to begin your mirror preview.</p><span className="aura-state-note">Your camera is not recorded, saved, or uploaded.</span></div>}
          {!captureUrl && cameraState === 'error' && <div className="aura-preview-state aura-preview-error"><span className="session-error-mark">!</span><b>We couldn’t start the camera</b><p>{cameraError || 'Check your camera connection and browser permission, then try again.'}</p><div className="aura-state-actions"><button className="primary-button" onClick={onRetry}>Try camera again <span className="button-arrow">↻</span></button><button className="outline-button" onClick={onBack}>Back</button></div></div>}
        </div>
        <div className="camera-bottom"><span>{captureUrl ? 'This preview stays in memory until you retake or leave' : 'Video stays on this device · no recording or uploads'}</span><span>16:9 · {captureUrl ? 'CAPTURE' : 'PREVIEW'}</span></div>
        <div className="aura-photo-actions">
          {!captureUrl ? <><button className="primary-button aura-capture-button" onClick={capturePhoto} disabled={cameraState !== 'ready' || captureBusy}>{captureBusy ? 'Preparing photo…' : 'Capture Photo'} <span>◉</span></button><button className="aura-mute-button" onClick={() => { const next = !muted; setMuted(next); if (audioRef.current) audioRef.current.setMuted(next); }} aria-pressed={muted}>{muted ? 'Sound off' : 'Mute sounds'}</button></> : <><button className="outline-button" onClick={retakePhoto}>Retake</button><button className="primary-button" onClick={downloadPhoto}>Download photo</button></>}
        </div>
        {captureError && <p className="aura-capture-error" role="alert">{captureError}</p>}
      </div>
      <aside className="aura-controls-card">
        <div className="aura-control-heading"><span className="eyebrow">YOUR AURA</span><h2>Choose a<br /><em>filter.</em></h2></div>
        <div className="aura-filter-list" role="group" aria-label="Choose an Aura Mirror filter">
          {FILTERS.map((item) => <button key={item.id} disabled={!!captureUrl} className={`aura-filter-option ${preset === item.id ? 'selected' : ''}`} onClick={() => chooseFilter(item.id)} aria-pressed={preset === item.id}>
            <span className="filter-swatch"><i style={{ background: (filterColors[item.id] || item.swatches)[0] }} /><i style={{ background: (filterColors[item.id] || item.swatches)[1] }} /></span><span className="filter-copy"><b>{item.name}</b><small>{item.description}</small></span><span className="filter-check">{preset === item.id ? '✓' : ''}</span>
          </button>)}
        </div>
        <div className="aura-color-controls" role="group" aria-label={`${selectedFilter.name} colors`}>
          <label><span>Primary color</span><input type="color" value={selectedColors[0]} disabled={!!captureUrl} onChange={(event) => updateFilterColor(0, event.target.value)} /></label>
          <label><span>Accent color</span><input type="color" value={selectedColors[1]} disabled={!!captureUrl} onChange={(event) => updateFilterColor(1, event.target.value)} /></label>
        </div>
        <label className="aura-intensity" htmlFor="aura-intensity"><span><b>Effect intensity</b><strong>{intensity}%</strong></span><input id="aura-intensity" type="range" min="0" max="100" value={intensity} disabled={!!captureUrl} onChange={(event) => setIntensity(Number(event.target.value))} style={{ '--intensity': `${intensity}%` }} /><small>Adjust overlay brightness and particle density.</small></label>
        <div className={`aura-tracking-state tracking-${faceTracking.status}`} role="status" aria-live="polite"><span className="tracking-state-mark">{faceTracking.faceVisible ? '✓' : faceTracking.status === 'error' ? '!' : '·'}</span><p><b>{trackingTitle}</b><small>{trackingDescription}</small>{faceTracking.faceVisible && faceTracking.center && faceTracking.size && <small className="face-readout">{faceTracking.facesDetected > 1 ? `${faceTracking.facesDetected} FACES TRACKED · ` : ''}CENTER {faceTracking.center.x.toFixed(2)}, {faceTracking.center.y.toFixed(2)} · SIZE {faceTracking.size.width.toFixed(2)} × {faceTracking.size.height.toFixed(2)}{faceTracking.confidence !== null ? ` · ${faceTracking.confidenceSource === 'landmark-presence' ? 'PRESENCE' : 'VISIBILITY'} ${Math.round(faceTracking.confidence * 100)}%` : ' · SCORE N/A'}</small>}{faceTracking.orientation && <small className="face-readout">HEAD YAW {Math.round(faceTracking.orientation.yaw)}° · PITCH {Math.round(faceTracking.orientation.pitch)}° · ROLL {Math.round(faceTracking.orientation.roll)}°</small>}</p></div>
        <div className="aura-privacy-notice"><b>YOUR PRIVACY</b><span>Camera frames and tracking run locally on this device. Nothing is recorded or uploaded. Captures stay in this tab until you retake or leave; a file is created only when you choose Download.</span></div>
        {!captureUrl && <div className={`aura-tracking-state tracking-${handTracking.status}`} role="status" aria-live="polite"><span className="tracking-state-mark">{handTracking.handVisible ? '✓' : handTracking.status === 'error' ? '!' : '·'}</span><p><b>Hand tracking {handTracking.handVisible ? 'active' : handTracking.status}</b><small>{handDescription}</small></p></div>}
        {!captureUrl && challenge.status !== 'playing' && <div className="aura-effect-hud" role="status" aria-live="polite">
          <div className="aura-effect-hud-title"><b>{selectedFilter.name}</b><span>{effectStatus.cooldownMs > 0 ? `COOLDOWN ${Math.ceil(effectStatus.cooldownMs / 100) / 10}s` : effectStatus.chargeReady ? 'CHARGE READY' : effectStatus.charge > 0 ? 'CHARGING' : 'READY'}</span></div>
          <div className="aura-energy-meter" role="progressbar" aria-label="Filter effect charge" aria-valuemin="0" aria-valuemax="100" aria-valuenow={Math.round(effectStatus.charge * 100)}><i style={{ width: `${Math.round(effectStatus.charge * 100)}%` }} /></div>
          <small>{effectStatus.cooldownMs > 0 ? 'Wait briefly, then charge again.' : selectedFilter.id === 'aura-crown' ? 'Hold a closed fist near the halo. Its motes spread and accelerate before an upward laser fires.' : selectedFilter.id === 'energy-hands' ? 'Both hands combine into one energy ball; bring them together to enlarge it, then close both fists for a Kamehameha beam.' : 'Open both hands to raise a shield; close both fists near the visor to fire twin eye lasers.'}</small>
        </div>}
        <div className="aura-challenge-card">
          <div className="aura-challenge-title"><span className="eyebrow">OPTIONAL · 30 SECOND CHALLENGE</span>{challenge.status === 'playing' && <strong>{Math.ceil(challenge.remainingMs / 1000)}s</strong>}</div>
          <div className="aura-energy-meter" role="progressbar" aria-label="Gesture charge" aria-valuemin="0" aria-valuemax="100" aria-valuenow={challenge.energy}><i style={{ width: `${challenge.energy}%` }} /></div>
          <p className="aura-game-instruction"><b>{challenge.status === 'playing' ? 'OPEN PALM → POINT → CLOSE FIST' : challenge.status === 'complete' ? 'ALL THREE MARKERS ACTIVATED' : challenge.status === 'finished' ? 'TIME COMPLETE · GIVE IT ANOTHER TRY' : challenge.status === 'instructions' ? challenge.filterActivated ? `${FILTERS.find((item) => item.id === challenge.filterId)?.name || 'FILTER'} READY` : 'CHOOSE A FILTER TO BEGIN' : challenge.status === 'skipped' ? 'FILTER PREVIEW · CHALLENGE SKIPPED' : 'OPEN PALM → POINT → CLOSE FIST'}</b><small>{challenge.status === 'playing' ? challenge.feedback || 'Hold Open_Palm to charge, aim with your hand position, then release with Closed_Fist.' : challenge.status === 'instructions' ? 'Select a filter above, then begin. Hold Open_Palm to charge, aim at a target with your hand, and close your fist to release.' : 'Hold Open_Palm to charge, aim at a marker with your hand, then release with Closed_Fist.'}</small></p>
          <div className="aura-challenge-progress"><span>{challenge.activated.length}/3 MARKERS</span><span>{challenge.status === 'playing' && !faceTracking.faceVisible ? 'PAUSED · FACE LOST' : challenge.status === 'playing' && !handTracking.handVisible ? 'PAUSED · SHOW HAND' : challenge.feedback || 'READY'}</span></div>
          <div className="aura-challenge-actions">{challenge.status === 'playing' ? <button className="outline-button" onClick={skipChallenge}>End challenge</button> : <button className="primary-button" onClick={startChallenge} disabled={!!captureUrl}>{challenge.status === 'complete' || challenge.status === 'finished' ? 'Play again' : challenge.status === 'instructions' ? 'Challenge instructions' : 'Start challenge'}</button>}{challenge.status === 'idle' && <button className="outline-button" onClick={skipChallenge} disabled={!!captureUrl}>Just enjoy filters</button>}{challenge.status !== 'playing' && <button className="outline-button" onClick={playShowcase} disabled={showcaseAt > 0 || !!captureUrl}>{showcaseAt > 0 ? 'Showcase playing' : 'Run visual demo'}</button>}</div>
          {showcaseAt > 0 && <small className="aura-demo-disclaimer">Visual-only animation. It does not use or simulate hand tracking.</small>}
        </div>
        {!captureUrl && <div className={`aura-instructions ${selectionMode ? 'selection-instructions' : ''}`}><span>{challenge.status === 'playing' ? 'CHALLENGE GESTURES' : selectionMode ? 'FILTER SELECTION' : 'GESTURE CONTROLS'}</span><p>{challenge.status === 'playing' ? 'Open_Palm charges, Pointing_Up aims and Closed_Fist releases. Filter gestures are paused during the challenge.' : selectionMode ? 'Hold Thumb_Up or Thumb_Down briefly to highlight a filter. Hold Open_Palm to apply, or cancel with Escape.' : 'Hold Open_Palm to charge a filter effect, then close your fist after the charge builds to release one pulse. Near the crown, keep a fist closed to build a faster, wider mote orbit before its laser fires. Hold Thumb_Up or Thumb_Down briefly to change filters; hold Pointing_Up for about 0.8 seconds to open selection. Manual filter buttons remain available.'}</p>{handLost && challenge.status !== 'playing' && <small className="gesture-tracking-pause">Hand tracking lost · gesture actions are paused until reacquired.</small>}{gestureHint && <small className="gesture-action-hint" role="status">{gestureHint}</small>}</div>}
      </aside>
    </div>
  </section>;
}
