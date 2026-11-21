import {
  DEFAULT_FILTER_COLORS,
  clamp,
  drawPolygon,
  lerp,
  mapVideoPoint,
} from './filters/canvasHelpers.js';
import {
  clearCrownState,
  createCrownState,
  decayCrownState,
  pushCrownPulseBursts,
  renderCrown,
  updateCrownGesture,
  updateCrownTrail,
} from './filters/auraCrown.js';
import { renderVisor } from './filters/guardianVisor.js';
import {
  clearEnergyHandsState,
  createEnergyHandsState,
  renderEnergyHands,
} from './filters/energyHands.js';
import { renderCustomArtwork } from './filters/customFilter.js';

/** Canvas-only AR effects. Tracking stays in its own hooks and normalized mirrored coordinates. */
export function startAuraCanvas(canvas, getInputs, reducedMotion = false) {
  const ctx = canvas?.getContext('2d', { alpha: true });
  if (!canvas || !ctx) return () => {};

  let width = 0;
  let height = 0;
  let ratio = 1;
  let frameId = 0;
  let previousAt = 0;
  let faceAnchor = null;
  let faceAnchors = [];
  let faceAlpha = 0;
  let activePreset = null;
  let outgoingPreset = null;
  let transitionAt = 0;
  let shownPulseId = 0;
  let shownFilterPulseId = 0;

  const customRolls = [];
  const crownState = createCrownState();
  const energyHandsState = createEnergyHandsState();
  const bursts = [];
  const filterBursts = [];

  function resize() {
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    ratio = Math.min(1.5, window.devicePixelRatio || 1, 1280 / rect.width, 720 / rect.height);
    width = rect.width;
    height = rect.height;
    const w = Math.max(1, Math.round(width * ratio));
    const h = Math.max(1, Math.round(height * ratio));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  }

  resize();
  const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(resize);
  observer?.observe(canvas);
  if (!observer) window.addEventListener('resize', resize);

  const mapPoint = (point) => mapVideoPoint(canvas, width, height, point);

  function drawPreset(id, input, fade, alpha, amount, now, dt) {
    const colors = input.filterColors?.[id] || DEFAULT_FILTER_COLORS[id] || DEFAULT_FILTER_COLORS['aura-crown'];
    if (id === 'energy-hands') {
      renderEnergyHands(ctx, energyHandsState, {
        width,
        height,
        now,
        input,
        dt,
        alpha: fade * alpha,
        amount,
        color: colors,
        reducedMotion,
        mapPoint,
      });
      return;
    }
    if (!['aura-crown', 'guardian-visor', 'custom-filter'].includes(id)) return;
    const anchors = faceAnchors.length ? faceAnchors : faceAnchor ? [faceAnchor] : [];
    anchors.forEach((anchor, index) => {
      if (id === 'aura-crown') {
        renderCrown(ctx, crownState, {
          anchor,
          width,
          height,
          now,
          input,
          alpha: fade * alpha,
          amount,
          color: colors,
          dt,
          reducedMotion,
        });
      } else if (id === 'guardian-visor') {
        renderVisor(ctx, {
          anchor,
          width,
          height,
          input,
          alpha: fade * alpha,
          amount,
          color: colors,
          now,
          transitionAt,
          reducedMotion,
          mapPoint,
        });
      } else {
        renderCustomArtwork(ctx, customRolls, {
          canvas,
          anchor,
          width,
          height,
          input,
          alpha: fade * alpha,
          dt,
          faceIndex: index,
          mapPoint,
        });
      }
    });
  }

  function drawInteraction(input, now, dt, amount) {
    const interaction = input.interaction;
    if (interaction?.status === 'playing' || interaction?.status === 'complete' || interaction?.status === 'finished') {
      for (const marker of input.markers || []) {
        const p = mapPoint(marker);
        if (!p) continue;
        const active = interaction.activated?.includes(marker.id);
        const r = Math.min(width, height) * marker.radius;
        ctx.save();
        ctx.globalAlpha = active ? 0.9 : 0.42 + amount * 0.3;
        ctx.strokeStyle = active ? 'rgba(98,231,229,.95)' : 'rgba(112,177,255,.72)';
        ctx.lineWidth = active ? 2 : 1;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha *= 0.5;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r * 0.72, 0, Math.PI * 2);
        ctx.stroke();
        if (active) {
          ctx.globalAlpha = 0.85;
          ctx.fillStyle = 'rgba(98,231,229,.75)';
          ctx.beginPath();
          ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }
      const hand = input.handTracking;
      if (hand?.handVisible && hand.position && hand.gesture === 'Pointing_Up') {
        const aim = mapPoint(hand.position);
        if (aim) {
          const nearest = (input.markers || [])
            .filter((m) => !interaction.activated?.includes(m.id))
            .sort((a, b) => Math.hypot(a.x - hand.position.x, a.y - hand.position.y) - Math.hypot(b.x - hand.position.x, b.y - hand.position.y))[0];
          ctx.save();
          ctx.globalAlpha = 0.8;
          ctx.strokeStyle = 'rgba(111,239,244,.86)';
          ctx.lineWidth = 1.2;
          if (nearest) {
            const target = mapPoint(nearest);
            ctx.setLineDash([4, 5]);
            ctx.beginPath();
            ctx.moveTo(aim.x, aim.y);
            ctx.lineTo(target.x, target.y);
            ctx.stroke();
            ctx.setLineDash([]);
          }
          ctx.beginPath();
          ctx.arc(aim.x, aim.y, 16 + Math.sin(now * 0.008) * 2, 0, Math.PI * 2);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(aim.x - 22, aim.y);
          ctx.lineTo(aim.x - 10, aim.y);
          ctx.moveTo(aim.x + 10, aim.y);
          ctx.lineTo(aim.x + 22, aim.y);
          ctx.moveTo(aim.x, aim.y - 22);
          ctx.lineTo(aim.x, aim.y - 10);
          ctx.moveTo(aim.x, aim.y + 10);
          ctx.lineTo(aim.x, aim.y + 22);
          ctx.stroke();
          ctx.restore();
        }
      }
      if (interaction.pulse && interaction.pulse.id !== shownPulseId) {
        shownPulseId = interaction.pulse.id;
        bursts.push({ x: interaction.pulse.x, y: interaction.pulse.y, age: 0, hit: interaction.pulse.hit });
      }
    }
    for (let i = bursts.length - 1; i >= 0; i -= 1) {
      const burst = bursts[i];
      burst.age += dt;
      if (burst.age > 0.7) {
        bursts.splice(i, 1);
        continue;
      }
      const p = mapPoint(burst);
      const progress = burst.age / 0.7;
      const radius = 10 + progress * Math.min(width, height) * 0.17;
      ctx.save();
      ctx.globalAlpha = (1 - progress) * 0.9;
      ctx.strokeStyle = burst.hit ? 'rgba(98,255,224,.95)' : 'rgba(94,170,255,.9)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
      ctx.stroke();
      if (burst.hit) {
        ctx.fillStyle = `rgba(98,231,229,${(1 - progress) * 0.18})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, radius * 0.72, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  function drawShowcase(now, input) {
    if (!input.showcaseAt) return;
    const elapsed = (now - input.showcaseAt) / 1000;
    if (elapsed < 0 || elapsed > 7) return;
    const phase = elapsed % 2.3;
    const center = { x: width * (0.3 + Math.min(1, elapsed / 7) * 0.4), y: height * 0.5 };
    const alpha = Math.min(1, elapsed * 2, (7 - elapsed) * 2);
    ctx.save();
    ctx.globalAlpha = alpha * 0.75;
    ctx.strokeStyle = 'rgba(98,231,229,.9)';
    ctx.lineWidth = 1.5;
    if (phase < 0.8) {
      const r = 18 + phase * Math.min(width, height) * 0.18;
      ctx.beginPath();
      ctx.arc(center.x, center.y, r, 0, Math.PI * 2);
      ctx.stroke();
    } else if (phase < 1.55) {
      const w = Math.min(width, height) * 0.21;
      const h = w * 0.3;
      drawPolygon(
        ctx,
        [
          { x: center.x - w / 2, y: center.y - h / 2 },
          { x: center.x + w / 2, y: center.y - h / 2 },
          { x: center.x + w * 0.42, y: center.y + h / 2 },
          { x: center.x - w * 0.42, y: center.y + h / 2 },
        ],
        'rgba(84,142,255,.14)',
        'rgba(126,210,255,.92)',
        1.5,
      );
    } else {
      const r = 24 + (phase - 1.55) * Math.min(width, height) * 0.21;
      ctx.beginPath();
      ctx.arc(center.x, center.y, r, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawFilterBursts(input, now, dt, amount, preset) {
    const colors = input.filterColors?.[preset] || DEFAULT_FILTER_COLORS[preset] || DEFAULT_FILTER_COLORS['aura-crown'];
    const charge = clamp(input.filterInteraction?.charge || 0, 0, 1);
    const hand = input.handTracking;
    const handPoint = hand?.handVisible && hand.position ? mapPoint(hand.position) : null;
    if (charge > 0.015 && handPoint) {
      const radius = 22 + charge * Math.min(width, height) * 0.075;
      const rotation = reducedMotion ? 0 : now * 0.0025;
      ctx.save();
      ctx.globalAlpha = amount * (0.35 + charge * 0.5);
      const glow = ctx.createRadialGradient(handPoint.x, handPoint.y, 2, handPoint.x, handPoint.y, radius * 1.8);
      glow.addColorStop(0, `rgba(${colors[0]},.22)`);
      glow.addColorStop(0.55, `rgba(${colors[1]},.12)`);
      glow.addColorStop(1, `rgba(${colors[1]},0)`);
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(handPoint.x, handPoint.y, radius * 1.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.translate(handPoint.x, handPoint.y);
      ctx.rotate(rotation);
      ctx.setLineDash([5, 7]);
      ctx.lineDashOffset = reducedMotion ? 0 : -now * 0.035;
      ctx.strokeStyle = `rgba(${colors[0]},.8)`;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(0, 0, radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.arc(0, 0, radius * 1.28, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * charge);
      ctx.strokeStyle = 'rgba(240,255,255,.92)';
      ctx.lineWidth = 2;
      ctx.stroke();
      for (let index = 0; index < 6; index += 1) {
        const angle = rotation + (index * Math.PI) / 3;
        const orbit = radius * (0.82 + charge * 0.35);
        ctx.beginPath();
        ctx.arc(Math.cos(angle) * orbit, Math.sin(angle) * orbit, 1.4 + charge * 1.6, 0, Math.PI * 2);
        ctx.fillStyle = index % 2 ? `rgb(${colors[0]})` : '#ffffff';
        ctx.fill();
      }
      ctx.restore();
    }

    for (let i = filterBursts.length - 1; i >= 0; i -= 1) {
      const burst = filterBursts[i];
      burst.age += dt;
      if (burst.age > 0.94) {
        filterBursts.splice(i, 1);
        continue;
      }
      const progress = burst.age / 0.94;
      const p = mapPoint(burst.position);
      if (!p) continue;
      ctx.save();
      ctx.globalAlpha = (1 - progress) * amount;
      ctx.shadowColor = `rgb(${colors[0]})`;
      ctx.shadowBlur = reducedMotion ? 0 : 18;
      for (let ring = 0; ring < 3; ring += 1) {
        const ringProgress = clamp((progress - ring * 0.12) / 0.88, 0, 1);
        if (!ringProgress) continue;
        const radius = 9 + ringProgress * Math.min(width, height) * (0.13 + ring * 0.035);
        ctx.globalAlpha = (1 - ringProgress) * amount * (0.8 - ring * 0.16);
        ctx.strokeStyle = ring === 1 ? `rgba(${colors[1]},.9)` : `rgba(${colors[0]},.96)`;
        ctx.lineWidth = Math.max(1, 2.4 - ring * 0.45);
        ctx.beginPath();
        ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.shadowBlur = 0;
      const sparkRadius = 12 + progress * Math.min(width, height) * 0.2;
      ctx.globalAlpha = (1 - progress) * amount * 0.9;
      for (let spark = 0; spark < 16; spark += 1) {
        const angle = (spark * Math.PI) / 8 + (reducedMotion ? 0 : now * 0.0015);
        const inner = sparkRadius * (0.72 + (spark % 2) * 0.12);
        const outer = sparkRadius * (1.03 + (spark % 3) * 0.08);
        ctx.beginPath();
        ctx.moveTo(p.x + Math.cos(angle) * inner, p.y + Math.sin(angle) * inner);
        ctx.lineTo(p.x + Math.cos(angle) * outer, p.y + Math.sin(angle) * outer);
        ctx.strokeStyle = spark % 3 ? `rgba(${colors[0]},.95)` : 'rgba(255,255,255,.96)';
        ctx.lineWidth = spark % 4 ? 1.2 : 2;
        ctx.stroke();
      }
      if (preset === 'guardian-visor' && faceAnchor && faceAlpha > 0.05) {
        const eyeA = mapPoint(faceAnchor.landmarks?.[33]);
        const eyeB = mapPoint(faceAnchor.landmarks?.[263]);
        const cx = eyeA && eyeB ? (eyeA.x + eyeB.x) / 2 : faceAnchor.x;
        const cy = eyeA && eyeB ? (eyeA.y + eyeB.y) / 2 : faceAnchor.y - faceAnchor.size.height * height * 0.12;
        const shield = Math.max(22, faceAnchor.size.width * width * (0.48 + progress * 0.28));
        ctx.globalAlpha *= faceAlpha;
        ctx.beginPath();
        ctx.ellipse(cx, cy, shield, shield * 0.44, ((faceAnchor.orientation?.roll || 0) * Math.PI) / 180, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha *= 0.25;
        ctx.fillStyle = `rgba(${colors[0]},.7)`;
        ctx.fill();
      }
      ctx.restore();
    }

    const pulse = input.filterInteraction?.pulse;
    if (pulse && pulse.id !== shownFilterPulseId) {
      shownFilterPulseId = pulse.id;
      filterBursts.push({ position: pulse.position, age: 0 });
      if (preset === 'aura-crown' && faceAnchor) {
        pushCrownPulseBursts(crownState, { anchor: faceAnchor, handPoint: mapPoint(pulse.position), height });
      }
    }

    if (preset === 'aura-crown') {
      updateCrownTrail(crownState, { anchor: faceAnchor, hand, width, height, amount, reducedMotion, mapPoint });
    } else {
      crownState.previousHand = null;
    }
  }

  function render(now) {
    frameId = requestAnimationFrame(render);
    resize();
    if (!width || !height) return;
    const input = getInputs() || {};
    const preset = input.preset || 'aura-crown';
    const dt = Math.min(0.05, previousAt ? (now - previousAt) / 1000 : 1 / 60);
    previousAt = now;
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
        return previous
          ? {
              x: lerp(previous.x, next.x, blend),
              y: lerp(previous.y, next.y, blend),
              size: {
                width: lerp(previous.size.width, next.size.width, blend),
                height: lerp(previous.size.height, next.size.height, blend),
              },
              landmarks: next.landmarks,
              orientation: next.orientation,
            }
          : next;
      });
      faceAnchor = faceAnchors[0] || null;
      customRolls.length = faceAnchors.length;
      faceAlpha = lerp(faceAlpha, 1, 1 - Math.exp(-dt * 6));
    } else {
      faceAlpha = lerp(faceAlpha, 0, 1 - Math.exp(-dt * 2.6));
      if (faceAlpha < 0.01) {
        faceAnchor = null;
        faceAnchors = [];
        customRolls.length = 0;
      }
    }

    if (preset === 'aura-crown') {
      const anchors = faceAnchors.length ? faceAnchors : faceAnchor ? [faceAnchor] : [];
      updateCrownGesture(crownState, { anchors, input, width, height, dt, mapPoint });
    } else {
      decayCrownState(crownState, dt);
    }

    if (preset !== activePreset) {
      outgoingPreset = activePreset;
      activePreset = preset;
      transitionAt = now;
    }

    const t = clamp((now - transitionAt) / 380, 0, 1);
    const amount = clamp(input.intensity ?? 60, 0, 100) / 100;
    ctx.clearRect(0, 0, width, height);
    if (outgoingPreset && t < 1) drawPreset(outgoingPreset, input, 1 - t, faceAlpha, amount, now, dt);
    drawPreset(activePreset || preset, input, t, faceAlpha, amount, now, dt);
    drawFilterBursts(input, now, dt, amount, activePreset || preset);

    if (preset !== 'custom-filter' && faceAlpha > 0.01 && faceAnchors.length) {
      const color = input.filterColors?.[preset]?.[0] || DEFAULT_FILTER_COLORS[preset]?.[0] || DEFAULT_FILTER_COLORS['aura-crown'][0];
      ctx.save();
      ctx.globalAlpha = faceAlpha * (0.08 + amount * 0.1);
      ctx.strokeStyle = `rgba(${color},.75)`;
      ctx.lineWidth = 1;
      faceAnchors.forEach((anchor) => {
        ctx.beginPath();
        ctx.ellipse(anchor.x, anchor.y, anchor.size.width * width * 0.58, anchor.size.height * height * 0.61, 0, 0, Math.PI * 2);
        ctx.stroke();
      });
      ctx.restore();
    }

    drawInteraction(input, now, dt, amount);
    drawShowcase(now, input);
  }

  frameId = requestAnimationFrame(render);
  return () => {
    cancelAnimationFrame(frameId);
    observer?.disconnect();
    if (!observer) window.removeEventListener('resize', resize);
    ctx.clearRect(0, 0, width, height);
    bursts.length = 0;
    filterBursts.length = 0;
    customRolls.length = 0;
    clearCrownState(crownState);
    clearEnergyHandsState(energyHandsState);
  };
}
