function formatTime(milliseconds) {
  const seconds = Math.ceil(milliseconds / 1000);
  return `00:${String(seconds).padStart(2, '0')}`;
}

export default function GameHUD({ tracking, game, muted, onToggleMute, demoMode }) {
  const filledSegments = Math.floor(game.energy * 10);
  const phaseLabel = game.status === 'paused' ? 'PAUSED' : game.status === 'playing' ? 'LIVE ROUND' : '30 SEC';
  const statusMessage = demoMode
    ? 'Mouse aim is simulated; this is not hand tracking.'
    : tracking.status === 'error'
    ? 'Gesture recognition unavailable.'
    : !tracking.handVisible
      ? 'Show one hand in the camera.'
      : game.cooldownMs > 0
        ? 'Pulse cooling down.'
        : tracking.gesture === 'Open_Palm'
          ? 'Open palm detected. Hold to charge.'
        : game.energy >= 0.28
          ? 'Charge ready. Close your fist to pulse.'
          : 'Open your palm to charge.';

  return <aside className="hud-card">
    <div className="hud-header"><div><span className="eyebrow">TARGET CHALLENGE</span><h2>Find your<br /><em>focus.</em></h2></div>
      <div className="hud-controls"><span className="hud-badge">{phaseLabel}</span><button className="mute-button" onClick={onToggleMute} aria-pressed={muted} aria-label={muted ? 'Enable game sounds' : 'Mute game sounds'} title={muted ? 'Enable sound' : 'Mute sound'}>{muted ? 'SOUND OFF' : 'SOUND ON'}</button></div>
    </div>
    <div className="metrics">
      <div className="metric"><span>SCORE</span><strong>{String(game.score).padStart(3, '0')}</strong><small>PTS</small></div>
      <div className="metric"><span>TIME LEFT</span><strong>{formatTime(game.remainingMs)}</strong><small>SEC</small></div>
    </div>
      <div className="energy"><div className="energy-label"><span>{demoMode ? 'DEMO ENERGY' : 'ENERGY CHARGE'}</span><b>{Math.round(game.energy * 100)}%</b></div>
      <div className="energy-track" role="meter" aria-label="Energy charge" aria-valuemin="0" aria-valuemax="100" aria-valuenow={Math.round(game.energy * 100)}>{Array.from({ length: 10 }, (_, index) => <i className={index < filledSegments ? 'filled' : ''} key={index} />)}</div>
      <small>{game.cooldownMs > 0 ? `COOLDOWN ${(game.cooldownMs / 1000).toFixed(1)}S` : game.energy >= 0.28 ? 'CHARGE READY' : demoMode ? 'CHARGES AUTOMATICALLY' : 'OPEN PALM TO CHARGE'}</small>
    </div>
    <div className={`hud-message game-feedback ${game.feedback.startsWith('HIT') ? 'is-hit' : game.feedback === 'MISS' ? 'is-miss' : ''}`}><span className="hud-message-icon">{game.feedback.startsWith('HIT') ? '+' : game.feedback === 'MISS' ? '!' : '✳'}</span><p><b className="feedback-title">{game.feedback}</b><br />{statusMessage}</p></div>
    <div className="challenge-instructions"><span>{demoMode ? 'DEMO' : 'PLAY'}</span><p>{demoMode ? 'Move mouse to aim · wait for charge · click to pulse.' : 'Open palm to charge · aim with your hand · close fist to release.'}</p></div>
    <div className="hud-foot"><span>TARGETS HIT</span><b>{Math.floor(game.score / 100)}</b></div>
  </aside>;
}
