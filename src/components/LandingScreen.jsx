const gestures = [
  { number: '01', title: 'OPEN PALM', detail: 'Begin the interaction', icon: '✋' },
  { number: '02', title: 'PINCH', detail: 'Select a letter', icon: '⌁' },
  { number: '03', title: 'SWIPE', detail: 'Move through the set', icon: '⇢' },
];

export default function LandingScreen({ onStart, onStartDemo }) {
  return <section className="landing">
    <div className="hero-copy"><span className="eyebrow"><i /> A NEW WAY TO LEARN</span>
      <h1>Learn with<br /><em>your hands.</em></h1>
      <p className="hero-description">A gesture-powered journey through the Arabic alphabet. Move, explore, and discover the joy of learning with IQRA’.</p>
      <div className="hero-actions mode-actions"><button className="primary-button" onClick={onStart}>Use gesture tracking <span className="button-arrow">→</span></button><button className="outline-button" onClick={onStartDemo}>Play Demo Mode</button></div><span className="duration mode-caption">Choose camera tracking or a mouse-controlled demo. Demo Mode does not use hand tracking.</span>
      <div className="hero-note"><span className="note-line" /> <span>CAMERA OPTIONAL <span className="note-separator">/</span> YOUR VIDEO STAYS ON THIS DEVICE</span></div>
    </div>
    <div className="hero-art" aria-hidden="true"><div className="orbit orbit-outer" /><div className="orbit orbit-inner" /><div className="orbit orbit-dash" /><div className="halo" /><div className="hero-glyph">ع</div><div className="glyph-caption"><span>ARABIC · 18</span><i /> LETTERS TO DISCOVER</div><div className="coord coord-a">02° 14’ 09” N<br />101° 43’ 21” E</div><div className="coord coord-b">IQ / 001<br />LEARNING MODE</div><span className="spark spark-a">✳</span><span className="spark spark-b">+</span></div>
    <div className="instructions"><div className="instructions-title"><span className="eyebrow">HOW TO PLAY</span><h2>Three gestures.<br /><em>A world of letters.</em></h2></div><div className="gesture-list">{gestures.map((gesture) => <article className="gesture-card" key={gesture.number}><div className="gesture-top"><span>{gesture.number} <i /></span><span className="gesture-icon">{gesture.icon}</span></div><div className="gesture-bottom"><b>{gesture.title}</b><small>{gesture.detail}</small></div></article>)}</div></div>
    <div className="landing-index"><span>01 — 03</span><span>EXPLORE THE EXPERIENCE <b>↓</b></span></div>
  </section>;
}
