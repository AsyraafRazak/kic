export default function ModeSelectionScreen({ onSelectGame, onSelectAuraMirror, onSelectFilterCreator }) {
  return <section className="mode-screen">
    <div className="mode-intro">
      <span className="eyebrow"><i /> KELAB IQRA INTERACTIVE SHOWCASE</span>
      <h1>Choose your<br /><em>experience.</em></h1>
      <p>Play a gesture challenge, explore Aura Mirror, or draw a filter of your own.</p>
    </div>
    <div className="mode-options">
      <button className="mode-option" onClick={onSelectGame}>
        <span className="mode-option-index">01 / GAME</span>
        <span className="mode-option-glyph game-glyph">✳</span>
        <strong>Gesture Game</strong>
        <span className="mode-option-description">Charge and release energy pulses using hand gestures.</span>
        <span className="mode-option-action">ENTER GAME <b>↗</b></span>
      </button>
      <button className="mode-option aura-option" onClick={onSelectAuraMirror}>
        <span className="mode-option-index">02 / MIRROR</span>
        <span className="mode-option-glyph aura-glyph"><i /><i /><i /></span>
        <strong>IQRA' Aura Mirror</strong>
        <span className="mode-option-description">Try luminous color filters in a mirrored camera preview.</span>
        <span className="mode-option-action">OPEN AURA MIRROR <b>↗</b></span>
      </button>
      <button className="mode-option creator-option" onClick={onSelectFilterCreator}>
        <span className="mode-option-index">03 / STUDIO</span>
        <span className="mode-option-glyph creator-glyph"><i /><i /><i /></span>
        <strong>Filter Creator</strong>
        <span className="mode-option-description">Draw a transparent filter and preview it anchored to your face.</span>
        <span className="mode-option-action">OPEN CREATIVE STUDIO <b>↗</b></span>
      </button>
    </div>
    <p className="mode-privacy">Camera access is requested only after choosing an experience. Video stays on this device.</p>
  </section>;
}
