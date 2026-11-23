// Pure layout helpers (no Babylon) for the four outer districts: which features belong to them, how a
// `building` rectangle becomes a terrace of city-kit models, where the terraces around the core block the way,
// and small geometry helpers the dressing and the tests share.
//
// Conventions of the outer districts' map data (content/world/<district>.geo.json):
// - every `building` is a terrace: models stand side by side along its facade edge, stretched to cover it exactly;
// - id tokens (parts between underscores) tell the dressing what a plain block, wall or area is:
//   block  hall (+ last token n|s|e|w = the side with the doors), chimney, wagon, boat, stack, bed, cross,
//          bandstand, kiosk, obelisk, watertower, platform
//   wall   gatepost (pairs `<name>_a` / `<name>_b` carry an arch), low walls (≤ 1.5 m) get a coping
//   area   track (sleepers and rails along its long side)
//   poi    bench ids ending in _n / _s (the way the sitter looks), cafe (table, stools and a parasol)
import type { Building, District, Facing, Rect, WorldData } from '../domain/world/worldData';
import { BUILDING_DEPTH, BUILDINGS, CITY_SCALE, type BuildingModel } from './cityKit';
import { cityRows, coreOpenings, type Bounds } from './townLayout';

export const OUTER_DISTRICTS = ['market-hill', 'canal-side', 'railway-yard', 'hillside-park'] as const;
export type OuterDistrictId = (typeof OUTER_DISTRICTS)[number];

const centre = (r: Rect): { x: number; z: number } => ({ x: (r.x0 + r.x1) / 2, z: (r.z0 + r.z1) / 2 });
const within = (r: Rect, x: number, z: number): boolean => x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1;

/** The outer district containing (x, z), if any (points on a shared edge go to the first match). */
export function outerDistrictAt(districts: readonly District[], x: number, z: number): District | undefined {
  return districts.find((d) => (OUTER_DISTRICTS as readonly string[]).includes(d.id) && within(d.rect, x, z));
}

/** True for buildings of the outer districts: they are skinned with terrace models, not hand-dressed facades. */
export function isTerrace(data: Pick<WorldData, 'districts'>, b: { rect: Rect }): boolean {
  const c = centre(b.rect);
  return outerDistrictAt(data.districts, c.x, c.z) !== undefined;
}

/** True when `token` is one of the underscore-separated parts of `id`. */
export function hasToken(id: string, token: string): boolean {
  return id.split('_').includes(token);
}

/** The side a hall's doors are on: the last id token (n, s, e or w), default south. */
export function hallFront(id: string): Facing {
  const last = id.slice(id.lastIndexOf('_') + 1);
  return ({ n: 'north', s: 'south', e: 'east', w: 'west' } as const)[last as 'n' | 's' | 'e' | 'w'] ?? 'south';
}

/** Small deterministic hash of an id (stable variety: tree sizes, model order, colours). */
export function hashId(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// ---------------------------------------------------------------- terraces

export interface TerraceUnit {
  model: BuildingModel;
  /** Centre of the building body (metres). */
  x: number;
  z: number;
  /** Yaw: the model's front (+Z) looks the way the building faces. */
  rotY: number;
  /** Stretch on top of CITY_SCALE: along the row (model X) and front-to-back (model Z). */
  stretchAlong: number;
  stretchDepth: number;
}

const FACE_YAW: Record<Facing, number> = { north: 0, east: Math.PI / 2, south: Math.PI, west: -Math.PI / 2 };
const MODEL_ORDER = Object.keys(BUILDINGS) as BuildingModel[];
const WIDTHS = Object.fromEntries(MODEL_ORDER.map((k) => [k, BUILDINGS[k].w * CITY_SCALE])) as Record<BuildingModel, number>;
/** Two rhythms; each terrace starts somewhere else in one of them (by its id). */
const RHYTHMS: BuildingModel[][] = [
  ['building-d', 'building-a', 'building-g', 'building-c', 'building-b', 'building-h', 'building-a', 'building-f', 'building-e'],
  ['building-b', 'building-e', 'building-c', 'building-a', 'building-h', 'building-d', 'building-f', 'building-a', 'building-g'],
];

/** The kit's building widths (metres), widest first. */
const WIDTH_CLASSES = [...new Set(MODEL_ORDER.map((m) => WIDTHS[m]))].sort((p, q) => q - p);

/** How many buildings of each width class come closest to `length` (ties: the more varied mix). */
function bestMix(length: number): number[] {
  let best: number[] = WIDTH_CLASSES.map(() => 0);
  let bestError = Infinity;
  const walk = (i: number, counts: number[], sum: number): void => {
    if (i === WIDTH_CLASSES.length) {
      if (sum <= 0) return;
      const error = Math.abs(sum - length) - counts.filter((n) => n > 0).length * 1e-3;
      if (error < bestError) {
        bestError = error;
        best = [...counts];
      }
      return;
    }
    const w = WIDTH_CLASSES[i]!;
    for (let n = 0; sum + n * w <= length * 1.1 + 1e-9; n++) walk(i + 1, [...counts, n], sum + n * w);
  };
  walk(0, [], 0);
  return best;
}

/**
 * City-kit models covering a building's footprint exactly: side by side along the facade edge, in the mix of
 * widths that comes closest to its length, then stretched a little so no part of the (collidable) block is
 * left bare.
 */
export function terraceUnits(b: Pick<Building, 'id' | 'rect' | 'facing'>): TerraceUnit[] {
  const { x0, x1, z0, z1 } = b.rect;
  const alongX = b.facing === 'north' || b.facing === 'south';
  const length = alongX ? x1 - x0 : z1 - z0;
  const depth = alongX ? z1 - z0 : x1 - x0;
  const h = hashId(b.id);
  const rhythm = RHYTHMS[h % RHYTHMS.length]!;
  const left = bestMix(length);
  const total = left.reduce((s, n) => s + n, 0);
  const row: BuildingModel[] = [];
  // Walk the rhythm from an id-dependent start, taking each model whose width is still wanted.
  for (let i = (h >>> 3) % rhythm.length, guard = 0; row.length < total && guard < 1000; i++, guard++) {
    const model = rhythm[i % rhythm.length]!;
    const cls = WIDTH_CLASSES.indexOf(WIDTHS[model]);
    if (left[cls]! > 0) {
      left[cls]!--;
      row.push(model);
    }
  }
  const used = row.reduce((s, m) => s + WIDTHS[m], 0);
  if (used <= 0) return [];
  const stretchAlong = length / used;
  const stretchDepth = depth / (BUILDING_DEPTH * CITY_SCALE);
  const c = centre(b.rect);
  let cursor = 0;
  return row.map((model) => {
    const width = WIDTHS[model] * stretchAlong;
    const at = cursor + width / 2;
    cursor += width;
    return { model, x: alongX ? x0 + at : c.x, z: alongX ? c.z : z0 + at, rotY: FACE_YAW[b.facing], stretchAlong, stretchDepth };
  });
}

/** The terraces around the core are visual only; their colliders are these footprints, grown a little so
 * nobody squeezes between a terrace and the core's wall. */
export const TERRACE_PAD = 0.5;
export function coreTerraceColliders(core: Bounds, walls: readonly Rect[]): Rect[] {
  return cityRows(core, coreOpenings(core, walls)).map((r) => ({
    x0: r.rect.x0 - TERRACE_PAD,
    x1: r.rect.x1 + TERRACE_PAD,
    z0: r.rect.z0 - TERRACE_PAD,
    z1: r.rect.z1 + TERRACE_PAD,
  }));
}

// ---------------------------------------------------------------- geometry

/** Parts of [a, b] not covered by any of the intervals. */
export function uncovered(a: number, b: number, covers: readonly (readonly [number, number])[]): [number, number][] {
  const out: [number, number][] = [];
  let cursor = a;
  for (const [c0, c1] of [...covers].sort((p, q) => p[0] - q[0])) {
    if (c1 <= cursor) continue;
    if (c0 >= b) break;
    if (c0 > cursor) out.push([cursor, c0]);
    cursor = Math.max(cursor, c1);
  }
  if (cursor < b) out.push([cursor, b]);
  return out.filter(([p, q]) => q - p > 0.05);
}

export interface Edge {
  /** 'x' = the edge runs along X at z = `at`; 'z' = along Z at x = `at`. */
  axis: 'x' | 'z';
  at: number;
  from: number;
  to: number;
  /** +1 / −1: which way is out of the rectangle. */
  out: 1 | -1;
}

/** The stretches of a rectangle's outline that none of `others` touches from outside (a quay edge; not a
 * bridge or more water). */
export function freeEdges(r: Rect, others: readonly Rect[]): Edge[] {
  const near = (p: number, q: number): boolean => Math.abs(p - q) < 0.05;
  const out: Edge[] = [];
  const side = (axis: 'x' | 'z', at: number, dir: 1 | -1): void => {
    const [a, b] = axis === 'x' ? [r.x0, r.x1] : [r.z0, r.z1];
    const covers = others
      .filter((o) => (axis === 'x' ? near(dir > 0 ? o.z0 : o.z1, at) : near(dir > 0 ? o.x0 : o.x1, at)))
      .map((o) => (axis === 'x' ? ([o.x0, o.x1] as const) : ([o.z0, o.z1] as const)));
    for (const [from, to] of uncovered(a, b, covers)) out.push({ axis, at, from, to, out: dir });
  };
  side('x', r.z1, 1);
  side('x', r.z0, -1);
  side('z', r.x1, 1);
  side('z', r.x0, -1);
  return out;
}
