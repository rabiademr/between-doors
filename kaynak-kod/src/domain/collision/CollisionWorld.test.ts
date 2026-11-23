import { describe, expect, it } from 'vitest';
import { CollisionWorld, closestOnSegment, penetration, signedDistance, type CapsuleBody } from './CollisionWorld';

const R = 0.35;

describe('penetration', () => {
  it('pushes a circle out of a box face', () => {
    const p = penetration(0.2, 0, R, { kind: 'box', x0: 0.4, x1: 1, z0: -1, z1: 1 });
    expect(p?.x).toBeCloseTo(-0.15);
    expect(p?.z).toBeCloseTo(0);
  });

  it('pushes out through the nearest face when the centre is inside the box', () => {
    const p = penetration(0.9, 0, R, { kind: 'box', x0: 0, x1: 1, z0: -1, z1: 1 });
    expect(p).toEqual({ x: expect.closeTo(0.45), z: 0 });
  });

  it('separates circles and capsules', () => {
    expect(penetration(0, 0, R, { kind: 'circle', x: 0.7, z: 0, r: 0.5 })?.x).toBeCloseTo(-0.15);
    const cap = penetration(0, 0.3, R, { kind: 'capsule', ax: -2, az: 0, bx: 2, bz: 0, r: 0.06 });
    expect(cap?.x).toBeCloseTo(0);
    expect(cap?.z).toBeCloseTo(0.11);
  });

  it('returns null when apart', () => {
    expect(penetration(0, 0, R, { kind: 'box', x0: 1, x1: 2, z0: 1, z1: 2 })).toBeNull();
    expect(penetration(0, 0, R, { kind: 'circle', x: 1, z: 0, r: 0.5 })).toBeNull();
  });
});

describe('CollisionWorld.move', () => {
  const wallAtX1 = () => {
    const w = new CollisionWorld();
    w.addStatic({ shape: { kind: 'box', x0: 1, x1: 1.5, z0: -10, z1: 10 } });
    return w;
  };

  it('moves freely in open space', () => {
    const r = new CollisionWorld().move(0, 0, R, 1, 2);
    expect(r).toEqual({ x: expect.closeTo(1), z: expect.closeTo(2), blocked: false });
  });

  it('stops at a wall', () => {
    const r = wallAtX1().move(0, 0, R, 2, 0);
    expect(r.x).toBeCloseTo(1 - R);
    expect(r.blocked).toBe(true);
  });

  it('slides along a wall when moving diagonally into it', () => {
    const r = wallAtX1().move(0.6, 0, R, 1, 1);
    expect(r.x).toBeCloseTo(1 - R);
    expect(r.z).toBeCloseTo(1);
  });

  it('never tunnels through a thin gate, even at bike speed in a long frame', () => {
    const w = new CollisionWorld();
    w.addStatic({ shape: { kind: 'capsule', ax: 5, az: -2, bx: 5, bz: 2, r: 0.06 } });
    const r = w.move(0, 0, R, 12 * 0.1 * 10, 0); // 12 m in one call
    expect(r.x).toBeLessThan(5);
    expect(r.blocked).toBe(true);
  });

  it('ignores inactive colliders and follows their switch live', () => {
    let on = false;
    const w = new CollisionWorld();
    w.addStatic({ shape: { kind: 'circle', x: 1, z: 0, r: 0.35 }, active: () => on });
    expect(w.move(0, 0, R, 2, 0).blocked).toBe(false);
    on = true;
    expect(w.move(0, 0, R, 2, 0).blocked).toBe(true);
  });

  it('collides with dynamic colliders and lets them be replaced each frame', () => {
    const w = new CollisionWorld();
    w.setDynamic([{ shape: { kind: 'circle', x: 1, z: 0, r: 0.35 } }]);
    expect(w.overlaps(0.5, 0, R)).toBe(true);
    w.setDynamic([]);
    expect(w.overlaps(0.5, 0, R)).toBe(false);
  });

  it('finds shapes that span many grid cells', () => {
    const w = new CollisionWorld(2);
    w.addStatic({ shape: { kind: 'box', x0: -50, x1: 50, z0: 10, z1: 11 } });
    expect(w.overlaps(37, 9.8, R)).toBe(true);
    expect(w.overlaps(37, 9.5, R)).toBe(false);
    expect(w.staticCount).toBe(1);
  });

  it('stays out of a corner made of two boxes', () => {
    const w = new CollisionWorld();
    w.addStatic({ shape: { kind: 'box', x0: 1, x1: 2, z0: -5, z1: 2 } });
    w.addStatic({ shape: { kind: 'box', x0: -5, x1: 2, z0: 1, z1: 2 } });
    const r = w.move(0, 0, R, 3, 3);
    expect(r.x).toBeCloseTo(1 - R);
    expect(r.z).toBeCloseTo(1 - R);
    expect(w.overlaps(r.x, r.z, R - 1e-6)).toBe(false);
  });
});

// A van-sized capsule: 4.6 m long (2 × 1.3 + 2 × 1), 2 m wide.
const VAN = { halfLength: 1.3, r: 1 };
const van = (x: number, z: number, heading: number): CapsuleBody => ({ x, z, heading, ...VAN });

describe('signedDistance / closestOnSegment', () => {
  it('measures outside and inside a box', () => {
    const box = { kind: 'box', x0: 0, x1: 2, z0: 0, z1: 2 } as const;
    expect(signedDistance(3, 1, box)).toBeCloseTo(1);
    expect(signedDistance(3, 3, box)).toBeCloseTo(Math.SQRT2);
    expect(signedDistance(1, 0.5, box)).toBeCloseTo(-0.5);
  });

  it('finds the point of a segment nearest a box corner, a circle and a capsule', () => {
    const seg = { ax: -2, az: 0, bx: 2, bz: 0 };
    expect(closestOnSegment(seg, { kind: 'box', x0: 0.5, x1: 3, z0: 1, z1: 3 }).x).toBeCloseTo(0.5, 4);
    expect(closestOnSegment(seg, { kind: 'circle', x: -1.2, z: 2, r: 0.3 }).x).toBeCloseTo(-1.2, 4);
    expect(closestOnSegment(seg, { kind: 'circle', x: 9, z: 1, r: 0.3 }).x).toBeCloseTo(2, 4); // clamps to the end
    const crossing = closestOnSegment(seg, { kind: 'capsule', ax: 1, az: -3, bx: 1, bz: 3, r: 0.1 });
    expect(crossing.x).toBeCloseTo(1, 3);
  });
});

describe('CollisionWorld capsule bodies', () => {
  const wallAtX5 = () => {
    const w = new CollisionWorld();
    w.addStatic({ shape: { kind: 'box', x0: 5, x1: 5.3, z0: -20, z1: 20 } });
    return w;
  };

  it('moves freely in open space', () => {
    expect(new CollisionWorld().moveCapsule(van(0, 0, 0), 1, 2)).toEqual({ x: expect.closeTo(1), z: expect.closeTo(2), blocked: false });
  });

  it('stops its nose at a wall it drives into head-on', () => {
    // Facing +X: the front cap reaches halfLength + r = 2.3 m ahead of the centre.
    const r = wallAtX5().moveCapsule(van(0, 0, Math.PI / 2), 6, 0);
    expect(r.x).toBeCloseTo(5 - 2.3, 3);
    expect(r.z).toBeCloseTo(0, 3);
    expect(r.blocked).toBe(true);
  });

  it('stops its side at a wall it drives into sideways', () => {
    const r = wallAtX5().moveCapsule(van(0, 0, 0), 6, 0); // facing +Z, pushed toward +X
    expect(r.x).toBeCloseTo(5 - 1, 3);
  });

  it('slides along a wall on a glancing hit, nose against it', () => {
    const heading = Math.PI / 2 - 0.3; // mostly +X, a bit +Z
    const w = wallAtX5();
    const start = van(5 - 2.3, 0, heading); // nose already touching
    const r = w.moveCapsule(start, Math.sin(heading) * 2, Math.cos(heading) * 2);
    expect(r.blocked).toBe(true);
    expect(r.z).toBeGreaterThan(0.5); // kept moving along the wall
    expect(w.overlapsCapsule({ ...van(r.x, r.z, heading), r: 1 - 1e-6 })).toBe(false);
  });

  it('never tunnels through a thin gate at 15 m/s in a long frame', () => {
    const w = new CollisionWorld();
    w.addStatic({ shape: { kind: 'capsule', ax: 8, az: -3, bx: 8, bz: 3, r: 0.06 } });
    const r = w.moveCapsule(van(0, 0, Math.PI / 2), 15 * 0.1 * 10, 0); // 15 m in one call
    expect(r.x).toBeLessThan(8 - 2.3 + 1e-3);
    expect(r.blocked).toBe(true);
  });

  it('cannot slip a thin post between its two ends (the waist is solid)', () => {
    const w = new CollisionWorld();
    w.addStatic({ shape: { kind: 'circle', x: 3, z: 0, r: 0.05 } });
    // Facing +Z, moving sideways toward +X: the post meets the middle of the side.
    const r = w.moveCapsule(van(0, 0, 0), 6, 0);
    expect(r.x).toBeCloseTo(3 - 1.05, 3);
  });

  it('stays out of a corner made of two boxes', () => {
    const w = new CollisionWorld();
    w.addStatic({ shape: { kind: 'box', x0: 4, x1: 5, z0: -10, z1: 5 } });
    w.addStatic({ shape: { kind: 'box', x0: -10, x1: 5, z0: 4, z1: 5 } });
    const heading = Math.PI / 4; // driving diagonally into the corner
    const r = w.moveCapsule(van(0, 0, heading), 6, 6);
    expect(r.blocked).toBe(true);
    expect(w.overlapsCapsule({ ...van(r.x, r.z, heading), r: 1 - 1e-3 })).toBe(false);
    expect(r.x).toBeLessThan(4);
    expect(r.z).toBeLessThan(4);
  });

  it('reports overlap for a turned pose that would swing into a wall', () => {
    const w = wallAtX5();
    expect(w.overlapsCapsule(van(3.9, 0, 0))).toBe(false); // parallel, side 0.1 m from the wall
    expect(w.overlapsCapsule(van(3.9, 0, 0.3))).toBe(true); // nose swung toward the wall
  });

  it('pushes out of an overlap with a zero move', () => {
    const r = wallAtX5().moveCapsule(van(4.5, 0, 0), 0, 0);
    expect(r.x).toBeCloseTo(4, 3);
    expect(r.blocked).toBe(true);
  });

  it('collides with dynamic colliders', () => {
    const w = new CollisionWorld();
    w.setDynamic([{ shape: { kind: 'circle', x: 0, z: 2.5, r: 0.35 } }]);
    expect(w.overlapsCapsule(van(0, 0, 0))).toBe(true); // nose reaches z = 2.3 > 2.5 − 0.35
    expect(w.moveCapsule(van(0, -3, 0), 0, 5).z).toBeCloseTo(2.5 - 0.35 - 2.3, 3);
    w.setDynamic([]);
    expect(w.overlapsCapsule(van(0, 0, 0))).toBe(false);
  });
});
