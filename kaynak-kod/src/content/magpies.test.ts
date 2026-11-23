import { describe, expect, it } from 'vitest';
import { boundaryWalls, type Rect } from '../domain/world/worldData';
import type { Point2 } from '../domain/npc/waypoints';
import { MAGPIES, MAGPIE_CRATE_ID, MAGPIE_DEN, MAGPIE_RULES, MAGPIE_THIEF_SPOT_ID, STORY_MAGPIES } from './magpies';
/** The gang and the story thieves (their routes are followed on foot in chapter 6). */
const ALL_THIEVES = [...MAGPIES, ...Object.values(STORY_MAGPIES)];
import { BELLWICK } from './world';

const CLEARANCE = 0.4;
const STEP = 0.25;

const obstacles: { id: string; rect: Rect }[] = [
  ...BELLWICK.buildings.map((b) => ({ id: b.id, rect: b.rect })),
  ...BELLWICK.solids.map((s) => ({ id: s.id, rect: s.rect })),
  ...BELLWICK.areas.filter((a) => a.surface === 'water').map((a) => ({ id: a.id, rect: a.rect })),
];

const inside = (p: Point2, r: Rect, grow: number): boolean => p.x > r.x0 - grow && p.x < r.x1 + grow && p.z > r.z0 - grow && p.z < r.z1 + grow;

/** Points every STEP metres along ambush → route (corners included). */
function samples(path: readonly Point2[]): Point2[] {
  const out: Point2[] = [];
  for (let i = 0; i + 1 < path.length; i++) {
    const a = path[i]!;
    const b = path[i + 1]!;
    const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / STEP));
    for (let k = 0; k < n; k++) out.push({ x: a.x + ((b.x - a.x) * k) / n, z: a.z + ((b.z - a.z) * k) / n });
  }
  out.push(path[path.length - 1]!);
  return out;
}

describe('the Magpies', () => {
  it('has 3–4 ambush points with unique ids', () => {
    expect(MAGPIES.length).toBeGreaterThanOrEqual(3);
    expect(MAGPIES.length).toBeLessThanOrEqual(4);
    expect(new Set(MAGPIES.map((m) => m.id)).size).toBe(MAGPIES.length);
  });

  it('every flee route keeps clear of buildings, blocks, walls and water', () => {
    const hits: string[] = [];
    for (const m of ALL_THIEVES) {
      for (const p of samples([m.ambush, ...m.route])) {
        const hit = obstacles.find((o) => inside(p, o.rect, CLEARANCE));
        if (hit) hits.push(`${m.id} (${p.x.toFixed(2)}, ${p.z.toFixed(2)}) in ${hit.id}`);
      }
    }
    expect(hits).toEqual([]);
  });

  it('no route crosses a district boundary wall (streets leave through the openings)', () => {
    // Boundary walls run along the outside of the active districts; every route stays well inside them.
    const outer = boundaryWalls(BELLWICK.districts);
    for (const m of ALL_THIEVES) {
      for (const p of samples([m.ambush, ...m.route])) expect(outer.some((r) => inside(p, r, CLEARANCE))).toBe(false);
    }
  });

  it('every route ends inside the den, entering through the west opening', () => {
    for (const m of ALL_THIEVES) {
      const path = [m.ambush, ...m.route];
      const last = path[path.length - 1]!;
      expect(inside(last, MAGPIE_DEN, -0.5)).toBe(true);
      // The first sample inside the pen came in over its west edge, between the two fence pieces.
      const pts = samples(path);
      const i = pts.findIndex((p) => inside(p, MAGPIE_DEN, 0));
      const before = pts[i - 1]!;
      expect(before.x).toBeLessThanOrEqual(MAGPIE_DEN.x0);
      expect(before.z).toBeGreaterThan(-89.5 + CLEARANCE);
      expect(before.z).toBeLessThan(-84.5 - CLEARANCE);
    }
  });

  it('the den is on the map: fence, label, crate and its spot', () => {
    const fence = BELLWICK.solids.filter((s) => s.id.startsWith('ry_fence_den_'));
    expect(fence.length).toBe(5);
    // The pen the routes were drawn for (moving the fence must move the thieves' runs too).
    expect(MAGPIE_DEN).toEqual({ x0: 10, x1: 26, z0: -94.3, z1: -79.7 });
    expect(BELLWICK.labels.some((l) => l.text === "Magpies' Den")).toBe(true);
    const crate = BELLWICK.solids.find((s) => s.id === 'ry_stack_den_crate');
    expect(crate?.kind).toBe('block');
    expect(inside({ x: (crate!.rect.x0 + crate!.rect.x1) / 2, z: (crate!.rect.z0 + crate!.rect.z1) / 2 }, MAGPIE_DEN, -0.5)).toBe(true);
    const spot = BELLWICK.spots.find((s) => s.id === MAGPIE_CRATE_ID);
    expect(spot?.kind).toBe('clue');
    expect(inside(spot!, MAGPIE_DEN, -0.5)).toBe(true);
    expect(inside(spot!, crate!.rect, 0)).toBe(false);
    expect(Math.hypot(spot!.x - (crate!.rect.x0 + crate!.rect.x1) / 2, spot!.z - (crate!.rect.z0 + crate!.rect.z1) / 2)).toBeLessThan(spot!.range);
  });

  it('rules: E on a thief grabs, E on the crate looks inside', () => {
    expect(MAGPIE_RULES).toEqual([
      { on: { interact: MAGPIE_THIEF_SPOT_ID }, do: [{ call: 'magpie.grab' }] },
      { on: { interact: MAGPIE_CRATE_ID }, do: [{ call: 'magpie.crate' }] },
    ]);
  });
});
