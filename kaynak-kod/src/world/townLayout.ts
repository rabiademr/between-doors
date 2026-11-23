// Pure layout helpers (no Babylon): terraced rows of buildings along a street edge.
import { BUILDING_DEPTH, BUILDING_OVERHANG, BUILDINGS, CITY_SCALE, type BuildingModel } from './cityKit';

export interface RowItem<M extends string> {
  model: M;
  /** Centre of the building, measured from the start of the row (metres). */
  at: number;
  width: number;
}

/**
 * Fill a row of `length` metres with buildings, side by side. Models are taken from `order` in turn
 * (repeating); when the next one does not fit, a narrower one is tried. What is left over is spread as
 * equal gaps, so the row starts and ends flush with its ends.
 * @param widths metres per model
 */
export function packRow<M extends string>(length: number, order: readonly M[], widths: Readonly<Record<M, number>>): RowItem<M>[] {
  if (order.length === 0 || length <= 0) return [];
  const picked: M[] = [];
  let used = 0;
  for (let i = 0; ; i++) {
    const preferred = order[i % order.length]!;
    const candidates = [preferred, ...[...order].sort((a, b) => widths[b] - widths[a])];
    const fit = candidates.find((m) => used + widths[m] <= length + 1e-9);
    if (fit === undefined) break;
    picked.push(fit);
    used += widths[fit];
    if (picked.length > 1000) break; // guard against zero widths
  }
  if (picked.length === 0) return [];
  const gap = picked.length > 1 ? (length - used) / (picked.length - 1) : 0;
  const out: RowItem<M>[] = [];
  let cursor = picked.length === 1 ? (length - used) / 2 : 0;
  for (const model of picked) {
    const width = widths[model];
    out.push({ model, at: cursor + width / 2, width });
    cursor += width + gap;
  }
  return out;
}

export interface Bounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface CityBuilding {
  model: BuildingModel;
  /** Origin = centre of the building body (metres); the front overhang lies towards the play area. */
  x: number;
  z: number;
  /** Yaw: the front faces the play area. */
  rotY: number;
  /** Whole footprint including the front overhang (metres), for checks. */
  rect: { x0: number; x1: number; z0: number; z1: number };
}

/** Building fronts stand this far outside the play area (the boundary walls are 0.5 m thick). */
const FRONT_GAP = 1;
const FACE_SOUTH = Math.PI;
const FACE_NORTH = 0;
const FACE_WEST = -Math.PI / 2;
/** A different rhythm per row so the terraces do not repeat. */
const ROW_ORDERS: Record<'north' | 'south' | 'east', BuildingModel[]> = {
  north: ['building-e', 'building-a', 'building-d', 'building-h', 'building-b', 'building-g', 'building-c', 'building-f'],
  south: ['building-b', 'building-g', 'building-c', 'building-h', 'building-a', 'building-f', 'building-d', 'building-e'],
  east: ['building-f', 'building-c', 'building-h', 'building-b', 'building-e', 'building-a', 'building-g', 'building-d'],
};

/** Gaps in the core's walls (where streets lead on into the next district), as intervals along each edge. */
export interface CoreOpenings {
  north: [number, number][];
  south: [number, number][];
  east: [number, number][];
}

/** Walls touching the outside of the core's north/south/east edges → the stretches of each edge they leave open. */
export function coreOpenings(b: Bounds, walls: readonly { x0: number; x1: number; z0: number; z1: number }[]): CoreOpenings {
  const near = (a: number, c: number): boolean => Math.abs(a - c) < 0.05;
  const covered = (pick: (w: (typeof walls)[number]) => [number, number] | null): [number, number][] =>
    walls.map(pick).filter((v): v is [number, number] => v !== null);
  return {
    north: gaps([b.minX, b.maxX], covered((w) => (near(w.z0, b.maxZ) ? [w.x0, w.x1] : null))),
    south: gaps([b.minX, b.maxX], covered((w) => (near(w.z1, b.minZ) ? [w.x0, w.x1] : null))),
    east: gaps([b.minZ, b.maxZ], covered((w) => (near(w.x0, b.maxX) ? [w.z0, w.z1] : null))),
  };
}

/** Parts of [a, b] not covered by any interval. */
function gaps(span: [number, number], covered: [number, number][]): [number, number][] {
  const out: [number, number][] = [];
  let cursor = span[0];
  for (const [c0, c1] of [...covered].sort((p, q) => p[0] - q[0])) {
    if (c0 > cursor + 1e-6) out.push([cursor, Math.min(c0, span[1])]);
    cursor = Math.max(cursor, c1);
    if (cursor >= span[1]) break;
  }
  if (cursor < span[1] - 1e-6) out.push([cursor, span[1]]);
  return out.filter(([a, c]) => c - a > 0.05);
}

/** [a, b] minus the openings widened by `margin` on each side. */
function around(span: [number, number], openings: [number, number][], margin: number): [number, number][] {
  return gaps(span, openings.map(([a, b]) => [a - margin, b + margin]));
}

/** Streets through a wall opening keep this much clear on each side of it before the next terrace. */
const OPENING_MARGIN = 1;

/**
 * KayKit terraces just outside the core's north, south and east walls, facing in, broken where a street
 * leads on through a wall opening. The west side is left to the suburban houses around Postmark Mews
 * (chapter 3's photo views). The east row covers the north-east and south-east corners; the south row also
 * covers the south-west corner.
 * @param b the core (Indigo Row + Dial Square)
 */
export function cityRows(b: Bounds, openings: CoreOpenings = { north: [], south: [], east: [] }): CityBuilding[] {
  const depth = (BUILDING_DEPTH + BUILDING_OVERHANG) * CITY_SCALE; // whole footprint, front line to back
  /** From the front line to the body's centre. */
  const toCentre = (BUILDING_OVERHANG + BUILDING_DEPTH / 2) * CITY_SCALE;
  const widths = Object.fromEntries(Object.entries(BUILDINGS).map(([k, v]) => [k, v.w * CITY_SCALE])) as Record<BuildingModel, number>;
  const out: CityBuilding[] = [];
  const eastFront = b.maxX + FRONT_GAP;
  const northFront = b.maxZ + FRONT_GAP;
  const southFront = b.minZ - FRONT_GAP;
  /** A row along X (north/south sides), skipping the openings. */
  const alongX = (x0: number, x1: number, front: number, outward: 1 | -1, order: BuildingModel[], rotY: number, open: [number, number][]): void => {
    const cz = front + outward * toCentre;
    const [z0, z1] = outward > 0 ? [front, front + depth] : [front - depth, front];
    for (const [a, c] of around([x0, x1], open, OPENING_MARGIN)) {
      for (const r of packRow(c - a, order, widths)) {
        const x = a + r.at;
        out.push({ model: r.model, x, z: cz, rotY, rect: { x0: x - r.width / 2, x1: x + r.width / 2, z0, z1 } });
      }
    }
  };
  // The north row starts at the west wall's outer face: Postmark Mews' houses are just beyond it.
  alongX(b.minX - 0.5, eastFront, northFront, 1, ROW_ORDERS.north, FACE_SOUTH, openings.north);
  alongX(b.minX - FRONT_GAP - depth, eastFront, southFront, -1, ROW_ORDERS.south, FACE_NORTH, openings.south);
  // East row along Z, from the south row's back to the north row's back.
  const cx = eastFront + toCentre;
  for (const [a, c] of around([southFront - depth, northFront + depth], openings.east, OPENING_MARGIN)) {
    for (const r of packRow(c - a, ROW_ORDERS.east, widths)) {
      const z = a + r.at;
      out.push({ model: r.model, x: cx, z, rotY: FACE_WEST, rect: { x0: eastFront, x1: eastFront + depth, z0: z - r.width / 2, z1: z + r.width / 2 } });
    }
  }
  return out;
}

// ---- Kenney suburban houses and towers (models/town)

/** Colour scheme of the suburban texture: default = white walls/green roofs, a = orange/blue, c = lilac/grey. */
export type Variant = 'default' | 'a' | 'c';
export interface KenneyPlacement {
  model: string;
  x: number;
  z: number;
  /** Yaw in radians; Kenney models face +Z at 0. */
  rotY: number;
  /** Uniform scale (model units → metres). */
  scale: number;
  variant?: Variant;
}

const SUBURBAN_SCALE = 6; // a two-storey Kenney house ≈ 6.8 m tall next to our 1.7 m characters
const TOWER_SCALE = 7;
const HOUSES = ['a', 'b', 'c', 'd', 'e', 'h', 'k', 'n', 'o', 's', 'u'].map((k) => `sub-building-type-${k}`);
const TOWERS = ['a', 'b', 'c', 'd', 'h', 'l', 'wide-a', 'wide-b'].map((k) => `com-low-detail-building-${k}`);
const VARIANTS: Variant[] = ['a', 'default', 'a', 'c', 'a', 'default'];
/** Rough half footprint depth of a scaled suburban house (m). */
const HOUSE_HALF_DEPTH = 3.5;
/** Centres of the house rows south and north of Postmark Mews (its walls are at z 27..27.5 and 35.5..36). */
const MEWS_FLANK_SOUTH_Z = 22;
const MEWS_FLANK_NORTH_Z = 40.5;
const FACE_EAST = Math.PI / 2;

/**
 * Suburban houses along the core's west wall and around Postmark Mews (from `b`, the core), and towers
 * further out on every side of the whole map (`outer`).
 */
export function townPlacements(b: Bounds, outer: Bounds = b): KenneyPlacement[] {
  const out: KenneyPlacement[] = [];
  let i = 0;
  const house = (x: number, z: number, rotY: number): void => {
    out.push({ model: HOUSES[i % HOUSES.length] ?? HOUSES[0]!, x, z, rotY, scale: SUBURBAN_SCALE, variant: VARIANTS[i % VARIANTS.length] });
    i++;
  };
  const tower = (x: number, z: number, rotY: number): void => {
    out.push({ model: TOWERS[i % TOWERS.length] ?? TOWERS[0]!, x, z, rotY, scale: TOWER_SCALE });
    i++;
  };
  // North, south and east sides are KayKit terraces now (cityRows). Their old house slots still advance `i`,
  // so every remaining house and tower keeps the model and colour it had (chapter 3's photo views depend on it).
  const skip = (): void => void i++;
  for (let x = b.minX - 6; x <= b.maxX + 6; x += 11) {
    skip(); // north row
    skip(); // south row
  }
  for (let z = b.minZ + 4; z <= b.maxZ - 2; z += 11) {
    // West row stops where it would overlap the houses flanking Postmark Mews (added below).
    if (z + HOUSE_HALF_DEPTH < MEWS_FLANK_SOUTH_Z - HOUSE_HALF_DEPTH) house(b.minX - 7, z, FACE_EAST);
    skip(); // east row
  }
  // Houses on both sides of Postmark Mews (lane z 27.5..35.5 in WorldBuilder), looking over its walls.
  for (const x of [b.minX - 5.5, b.minX - 13]) {
    house(x, MEWS_FLANK_SOUTH_Z, FACE_NORTH);
    house(x, MEWS_FLANK_NORTH_Z, FACE_SOUTH);
  }
  // Skyline: towers around the whole map (`outer`); further apart once the map is bigger than the core.
  const o = outer;
  const step = o === b ? 4.2 : 8.4;
  for (let x = o.minX - 22; x <= o.maxX + 22; x += step) {
    tower(x, o.maxZ + 22 + (i % 3) * 2, FACE_SOUTH);
    tower(x + 2, o.minZ - 22 - (i % 3) * 2, FACE_NORTH);
  }
  for (let z = o.minZ - 18; z <= o.maxZ + 18; z += step) {
    tower(o.minX - 22 - (i % 3) * 2, z, FACE_EAST);
    tower(o.maxX + 22 + (i % 3) * 2, z + 2, FACE_WEST);
  }
  return out;
}

/** Half the side of a suburban house's collision square (m): a little inside its walls, porches stay walkable. */
const HOUSE_HALF_SOLID = 3.2;

/** Ground squares the suburban houses stand on (collision; the skyline towers are outside the map). */
export function houseFootprints(b: Bounds, outer: Bounds = b): { x0: number; x1: number; z0: number; z1: number }[] {
  return townPlacements(b, outer)
    .filter((p) => HOUSES.includes(p.model))
    .map((p) => ({ x0: p.x - HOUSE_HALF_SOLID, x1: p.x + HOUSE_HALF_SOLID, z0: p.z - HOUSE_HALF_SOLID, z1: p.z + HOUSE_HALF_SOLID }));
}
