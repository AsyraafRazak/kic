const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const lerp = (a, b, t) => a + (b - a) * t;
const COLORS = { 'aura-crown': ['98, 231, 229', '84, 142, 255'], 'energy-hands': ['98, 231, 229', '85, 183, 255'], 'guardian-visor': ['126, 210, 255', '132, 153, 255'] };

/** Canvas-only AR effects. Tracking stays in its own hooks and normalized mirrored coordinates. */
export function startAuraCanvas(canvas, getInputs, reducedMotion = false) {
  const ctx = canvas?.getContext('2d', { alpha: true });
  if (!canvas || !ctx) return () => {};
  let width = 0, height = 0, ratio = 1, frameId = 0, previousAt = 0;
  let faceAnchor = null, faceAnchors = [], faceAlpha = 0, handAnchor = null, handAlpha = 0;
  let activePreset = null, outgoingPreset = null, transitionAt = 0, shownPulseId = 0, shownFilterPulseId = 0;
  const customRolls = [];
  let crownHandInfluence = 0;
  let crownSpin = 0;
  let crownSpinHoldMs = 0;
  const particles = [];
  const bursts = [];
  const crownBursts = [];
  const crownTrail = [];
  const filterBursts = [];
  let previousCrownHand = null;

  function resize() {
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    ratio = Math.min(1.5, window.devicePixelRatio || 1, 1280 / rect.width, 720 / rect.height);
    width = rect.width; height = rect.height;
    const w = Math.max(1, Math.round(width * ratio)), h = Math.max(1, Math.round(height * ratio));
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  }
  resize();
  const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(resize);
  observer?.observe(canvas);
  if (!observer) window.addEventListener('resize', resize);

  // Input positions already use mirrored normalized coordinates. Match object-fit: cover.
  function mapPoint(point) {
    if (!point) return null;
    const video = canvas.parentElement?.querySelector('video');
    const sourceW = video?.videoWidth || width, sourceH = video?.videoHeight || height;
    const scale = Math.max(width / sourceW, height / sourceH);
    return { x: point.x * sourceW * scale + (width - sourceW * scale) / 2, y: point.y * sourceH * scale + (height - sourceH * scale) / 2 };
  }
  function polygon(points, fill, stroke, lineWidth = 1) {
    ctx.beginPath(); points.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lineWidth; ctx.stroke(); }
  }
  function renderCrown(now, input, alpha, amount, color, dt) {
    if (!faceAnchor || alpha < .01) {
      crownSpinHoldMs = 0;
      return;
    }
    const { x, y, size } = faceAnchor;
    const widthPx = clamp(size.width * width * 1.08, 60, width * .62);
    const charge = input.filterInteraction?.charge || 0;
    const bob = reducedMotion ? 0 : Math.sin(now * .0012) * 2;
    const cx = x, baseCy = y - size.height * height * .65 - bob;
    const cy = baseCy;
    const lift = crownHandInfluence;
    const power = clamp(crownSpinHoldMs / 1100, 0, 1);
    const rx = widthPx * (.48 + lift * .035 + charge * .06), ry = rx * (.24 + charge * .035);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate((faceAnchor.orientation?.roll || 0) * Math.PI / 180);
    ctx.translate(-cx, -cy);
    ctx.globalAlpha = alpha * clamp(.12 + amount * .65 + charge * .25 + lift * .24, 0, 1);
    ctx.shadowColor = `rgb(${color[0]})`;
    ctx.shadowBlur = reducedMotion ? 0 : 8 + charge * 12;
    ctx.strokeStyle = `rgba(${color[0]},.96)`;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, Math.PI, Math.PI * 2); ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = `rgba(${color[1]},.86)`;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.ellipse(cx, cy + 2, rx * .86, ry * .68, 0, Math.PI, Math.PI * 2); ctx.stroke();
    const pts = [-1, -.5, 0, .5, 1].map((v, i) => ({ x: cx + rx * v, y: cy - ry * (i === 2 ? 1.1 : i % 2 ? .62 : .18) }));
    ctx.beginPath(); pts.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.stroke();
    ctx.lineTo(cx - rx, cy);
    ctx.closePath();
    const crownFill = ctx.createLinearGradient(cx, cy - ry, cx, cy + ry);
    crownFill.addColorStop(0, `rgba(${color[0]},.16)`);
    crownFill.addColorStop(1, `rgba(${color[1]},.025)`);
    ctx.fillStyle = crownFill;
    ctx.fill();
    for (let i = 0; i < pts.length; i++) {
      const jewel = pts[i];
      const jewelRadius = i === 2 ? 4.2 : 2.5;
      ctx.beginPath();
      ctx.arc(jewel.x, jewel.y + 2, jewelRadius + (i === 2 ? power : 0), 0, Math.PI * 2);
      ctx.fillStyle = i === 2 ? '#f5ffff' : `rgb(${color[1]})`;
      ctx.shadowColor = `rgb(${color[0]})`;
      ctx.shadowBlur = reducedMotion ? 0 : 6 + charge * 10;
      ctx.fill();
    }
    ctx.shadowBlur = 0;
    const orbitRadius = 1.12 + power * .82 + charge * .14;
    const orbitSpeed = reducedMotion ? 0 : .00045 + power * .0032;
    ctx.fillStyle = `rgba(${color[1]},${.45 + amount * .35 + charge * .2})`;
    for (let i = 0; i < 10; i++) {
      const a = now * orbitSpeed + i * Math.PI * 2 / 10;
      const orbitY = Math.sin(a) * ry * (1.8 + power * .8);
      ctx.beginPath();
      ctx.arc(cx + Math.cos(a) * rx * orbitRadius, cy + orbitY, 1.5 + amount + charge + power, 0, Math.PI * 2);
      ctx.fill();
    }
    if (power > .02) {
      ctx.globalAlpha *= power;
      ctx.strokeStyle = `rgba(${color[0]},.52)`;
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.ellipse(cx, cy, rx * (1.08 + power * .34), ry * (1.45 + power * .35), 0, Math.PI, Math.PI * 2); ctx.stroke();
    }
    if (lift > .04) { ctx.globalAlpha *= .55 * lift; ctx.beginPath(); ctx.ellipse(cx, cy, rx * 1.12, ry * 1.35, 0, 0, Math.PI * 2); ctx.stroke(); }
    for (let i = crownTrail.length - 1; i >= 0; i--) {
      const particle = crownTrail[i]; particle.life -= dt;
      if (particle.life <= 0) { crownTrail.splice(i, 1); continue; }
      ctx.globalAlpha = alpha * amount * clamp(particle.life / particle.max, 0, 1) * .7;
      ctx.beginPath(); ctx.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2); ctx.fill();
    }
    for (let i = crownBursts.length - 1; i >= 0; i--) {
      const burst = crownBursts[i]; burst.age += .016;
      if (burst.age > .65) { crownBursts.splice(i, 1); continue; }
      ctx.globalAlpha = alpha * (1 - burst.age / .65) * amount * .8;
      ctx.beginPath(); ctx.arc(cx + burst.offsetX, cy + burst.offsetY, 1.4 + burst.age * 9, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
    if (crownSpinHoldMs >= 1100) {
      const laserTop = 0;
      const laserStart = cy - ry * 1.2;
      const laser = ctx.createLinearGradient(cx, laserStart, cx, laserTop);
      laser.addColorStop(0, `rgba(${color[0]},.95)`);
      laser.addColorStop(.2, `rgba(${color[0]},.8)`);
      laser.addColorStop(1, `rgba(${color[1]},.08)`);
      ctx.save(); ctx.globalAlpha = alpha * (.62 + amount * .3);
      ctx.strokeStyle = laser; ctx.lineCap = 'round';
      ctx.shadowColor = `rgb(${color[0]})`; ctx.shadowBlur = reducedMotion ? 0 : 20;
      ctx.lineWidth = Math.max(8, widthPx * .035);
      ctx.beginPath(); ctx.moveTo(cx, laserStart); ctx.lineTo(cx, laserTop); ctx.stroke();
      ctx.shadowBlur = 0; ctx.strokeStyle = 'rgba(230,255,255,.96)';
      ctx.lineWidth = Math.max(2, widthPx * .008);
      ctx.beginPath(); ctx.moveTo(cx, laserStart); ctx.lineTo(cx, laserTop); ctx.stroke();
      ctx.restore();
    }
  }
  function renderVisor(input, alpha, amount, color, now) {
    if (!faceAnchor || alpha < .01) return;
    const landmarks = faceAnchor.landmarks;
    const left = mapPoint(landmarks?.[33]), right = mapPoint(landmarks?.[263]);
    const center = left && right ? { x: (left.x + right.x) / 2, y: (left.y + right.y) / 2 } : { x: faceAnchor.x, y: faceAnchor.y - faceAnchor.size.height * height * .12 };
    const dx = left && right ? right.x - left.x : faceAnchor.size.width * width * .48;
    const dy = left && right ? right.y - left.y : 0;
    const w = clamp(Math.hypot(dx, dy) * 1.48, 70, width * .7), h = w * .32;
    const angle = Math.atan2(dy, dx) + (faceAnchor.orientation?.roll || 0) * Math.PI / 180 * .24;
    const activation = clamp((now - transitionAt) / 480, 0, 1);
    const scale = .84 + activation * .16;
    const trackedHands = input.handTracking?.hands || [];
    const confidentHands = trackedHands.filter((hand) => (Number(hand.confidence) || 0) >= .58);
    const shieldActive = confidentHands.length >= 2 && confidentHands.slice(0, 2).every((hand) => hand.gesture === 'Open_Palm');
    const nearbyFists = confidentHands
      .filter((hand) => hand.gesture === 'Closed_Fist')
      .map((hand) => mapPoint(hand.position))
      .filter((point) => point && Math.hypot(point.x - center.x, point.y - center.y) < w * .72)
      .slice(0, 2);
    ctx.save(); ctx.translate(center.x, center.y + h * .12); ctx.rotate(angle); ctx.scale(scale, scale);
    ctx.globalAlpha = alpha * (.06 + amount * .9) * (.72 + activation * .28);
    const shell = ctx.createLinearGradient(0, -h * .55, 0, h * .55);
    shell.addColorStop(0, `rgba(${color[0]},.24)`);
    shell.addColorStop(.45, `rgba(${color[1]},.31)`);
    shell.addColorStop(1, `rgba(${color[0]},.1)`);
    polygon([{x:-w*.5,y:-h*.28},{x:-w*.39,y:-h*.52},{x:w*.39,y:-h*.52},{x:w*.5,y:-h*.28},{x:w*.43,y:h*.34},{x:w*.29,y:h*.5},{x:-w*.29,y:h*.5},{x:-w*.43,y:h*.34}], shell, `rgba(${color[0]},.96)`, 2);
    ctx.strokeStyle = `rgba(${color[0]},.88)`; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(-w*.47, -h*.2); ctx.lineTo(-w*.57, -h*.02); ctx.lineTo(-w*.48, h*.08);
    ctx.moveTo(w*.47, -h*.2); ctx.lineTo(w*.57, -h*.02); ctx.lineTo(w*.48, h*.08);
    ctx.moveTo(-w*.38, -h*.17); ctx.lineTo(-w*.12, -h*.1); ctx.lineTo(0, -h*.13); ctx.lineTo(w*.12, -h*.1); ctx.lineTo(w*.38, -h*.17);
    ctx.stroke();
    ctx.fillStyle = `rgba(${color[0]},.16)`;
    ctx.beginPath(); ctx.ellipse(-w*.2, 0, w*.18, h*.2, 0, 0, Math.PI * 2); ctx.ellipse(w*.2, 0, w*.18, h*.2, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = `rgba(${color[0]},.9)`; ctx.lineWidth = 1.1;
    ctx.beginPath(); ctx.ellipse(-w*.2, 0, w*.18, h*.2, 0, 0, Math.PI * 2); ctx.ellipse(w*.2, 0, w*.18, h*.2, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();

    if (shieldActive) {
      const pulse = reducedMotion ? 0 : Math.sin(now * .006) * .025;
      const shieldWidth = faceAnchor.size.width * width * (.82 + pulse);
      const shieldHeight = faceAnchor.size.height * height * (.78 + pulse);
      ctx.save(); ctx.globalAlpha = alpha * (.28 + amount * .42);
      ctx.translate(faceAnchor.x, faceAnchor.y);
      ctx.rotate((faceAnchor.orientation?.roll || 0) * Math.PI / 180);
      const gradient = ctx.createRadialGradient(0, 0, shieldWidth * .2, 0, 0, shieldWidth);
      gradient.addColorStop(0, `rgba(${color[0]},.03)`);
      gradient.addColorStop(.72, `rgba(${color[1]},.1)`);
      gradient.addColorStop(1, `rgba(${color[0]},.48)`);
      ctx.fillStyle = gradient;
      ctx.strokeStyle = `rgba(${color[0]},.92)`;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(0, 0, shieldWidth, shieldHeight, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.globalAlpha *= .7;
      ctx.beginPath(); ctx.ellipse(0, 0, shieldWidth * .9, shieldHeight * .9, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }

    if (nearbyFists.length) {
      ctx.save(); ctx.globalAlpha = alpha * (.72 + amount * .28);
      ctx.shadowColor = `rgb(${color[0]})`; ctx.shadowBlur = reducedMotion ? 0 : 18;
      ctx.lineCap = 'round';
      const sides = nearbyFists.length > 1 ? [-1, 1] : [nearbyFists[0].x < center.x ? -1 : 1];
      for (const side of sides) {
        const startX = center.x + side * w * .2;
        const startY = center.y + h * .12;
        const endX = center.x + side * width * .42;
        const endY = height;
        const gradient = ctx.createLinearGradient(startX, startY, endX, endY);
        gradient.addColorStop(0, `rgba(${color[0]},.96)`);
        gradient.addColorStop(.2, `rgba(${color[0]},.78)`);
        gradient.addColorStop(1, `rgba(${color[1]},0)`);
        ctx.strokeStyle = gradient; ctx.lineWidth = Math.max(8, h * .19);
        ctx.beginPath(); ctx.moveTo(startX, startY); ctx.lineTo(endX, endY); ctx.stroke();
        ctx.shadowBlur = 0; ctx.strokeStyle = 'rgba(226,255,255,.98)'; ctx.lineWidth = Math.max(2, h * .045);
        ctx.beginPath(); ctx.moveTo(startX, startY); ctx.lineTo(endX, endY); ctx.stroke();
      }
      ctx.restore();
    }
  }
  function renderCustomArtwork(input, alpha, dt, faceIndex = 0) {
    const artwork = input.customArtwork;
    const faceArtwork = input.customFaceArtwork;
    const placement = input.customPlacement || {};
    if (!faceAnchor || (!artwork && !faceArtwork) || alpha < .01) return;
    const left = mapPoint(faceAnchor.landmarks?.[33]);
    const right = mapPoint(faceAnchor.landmarks?.[263]);
    let targetRoll = faceAnchor.orientation?.roll ? faceAnchor.orientation.roll * Math.PI / 180 : 0;
    if (left && right) {
      targetRoll = Math.atan2(right.y - left.y, right.x - left.x);
      if (targetRoll > Math.PI / 2) targetRoll -= Math.PI;
      if (targetRoll < -Math.PI / 2) targetRoll += Math.PI;
    }
    if (!Number.isFinite(customRolls[faceIndex])) customRolls[faceIndex] = targetRoll;
    else {
      let delta = targetRoll - customRolls[faceIndex];
      while (delta > Math.PI) delta -= Math.PI * 2;
      while (delta < -Math.PI) delta += Math.PI * 2;
      customRolls[faceIndex] += delta * (1 - Math.exp(-dt * 8));
    }
    const video = canvas.parentElement?.querySelector('video');
    const sourceWidth = video?.videoWidth || width;
    const sourceHeight = video?.videoHeight || height;
    const coverScale = Math.max(width / sourceWidth, height / sourceHeight);
    const faceWidth = faceAnchor.size.width * sourceWidth * coverScale;
    const faceHeight = faceAnchor.size.height * sourceHeight * coverScale;
    if (!Number.isFinite(faceWidth) || faceWidth <= 0 || !Number.isFinite(faceHeight) || faceHeight <= 0) return;
    const scale = clamp(Number(placement.scale) || 1, .1, 3);
    const x = faceAnchor.x + faceWidth * (Number(placement.horizontal) || 0);
    const y = faceAnchor.y + faceHeight * (Number(placement.vertical) || 0);
    const rotation = (Number(placement.rotation) || 0) * Math.PI / 180;
    const opacity = clamp(Number(placement.opacity ?? 100), 0, 100) / 100;
    ctx.save();
    ctx.globalAlpha = alpha * opacity;
    ctx.translate(x, y);
    ctx.rotate(customRolls[faceIndex] + rotation);
    if (artwork?.width && artwork.height) {
      const artworkWidth = faceWidth * scale;
      const artworkHeight = artworkWidth * artwork.height / artwork.width;
      try { ctx.drawImage(artwork, -artworkWidth / 2, -artworkHeight / 2, artworkWidth, artworkHeight); } catch { /* An unavailable canvas bitmap is ignored safely. */ }
    }
    if (faceArtwork?.width && faceArtwork.height) {
      try { ctx.drawImage(faceArtwork, -faceWidth * scale / 2, -faceHeight * scale / 2, faceWidth * scale, faceHeight * scale); } catch { /* An unavailable canvas bitmap is ignored safely. */ }
    }
    ctx.restore();
  }
  function renderHands(now, input, dt, alpha, amount, color) {
    const hand = input.handTracking;
    const charge = input.filterInteraction?.charge || 0;
    const trackedHands = (hand?.hands || []).filter((item) => (Number(item.confidence) || 0) >= .58).slice(0, 2);
    const handPoints = trackedHands.map((item) => mapPoint(item.position)).filter(Boolean);
    const twoHands = handPoints.length === 2;
    const centerPoint = twoHands
      ? { x: (handPoints[0].x + handPoints[1].x) / 2, y: (handPoints[0].y + handPoints[1].y) / 2 }
      : hand?.handVisible && hand.position ? mapPoint(hand.position) : null;
    let speed = 0;
    if (centerPoint) {
      const p = centerPoint;
      if (p) {
        if (!handAnchor) handAnchor = p;
        const previousX = handAnchor.x, previousY = handAnchor.y;
        const blend = 1 - Math.exp(-dt * 12); handAnchor = { x: lerp(handAnchor.x, p.x, blend), y: lerp(handAnchor.y, p.y, blend) };
        speed = clamp(Math.hypot(handAnchor.x - previousX, handAnchor.y - previousY) / Math.max(dt, .001) / 700, 0, 1);
        handAlpha = lerp(handAlpha, 1, 1 - Math.exp(-dt * 7));
        if (!reducedMotion && Math.hypot(p.x - previousX, p.y - previousY) > 1.2) {
          const count = Math.round(1 + amount * 2 + speed * 3);
          for (let i = 0; i < count && particles.length < 48; i++) particles.push({ kind: 'hand', x: handAnchor.x + (Math.random() - .5) * 10, y: handAnchor.y + (Math.random() - .5) * 10, vx: (Math.random() - .5) * (20 + speed * 45), vy: (Math.random() - .5) * (20 + speed * 45) - 8, life: .45 + speed * .6 + Math.random() * .3, max: 1.35, color: i % 2 ? color[0] : color[1], speed });
        }
      }
    } else handAlpha = lerp(handAlpha, 0, 1 - Math.exp(-dt * 3));
    if (!twoHands && handAnchor && handAlpha > .01) {
      ctx.save(); ctx.globalAlpha = alpha * handAlpha * (.08 + amount * .62 + charge * .3); ctx.strokeStyle = `rgba(${color[0]},.9)`; ctx.lineWidth = 1.5 + charge * 1.2;
      const radius = clamp(Math.min(width, height) * .055, 19, 44) * (1 + charge * .48);
      ctx.beginPath(); ctx.arc(handAnchor.x, handAnchor.y, radius, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha *= .6; ctx.beginPath(); ctx.arc(handAnchor.x, handAnchor.y, radius * .68, 0, Math.PI * 2); ctx.stroke();
      if (charge > 0) { ctx.fillStyle = `rgba(${color[1]},${charge * .2})`; ctx.beginPath(); ctx.arc(handAnchor.x, handAnchor.y, radius * .55, 0, Math.PI * 2); ctx.fill(); }
      ctx.restore();
    }
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i]; p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 9 * dt;
      if (p.life <= 0) { particles.splice(i, 1); continue; }
      if (p.kind !== 'hand') continue;
      ctx.globalAlpha = alpha * handAlpha * clamp(p.life / p.max, 0, 1) * amount * (.45 + (p.speed || 0) * .55); ctx.fillStyle = `rgb(${p.color})`;
      ctx.beginPath(); ctx.arc(p.x, p.y, 1 + amount * (1.2 + (p.speed || 0) * 2), 0, Math.PI * 2); ctx.fill();
    }
    const bothFists = trackedHands.length === 2 && trackedHands.every((item) => item.gesture === 'Closed_Fist');
    const handGap = twoHands ? Math.hypot(
      trackedHands[0].position.x - trackedHands[1].position.x,
      trackedHands[0].position.y - trackedHands[1].position.y,
    ) : Infinity;
    const chargingPalm = !twoHands && handAlpha > .01 && charge > .02;
    const ballActive = twoHands || chargingPalm;
    if (ballActive) {
      const convergence = twoHands ? clamp(1 - handGap / .48, 0, 1) : charge;
      const center = twoHands ? centerPoint : handAnchor;
      const breath = reducedMotion ? 1 : 1 + Math.sin(now * .008) * .035;
      const radius = clamp(Math.min(width, height) * (.045 + convergence * .085 + charge * .045 + (bothFists ? .025 : 0)) * breath, 26, Math.min(width, height) * .2);
      const rotation = reducedMotion ? 0 : now * (.0011 + charge * .0018);
      ctx.save();
      ctx.translate(center.x, center.y);
      ctx.globalAlpha = alpha * (.54 + amount * .38);
      ctx.shadowColor = `rgb(${color[0]})`;
      ctx.shadowBlur = reducedMotion ? 0 : 18 + charge * 26;
      const aura = ctx.createRadialGradient(0, 0, radius * .12, 0, 0, radius * 1.55);
      aura.addColorStop(0, 'rgba(255,255,255,.95)');
      aura.addColorStop(.16, `rgba(${color[0]},.92)`);
      aura.addColorStop(.48, `rgba(${color[0]},.58)`);
      aura.addColorStop(.78, `rgba(${color[1]},.3)`);
      aura.addColorStop(1, `rgba(${color[1]},0)`);
      ctx.fillStyle = aura;
      ctx.beginPath(); ctx.arc(0, 0, radius * 1.55, 0, Math.PI * 2); ctx.fill();

      const core = ctx.createRadialGradient(-radius * .16, -radius * .18, radius * .04, 0, 0, radius * .82);
      core.addColorStop(0, 'rgba(255,255,255,.98)');
      core.addColorStop(.3, `rgba(${color[0]},.9)`);
      core.addColorStop(.76, `rgba(${color[1]},.55)`);
      core.addColorStop(1, `rgba(${color[1]},.08)`);
      ctx.shadowBlur = reducedMotion ? 0 : 10 + charge * 16;
      ctx.fillStyle = core;
      ctx.beginPath(); ctx.arc(0, 0, radius * (.78 + charge * .08), 0, Math.PI * 2); ctx.fill();

      ctx.shadowBlur = 0;
      for (let index = 0; index < 3; index += 1) {
        ctx.save();
        ctx.rotate(rotation * (index % 2 ? -1 : 1) + index * Math.PI / 3);
        ctx.beginPath();
        ctx.ellipse(0, 0, radius * (1.08 + index * .11), radius * (.36 + index * .035), 0, .28, Math.PI * 1.82);
        ctx.strokeStyle = index === 1 ? `rgba(${color[1]},.82)` : `rgba(${color[0]},.92)`;
        ctx.lineWidth = Math.max(1.4, radius * .045);
        ctx.stroke();
        ctx.restore();
      }
      for (let index = 0; index < 5; index += 1) {
        const angle = rotation * 1.7 + index * Math.PI * 2 / 5;
        const orbit = radius * (1.18 + (index % 2) * .14);
        ctx.beginPath();
        ctx.arc(Math.cos(angle) * orbit, Math.sin(angle) * orbit * .58, 1.8 + charge * 1.6, 0, Math.PI * 2);
        ctx.fillStyle = index % 2 ? `rgb(${color[0]})` : '#f3ffff';
        ctx.fill();
      }
      if (charge > .02) {
        ctx.beginPath();
        ctx.arc(0, 0, radius * 1.34, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * charge);
        ctx.strokeStyle = 'rgba(255,255,255,.94)';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      ctx.restore();
      if (bothFists) {
        const direction = center.x < width / 2 ? 1 : -1;
        const beamEnd = direction > 0 ? width : 0;
        const beamWidth = clamp(Math.min(width, height) * .2, 58, 180);
        const pulse = reducedMotion ? 0 : Math.sin(now * .02) * 6;
        const start = { x: center.x + direction * radius * .55, y: center.y };
        const endY = center.y + pulse;
        ctx.save(); ctx.globalAlpha = alpha * (.56 + amount * .4);
        const beam = ctx.createLinearGradient(start.x, start.y, beamEnd, endY);
        beam.addColorStop(0, 'rgba(221,255,255,.96)');
        beam.addColorStop(.15, `rgba(${color[0]},.78)`);
        beam.addColorStop(1, `rgba(${color[1]},0)`);
        ctx.fillStyle = beam;
        ctx.shadowColor = `rgb(${color[0]})`;
        ctx.shadowBlur = reducedMotion ? 0 : 22;
        ctx.beginPath();
        ctx.moveTo(start.x, start.y - beamWidth * .16);
        ctx.lineTo(beamEnd, endY - beamWidth * .5);
        ctx.lineTo(beamEnd, endY + beamWidth * .5);
        ctx.lineTo(start.x, start.y + beamWidth * .16);
        ctx.closePath(); ctx.fill();
        ctx.strokeStyle = 'rgba(224,255,255,.95)'; ctx.lineWidth = Math.max(3, beamWidth * .055);
        ctx.beginPath(); ctx.moveTo(start.x, start.y); ctx.lineTo(beamEnd, endY); ctx.stroke();
        ctx.restore();
      }
    }
  }
  function drawPreset(id, input, fade, alpha, amount, now, dt) {
    const colors = input.filterColors?.[id] || COLORS[id] || COLORS['aura-crown'];
    if (id === 'energy-hands') {
      renderHands(now, input, dt, fade * alpha, amount, colors);
      return;
    }
    if (!['aura-crown', 'guardian-visor', 'custom-filter'].includes(id)) return;
    const anchors = faceAnchors.length ? faceAnchors : faceAnchor ? [faceAnchor] : [];
    anchors.forEach((anchor, index) => {
      faceAnchor = anchor;
      if (id === 'aura-crown') renderCrown(now, input, fade * alpha, amount, colors, dt);
      else if (id === 'guardian-visor') renderVisor(input, fade * alpha, amount, colors, now);
      else renderCustomArtwork(input, fade * alpha, dt, index);
    });
    faceAnchor = anchors[0] || null;
  }
  function updateCrownGesture(input, dt) {
    const anchors = faceAnchors.length ? faceAnchors : faceAnchor ? [faceAnchor] : [];
    const hands = input.handTracking?.hands || [];
    const fist = hands.find((item) => item.gesture === 'Closed_Fist');
    const legacyFist = input.handTracking?.gesture === 'Closed_Fist';
    const handPosition = fist?.position || (legacyFist ? input.handTracking?.position : null);
    const point = input.handTracking?.handVisible && handPosition ? mapPoint(handPosition) : null;
    const proximity = point ? anchors.reduce((nearest, anchor) => {
      const crownY = anchor.y - anchor.size.height * height * .65;
      const distance = Math.hypot(point.x - anchor.x, point.y - crownY);
      return Math.max(nearest, clamp(1 - distance / Math.min(width, height) * 2.8, 0, 1));
    }, 0) : 0;
    const active = input.faceTracking?.faceVisible && (fist || legacyFist) && proximity > .25;
    crownHandInfluence = lerp(crownHandInfluence, proximity, 1 - Math.exp(-dt * 5));
    crownSpinHoldMs = active ? crownSpinHoldMs + dt * 1000 : 0;
    const chargeSpeed = 1.8 + clamp(crownSpinHoldMs / 1000, 0, 3) * 2.7;
    crownSpin = (crownSpin + (active ? dt * chargeSpeed : 0)) % (Math.PI * 2);
  }
  function drawInteraction(input, now, dt, amount) {
    const interaction = input.interaction;
    if (interaction?.status === 'playing' || interaction?.status === 'complete' || interaction?.status === 'finished') {
      for (const marker of input.markers || []) {
        const p = mapPoint(marker);
        if (!p) continue;
        const active = interaction.activated?.includes(marker.id);
        const r = Math.min(width, height) * marker.radius;
        ctx.save(); ctx.globalAlpha = active ? .9 : .42 + amount * .3;
        ctx.strokeStyle = active ? 'rgba(98,231,229,.95)' : 'rgba(112,177,255,.72)'; ctx.lineWidth = active ? 2 : 1;
        ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.stroke();
        ctx.globalAlpha *= .5; ctx.beginPath(); ctx.arc(p.x, p.y, r * .72, 0, Math.PI * 2); ctx.stroke();
        if (active) { ctx.globalAlpha = .85; ctx.fillStyle = 'rgba(98,231,229,.75)'; ctx.beginPath(); ctx.arc(p.x, p.y, 3, 0, Math.PI * 2); ctx.fill(); }
        ctx.restore();
      }
      const hand = input.handTracking;
      if (hand?.handVisible && hand.position && hand.gesture === 'Pointing_Up') {
        const aim = mapPoint(hand.position);
        if (aim) {
          const nearest = (input.markers || []).filter((m) => !interaction.activated?.includes(m.id)).sort((a, b) => Math.hypot(a.x - hand.position.x, a.y - hand.position.y) - Math.hypot(b.x - hand.position.x, b.y - hand.position.y))[0];
          ctx.save(); ctx.globalAlpha = .8; ctx.strokeStyle = 'rgba(111,239,244,.86)'; ctx.lineWidth = 1.2;
          if (nearest) { const target = mapPoint(nearest); ctx.setLineDash([4, 5]); ctx.beginPath(); ctx.moveTo(aim.x, aim.y); ctx.lineTo(target.x, target.y); ctx.stroke(); ctx.setLineDash([]); }
          ctx.beginPath(); ctx.arc(aim.x, aim.y, 16 + Math.sin(now * .008) * 2, 0, Math.PI * 2); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(aim.x - 22, aim.y); ctx.lineTo(aim.x - 10, aim.y); ctx.moveTo(aim.x + 10, aim.y); ctx.lineTo(aim.x + 22, aim.y); ctx.moveTo(aim.x, aim.y - 22); ctx.lineTo(aim.x, aim.y - 10); ctx.moveTo(aim.x, aim.y + 10); ctx.lineTo(aim.x, aim.y + 22); ctx.stroke(); ctx.restore();
        }
      }
      if (interaction.pulse && interaction.pulse.id !== shownPulseId) {
        shownPulseId = interaction.pulse.id;
        bursts.push({ x: interaction.pulse.x, y: interaction.pulse.y, age: 0, hit: interaction.pulse.hit });
      }
    }
    for (let i = bursts.length - 1; i >= 0; i--) {
      const burst = bursts[i]; burst.age += dt;
      if (burst.age > .7) { bursts.splice(i, 1); continue; }
      const p = mapPoint(burst), progress = burst.age / .7, radius = 10 + progress * Math.min(width, height) * .17;
      ctx.save(); ctx.globalAlpha = (1 - progress) * .9; ctx.strokeStyle = burst.hit ? 'rgba(98,255,224,.95)' : 'rgba(94,170,255,.9)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(p.x, p.y, radius, 0, Math.PI * 2); ctx.stroke();
      if (burst.hit) { ctx.fillStyle = `rgba(98,231,229,${(1-progress)*.18})`; ctx.beginPath(); ctx.arc(p.x, p.y, radius * .72, 0, Math.PI * 2); ctx.fill(); }
      ctx.restore();
    }
  }
  function drawShowcase(now, input) {
    if (!input.showcaseAt) return;
    const elapsed = (now - input.showcaseAt) / 1000;
    if (elapsed < 0 || elapsed > 7) return;
    const phase = elapsed % 2.3, center = { x: width * (.3 + Math.min(1, elapsed / 7) * .4), y: height * .5 };
    const alpha = Math.min(1, elapsed * 2, (7 - elapsed) * 2);
    ctx.save(); ctx.globalAlpha = alpha * .75; ctx.strokeStyle = 'rgba(98,231,229,.9)'; ctx.lineWidth = 1.5;
    if (phase < .8) {
      const r = 18 + phase * Math.min(width, height) * .18;
      ctx.beginPath(); ctx.arc(center.x, center.y, r, 0, Math.PI * 2); ctx.stroke();
    } else if (phase < 1.55) {
      const w = Math.min(width, height) * .21, h = w * .3;
      polygon([{x:center.x-w/2,y:center.y-h/2},{x:center.x+w/2,y:center.y-h/2},{x:center.x+w*.42,y:center.y+h/2},{x:center.x-w*.42,y:center.y+h/2}], 'rgba(84,142,255,.14)', 'rgba(126,210,255,.92)', 1.5);
    } else {
      const r = 24 + (phase - 1.55) * Math.min(width, height) * .21;
      ctx.beginPath(); ctx.arc(center.x, center.y, r, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.restore();
  }
  function drawFilterBursts(input, now, dt, amount, preset) {
    const colors = input.filterColors?.[preset] || COLORS[preset] || COLORS['aura-crown'];
    const charge = clamp(input.filterInteraction?.charge || 0, 0, 1);
    const hand = input.handTracking;
    const handPoint = hand?.handVisible && hand.position ? mapPoint(hand.position) : null;
    if (charge > .015 && handPoint) {
      const radius = 22 + charge * Math.min(width, height) * .075;
      const rotation = reducedMotion ? 0 : now * .0025;
      ctx.save();
      ctx.globalAlpha = amount * (.35 + charge * .5);
      const glow = ctx.createRadialGradient(handPoint.x, handPoint.y, 2, handPoint.x, handPoint.y, radius * 1.8);
      glow.addColorStop(0, `rgba(${colors[0]},.22)`);
      glow.addColorStop(.55, `rgba(${colors[1]},.12)`);
      glow.addColorStop(1, `rgba(${colors[1]},0)`);
      ctx.fillStyle = glow;
      ctx.beginPath(); ctx.arc(handPoint.x, handPoint.y, radius * 1.8, 0, Math.PI * 2); ctx.fill();
      ctx.translate(handPoint.x, handPoint.y);
      ctx.rotate(rotation);
      ctx.setLineDash([5, 7]);
      ctx.lineDashOffset = reducedMotion ? 0 : -now * .035;
      ctx.strokeStyle = `rgba(${colors[0]},.8)`;
      ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.arc(0, 0, radius, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.arc(0, 0, radius * 1.28, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * charge);
      ctx.strokeStyle = 'rgba(240,255,255,.92)';
      ctx.lineWidth = 2;
      ctx.stroke();
      for (let index = 0; index < 6; index += 1) {
        const angle = rotation + index * Math.PI / 3;
        const orbit = radius * (.82 + charge * .35);
        ctx.beginPath();
        ctx.arc(Math.cos(angle) * orbit, Math.sin(angle) * orbit, 1.4 + charge * 1.6, 0, Math.PI * 2);
        ctx.fillStyle = index % 2 ? `rgb(${colors[0]})` : '#ffffff';
        ctx.fill();
      }
      ctx.restore();
    }
    for (let i = filterBursts.length - 1; i >= 0; i--) {
      const burst = filterBursts[i]; burst.age += dt;
      if (burst.age > .94) { filterBursts.splice(i, 1); continue; }
      const progress = burst.age / .94, p = mapPoint(burst.position);
      if (!p) continue;
      ctx.save();
      ctx.globalAlpha = (1 - progress) * amount;
      ctx.shadowColor = `rgb(${colors[0]})`;
      ctx.shadowBlur = reducedMotion ? 0 : 18;
      for (let ring = 0; ring < 3; ring += 1) {
        const ringProgress = clamp((progress - ring * .12) / .88, 0, 1);
        if (!ringProgress) continue;
        const radius = 9 + ringProgress * Math.min(width, height) * (.13 + ring * .035);
        ctx.globalAlpha = (1 - ringProgress) * amount * (.8 - ring * .16);
        ctx.strokeStyle = ring === 1 ? `rgba(${colors[1]},.9)` : `rgba(${colors[0]},.96)`;
        ctx.lineWidth = Math.max(1, 2.4 - ring * .45);
        ctx.beginPath(); ctx.arc(p.x, p.y, radius, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.shadowBlur = 0;
      const sparkRadius = 12 + progress * Math.min(width, height) * .2;
      ctx.globalAlpha = (1 - progress) * amount * .9;
      for (let spark = 0; spark < 16; spark += 1) {
        const angle = spark * Math.PI / 8 + (reducedMotion ? 0 : now * .0015);
        const inner = sparkRadius * (.72 + (spark % 2) * .12);
        const outer = sparkRadius * (1.03 + (spark % 3) * .08);
        ctx.beginPath();
        ctx.moveTo(p.x + Math.cos(angle) * inner, p.y + Math.sin(angle) * inner);
        ctx.lineTo(p.x + Math.cos(angle) * outer, p.y + Math.sin(angle) * outer);
        ctx.strokeStyle = spark % 3 ? `rgba(${colors[0]},.95)` : 'rgba(255,255,255,.96)';
        ctx.lineWidth = spark % 4 ? 1.2 : 2;
        ctx.stroke();
      }
      if (preset === 'guardian-visor' && faceAnchor && faceAlpha > .05) {
        const eyeA = mapPoint(faceAnchor.landmarks?.[33]), eyeB = mapPoint(faceAnchor.landmarks?.[263]);
        const cx = eyeA && eyeB ? (eyeA.x + eyeB.x) / 2 : faceAnchor.x;
        const cy = eyeA && eyeB ? (eyeA.y + eyeB.y) / 2 : faceAnchor.y - faceAnchor.size.height * height * .12;
        const shield = Math.max(22, faceAnchor.size.width * width * (.48 + progress * .28));
        ctx.globalAlpha *= faceAlpha; ctx.beginPath(); ctx.ellipse(cx, cy, shield, shield * .44, (faceAnchor.orientation?.roll || 0) * Math.PI / 180, 0, Math.PI * 2); ctx.stroke();
        ctx.globalAlpha *= .25; ctx.fillStyle = `rgba(${colors[0]},.7)`; ctx.fill();
      }
      ctx.restore();
    }
    const pulse = input.filterInteraction?.pulse;
    if (pulse && pulse.id !== shownFilterPulseId) {
      shownFilterPulseId = pulse.id;
      filterBursts.push({ position: pulse.position, age: 0 });
      if (preset === 'aura-crown' && faceAnchor) {
        const hand = mapPoint(pulse.position);
        if (hand) {
          const angle = Math.atan2(hand.y - faceAnchor.y, hand.x - faceAnchor.x);
          for (let i = 0; i < 8 && crownBursts.length < 16; i++) crownBursts.push({ age: 0, offsetX: Math.cos(angle + (i - 3.5) * .23) * 9, offsetY: -faceAnchor.size.height * height * .65 + Math.sin(angle + (i - 3.5) * .23) * 8 });
        }
      }
    }
    if (preset === 'aura-crown' && faceAnchor && hand?.handVisible && hand.position && !reducedMotion) {
      const point = mapPoint(hand.position);
      const crownY = faceAnchor.y - faceAnchor.size.height * height * .65;
      const nearCrown = point && Math.hypot(point.x - faceAnchor.x, point.y - crownY) < Math.min(width, height) * .34;
      if (nearCrown) {
        if (previousCrownHand) {
          const moved = Math.hypot(point.x - previousCrownHand.x, point.y - previousCrownHand.y);
          if (moved > 2) {
            const centerY = faceAnchor.y - faceAnchor.size.height * height * .65;
            const angle = Math.atan2(point.y - centerY, point.x - faceAnchor.x);
            const ringX = faceAnchor.x + Math.cos(angle) * Math.min(width, height) * .13;
            const ringY = centerY + Math.sin(angle) * Math.min(width, height) * .045;
            if (crownTrail.length < 32) crownTrail.push({ x: ringX, y: ringY, life: .42, max: .42, radius: 1.3 + amount * 1.8 });
          }
        }
        previousCrownHand = point;
      }
    } else previousCrownHand = null;
  }
  function render(now) {
    frameId = requestAnimationFrame(render);
    resize(); if (!width || !height) return;
    const input = getInputs() || {}, preset = input.preset || 'aura-crown';
    const dt = Math.min(.05, previousAt ? (now - previousAt) / 1000 : 1/60); previousAt = now;
    const face = input.faceTracking;
    const detectedFaces = face?.faces?.length ? face.faces : face?.faceVisible && face.center && face.size ? [face] : [];
    if (detectedFaces.length) {
      const previousAnchors = faceAnchors;
      const matchedPrevious = new Set();
      faceAnchors = detectedFaces.map((detected) => {
        const mapped = mapPoint(detected.center);
        const next = { ...mapped, size: detected.size, landmarks: detected.landmarks, orientation: detected.orientation };
        let previousIndex = -1;
        let nearestDistance = Infinity;
        previousAnchors.forEach((previous, candidateIndex) => {
          if (matchedPrevious.has(candidateIndex)) return;
          const distance = Math.hypot(previous.x - next.x, previous.y - next.y);
          if (distance < nearestDistance) {
            nearestDistance = distance;
            previousIndex = candidateIndex;
          }
        });
        if (previousIndex >= 0) matchedPrevious.add(previousIndex);
        const previous = previousAnchors[previousIndex];
        const blend = previous ? 1 - Math.exp(-dt * 10) : 1;
        return previous ? {
          x: lerp(previous.x, next.x, blend),
          y: lerp(previous.y, next.y, blend),
          size: {
            width: lerp(previous.size.width, next.size.width, blend),
            height: lerp(previous.size.height, next.size.height, blend),
          },
          landmarks: next.landmarks,
          orientation: next.orientation,
        } : next;
      });
      faceAnchor = faceAnchors[0] || null;
      customRolls.length = faceAnchors.length;
      faceAlpha = lerp(faceAlpha, 1, 1 - Math.exp(-dt * 6));
    } else {
      faceAlpha = lerp(faceAlpha, 0, 1 - Math.exp(-dt * 2.6));
      if (faceAlpha < .01) {
        faceAnchor = null;
        faceAnchors = [];
        customRolls.length = 0;
      }
    }
    if (preset === 'aura-crown') updateCrownGesture(input, dt);
    else {
      crownSpinHoldMs = 0;
      crownHandInfluence = lerp(crownHandInfluence, 0, 1 - Math.exp(-dt * 4));
    }
    if (preset !== activePreset) { outgoingPreset = activePreset; activePreset = preset; transitionAt = now; }
    const t = clamp((now - transitionAt) / 380, 0, 1), amount = clamp(input.intensity ?? 60, 0, 100) / 100;
    ctx.clearRect(0, 0, width, height);
    if (outgoingPreset && t < 1) drawPreset(outgoingPreset, input, 1 - t, faceAlpha, amount, now, dt);
    drawPreset(activePreset || preset, input, t, faceAlpha, amount, now, dt);
    drawFilterBursts(input, now, dt, amount, activePreset || preset);
    if (preset !== 'custom-filter' && faceAlpha > .01 && faceAnchors.length) {
      const color = input.filterColors?.[preset]?.[0] || COLORS[preset]?.[0] || COLORS['aura-crown'][0];
      ctx.save(); ctx.globalAlpha = faceAlpha * (.08 + amount * .1); ctx.strokeStyle = `rgba(${color},.75)`; ctx.lineWidth = 1;
      faceAnchors.forEach((anchor) => {
        ctx.beginPath(); ctx.ellipse(anchor.x, anchor.y, anchor.size.width * width * .58, anchor.size.height * height * .61, 0, 0, Math.PI * 2); ctx.stroke();
      });
      ctx.restore();
    }
    drawInteraction(input, now, dt, amount);
    drawShowcase(now, input);
  }
  frameId = requestAnimationFrame(render);
  return () => { cancelAnimationFrame(frameId); observer?.disconnect(); if (!observer) window.removeEventListener('resize', resize); ctx.clearRect(0, 0, width, height); particles.length = 0; bursts.length = 0; crownTrail.length = 0; crownBursts.length = 0; filterBursts.length = 0; customRolls.length = 0; };
}
