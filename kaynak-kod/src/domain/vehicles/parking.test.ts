import { describe, expect, it } from 'vitest';
import { CollisionWorld } from '../collision/CollisionWorld';
import { ParkedState, STEP_OFF_GAP, dismountSpot, mountCheck, parkedFootprint, pathClear, type Pose } from './parking';

const EAST = Math.PI / 2;
const close = (a: { x: number; z: number } | null, x: number, z: number): void => {
  expect(a).not.toBeNull();
  expect(a?.x).toBeCloseTo(x);
  expect(a?.z).toBeCloseTo(z);
};

describe('parkedFootprint', () => {
  it('a capsule body parks as its full box', () => {
    const fp = parkedFootprint({ radius: 1, halfLength: 1.3 });
    expect(fp.halfWidth).toBe(1);
    expect(fp.halfLength).toBeCloseTo(2.3);
    expect(fp.spine).toBeCloseTo(1.3);
  });
  it('a circle body parks narrower than it rides and longer than wide', () => {
    const fp = parkedFootprint({ radius: 0.45, halfLength: 0 });
    expect(fp.halfWidth).toBeLessThan(0.45);
    expect(fp.halfLength).toBeGreaterThan(fp.halfWidth);
    expect(fp.spine).toBeCloseTo(fp.halfLength - fp.halfWidth);
  });
});

describe('dismountSpot', () => {
  const north: Pose = { x: 10, z: 20, heading: 0 };
  const d = 0.5 + STEP_OFF_GAP;
  const blocked =
    (...pts: [number, number][]) =>
    (x: number, z: number): boolean =>
      !pts.some(([bx, bz]) => Math.hypot(bx - x, bz - z) < 0.01);

  it('steps off to the left first', () => close(dismountSpot(north, 0.5, () => true), 10 - d, 20));
  it('then to the right', () => close(dismountSpot(north, 0.5, blocked([10 - d, 20])), 10 + d, 20));
  it('then behind', () => close(dismountSpot(north, 0.5, blocked([10 - d, 20], [10 + d, 20])), 10, 20 - d));
  it('then in front', () => close(dismountSpot(north, 0.5, blocked([10 - d, 20], [10 + d, 20], [10, 20 - d])), 10, 20 + d));
  it('refuses when all four are blocked', () => expect(dismountSpot(north, 0.5, () => false)).toBeNull());

  it('follows the heading: facing east, left is north (+z)', () => {
    close(dismountSpot({ x: 0, z: 0, heading: EAST }, 0.5, () => true), 0, d);
  });
  it('measures behind and front from the half-length of a long vehicle', () => {
    const sidesBlocked = (x: number): boolean => Math.abs(x) < 0.01;
    close(dismountSpot({ x: 0, z: 0, heading: 0 }, 1, sidesBlocked, { halfLength: 2.3 }), 0, -(2.3 + STEP_OFF_GAP));
  });
  it('asks for room for the rider (foot radius)', () => {
    const asked: number[] = [];
    dismountSpot(north, 0.5, (_x, _z, r) => (asked.push(r), true), { footRadius: 0.4 });
    expect(asked).toEqual([0.4]);
  });
});

describe('dismountSpot beside a thin fence (pathClear)', () => {
  /** A fence along x = 0 (z −10..10), 0.2 m thick. */
  const world = new CollisionWorld();
  world.addStatic({ shape: { kind: 'box', x0: -0.1, x1: 0.1, z0: -10, z1: 10 } });
  const isFree = (x: number, z: number, r: number): boolean => !world.overlaps(x, z, r);
  // A two-wheeler (radius 0.36) facing north, its centre 0.46 m from the fence: the preferred left spot
  // (x = −0.50) is free ground — but on the far side of the fence.
  const bike: Pose = { x: 0.46, z: 0, heading: 0 };
  const side = 0.36 + STEP_OFF_GAP;

  it('the far side of the fence is free ground (why the path matters)', () => {
    close(dismountSpot(bike, 0.36, isFree), 0.46 - side, 0);
  });
  it('steps off on the open side instead, never through the fence', () => {
    const spot = dismountSpot(bike, 0.36, isFree, { reaches: (x, z) => pathClear(world, bike, { x, z }) });
    close(spot, 0.46 + side, 0);
  });
  it('pathClear: blocked across the fence, clear along it', () => {
    expect(pathClear(world, bike, { x: -0.5, z: 0 })).toBe(false);
    expect(pathClear(world, bike, { x: 1.42, z: 0 })).toBe(true);
    expect(pathClear(world, bike, { x: 0.46, z: 1.5 })).toBe(true);
  });
  it('refuses when the only free spots are behind the fence', () => {
    // A second fence just right of the bike leaves no reachable spot on either side; ends blocked too.
    const boxed = new CollisionWorld();
    boxed.addStatic({ shape: { kind: 'box', x0: -0.1, x1: 0.1, z0: -10, z1: 10 } });
    boxed.addStatic({ shape: { kind: 'box', x0: 0.82, x1: 1.02, z0: -10, z1: 10 } });
    boxed.addStatic({ shape: { kind: 'box', x0: -5, x1: 5, z0: 1.2, z1: 1.4 } });
    boxed.addStatic({ shape: { kind: 'box', x0: -5, x1: 5, z0: -1.4, z1: -1.2 } });
    const free = (x: number, z: number, r: number): boolean => !boxed.overlaps(x, z, r);
    expect(dismountSpot(bike, 0.36, free)).not.toBeNull(); // without the path check it would teleport out
    expect(dismountSpot(bike, 0.36, free, { reaches: (x, z) => pathClear(boxed, bike, { x, z }) })).toBeNull();
  });
});

describe('ParkedState', () => {
  const rack = (id: string): Pose => ({ x: id === 'van' ? 5 : 0, z: 0, heading: 0 });
  const make = (): ParkedState => {
    const s = new ParkedState(rack, (id) => (id === 'van' ? 1.3 : 0));
    s.setOwned(['bike', 'van']);
    return s;
  };

  it('owned vehicles start at their rack slots', () => {
    const s = make();
    expect(s.placeOf('bike')).toEqual(rack('bike'));
    expect(s.placeOf('van')).toEqual(rack('van'));
    expect(s.placeOf('scooter')).toBeUndefined();
  });
  it('setOwned adds new ones at the rack, keeps the others in place, drops what is no longer owned', () => {
    const s = make();
    s.park('bike', { x: 30, z: 30, heading: 1 });
    s.setOwned(['bike', 'scooter']);
    expect(s.placeOf('bike')).toEqual({ x: 30, z: 30, heading: 1 });
    expect(s.placeOf('scooter')).toEqual(rack('scooter'));
    expect(s.has('van')).toBe(false);
  });
  it('ride and park move a vehicle; unknown ids are ignored', () => {
    const s = make();
    s.ride('bike');
    expect(s.placeOf('bike')).toBe('ridden');
    expect(s.riddenIds()).toEqual(['bike']);
    s.park('bike', { x: 8, z: 9, heading: 2 });
    expect(s.placeOf('bike')).toEqual({ x: 8, z: 9, heading: 2 });
    s.ride('motorcycle');
    s.park('motorcycle', { x: 1, z: 1, heading: 0 });
    expect(s.has('motorcycle')).toBe(false);
  });
  it('resetToRack returns only the given vehicles', () => {
    const s = make();
    s.ride('bike');
    s.park('van', { x: 40, z: 40, heading: 0 });
    s.resetToRack(['bike', 'scooter']);
    expect(s.placeOf('bike')).toEqual(rack('bike'));
    expect(s.placeOf('van')).toEqual({ x: 40, z: 40, heading: 0 });
  });
  it('nearest finds the closest parked vehicle in range and skips ridden ones', () => {
    const s = make();
    expect(s.nearest({ x: 1, z: 0 }, 2.2)?.id).toBe('bike');
    expect(s.nearest({ x: 4, z: 0 }, 2.2)?.id).toBe('van');
    expect(s.nearest({ x: 0, z: 10 }, 2.2)).toBeNull();
    s.ride('bike');
    expect(s.nearest({ x: 1, z: 0 }, 2.2)).toBeNull();
  });
  it("nearest measures to a long vehicle's centre line", () => {
    const s = make();
    const n = s.nearest({ x: 5, z: 3 }, 2.2); // 3 m from the centre, 1.7 m from the end of the spine
    expect(n?.id).toBe('van');
    expect(n?.distance).toBeCloseTo(1.7);
    expect(n?.z).toBeCloseTo(1.3);
  });
});

describe('mountCheck', () => {
  const VAN = { radius: 1, halfLength: 1.3 };
  const BIKE = { radius: 0.45, halfLength: 0 };
  /** A fence along x = 0 (z −10..10), 0.2 m thick. */
  const fenced = () => {
    const w = new CollisionWorld();
    w.addStatic({ shape: { kind: 'box', x0: -0.1, x1: 0.1, z0: -10, z1: 10 } });
    return w;
  };
  const bikeAt: Pose = { x: 1, z: 0, heading: 0 };

  it('a rider beside the vehicle can get on', () => {
    expect(mountCheck(fenced(), { x: 2.5, z: 0 }, bikeAt, BIKE)).toBe('ok');
  });
  it('not through a fence, even within reach', () => {
    expect(mountCheck(fenced(), { x: -1, z: 0 }, bikeAt, BIKE)).toBe('unreachable');
  });
  it('a vehicle parked flush against the fence is still free', () => {
    const flush: Pose = { x: 0.1 + BIKE.radius, z: 0, heading: 0 };
    expect(mountCheck(fenced(), { x: 2, z: 0 }, flush, BIKE)).toBe('ok');
  });
  it('a two-wheeler ridden nose-first into the fence at an angle: still reachable from beside its front', () => {
    const r = BIKE.radius;
    const heading = -(65 * Math.PI) / 180; // nose towards the fence (west), 65° off along it
    const nosed: Pose = { x: 0.1 + r, z: 0, heading };
    // The rider stands beside the front wheel, on the open side of the fence.
    expect(mountCheck(fenced(), { x: 0.1 + 0.36, z: -1.35 }, nosed, BIKE)).toBe('ok');
  });
  it('a van whose spot something moved into: no room', () => {
    const w = new CollisionWorld();
    const van: Pose = { x: 5, z: 0, heading: 0 };
    w.setDynamic([{ shape: { kind: 'circle', x: 5, z: 2, r: 0.4 } }]); // a passer-by at its front bumper
    expect(mountCheck(w, { x: 7, z: 0 }, van, VAN)).toBe('noRoom');
    w.setDynamic([]);
    expect(mountCheck(w, { x: 7, z: 0 }, van, VAN)).toBe('ok');
  });
});
