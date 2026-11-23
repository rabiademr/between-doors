import { describe, expect, it } from 'vitest';
import { distanceToRect, distanceToSegment, firstBlocked, inViewWedge, isWalkable, samplesAlong, type Obstacles } from './walkable';

const WORLD: Obstacles = {
  bounds: { x0: -10, x1: 10, z0: -10, z1: 10 },
  rects: [{ x0: 2, x1: 4, z0: -1, z1: 1 }],
  circles: [{ x: -5, z: 0, r: 1 }],
};

describe('walkable', () => {
  it('measures the distance to a rectangle (0 inside)', () => {
    const r = { x0: 0, x1: 2, z0: 0, z1: 2 };
    expect(distanceToRect({ x: 1, z: 1 }, r)).toBe(0);
    expect(distanceToRect({ x: 3, z: 1 }, r)).toBe(1);
    expect(distanceToRect({ x: 5, z: 6 }, r)).toBe(5);
  });

  it('a body fits on open ground, not against boxes, circles or the edge', () => {
    expect(isWalkable({ x: 0, z: 0 }, WORLD, 0.35)).toBe(true);
    expect(isWalkable({ x: 3, z: 0 }, WORLD, 0.35)).toBe(false); // inside the box
    expect(isWalkable({ x: 1.8, z: 0 }, WORLD, 0.35)).toBe(false); // too close to it
    expect(isWalkable({ x: 1.6, z: 0 }, WORLD, 0.35)).toBe(true);
    expect(isWalkable({ x: -3.8, z: 0 }, WORLD, 0.35)).toBe(false); // brushing the circle
    expect(isWalkable({ x: 9.8, z: 0 }, WORLD, 0.35)).toBe(false); // outside the bounds margin
  });

  it('finds where a stretch is blocked', () => {
    expect(firstBlocked({ x: 0, z: 5 }, { x: 8, z: 5 }, WORLD, 0.35)).toBeNull();
    const hit = firstBlocked({ x: 0, z: 0 }, { x: 8, z: 0 }, WORLD, 0.35);
    expect(hit?.x).toBeGreaterThan(1.6);
    expect(hit?.x).toBeLessThan(2);
  });

  it('samples both ends of a stretch', () => {
    const s = samplesAlong({ x: 0, z: 0 }, { x: 1, z: 0 }, 0.25);
    expect(s).toHaveLength(5);
    expect(s[0]).toEqual({ x: 0, z: 0 });
    expect(s[4]).toEqual({ x: 1, z: 0 });
    expect(samplesAlong({ x: 2, z: 2 }, { x: 2, z: 2 })).toHaveLength(2);
  });

  it('measures the distance to a segment', () => {
    expect(distanceToSegment({ x: 5, z: 3 }, { x: 0, z: 0 }, { x: 10, z: 0 })).toBe(3);
    expect(distanceToSegment({ x: -4, z: 3 }, { x: 0, z: 0 }, { x: 10, z: 0 })).toBe(5);
  });

  it('knows what a camera sees on the ground', () => {
    const from = { x: 0, z: 0 };
    const to = { x: -10, z: 0 }; // looking west
    const half = Math.PI / 4;
    expect(inViewWedge({ x: -5, z: 0 }, from, to, half)).toBe(true);
    expect(inViewWedge({ x: -5, z: 4.9 }, from, to, half)).toBe(true);
    expect(inViewWedge({ x: -5, z: 6 }, from, to, half)).toBe(false);
    expect(inViewWedge({ x: -5, z: 6 }, from, to, half, 1.5)).toBe(true); // a wide body still shows
    expect(inViewWedge({ x: 3, z: 0 }, from, to, half)).toBe(false); // behind the camera
  });
});
