import { describe, it, expect, vi } from 'vitest';
import { ART_HEIGHT, ART_WIDTH, renderDrawingAction } from '../drawingRenderer.js';

function createContextStub() {
  const gradient = { addColorStop: vi.fn() };
  return {
    gradient,
    save: vi.fn(),
    restore: vi.fn(),
    clearRect: vi.fn(),
    createLinearGradient: vi.fn(() => gradient),
    beginPath: vi.fn(),
    closePath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    strokeRect: vi.fn(),
    ellipse: vi.fn(),
    bezierCurveTo: vi.fn(),
    globalCompositeOperation: 'source-over',
    strokeStyle: '',
    fillStyle: '',
    lineWidth: 0,
    shadowColor: '',
    shadowBlur: 0,
    lineCap: '',
    lineJoin: '',
  };
}

describe('drawingRenderer', () => {
  it('clears the full canvas for clear actions', () => {
    const ctx = createContextStub();
    renderDrawingAction(ctx, { tool: 'clear' });
    expect(ctx.clearRect).toHaveBeenCalledWith(0, 0, ART_WIDTH, ART_HEIGHT);

    renderDrawingAction(ctx, { tool: 'clear' }, { width: 800, height: 450, normalized: true });
    expect(ctx.clearRect).toHaveBeenCalledWith(0, 0, 800, 450);
  });

  it('draws brush single-point dots and multi-point paths in pixel and normalized modes', () => {
    const ctx = createContextStub();
    renderDrawingAction(ctx, {
      tool: 'brush',
      color: '#62e7e5',
      size: 10,
      start: { x: 100, y: 200 },
      points: [{ x: 100, y: 200 }],
    });
    expect(ctx.arc).toHaveBeenCalledWith(100, 200, 5, 0, Math.PI * 2);
    expect(ctx.fill).toHaveBeenCalledTimes(1);

    const normCtx = createContextStub();
    renderDrawingAction(
      normCtx,
      {
        tool: 'brush',
        color: '#ffffff',
        size: 10,
        start: { x: 0.25, y: 0.5 },
        points: [
          { x: 0.25, y: 0.5 },
          { x: 0.75, y: 0.5 },
        ],
      },
      { width: 800, height: 400, normalized: true },
    );
    expect(normCtx.lineWidth).toBe(5);
    expect(normCtx.moveTo).toHaveBeenCalledWith(200, 200);
    expect(normCtx.lineTo).toHaveBeenCalledWith(600, 200);
    expect(normCtx.stroke).toHaveBeenCalledTimes(1);
  });

  it('applies magic ink gradient/glow and eraser destination-out composite mode', () => {
    const magicCtx = createContextStub();
    renderDrawingAction(magicCtx, {
      tool: 'magic',
      color: '#548eff',
      size: 10,
      start: { x: 10, y: 20 },
      points: [
        { x: 10, y: 20 },
        { x: 110, y: 120 },
      ],
    });
    expect(magicCtx.createLinearGradient).toHaveBeenCalledWith(10, 20, 110, 120);
    expect(magicCtx.gradient.addColorStop).toHaveBeenCalledWith(0.5, '#ffffff');
    expect(magicCtx.shadowBlur).toBe(24);
    expect(magicCtx.stroke).toHaveBeenCalledTimes(1);

    const eraserCtx = createContextStub();
    renderDrawingAction(
      eraserCtx,
      {
        tool: 'eraser',
        color: '#000000',
        size: 12,
        start: { x: 0.1, y: 0.1 },
        points: [{ x: 0.1, y: 0.1 }],
      },
      { width: 1000, height: 800, normalized: true },
    );
    expect(eraserCtx.globalCompositeOperation).toBe('destination-out');
    expect(eraserCtx.fill).toHaveBeenCalledTimes(1);
  });

  it('renders line, rectangle, circle, star, and heart shapes', () => {
    const base = { color: '#62e7e5', size: 8, start: { x: 100, y: 100 }, end: { x: 300, y: 200 } };

    const lineCtx = createContextStub();
    renderDrawingAction(lineCtx, { ...base, tool: 'line' });
    expect(lineCtx.moveTo).toHaveBeenCalledWith(100, 100);
    expect(lineCtx.lineTo).toHaveBeenCalledWith(300, 200);
    expect(lineCtx.stroke).toHaveBeenCalledTimes(1);

    const rectCtx = createContextStub();
    renderDrawingAction(rectCtx, { ...base, tool: 'rectangle' });
    expect(rectCtx.strokeRect).toHaveBeenCalledWith(100, 100, 200, 100);

    const circleCtx = createContextStub();
    renderDrawingAction(circleCtx, { ...base, tool: 'circle' });
    expect(circleCtx.ellipse).toHaveBeenCalledWith(200, 150, 100, 50, 0, 0, Math.PI * 2);

    const starCtx = createContextStub();
    renderDrawingAction(starCtx, { ...base, tool: 'star' });
    expect(starCtx.moveTo).toHaveBeenCalledTimes(1);
    expect(starCtx.lineTo).toHaveBeenCalledTimes(9);
    expect(starCtx.closePath).toHaveBeenCalledTimes(1);

    const heartCtx = createContextStub();
    renderDrawingAction(heartCtx, { ...base, tool: 'heart' });
    expect(heartCtx.bezierCurveTo).toHaveBeenCalledTimes(2);
    expect(heartCtx.stroke).toHaveBeenCalledTimes(1);
  });
});
