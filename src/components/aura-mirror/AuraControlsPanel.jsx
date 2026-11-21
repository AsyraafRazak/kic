export default function AuraControlsPanel({
  filters,
  preset,
  filterColors,
  selectedFilter,
  selectedColors,
  intensity,
  captureUrl,
  faceTracking,
  trackingTitle,
  trackingDescription,
  handTracking,
  handDescription,
  challenge,
  effectStatus,
  showcaseAt,
  selectionMode,
  handLost,
  gestureHint,
  onChooseFilter,
  onUpdateFilterColor,
  onIntensityChange,
  onSkipChallenge,
  onStartChallenge,
  onPlayShowcase,
}) {
  return (
    <aside className="aura-controls-card">
      <div className="aura-control-heading"><span className="eyebrow">YOUR AURA</span><h2>Choose a<br /><em>filter.</em></h2></div>
      <div className="aura-filter-list" role="group" aria-label="Choose an Aura Mirror filter">
        {filters.map((item) => (
          <button
            key={item.id}
            disabled={!!captureUrl}
            className={`aura-filter-option ${preset === item.id ? 'selected' : ''}`}
            onClick={() => onChooseFilter(item.id)}
            aria-pressed={preset === item.id}
          >
            <span className="filter-swatch">
              <i style={{ background: (filterColors[item.id] || item.swatches)[0] }} />
              <i style={{ background: (filterColors[item.id] || item.swatches)[1] }} />
            </span>
            <span className="filter-copy"><b>{item.name}</b><small>{item.description}</small></span>
            <span className="filter-check">{preset === item.id ? '✓' : ''}</span>
          </button>
        ))}
      </div>
      <div className="aura-color-controls" role="group" aria-label={`${selectedFilter.name} colors`}>
        <label><span>Primary color</span><input type="color" value={selectedColors[0]} disabled={!!captureUrl} onChange={(event) => onUpdateFilterColor(0, event.target.value)} /></label>
        <label><span>Accent color</span><input type="color" value={selectedColors[1]} disabled={!!captureUrl} onChange={(event) => onUpdateFilterColor(1, event.target.value)} /></label>
      </div>
      <label className="aura-intensity" htmlFor="aura-intensity">
        <span><b>Effect intensity</b><strong>{intensity}%</strong></span>
        <input id="aura-intensity" type="range" min="0" max="100" value={intensity} disabled={!!captureUrl} onChange={(event) => onIntensityChange(Number(event.target.value))} style={{ '--intensity': `${intensity}%` }} />
        <small>Adjust overlay brightness and particle density.</small>
      </label>
      <div className={`aura-tracking-state tracking-${faceTracking.status}`} role="status" aria-live="polite">
        <span className="tracking-state-mark">{faceTracking.faceVisible ? '✓' : faceTracking.status === 'error' ? '!' : '·'}</span>
        <p>
          <b>{trackingTitle}</b>
          <small>{trackingDescription}</small>
          {faceTracking.faceVisible && faceTracking.center && faceTracking.size && (
            <small className="face-readout">
              {faceTracking.facesDetected > 1 ? `${faceTracking.facesDetected} FACES TRACKED · ` : ''}
              CENTER {faceTracking.center.x.toFixed(2)}, {faceTracking.center.y.toFixed(2)} · SIZE {faceTracking.size.width.toFixed(2)} × {faceTracking.size.height.toFixed(2)}
              {faceTracking.confidence !== null
                ? ` · ${faceTracking.confidenceSource === 'landmark-presence' ? 'PRESENCE' : 'VISIBILITY'} ${Math.round(faceTracking.confidence * 100)}%`
                : ' · SCORE N/A'}
            </small>
          )}
          {faceTracking.orientation && (
            <small className="face-readout">
              HEAD YAW {Math.round(faceTracking.orientation.yaw)}° · PITCH {Math.round(faceTracking.orientation.pitch)}° · ROLL {Math.round(faceTracking.orientation.roll)}°
            </small>
          )}
        </p>
      </div>
      <div className="aura-privacy-notice">
        <b>YOUR PRIVACY</b>
        <span>Camera frames and tracking run locally on this device. Nothing is recorded or uploaded. Captures stay in this tab until you retake or leave; a file is created only when you choose Download.</span>
      </div>
      {!captureUrl && (
        <div className={`aura-tracking-state tracking-${handTracking.status}`} role="status" aria-live="polite">
          <span className="tracking-state-mark">{handTracking.handVisible ? '✓' : handTracking.status === 'error' ? '!' : '·'}</span>
          <p><b>Hand tracking {handTracking.handVisible ? 'active' : handTracking.status}</b><small>{handDescription}</small></p>
        </div>
      )}
      {!captureUrl && challenge.status !== 'playing' && (
        <div className="aura-effect-hud" role="status" aria-live="polite">
          <div className="aura-effect-hud-title">
            <b>{selectedFilter.name}</b>
            <span>{effectStatus.cooldownMs > 0 ? `COOLDOWN ${Math.ceil(effectStatus.cooldownMs / 100) / 10}s` : effectStatus.chargeReady ? 'CHARGE READY' : effectStatus.charge > 0 ? 'CHARGING' : 'READY'}</span>
          </div>
          <div className="aura-energy-meter" role="progressbar" aria-label="Filter effect charge" aria-valuemin="0" aria-valuemax="100" aria-valuenow={Math.round(effectStatus.charge * 100)}>
            <i style={{ width: `${Math.round(effectStatus.charge * 100)}%` }} />
          </div>
          <small>
            {effectStatus.cooldownMs > 0
              ? 'Wait briefly, then charge again.'
              : selectedFilter.id === 'aura-crown'
                ? 'Hold a closed fist near the halo. Its motes spread and accelerate before an upward laser fires.'
                : selectedFilter.id === 'energy-hands'
                  ? 'Both hands combine into one energy ball; bring them together to enlarge it, then close both fists for a Kamehameha beam.'
                  : 'Open both hands to raise a shield; close both fists near the visor to fire twin eye lasers.'}
          </small>
        </div>
      )}
      <div className="aura-challenge-card">
        <div className="aura-challenge-title">
          <span className="eyebrow">OPTIONAL · 30 SECOND CHALLENGE</span>
          {challenge.status === 'playing' && <strong>{Math.ceil(challenge.remainingMs / 1000)}s</strong>}
        </div>
        <div className="aura-energy-meter" role="progressbar" aria-label="Gesture charge" aria-valuemin="0" aria-valuemax="100" aria-valuenow={challenge.energy}>
          <i style={{ width: `${challenge.energy}%` }} />
        </div>
        <p className="aura-game-instruction">
          <b>
            {challenge.status === 'playing'
              ? 'OPEN PALM → POINT → CLOSE FIST'
              : challenge.status === 'complete'
                ? 'ALL THREE MARKERS ACTIVATED'
                : challenge.status === 'finished'
                  ? 'TIME COMPLETE · GIVE IT ANOTHER TRY'
                  : challenge.status === 'instructions'
                    ? challenge.filterActivated
                      ? `${filters.find((item) => item.id === challenge.filterId)?.name || 'FILTER'} READY`
                      : 'CHOOSE A FILTER TO BEGIN'
                    : challenge.status === 'skipped'
                      ? 'FILTER PREVIEW · CHALLENGE SKIPPED'
                      : 'OPEN PALM → POINT → CLOSE FIST'}
          </b>
          <small>
            {challenge.status === 'playing'
              ? challenge.feedback || 'Hold Open_Palm to charge, aim with your hand position, then release with Closed_Fist.'
              : challenge.status === 'instructions'
                ? 'Select a filter above, then begin. Hold Open_Palm to charge, aim at a target with your hand, and close your fist to release.'
                : 'Hold Open_Palm to charge, aim at a marker with your hand, then release with Closed_Fist.'}
          </small>
        </p>
        <div className="aura-challenge-progress">
          <span>{challenge.activated.length}/3 MARKERS</span>
          <span>
            {challenge.status === 'playing' && !faceTracking.faceVisible
              ? 'PAUSED · FACE LOST'
              : challenge.status === 'playing' && !handTracking.handVisible
                ? 'PAUSED · SHOW HAND'
                : challenge.feedback || 'READY'}
          </span>
        </div>
        <div className="aura-challenge-actions">
          {challenge.status === 'playing'
            ? <button className="outline-button" onClick={onSkipChallenge}>End challenge</button>
            : (
              <button className="primary-button" onClick={onStartChallenge} disabled={!!captureUrl}>
                {challenge.status === 'complete' || challenge.status === 'finished'
                  ? 'Play again'
                  : challenge.status === 'instructions'
                    ? 'Challenge instructions'
                    : 'Start challenge'}
              </button>
            )}
          {challenge.status === 'idle' && <button className="outline-button" onClick={onSkipChallenge} disabled={!!captureUrl}>Just enjoy filters</button>}
          {challenge.status !== 'playing' && (
            <button className="outline-button" onClick={onPlayShowcase} disabled={showcaseAt > 0 || !!captureUrl}>
              {showcaseAt > 0 ? 'Showcase playing' : 'Run visual demo'}
            </button>
          )}
        </div>
        {showcaseAt > 0 && <small className="aura-demo-disclaimer">Visual-only animation. It does not use or simulate hand tracking.</small>}
      </div>
      {!captureUrl && (
        <div className={`aura-instructions ${selectionMode ? 'selection-instructions' : ''}`}>
          <span>{challenge.status === 'playing' ? 'CHALLENGE GESTURES' : selectionMode ? 'FILTER SELECTION' : 'GESTURE CONTROLS'}</span>
          <p>
            {challenge.status === 'playing'
              ? 'Open_Palm charges, Pointing_Up aims and Closed_Fist releases. Filter gestures are paused during the challenge.'
              : selectionMode
                ? 'Hold Thumb_Up or Thumb_Down briefly to highlight a filter. Hold Open_Palm to apply, or cancel with Escape.'
                : 'Hold Open_Palm to charge a filter effect, then close your fist after the charge builds to release one pulse. Near the crown, keep a fist closed to build a faster, wider mote orbit before its laser fires. Hold Thumb_Up or Thumb_Down briefly to change filters; hold Pointing_Up for about 0.8 seconds to open selection. Manual filter buttons remain available.'}
          </p>
          {handLost && challenge.status !== 'playing' && <small className="gesture-tracking-pause">Hand tracking lost · gesture actions are paused until reacquired.</small>}
          {gestureHint && <small className="gesture-action-hint" role="status">{gestureHint}</small>}
        </div>
      )}
    </aside>
  );
}
