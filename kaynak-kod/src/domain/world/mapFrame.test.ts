import { describe, expect, it } from 'vitest';
import { clampFrame, fitFrame, panFrame, viewBoxOf, zoomFrame, type FrameLimits } from './mapFrame';

const ASPECT = 4 / 3;
const town = { x0: -150, x1: 150, z0: -150, z1: 120 };
const limits: FrameLimits = { outer: fitFrame(town, ASPECT, 4), minWidth: 40 };
const w = (r: { x0: number; x1: number }): number => r.x1 - r.x0;
const h = (r: { z0: number; z1: number }): number => r.z1 - r.z0;

describe('map frame', () => {
  it('fits a rectangle with a margin at the given aspect, centred', () => {
    const f = fitFrame({ x0: -20, x1: 28, z0: -20, z1: 40 }, ASPECT, 2);
    expect(w(f) / h(f)).toBeCloseTo(ASPECT);
    expect(h(f)).toBeCloseTo(64); // the taller side decides
    expect((f.x0 + f.x1) / 2).toBeCloseTo(4);
    expect((f.z0 + f.z1) / 2).toBeCloseTo(10);
    const wide = fitFrame({ x0: 0, x1: 100, z0: 0, z1: 10 }, ASPECT);
    expect(w(wide)).toBeCloseTo(100);
  });

  it('zooms about a pivot and keeps the aspect', () => {
    const f = fitFrame({ x0: 0, x1: 80, z0: 0, z1: 60 }, ASPECT);
    const z = zoomFrame(f, 0.5, limits, { x: 20, z: 15 });
    expect(w(z)).toBeCloseTo(40);
    expect(w(z) / h(z)).toBeCloseTo(ASPECT);
    // The pivot keeps its relative place in the frame (a quarter in from the west and south edges).
    expect((20 - z.x0) / w(z)).toBeCloseTo(0.25);
    expect((15 - z.z0) / h(z)).toBeCloseTo(0.25);
  });

  it('stops zooming in at the minimum width and out at the whole town', () => {
    const f = fitFrame({ x0: 0, x1: 80, z0: 0, z1: 60 }, ASPECT);
    expect(w(zoomFrame(f, 0.01, limits))).toBeCloseTo(40);
    const out = zoomFrame(f, 100, limits);
    expect(out).toEqual(limits.outer);
  });

  it('pans but never leaves the town', () => {
    const f = fitFrame({ x0: 0, x1: 80, z0: 0, z1: 60 }, ASPECT);
    const moved = panFrame(f, 10, -5, limits);
    expect(moved.x0).toBeCloseTo(f.x0 + 10);
    expect(moved.z0).toBeCloseTo(f.z0 - 5);
    const far = panFrame(f, 1e4, 1e4, limits);
    expect(far.x1).toBeCloseTo(limits.outer.x1);
    expect(far.z1).toBeCloseTo(limits.outer.z1);
    expect(w(far)).toBeCloseTo(w(f));
  });

  it('centres a frame that is bigger than the limits allow', () => {
    const c = clampFrame({ x0: -1000, x1: 1000, z0: -750, z1: 750 }, limits);
    expect(c).toEqual(limits.outer);
  });

  it('writes an SVG viewBox with north up', () => {
    expect(viewBoxOf({ x0: -10, x1: 30, z0: 5, z1: 35 })).toBe('-10.00 -35.00 40.00 30.00');
  });
});
