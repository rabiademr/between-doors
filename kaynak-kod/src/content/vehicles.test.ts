import { describe, expect, it } from 'vitest';
import { parkedFootprint, type Pose } from '../domain/vehicles/parking';
import { VEHICLES, VEHICLE_KINDS } from '../player/movers/vehicles';
import { VEHICLE_OFFERS, VEHICLE_PARKED_SPOT_ID, VEHICLE_RULES, rackPose } from './vehicles';
import { BELLWICK } from './world';

/** Axis-aligned ground box of a vehicle parked at `pose` (rack headings are multiples of 90°). */
function parkedRect(kind: (typeof VEHICLE_KINDS)[number], pose: Pose): { x0: number; x1: number; z0: number; z1: number } {
  const fp = parkedFootprint(VEHICLES[kind].body);
  const alongX = Math.abs(Math.sin(pose.heading)) > 0.5;
  const hx = alongX ? fp.halfLength : fp.halfWidth;
  const hz = alongX ? fp.halfWidth : fp.halfLength;
  return { x0: pose.x - hx, x1: pose.x + hx, z0: pose.z - hz, z1: pose.z + hz };
}
/** Distance from a point to a box (0 inside). */
function distanceTo(r: { x0: number; x1: number; z0: number; z1: number }, x: number, z: number): number {
  return Math.hypot(Math.max(r.x0 - x, 0, x - r.x1), Math.max(r.z0 - z, 0, z - r.z1));
}
const overlap = (a: { x0: number; x1: number; z0: number; z1: number }, b: { x0: number; x1: number; z0: number; z1: number }): boolean =>
  a.x0 < b.x1 && b.x0 < a.x1 && a.z0 < b.z1 && b.z0 < a.z1;

/** Things the map does not know (built in world/Dressing.ts): kerb lamp posts near the rack. */
const LAMPS = [
  { x: -3.35, z: -6 },
  { x: -3.35, z: -17 },
  { x: -3.35, z: 9 },
];
/** Ground a prop takes up around its point (m): cars are long, street furniture is small. */
const propRadius = (model: string): number => (model.startsWith('car') ? 2.4 : 0.5);

describe('vehicle rack', () => {
  const slots = VEHICLE_KINDS.map((kind) => ({ kind, pose: rackPose(kind), rect: parkedRect(kind, rackPose(kind)) }));

  it('has a slot for every vehicle on sale, and the slots do not overlap', () => {
    expect(VEHICLE_OFFERS.map((v) => v.id).sort()).toEqual([...VEHICLE_KINDS].sort());
    for (const a of slots) for (const b of slots) if (a !== b) expect(overlap(a.rect, b.rect), `${a.kind}/${b.kind}`).toBe(false);
  });

  it('no slot is inside a building, block or wall', () => {
    const rects = [...BELLWICK.buildings.map((b) => b.rect), ...BELLWICK.solids.map((s) => s.rect)];
    for (const s of slots) {
      for (const r of rects) expect(overlap(s.rect, r), s.kind).toBe(false);
    }
  });

  it('no slot stands on a prop, a point of interest or a lamp post', () => {
    for (const s of slots) {
      for (const p of BELLWICK.props) expect(distanceTo(s.rect, p.x, p.z), `${s.kind}/${p.id}`).toBeGreaterThan(propRadius(p.model));
      for (const p of BELLWICK.pois) expect(distanceTo(s.rect, p.x, p.z), `${s.kind}/poi`).toBeGreaterThan(1);
      for (const l of LAMPS) expect(distanceTo(s.rect, l.x, l.z), `${s.kind}/lamp`).toBeGreaterThan(0.5);
    }
  });

  it('every slot centre is at least 1.5 m from every spot, NPC, lamp post and the bin', () => {
    const keepClear = [...BELLWICK.spots, ...BELLWICK.npcs, ...LAMPS, ...BELLWICK.props.filter((p) => p.id === 'binRelay')];
    expect(keepClear.length).toBeGreaterThan(5);
    for (const s of slots) {
      for (const k of keepClear) expect(Math.hypot(k.x - s.pose.x, k.z - s.pose.z), s.kind).toBeGreaterThanOrEqual(1.5);
      // …and the vehicle's body does not cover the place where the player stands to use a spot.
      for (const k of BELLWICK.spots) expect(distanceTo(s.rect, k.x, k.z), s.kind).toBeGreaterThan(0.5);
    }
  });

  it('every two-wheeler can be walked up to from the road: room for the rider in front of its nose', () => {
    const RIDER_WIDTH = 0.7;
    for (const s of slots.filter((x) => VEHICLES[x.kind].body.halfLength === 0)) {
      // The courier stands just off the nose (east, towards the road), level with the slot.
      const front = { x0: s.rect.x1, x1: s.rect.x1 + RIDER_WIDTH + 0.1, z0: s.pose.z - 0.35, z1: s.pose.z + 0.35 };
      for (const o of slots) if (o !== s) expect(overlap(front, o.rect), `${s.kind} blocked by ${o.kind}`).toBe(false);
    }
  });

  it('slots are on the pavement or the road of Indigo Row, not on the far lane', () => {
    for (const s of slots) {
      expect(s.rect.x0).toBeGreaterThanOrEqual(-5);
      expect(s.rect.x1).toBeLessThanOrEqual(0);
    }
  });

  it('E on the shared parked-vehicle spot gets on', () => {
    expect(VEHICLE_RULES).toEqual([{ on: { interact: VEHICLE_PARKED_SPOT_ID }, do: [{ call: 'vehicle.mount' }] }]);
  });
});
