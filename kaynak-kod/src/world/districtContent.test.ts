import { describe, expect, it } from 'vitest';
import { BELLWICK, coreRect } from '../content/world';
import { districtAt, type Rect, type WorldData } from '../domain/world/worldData';
import { CITY_SCALE, PROP_KIT } from './cityKit';
import { coreTerraceColliders, freeEdges, hasToken, isTerrace, OUTER_DISTRICTS, outerDistrictAt, terraceUnits, uncovered } from './districtLayout';
import { cityRows, coreOpenings, townPlacements } from './townLayout';

const W: WorldData = BELLWICK;
const c = coreRect(W);
const CORE = { minX: c.x0, maxX: c.x1, minZ: c.z0, maxZ: c.z1 };
const WALLS = W.solids.filter((s) => s.kind === 'wall').map((s) => s.rect);
const OPENINGS = coreOpenings(CORE, WALLS);
/** The terraces around the core, as generated (visual footprints). */
const TERRACES: Rect[] = cityRows(CORE, OPENINGS).map((r) => r.rect);
/** Kenney suburban houses west of the core and around Postmark Mews (≈ 7 × 7 m each). */
const HOUSE = 3.5;
const HOUSES: Rect[] = townPlacements(CORE, W.bounds)
  .filter((p) => p.model.startsWith('sub-'))
  .map((p) => ({ x0: p.x - HOUSE, x1: p.x + HOUSE, z0: p.z - HOUSE, z1: p.z + HOUSE }));
const APRON = 2;

const overlap = (a: Rect, b: Rect, eps = 1e-6): boolean => a.x0 < b.x1 - eps && b.x0 < a.x1 - eps && a.z0 < b.z1 - eps && b.z0 < a.z1 - eps;
const grow = (r: Rect, m: number): Rect => ({ x0: r.x0 - m, x1: r.x1 + m, z0: r.z0 - m, z1: r.z1 + m });
const square = (x: number, z: number, half: number): Rect => ({ x0: x - half, x1: x + half, z0: z - half, z1: z + half });
const inRect = (r: Rect, x: number, z: number): boolean => x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1;
const mid = (r: Rect): { x: number; z: number } => ({ x: (r.x0 + r.x1) / 2, z: (r.z0 + r.z1) / 2 });
const outer = (x: number, z: number): string | undefined => outerDistrictAt(W.districts, x, z)?.id;
const outerRect = (r: Rect): string | undefined => outer(mid(r).x, mid(r).z);

/** Bounding box of a prop's collider (its footprint turned by its yaw). */
function propRect(p: (typeof W.props)[number]): Rect | null {
  const kit = PROP_KIT[p.model];
  if (!kit.collider) return null;
  const yaw = (p.rotate * Math.PI) / 180;
  const w = kit.w * CITY_SCALE;
  const d = kit.d * CITY_SCALE;
  const hx = (Math.abs(Math.cos(yaw)) * w + Math.abs(Math.sin(yaw)) * d) / 2;
  const hz = (Math.abs(Math.sin(yaw)) * w + Math.abs(Math.cos(yaw)) * d) / 2;
  return { x0: p.x - hx, x1: p.x + hx, z0: p.z - hz, z1: p.z + hz };
}
function poiRect(p: (typeof W.pois)[number]): Rect {
  switch (p.kind) {
    case 'stall': return { x0: p.x - 1.3, x1: p.x + 1.3, z0: p.z - 0.55, z1: p.z + 0.55 };
    case 'bench': return { x0: p.x - 0.9, x1: p.x + 0.9, z0: p.z - 0.3, z1: p.z + 0.3 };
    case 'tree': return square(p.x, p.z, 0.18);
    case 'lamp': return square(p.x, p.z, 0.09);
    case 'chilli_pot': return square(p.x, p.z, 0.28);
    case 'fountain': return square(p.x, p.z, p.radius ?? 2.5);
  }
}

interface Named {
  what: string;
  rect: Rect;
  wall?: boolean;
}
/** Everything authored in the map data that stops the player. */
function authoredSolids(): Named[] {
  const out: Named[] = [];
  for (const b of W.buildings) out.push({ what: `building ${b.id}`, rect: b.rect });
  for (const s of W.solids) if (!s.id.startsWith('boundary_')) out.push({ what: `${s.kind} ${s.id}`, rect: s.rect, wall: s.kind === 'wall' });
  for (const a of W.areas) if (a.surface === 'water') out.push({ what: `water ${a.id}`, rect: a.rect });
  for (const p of W.props) {
    const r = propRect(p);
    if (r) out.push({ what: `prop ${p.id}`, rect: r });
  }
  for (const p of W.pois) out.push({ what: `${p.kind} ${p.id}`, rect: poiRect(p) });
  return out;
}
const SOLIDS = authoredSolids();
const OUTER_SOLIDS = SOLIDS.filter((s) => outerRect(s.rect));

// ---------------------------------------------------------------- walkability raster

const CELL = 0.5;
const MARGIN = 0.5; // the player's radius (0.35) and then some
class Raster {
  readonly nx: number;
  readonly nz: number;
  readonly blocked: Uint8Array;
  constructor(extra: readonly Rect[] = []) {
    const b = W.bounds;
    this.nx = Math.round((b.maxX - b.minX) / CELL);
    this.nz = Math.round((b.maxZ - b.minZ) / CELL);
    this.blocked = new Uint8Array(this.nx * this.nz);
    const all: Rect[] = [
      ...SOLIDS.map((s) => s.rect),
      ...W.solids.filter((s) => s.id.startsWith('boundary_')).map((s) => s.rect),
      ...W.npcs.map((n) => square(n.x, n.z, 0.35)),
      ...coreTerraceColliders(CORE, WALLS),
      ...HOUSES,
      ...extra,
    ];
    for (const r of all) this.block(grow(r, MARGIN));
  }
  private ix(x: number): number {
    return Math.floor((x - W.bounds.minX) / CELL);
  }
  private iz(z: number): number {
    return Math.floor((z - W.bounds.minZ) / CELL);
  }
  /** Blocks every cell whose centre lies inside the rectangle. */
  private block(r: Rect): void {
    const i0 = Math.max(0, Math.ceil((r.x0 - W.bounds.minX) / CELL - 0.5));
    const i1 = Math.min(this.nx - 1, Math.floor((r.x1 - W.bounds.minX) / CELL - 0.5));
    const k0 = Math.max(0, Math.ceil((r.z0 - W.bounds.minZ) / CELL - 0.5));
    const k1 = Math.min(this.nz - 1, Math.floor((r.z1 - W.bounds.minZ) / CELL - 0.5));
    for (let k = k0; k <= k1; k++) for (let i = i0; i <= i1; i++) this.blocked[k * this.nx + i] = 1;
  }
  /** Cells reachable on foot from the spawn (4-neighbour flood fill). */
  flood(): Uint8Array {
    const seen = new Uint8Array(this.nx * this.nz);
    const start = this.iz(W.spawn.z) * this.nx + this.ix(W.spawn.x);
    if (this.blocked[start]) throw new Error('spawn is blocked');
    const stack = [start];
    seen[start] = 1;
    while (stack.length) {
      const at = stack.pop()!;
      const i = at % this.nx;
      const k = (at - i) / this.nx;
      const tryCell = (ii: number, kk: number): void => {
        if (ii < 0 || kk < 0 || ii >= this.nx || kk >= this.nz) return;
        const n = kk * this.nx + ii;
        if (seen[n] || this.blocked[n]) return;
        seen[n] = 1;
        stack.push(n);
      };
      tryCell(i + 1, k);
      tryCell(i - 1, k);
      tryCell(i, k + 1);
      tryCell(i, k - 1);
    }
    return seen;
  }
  /** True when some reached cell centre lies within `radius` of (x, z). */
  reaches(seen: Uint8Array, x: number, z: number, radius: number): boolean {
    const n = Math.ceil(radius / CELL);
    const ci = this.ix(x);
    const ck = this.iz(z);
    for (let k = ck - n; k <= ck + n; k++) {
      for (let i = ci - n; i <= ci + n; i++) {
        if (i < 0 || k < 0 || i >= this.nx || k >= this.nz || !seen[k * this.nx + i]) continue;
        const cx = W.bounds.minX + (i + 0.5) * CELL;
        const cz = W.bounds.minZ + (k + 0.5) * CELL;
        if (Math.hypot(cx - x, cz - z) <= radius) return true;
      }
    }
    return false;
  }
  cells(seen: Uint8Array): { x: number; z: number }[] {
    const out: { x: number; z: number }[] = [];
    for (let k = 0; k < this.nz; k++) {
      for (let i = 0; i < this.nx; i++) {
        if (seen[k * this.nx + i]) out.push({ x: W.bounds.minX + (i + 0.5) * CELL, z: W.bounds.minZ + (k + 0.5) * CELL });
      }
    }
    return out;
  }
}

/** Places the player must be able to walk to: each district's name label, the vendor, both canal banks. */
function anchors(): { what: string; x: number; z: number; radius: number }[] {
  const out: { what: string; x: number; z: number; radius: number }[] = [];
  for (const d of W.districts) {
    if (!(OUTER_DISTRICTS as readonly string[]).includes(d.id)) continue;
    const label = W.labels.find((l) => l.text === d.name && l.style === 'normal');
    expect(label, `label "${d.name}"`).toBeDefined();
    out.push({ what: d.name, x: label!.x, z: label!.z, radius: 1 });
  }
  const vendor = W.spots.find((s) => s.id === 'npc_vendor')!;
  out.push({ what: 'vendor spot', x: vendor.x, z: vendor.z, radius: vendor.range - 0.4 });
  const canal = W.areas.filter((a) => a.surface === 'water' && hasToken(a.id, 'canal'));
  expect(canal.length).toBeGreaterThanOrEqual(3);
  for (const w of canal) {
    out.push({ what: `west bank of ${w.id}`, x: w.rect.x0 - 3, z: mid(w.rect).z, radius: 1.5 });
    out.push({ what: `east bank of ${w.id}`, x: w.rect.x1 + 3, z: mid(w.rect).z, radius: 1.5 });
  }
  return out;
}

/** The three street openings in the core's walls, as short corridors leading out. */
function openingCorridors(depth: number): { what: string; rect: Rect }[] {
  return [
    ...OPENINGS.north.map(([a, b]) => ({ what: 'north opening', rect: { x0: a, x1: b, z0: CORE.maxZ, z1: CORE.maxZ + depth } })),
    ...OPENINGS.south.map(([a, b]) => ({ what: 'south opening', rect: { x0: a, x1: b, z0: CORE.minZ - depth, z1: CORE.minZ } })),
    ...OPENINGS.east.map(([a, b]) => ({ what: 'east opening', rect: { x0: CORE.maxX, x1: CORE.maxX + depth, z0: a, z1: b } })),
  ];
}

// ---------------------------------------------------------------- tests

describe('outer districts: content', () => {
  const count = (id: string): Record<string, number> => {
    const d = W.districts.find((x) => x.id === id)!;
    const n: Record<string, number> = {};
    const add = (k: string, x: number, z: number): void => {
      if (districtAt(W.districts, x, z) === d || outer(x, z) === id) n[k] = (n[k] ?? 0) + 1;
    };
    for (const a of W.areas) add(a.surface, mid(a.rect).x, mid(a.rect).z);
    for (const b of W.buildings) add('building', mid(b.rect).x, mid(b.rect).z);
    for (const s of W.solids) if (!s.id.startsWith('boundary_')) add(s.kind, mid(s.rect).x, mid(s.rect).z);
    for (const p of W.pois) add(p.kind, p.x, p.z);
    for (const p of W.props) add(p.model, p.x, p.z);
    for (const p of W.props) add('prop', p.x, p.z);
    for (const l of W.labels) add('label', l.x, l.z);
    return n;
  };
  const atLeast = (id: string, wanted: Record<string, number>): void => {
    const n = count(id);
    for (const [k, min] of Object.entries(wanted)) expect(n[k] ?? 0, `${id}: ${k}`).toBeGreaterThanOrEqual(min);
  };

  it('Market Hill is a market: stalls, shop terraces, trees, the vendor', () => {
    atLeast('market-hill', { stall: 24, building: 10, tree: 20, bench: 6, lamp: 12, road: 1, paving: 4, label: 3 });
    const vendor = W.spots.find((s) => s.id === 'npc_vendor');
    expect(vendor?.kind).toBe('vendor');
    expect(outer(vendor!.x, vendor!.z)).toBe('market-hill');
    const npc = W.npcs.find((n) => n.id === 'npc_vendor')!;
    expect(outer(npc.x, npc.z)).toBe('market-hill');
    // The vendor stands behind (south of) a stall and looks north over the counter at the customer's spot.
    const stall = W.pois.find((p) => p.kind === 'stall' && Math.abs(p.x - npc.x) < 0.5 && p.z > npc.z && p.z - npc.z < 1.6);
    expect(stall, 'stall in front of the vendor').toBeDefined();
    expect(npc.heading).toBe(0);
    expect(vendor!.z).toBeGreaterThan(stall!.z + 0.55 + 0.35);
    expect(Math.hypot(vendor!.x - stall!.x, vendor!.z - stall!.z)).toBeLessThan(vendor!.range);
  });
  it('Canal Side has a canal with bridges, quays and terraces', () => {
    atLeast('canal-side', { water: 4, bridge: 3, building: 6, tree: 20, lamp: 20, bench: 4, paving: 6, label: 3 });
  });
  it('Railway Yard is industrial: depots, wagons, tracks, crates, the water tower', () => {
    atLeast('railway-yard', { block: 10, 'box-a': 12, dumpster: 6, 'car-stationwagon': 3, gravel: 3, lamp: 8, label: 2 });
    const ids = W.solids.map((s) => s.id).filter((id) => id.startsWith('ry_'));
    expect(ids.filter((id) => hasToken(id, 'hall')).length).toBeGreaterThanOrEqual(4);
    expect(ids.filter((id) => hasToken(id, 'wagon')).length).toBeGreaterThanOrEqual(2);
    expect(ids.filter((id) => hasToken(id, 'watertower')).length).toBe(1);
    expect(W.areas.filter((a) => hasToken(a.id, 'track')).length).toBeGreaterThanOrEqual(2);
  });
  it('Hillside Park is green: grass, paths, a pond with a causeway, many trees', () => {
    atLeast('hillside-park', { grass: 3, water: 2, bridge: 1, paving: 12, tree: 120, bench: 10, bush: 10, lamp: 10, label: 2 });
    expect(W.solids.some((s) => hasToken(s.id, 'bandstand'))).toBe(true);
  });
  it('every bridge has water on two opposite sides', () => {
    const water = W.areas.filter((a) => a.surface === 'water').map((a) => a.rect);
    for (const b of W.areas.filter((a) => a.surface === 'bridge')) {
      const free = freeEdges(b.rect, water);
      const wet = (axis: 'x' | 'z', out: 1 | -1): boolean => {
        const full = axis === 'x' ? b.rect.x1 - b.rect.x0 : b.rect.z1 - b.rect.z0;
        const dry = free.filter((e) => e.axis === axis && e.out === out).reduce((s, e) => s + e.to - e.from, 0);
        return dry < full * 0.5;
      };
      expect((wet('x', 1) && wet('x', -1)) || (wet('z', 1) && wet('z', -1)), b.id).toBe(true);
    }
  });
  it('keeps the model budget (terrace units, props, café parasols, the water tower)', () => {
    const terraces = W.buildings.filter((b) => isTerrace(W, b));
    let models = 0;
    const stretched: string[] = [];
    for (const b of terraces) {
      const units = terraceUnits(b);
      expect(units.length, b.id).toBeGreaterThan(0);
      for (const u of units) {
        if (Math.abs(u.stretchAlong - 1) > 0.06) stretched.push(`${b.id} along x${u.stretchAlong.toFixed(3)}`);
        if (u.stretchDepth < 0.98 || u.stretchDepth > 1.12) stretched.push(`${b.id} depth x${u.stretchDepth.toFixed(3)}`);
        expect(inRect(grow(b.rect, 0.01), u.x, u.z), b.id).toBe(true);
      }
      models += units.length;
    }
    models += W.props.filter((p) => outer(p.x, p.z)).length;
    models += W.pois.filter((p) => outer(p.x, p.z) && hasToken(p.id, 'cafe')).length;
    models += 1;
    expect([...new Set(stretched)]).toEqual([]);
    expect(models, 'model instances').toBeLessThanOrEqual(250);
    // Hand-dressed facades (windows, roofs) stay in the core and Postmark Mews.
    expect(W.buildings.filter((b) => !isTerrace(W, b)).map((b) => b.id)).toContain('relay');
    expect(isTerrace(W, W.buildings.find((b) => b.id === 'arthurHouse')!)).toBe(false);
  });
});

describe('outer districts: nothing in the way', () => {
  it('authored solids keep clear of the core terraces and the suburban houses', () => {
    expect(TERRACES.length).toBeGreaterThan(10);
    expect(HOUSES.length).toBe(7);
    const problems: string[] = [];
    for (const s of OUTER_SOLIDS) {
      // Walls may run up to a terrace (they close the alleys behind them); everything else keeps an apron.
      if (TERRACES.some((t) => overlap(s.rect, s.wall ? t : grow(t, APRON)))) problems.push(`${s.what} at a core terrace`);
      if (HOUSES.some((h) => overlap(s.rect, s.wall ? h : grow(h, APRON)))) problems.push(`${s.what} at a suburban house`);
    }
    expect(problems).toEqual([]);
  });
  it('streets continue from the three openings in the core walls', () => {
    const corridors = openingCorridors(12);
    expect(corridors.length).toBe(3);
    for (const corridor of corridors) {
      expect(SOLIDS.filter((s) => overlap(s.rect, corridor.rect)).map((s) => `${s.what} in the ${corridor.what}`)).toEqual([]);
      const road = W.areas.find((a) => a.surface === 'road' && outerRect(a.rect) && overlap(a.rect, corridor.rect));
      expect(road, `road through the ${corridor.what}`).toBeDefined();
    }
  });
  it('points stand on open ground (not inside a building, a block or the water)', () => {
    const hard = [...W.buildings.map((b) => ({ id: b.id, rect: b.rect })), ...W.solids.map((s) => ({ id: s.id, rect: s.rect })), ...W.areas.filter((a) => a.surface === 'water').map((a) => ({ id: a.id, rect: a.rect }))];
    const roads = W.areas.filter((a) => a.surface === 'road');
    const problems: string[] = [];
    const check = (what: string, r: Rect, onRoadOk: boolean): void => {
      if (!outerRect(r)) return;
      for (const h of hard) if (overlap(r, h.rect)) problems.push(`${what} in ${h.id}`);
      if (!onRoadOk) for (const road of roads) if (overlap(r, road.rect)) problems.push(`${what} on ${road.id}`);
    };
    for (const p of W.pois) check(`${p.kind} ${p.id}`, poiRect(p), false);
    for (const p of W.props) {
      const r = propRect(p) ?? square(p.x, p.z, 0.2);
      check(`prop ${p.id}`, r, p.model.startsWith('car'));
    }
    for (const s of W.spots) check(`spot ${s.id}`, square(s.x, s.z, 0.3), true);
    for (const n of W.npcs) check(`npc ${n.id}`, square(n.x, n.z, 0.35), false);
    // Props and pois do not stand in each other.
    const things = [...W.pois.map((p) => ({ id: p.id, rect: poiRect(p) })), ...W.props.flatMap((p) => (propRect(p) ? [{ id: p.id, rect: propRect(p)! }] : []))].filter((t) => outerRect(t.rect));
    for (let i = 0; i < things.length; i++) {
      for (let j = i + 1; j < things.length; j++) {
        const a = things[i]!;
        const b = things[j]!;
        // Crates in a pile may touch; nothing else overlaps.
        if (a.id.includes('_box') && b.id.includes('_box')) continue;
        if (overlap(a.rect, b.rect)) problems.push(`${a.id} and ${b.id}`);
      }
    }
    expect(problems).toEqual([]);
  });
});

describe('outer districts: reachability on foot', () => {
  const wanted = anchors();
  const reachAll = (raster: Raster, why: string): Uint8Array => {
    const seen = raster.flood();
    for (const a of wanted) expect(raster.reaches(seen, a.x, a.z, a.radius), `${a.what} (${a.x}, ${a.z}) ${why}`).toBe(true);
    return seen;
  };

  it('reaches every district, the vendor and both canal banks from the spawn', () => {
    const raster = new Raster();
    const seen = reachAll(raster, 'with everything open');
    // Postmark Mews is not a short cut: only its lane (behind the story gate) can be reached.
    const lane = grow(W.areas.find((a) => a.id === 'mewsPaving')!.rect, 0.01);
    const mews = W.districts.find((d) => d.id === 'postmark-mews')!;
    for (const cell of raster.cells(seen)) {
      if (inRect(mews.rect, cell.x, cell.z)) expect(inRect(lane, cell.x, cell.z), `reached (${cell.x}, ${cell.z}) in Postmark Mews`).toBe(true);
    }
    // The terraces and houses around the core are not walked through.
    for (const r of [...TERRACES, ...HOUSES]) expect(raster.reaches(seen, mid(r).x, mid(r).z, 0.6)).toBe(false);
  });
  it('does not depend on the story gates (Crossing Yard alley, Postmark Mews)', () => {
    const alley = W.areas.find((a) => a.id === 'alley')!.rect;
    const mews = W.areas.find((a) => a.id === 'mewsPaving')!.rect;
    reachAll(new Raster([alley, mews]), 'with the story gates shut');
  });
  it('forms a loop around the core: with any one opening blocked everything is still reachable', () => {
    for (const corridor of openingCorridors(1)) reachAll(new Raster([grow(corridor.rect, 0.6)]), `with the ${corridor.what} blocked`);
  });
});

describe('district layout helpers', () => {
  it('uncovered() returns what the intervals leave free', () => {
    expect(uncovered(0, 10, [[2, 4], [3, 6]])).toEqual([[0, 2], [6, 10]]);
    expect(uncovered(0, 10, [[-5, 20]])).toEqual([]);
    expect(uncovered(0, 10, [])).toEqual([[0, 10]]);
  });
  it('freeEdges() drops the stretches another rectangle touches', () => {
    const r = { x0: 0, x1: 10, z0: 0, z1: 4 };
    const edges = freeEdges(r, [{ x0: 2, x1: 6, z0: 4, z1: 8 }]);
    expect(edges.filter((e) => e.axis === 'x' && e.out === 1)).toEqual([
      { axis: 'x', at: 4, from: 0, to: 2, out: 1 },
      { axis: 'x', at: 4, from: 6, to: 10, out: 1 },
    ]);
    expect(edges.filter((e) => e.axis === 'z').length).toBe(2);
  });
  it('terraceUnits() covers the footprint side by side, fronts on the facade edge', () => {
    const units = terraceUnits({ id: 'x_row_test', rect: { x0: 0, x1: 23.4, z0: 10, z1: 16 }, facing: 'north' });
    expect(units.length).toBeGreaterThanOrEqual(3);
    for (const u of units) {
      expect(u.z).toBe(13);
      expect(u.rotY).toBe(0);
    }
    const xs = units.map((u) => u.x).sort((a, b) => a - b);
    expect(xs[0]).toBeGreaterThan(0);
    expect(xs[xs.length - 1]).toBeLessThan(23.4);
    expect(terraceUnits({ id: 'x_row_w', rect: { x0: 0, x1: 6, z0: 0, z1: 21.6 }, facing: 'west' })[0]!.rotY).toBe(-Math.PI / 2);
  });
});
