export default function AuraChallengeOverlays({
  challenge,
  showcaseAt,
  selectionMode,
  selectionRemainingMs,
  selectionIndex,
  filters,
  filterColors,
  onBeginChallenge,
  onReturnToFilters,
  onReplayChallenge,
  onCancelSelection,
  onChooseFilter,
}) {
  return (
    <>
      {challenge.status === 'instructions' && (
        <div className="aura-challenge-overlay" role="dialog" aria-modal="true" aria-labelledby="aura-challenge-instruction-title">
          <div className="aura-challenge-modal">
            <span className="eyebrow">OPTIONAL · 30 SECOND CHALLENGE</span>
            <h2 id="aura-challenge-instruction-title">Charge. Aim. <em>Release.</em></h2>
            <p>Choose one of the filters on the right to activate it, then hit all three energy markers before time runs out.</p>
            <ol>
              <li>Hold <b>Open_Palm</b> to charge your aura.</li>
              <li>Move your hand over a glowing target to aim.</li>
              <li>Close your fist to release one pulse.</li>
            </ol>
            <div className="aura-challenge-modal-actions">
              <button className="primary-button" disabled={!challenge.filterActivated} onClick={onBeginChallenge}>
                {challenge.filterActivated ? 'Begin challenge' : 'Choose a filter first'}
              </button>
              <button className="outline-button" onClick={onReturnToFilters}>Back to filters</button>
            </div>
          </div>
        </div>
      )}
      {(challenge.status === 'complete' || challenge.status === 'finished') && (
        <div className="aura-challenge-overlay" role="dialog" aria-modal="true" aria-labelledby="aura-challenge-result-title">
          <div className="aura-challenge-modal">
            <span className="eyebrow">CHALLENGE RESULTS · {challenge.activated.length}/3 TARGETS</span>
            <h2 id="aura-challenge-result-title">{challenge.status === 'complete' ? 'Aura activated.' : 'Time is up.'}</h2>
            <p>
              {challenge.status === 'complete'
                ? 'All three markers are active. Your filter remains ready for photos or free play.'
                : `${challenge.activated.length} of 3 energy markers activated. Charge up and try another round.`}
            </p>
            <div className="aura-challenge-modal-actions">
              <button className="primary-button" onClick={onReplayChallenge}>Play again</button>
              <button className="outline-button" onClick={onReturnToFilters}>Return to filters</button>
            </div>
          </div>
        </div>
      )}
      {showcaseAt > 0 && <div className="aura-showcase-label">SHOWCASE ANIMATION · NO TRACKING INPUT</div>}
      {selectionMode && (
        <div className="aura-selection-carousel" role="dialog" aria-label="Gesture filter selection">
          <div className="aura-selection-top">
            <b>FILTER SELECTION</b>
            <span>{Math.ceil(selectionRemainingMs / 1000)}s</span>
            <button className="aura-selection-cancel" onClick={onCancelSelection}>Cancel · Esc</button>
          </div>
          <div className="aura-selection-options">
            {filters.map((item, index) => {
              const colors = filterColors[item.id] || item.swatches;
              return (
                <button
                  key={item.id}
                  className={selectionIndex === index ? 'highlighted' : ''}
                  onClick={() => onChooseFilter(item.id)}
                  aria-pressed={selectionIndex === index}
                >
                  <i style={{ background: `linear-gradient(135deg,${colors[0]},${colors[1]})` }} />
                  <span>{item.name}</span>
                </button>
              );
            })}
          </div>
          <small>Thumb_Up / Thumb_Down to highlight · Open_Palm to apply · relax briefly to rearm</small>
        </div>
      )}
    </>
  );
}
