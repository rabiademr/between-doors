import { describe, expect, it } from 'vitest';
import { CollisionWorld } from '../../domain/collision/CollisionWorld';
import { VehicleMover } from './VehicleMover';
import type { MoverState } from './Mover';
import type { MoveInput } from '../movement';
import { BIKE_RADIUS, BIKE_TUNING, VEHICLES, VEHICLE_KINDS, nextVehicle, type VehicleKind } from './vehicles';

const DT = 1 / 60;
const START: MoverState = { x: 0, z: 0, heading: 0, speed: 0 };
const drive = (
  kind: VehicleKind,
  input: MoveInput,
  seconds: number,
  from: MoverState = START,
  collisions = new CollisionWorld(),
  dt = DT,
) => {
  const m = new VehicleMover(VEHICLES[kind]);
  let s = from;
  for (let t = 0; t < seconds; t += dt) s = m.step(s, { input, cameraAlpha: 0, dt, collisions });
  return s;
};
const ride = (input: MoveInput, seconds: number, from: MoverState = START, collisions = new CollisionWorld()) =>
  drive('bike', input, seconds, from, collisions);
const W = { forward: 1, right: 0, run: false };

/** Widest x reached driving a full circle to the right at cruise speed (≈ circle diameter). */
const turningDiameter = (kind: VehicleKind): number => {
  const m = new VehicleMover(VEHICLES[kind]);
  let s: MoverState = { x: 0, z: 0, heading: 0, speed: VEHICLES[kind].tuning.cruiseSpeed };
  let maxX = 0;
  for (let t = 0; t < 12; t += DT) {
    s = m.step(s, { input: { forward: 1, right: 1, run: false }, cameraAlpha: 0, dt: DT, collisions: new CollisionWorld() });
    maxX = Math.max(maxX, s.x);
  }
  return maxX;
};

describe('VehicleMover (bike)', () => {
  it('defaults to the bike', () => {
    const m = new VehicleMover();
    expect(m.kind).toBe('bike');
    expect(m.radius).toBe(BIKE_RADIUS);
    expect(m.tuning).toBe(BIKE_TUNING);
  });

  it('accelerates to cruise speed, faster with Shift, never beyond', () => {
    expect(ride(W, 1).speed).toBeCloseTo(BIKE_TUNING.acceleration, 0);
    expect(ride(W, 6).speed).toBeCloseTo(BIKE_TUNING.cruiseSpeed);
    expect(ride({ ...W, run: true }, 8).speed).toBeCloseTo(BIKE_TUNING.sprintSpeed);
  });

  it('rides along its heading, ignoring the camera', () => {
    const s = ride(W, 2, { x: 0, z: 0, heading: Math.PI / 2, speed: 0 }); // facing east
    expect(s.x).toBeGreaterThan(3);
    expect(Math.abs(s.z)).toBeLessThan(1e-9);
  });

  it('coasts down when the pedal is released and brakes hard with S, then rolls back slowly', () => {
    const cruising = { x: 0, z: 0, heading: 0, speed: 8 };
    const coast = ride({ forward: 0, right: 0, run: false }, 1, cruising);
    expect(coast.speed).toBeCloseTo(8 - BIKE_TUNING.drag, 1);
    const braked = ride({ forward: -1, right: 0, run: false }, 0.5, cruising);
    expect(braked.speed).toBeCloseTo(8 - BIKE_TUNING.braking * 0.5, 0); // stops in under a second
    const back = ride({ forward: -1, right: 0, run: false }, 3, cruising);
    expect(back.speed).toBeCloseTo(-BIKE_TUNING.reverseSpeed);
  });

  it("can't turn on the spot and keeps at least the turn radius at speed", () => {
    expect(ride({ forward: 0, right: 1, run: false }, 1).heading).toBe(0);
    // Full circle at cruise speed: radius ≈ v / yawRate = max(R, v / maxYawRate).
    const expectedRadius = Math.max(BIKE_TUNING.turnRadius, BIKE_TUNING.cruiseSpeed / BIKE_TUNING.maxYawRate);
    expect(turningDiameter('bike') / 2).toBeCloseTo(expectedRadius, 0);
  });

  it('turns right with D going forward (heading increases toward +X)', () => {
    expect(ride({ forward: 1, right: 1, run: false }, 0.5, { x: 0, z: 0, heading: 0, speed: 6 }).heading).toBeGreaterThan(0);
  });

  it('stops at a wall without tunnelling, losing its speed head-on', () => {
    const collisions = new CollisionWorld();
    collisions.addStatic({ shape: { kind: 'box', x0: -5, x1: 5, z0: 10, z1: 10.3 } });
    const s = ride({ ...W, run: true }, 4, { x: 0, z: 0, heading: 0, speed: 11 }, collisions);
    expect(s.z).toBeCloseTo(10 - BIKE_RADIUS, 2);
    expect(Math.abs(s.speed)).toBeLessThan(0.5);
  });

  it('scrubs speed but keeps rolling when glancing along a wall', () => {
    const collisions = new CollisionWorld();
    collisions.addStatic({ shape: { kind: 'box', x0: 1, x1: 1.3, z0: -50, z1: 50 } });
    const s = new VehicleMover().step(
      { x: 1 - BIKE_RADIUS, z: 0, heading: 0.3, speed: 8 },
      { input: { forward: 0, right: 0, run: false }, cameraAlpha: 0, dt: DT, collisions },
    );
    expect(s.speed).toBeGreaterThan(3);
    expect(s.speed).toBeLessThan(8);
    expect(s.z).toBeGreaterThan(0);
  });
});

describe('VehicleMover (two-wheelers against walls)', () => {
  const wallOnTheRight = () => {
    const collisions = new CollisionWorld();
    collisions.addStatic({ shape: { kind: 'box', x0: 1, x1: 1.3, z0: -500, z1: 500 } });
    return collisions;
  };

  it('keeps its pace brushing along a wall, and noses round to run along it', () => {
    const s = ride(W, 2, { x: 1 - BIKE_RADIUS, z: 0, heading: 0.3, speed: 8 }, wallOnTheRight());
    expect(s.speed).toBeGreaterThan(7); // used to lose 40 % every frame it touched
    expect(Math.abs(s.heading)).toBeLessThan(0.02);
    expect(s.z).toBeGreaterThan(14);
  });

  it('loses the same speed whatever the frame rate', () => {
    const from = { x: 1 - BIKE_RADIUS, z: 0, heading: 0.9, speed: 8 };
    const coast = { forward: 0, right: 0, run: false };
    const at60 = drive('bike', coast, 0.2, from, wallOnTheRight(), 1 / 60);
    const at30 = drive('bike', coast, 0.2, from, wallOnTheRight(), 1 / 30);
    expect(at30.speed).toBeCloseTo(at60.speed, 0);
  });

  it('does not turn a square hit into a slide', () => {
    const collisions = new CollisionWorld();
    collisions.addStatic({ shape: { kind: 'box', x0: -5, x1: 5, z0: 10, z1: 10.3 } });
    const s = ride(W, 3, { x: 0, z: 5, heading: 0, speed: 8 }, collisions);
    expect(s.heading).toBe(0);
    expect(Math.abs(s.x)).toBeLessThan(1e-6);
  });

  it('stuck nose-first, can swing round with the pedal held and ride off', () => {
    const collisions = new CollisionWorld();
    collisions.addStatic({ shape: { kind: 'box', x0: -50, x1: 50, z0: 10, z1: 10.3 } });
    const stuck = { x: 0, z: 10 - BIKE_RADIUS, heading: 0, speed: 0 };
    const swung = ride({ forward: 1, right: 1, run: false }, 1, stuck, collisions);
    expect(swung.heading).toBeGreaterThan(0.8); // no reversing needed
    const s = ride(W, 2, swung, collisions);
    expect(s.x).toBeGreaterThan(5); // riding east along the wall
    expect(s.speed).toBeGreaterThan(4);
  });

  it('backs out at a useful pace', () => {
    for (const kind of ['bike', 'scooter', 'motorcycle'] as const) expect(VEHICLES[kind].tuning.reverseSpeed).toBeGreaterThanOrEqual(2.5);
  });
});

describe('vehicle table', () => {
  it('cycles foot → bike → scooter → motorcycle → van → foot', () => {
    const seen: (VehicleKind | null)[] = [];
    let k: VehicleKind | null = null;
    for (let i = 0; i < 5; i++) seen.push((k = nextVehicle(k)));
    expect(seen).toEqual(['bike', 'scooter', 'motorcycle', 'van', null]);
  });

  it('reaches each vehicle its own cruise and top speed', () => {
    for (const kind of VEHICLE_KINDS) {
      const t = VEHICLES[kind].tuning;
      expect(drive(kind, W, 15).speed).toBeCloseTo(t.cruiseSpeed);
      expect(drive(kind, { ...W, run: true }, 15).speed).toBeCloseTo(t.sprintSpeed);
    }
  });

  it('gives each vehicle its character', () => {
    const { bike, scooter, motorcycle, van } = VEHICLES;
    expect(scooter.tuning.acceleration).toBeGreaterThan(bike.tuning.acceleration);
    expect(scooter.tuning.cruiseSpeed).toBeCloseTo(10);
    expect(motorcycle.tuning.sprintSpeed).toBeCloseTo(15);
    expect(van.tuning.sprintSpeed).toBeCloseTo(9);
    expect(van.tuning.acceleration).toBeLessThan(Math.min(bike.tuning.acceleration, scooter.tuning.acceleration, motorcycle.tuning.acceleration));
    // Turning circles at cruise speed: scooter tightest, van widest.
    expect(turningDiameter('scooter')).toBeLessThan(turningDiameter('bike'));
    expect(turningDiameter('motorcycle')).toBeGreaterThan(turningDiameter('bike'));
    expect(turningDiameter('van')).toBeGreaterThan(turningDiameter('motorcycle'));
  });

  it('keeps every vehicle outside a wall it hits at full speed, even in long frames', () => {
    for (const kind of VEHICLE_KINDS) {
      const collisions = new CollisionWorld();
      collisions.addStatic({ shape: { kind: 'capsule', ax: -5, az: 12, bx: 5, bz: 12, r: 0.06 } }); // thin gate
      const top = VEHICLES[kind].tuning.sprintSpeed;
      const s = drive(kind, { ...W, run: true }, 3, { x: 0, z: 0, heading: 0, speed: top }, collisions, 0.1);
      const { radius, halfLength } = VEHICLES[kind].body;
      expect(s.z).toBeCloseTo(12 - 0.06 - radius - halfLength, 2);
      expect(Math.abs(s.speed)).toBeLessThan(0.5);
    }
  });
});

describe('VehicleMover (van capsule)', () => {
  const van = () => new VehicleMover(VEHICLES.van);
  const { radius: R, halfLength: H } = VEHICLES.van.body;
  /** A long wall along +Z on the van's right (x = 3). */
  const wallOnRight = () => {
    const w = new CollisionWorld();
    w.addStatic({ shape: { kind: 'box', x0: 3, x1: 3.5, z0: -50, z1: 80 } });
    return w;
  };

  it('stops its nose at a wall at 15 m/s without tunnelling', () => {
    const collisions = new CollisionWorld();
    collisions.addStatic({ shape: { kind: 'box', x0: -5, x1: 5, z0: 10, z1: 10.1 } });
    const s = drive('van', W, 2, { x: 0, z: 0, heading: 0, speed: 15 }, collisions, 0.1);
    expect(s.z).toBeCloseTo(10 - R - H, 2);
    expect(collisions.overlapsCapsule({ ...van().capsule(s.x, s.z, s.heading), r: R - 1e-3 })).toBe(false);
  });

  it('refuses to turn its body into a wall it runs alongside, and slides on', () => {
    const collisions = wallOnRight();
    const m = van();
    let s: MoverState = { x: 3 - R, z: 0, heading: 0, speed: 6 }; // side touching the wall
    for (let t = 0; t < 2; t += DT) {
      s = m.step(s, { input: { forward: 1, right: 1, run: false }, cameraAlpha: 0, dt: DT, collisions });
      expect(collisions.overlapsCapsule({ ...m.capsule(s.x, s.z, s.heading), r: R - 0.025 })).toBe(false);
    }
    expect(Math.abs(s.heading)).toBeLessThan(0.05);
    expect(s.z).toBeGreaterThan(8); // still rolling along the wall
  });

  it('can steer away from a wall it touches (turns about the rear axle)', () => {
    const collisions = wallOnRight();
    const s = drive('van', { forward: 1, right: -1, run: false }, 1, { x: 3 - R, z: 0, heading: 0, speed: 6 }, collisions);
    expect(s.heading).toBeLessThan(-0.3);
    expect(s.x).toBeLessThan(3 - R);
  });

  it('cannot turn while stopped, and a steered crash into a corner never leaves it inside a wall', () => {
    expect(drive('van', { forward: 0, right: 1, run: false }, 1).heading).toBe(0);
    const collisions = new CollisionWorld();
    collisions.addStatic({ shape: { kind: 'box', x0: 6, x1: 7, z0: -20, z1: 9 } });
    collisions.addStatic({ shape: { kind: 'box', x0: -20, x1: 7, z0: 8, z1: 9 } });
    const m = van();
    let s: MoverState = { x: 0, z: 0, heading: 0.6, speed: 0 };
    for (let t = 0; t < 6; t += DT) {
      s = m.step(s, { input: { forward: 1, right: t < 3 ? 1 : -1, run: true }, cameraAlpha: 0, dt: DT, collisions });
      expect(collisions.overlapsCapsule({ ...m.capsule(s.x, s.z, s.heading), r: R - 0.03 })).toBe(false);
    }
    expect(s.x).toBeLessThan(6);
    expect(s.z).toBeLessThan(8);
  });
});
