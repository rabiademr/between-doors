// Model: Bellwick's world as data (Web GIS layers). GeoJSON FeatureCollections in src/content/world/ are
// validated and turned into typed layers here; the 3D scene (world/WorldBuilder) and the sketch map
// (ui/MapView) are both drawn from the result, so they can never disagree.
//
// Coordinates are local metres: GeoJSON [x, y] = game (x = east, z = north). No real map data.
// Schema v1 limits: polygons are axis-aligned rectangles (closed ring of 5 positions).
// Districts tile the map without overlapping; every other feature must lie inside one. The outer edge of
// the active districts gets a boundary wall automatically (see boundaryWalls).
// Pure: no Babylon, no DOM.

export interface Rect {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}
export type Facing = 'east' | 'west' | 'north' | 'south';
/** `townsfolk` is the shared greeting spot the app moves onto the nearest townsperson (never in map data). */
export type SpotKind = 'giver' | 'door' | 'gate' | 'npc' | 'clue' | 'vendor' | 'board' | 'address' | 'townsfolk' | 'vehicle' | 'magpie';
/** Kinds a map file may contain; the rest (`townsfolk`, `vehicle`, `magpie`) are made by the game while it runs. */
export const MAP_SPOT_KINDS = ['giver', 'door', 'gate', 'npc', 'clue', 'vendor', 'board', 'address'] as const;
/** `water` blocks the player (bridges are the gaps left between water rectangles); the rest is floor. */
export type Surface = 'road' | 'paving' | 'gravel' | 'grass' | 'water' | 'bridge';
export const SURFACES = ['road', 'paving', 'gravel', 'grass', 'water', 'bridge'] as const;
export const POI_KINDS = ['fountain', 'tree', 'chilli_pot', 'bench', 'stall', 'lamp'] as const;
export type PoiKind = (typeof POI_KINDS)[number];
const FACINGS = ['east', 'west', 'north', 'south'] as const;
export type LabelStyle = 'normal' | 'small' | 'street';

export interface District {
  id: string;
  name: string;
  /** Only active districts are built; placeholders mark where later districts go. */
  status: 'active' | 'placeholder';
  rect: Rect;
  /** Ground colour of this district (default: the palette's ground). */
  ground?: string;
}
export interface Area {
  id: string;
  surface: Surface;
  colour: string;
  rect: Rect;
  /** Drawn on the map only (the 3D ground already looks right there). */
  mapOnly: boolean;
  /** Outside the main ground: this area is the floor the player walks on. */
  walkable: boolean;
  /** Shown on the map only after this chapter is completed. */
  reveal?: string;
}
export interface Building {
  id: string;
  rect: Rect;
  height: number;
  colour: string;
  style: 'house' | 'shop';
  /** Which way the street facade looks (east = the building stands on the west side of its street). */
  facing: Facing;
  /** Map fill class suffix (default 'house'). */
  mapStyle: 'house' | 'relay' | 'bakery';
  reveal?: string;
}
export interface Solid {
  id: string;
  rect: Rect;
  height: number;
  colour: string;
  /** Blocks are drawn on the map; walls are not. */
  kind: 'block' | 'wall';
}
export interface Door {
  id: string;
  x: number;
  z: number;
  facing: Facing;
  colour: string;
}
export interface Sign {
  id: string;
  x: number;
  z: number;
  y: number;
  facing: Facing;
  text: string;
  width: number;
  background: string;
}
export interface Spot {
  id: string;
  kind: SpotKind;
  x: number;
  z: number;
  range: number;
  chapters?: readonly string[];
  /** What the place is called on a delivery note (addresses; proper names, English in every language). */
  name?: string;
}
export interface NpcPoint {
  id: string;
  x: number;
  z: number;
  /** yaw: 0 faces +Z (north), π/2 faces +X (east) */
  heading: number;
}
export interface Poi {
  id: string;
  kind: PoiKind;
  x: number;
  z: number;
  /** Map circle radius (fountain). */
  radius?: number;
}
/** Street furniture and parked cars (city kit models; see world/cityKit.ts for sizes). */
export const PROP_MODELS = [
  'bench', 'bush', 'box-a', 'box-b', 'dumpster', 'firehydrant', 'trash-a', 'trash-b',
  'car-hatchback', 'car-sedan', 'car-stationwagon', 'car-taxi',
] as const;
export type PropModel = (typeof PROP_MODELS)[number];
export interface Prop {
  id: string;
  model: PropModel;
  x: number;
  z: number;
  /** Yaw in degrees, clockwise seen from above (0 = model front faces north, 90 = east). */
  rotate: number;
}
/** A named point the game steers by (a thief's ambush, a rack slot, where Finn waits). */
export interface Marker {
  id: string;
  x: number;
  z: number;
  /** yaw in RADIANS like the `npc` layer: 0 faces +Z (north), π/2 faces +X (east); 0 when not given.
   *  (The `prop` layer's `rotate` is in degrees — same direction, different unit.) */
  heading: number;
}
/** A walked or run line (LineString): a thief's way home, Finn's patrol. Every vertex lies in a district. */
export interface Route {
  id: string;
  points: { x: number; z: number }[];
}
export interface Label {
  text: string;
  x: number;
  z: number;
  style: LabelStyle;
  rotate: number;
  reveal?: string;
}

export interface WorldData {
  districts: District[];
  areas: Area[];
  buildings: Building[];
  solids: Solid[];
  doors: Door[];
  signs: Sign[];
  spots: Spot[];
  npcs: NpcPoint[];
  pois: Poi[];
  props: Prop[];
  labels: Label[];
  markers: Marker[];
  routes: Route[];
  spawn: { x: number; z: number };
  /** Bounding box of the active districts (ground, camera range, map frame). */
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
}

/** Walls generated along the outside of the active districts' outer edges. */
export const BOUNDARY_WALL = { thickness: 0.5, height: 3, colour: '#8c7f73' } as const;

export class WorldDataError extends Error {
  readonly problems: readonly string[];
  constructor(problems: readonly string[]) {
    super(`World data is invalid:\n- ${problems.join('\n- ')}`);
    this.problems = problems;
  }
}

/** Facade side of a building/door: facing east = west side of the street (x < street). */
export function facingSide(facing: 'east' | 'west'): -1 | 1 {
  return facing === 'east' ? -1 : 1;
}

/** True for facades along a north–south street (the only ones the hand-built core has). */
export const facesAcross = (facing: Facing): facing is 'east' | 'west' => facing === 'east' || facing === 'west';

/** The edge of a building's footprint that carries its street facade, with the outward direction. */
export function facadeEdge(b: { rect: Rect; facing: Facing }): { x0: number; x1: number; z0: number; z1: number; nx: number; nz: number } {
  const { x0, x1, z0, z1 } = b.rect;
  switch (b.facing) {
    case 'east': return { x0: x1, x1, z0, z1, nx: 1, nz: 0 };
    case 'west': return { x0, x1: x0, z0, z1, nx: -1, nz: 0 };
    case 'north': return { x0, x1, z0: z1, z1, nx: 0, nz: 1 };
    case 'south': return { x0, x1, z0, z1: z0, nx: 0, nz: -1 };
  }
}

/** Validates and merges FeatureCollections. Throws WorldDataError listing every problem. */
export function parseWorld(collections: readonly unknown[]): WorldData {
  const problems: string[] = [];
  const out: WorldData = {
    districts: [],
    areas: [],
    buildings: [],
    solids: [],
    doors: [],
    signs: [],
    spots: [],
    npcs: [],
    pois: [],
    props: [],
    labels: [],
    markers: [],
    routes: [],
    spawn: { x: 0, z: 0 },
    bounds: { minX: 0, maxX: 0, minZ: 0, maxZ: 0 },
  };
  let spawns = 0;
  const ids = new Map<string, Set<string>>();
  /** Where each non-district feature sits (point, or rect centre), checked against the districts at the end. */
  const anchors: { where: string; x: number; z: number }[] = [];

  collections.forEach((fc, ci) => {
    if (!isObj(fc) || fc.type !== 'FeatureCollection' || !Array.isArray(fc.features)) {
      problems.push(`collection ${ci}: not a GeoJSON FeatureCollection`);
      return;
    }
    const source = typeof fc.name === 'string' ? fc.name : `collection ${ci}`;
    fc.features.forEach((f: unknown, fi: number) => {
      const r = new FeatureReader(f, `${source} #${fi}`, problems);
      if (!r.ok) return;
      const layer = r.layer;
      if (layer !== 'district') {
        const a = r.anchor();
        if (a) anchors.push({ where: r.label, ...a });
      }
      if (layer !== 'label' && layer !== 'spawn') {
        const id = r.str('id');
        if (id !== undefined) {
          const seen = ids.get(layer) ?? new Set<string>();
          if (seen.has(id)) r.fail(`duplicate ${layer} id "${id}"`);
          seen.add(id);
          ids.set(layer, seen);
        }
      }
      switch (layer) {
        case 'district': {
          const rect = r.rect();
          const status = r.oneOf('status', ['active', 'placeholder'] as const);
          const id = r.str('id');
          const name = r.str('name');
          const ground = r.optColour('ground');
          if (rect && status && id && name) out.districts.push({ id, name, status, rect, ...opt('ground', ground) });
          break;
        }
        case 'area': {
          const rect = r.rect();
          const id = r.str('id');
          const surface = r.oneOf('surface', SURFACES);
          const colour = r.colour('colour');
          if (rect && id && surface && colour) {
            out.areas.push({
              id, surface, colour, rect,
              mapOnly: r.bool('mapOnly') ?? false,
              walkable: r.bool('walkable') ?? false,
              ...opt('reveal', r.optStr('reveal')),
            });
          }
          break;
        }
        case 'building': {
          const rect = r.rect();
          const id = r.str('id');
          const height = r.positive('height');
          const colour = r.colour('colour');
          const style = r.oneOf('style', ['house', 'shop'] as const);
          const facing = r.oneOf('facing', FACINGS);
          const mapStyle = r.optOneOf('mapStyle', ['house', 'relay', 'bakery'] as const) ?? 'house';
          if (rect && id && height && colour && style && facing) {
            out.buildings.push({ id, rect, height, colour, style, facing, mapStyle, ...opt('reveal', r.optStr('reveal')) });
          }
          break;
        }
        case 'block':
        case 'wall': {
          const rect = r.rect();
          const id = r.str('id');
          const height = r.positive('height');
          const colour = r.colour('colour');
          if (rect && id && height && colour) out.solids.push({ id, rect, height, colour, kind: layer });
          break;
        }
        case 'door': {
          const p = r.point();
          const id = r.str('id');
          const facing = r.oneOf('facing', FACINGS);
          const colour = r.colour('colour');
          if (p && id && facing && colour) out.doors.push({ id, x: p.x, z: p.z, facing, colour });
          break;
        }
        case 'sign': {
          const p = r.point();
          const id = r.str('id');
          const facing = r.oneOf('facing', FACINGS);
          const text = r.str('text');
          const width = r.positive('width');
          const background = r.colour('background');
          const y = r.optNum('y') ?? 3.1;
          if (p && id && facing && text && width && background) out.signs.push({ id, x: p.x, z: p.z, y, facing, text, width, background });
          break;
        }
        case 'spot': {
          const p = r.point();
          const id = r.str('id');
          const kind = r.oneOf('kind', MAP_SPOT_KINDS);
          const name = r.optStr('name');
          const range = r.positive('range');
          const chapters = r.optStrList('chapters');
          if (p && id && kind && range) out.spots.push({ id, kind, x: p.x, z: p.z, range, ...opt('chapters', chapters), ...opt('name', name) });
          break;
        }
        case 'npc': {
          const p = r.point();
          const id = r.str('id');
          const heading = r.num('heading');
          if (p && id && heading !== undefined) out.npcs.push({ id, x: p.x, z: p.z, heading });
          break;
        }
        case 'poi': {
          const p = r.point();
          const id = r.str('id');
          const kind = r.oneOf('kind', POI_KINDS);
          const radius = r.optNum('radius');
          if (p && id && kind) out.pois.push({ id, kind, x: p.x, z: p.z, ...opt('radius', radius) });
          break;
        }
        case 'prop': {
          const p = r.point();
          const id = r.str('id');
          const model = r.oneOf('model', PROP_MODELS);
          const rotate = r.optNum('rotate') ?? 0;
          if (p && id && model) out.props.push({ id, model, x: p.x, z: p.z, rotate });
          break;
        }
        case 'label': {
          const p = r.point();
          const text = r.str('text');
          const style = r.optOneOf('style', ['normal', 'small', 'street'] as const) ?? 'normal';
          if (p && text) {
            out.labels.push({ text, x: p.x, z: p.z, style, rotate: r.optNum('rotate') ?? 0, ...opt('reveal', r.optStr('reveal')) });
          }
          break;
        }
        case 'marker': {
          const p = r.point();
          const id = r.str('id');
          const heading = r.optNum('heading') ?? 0;
          if (p && id) out.markers.push({ id, x: p.x, z: p.z, heading });
          break;
        }
        case 'route': {
          const points = r.lineString();
          const id = r.str('id');
          // Every vertex must be on the map (the anchor only checks the first).
          points?.slice(1).forEach((pt, i) => anchors.push({ where: `${r.label} vertex ${i + 1}`, ...pt }));
          if (points && id) out.routes.push({ id, points });
          break;
        }
        case 'spawn': {
          const p = r.point();
          if (p) {
            out.spawn = p;
            spawns++;
          }
          break;
        }
        default:
          r.fail(`unknown layer "${layer}"`);
      }
    });
  });

  const active = out.districts.filter((d) => d.status === 'active');
  if (active.length === 0) problems.push('no active district');
  else {
    out.bounds = {
      minX: Math.min(...active.map((d) => d.rect.x0)),
      maxX: Math.max(...active.map((d) => d.rect.x1)),
      minZ: Math.min(...active.map((d) => d.rect.z0)),
      maxZ: Math.max(...active.map((d) => d.rect.z1)),
    };
  }
  if (spawns !== 1) problems.push(`expected exactly one spawn point, found ${spawns}`);

  const ds = out.districts;
  for (let i = 0; i < ds.length; i++) {
    for (let j = i + 1; j < ds.length; j++) {
      if (overlaps(ds[i]!.rect, ds[j]!.rect)) problems.push(`districts "${ds[i]!.id}" and "${ds[j]!.id}" overlap`);
    }
  }
  for (const a of anchors) {
    if (!ds.some((d) => inside(d.rect, a.x, a.z))) problems.push(`${a.where}: lies outside every district (${a.x}, ${a.z})`);
  }
  // Water must leave every road, paving and bridge clear: a bridge is the gap between two water rectangles.
  const FLOORS: readonly Surface[] = ['road', 'paving', 'bridge'];
  for (const w of out.areas.filter((a) => a.surface === 'water')) {
    for (const f of out.areas) {
      if (FLOORS.includes(f.surface) && !f.mapOnly && overlaps(w.rect, f.rect)) problems.push(`water "${w.id}" overlaps ${f.surface} "${f.id}"`);
    }
  }
  if (active.length > 0) {
    boundaryWalls(active).forEach((rect, i) => {
      out.solids.push({ id: `boundary_${i}`, rect, height: BOUNDARY_WALL.height, colour: BOUNDARY_WALL.colour, kind: 'wall' });
    });
  }

  if (problems.length) throw new WorldDataError(problems);
  return out;
}

/** Bounding rectangle of the given districts (e.g. the hand-built core). Throws if one is missing. */
export function districtsRect(districts: readonly District[], ids: readonly string[]): Rect {
  const picked = ids.map((id) => {
    const d = districts.find((x) => x.id === id);
    if (!d) throw new Error(`unknown district "${id}"`);
    return d.rect;
  });
  return {
    x0: Math.min(...picked.map((r) => r.x0)),
    x1: Math.max(...picked.map((r) => r.x1)),
    z0: Math.min(...picked.map((r) => r.z0)),
    z1: Math.max(...picked.map((r) => r.z1)),
  };
}

/** The district containing (x, z): edges belong to the district on their north/east side. */
export function districtAt(districts: readonly District[], x: number, z: number): District | undefined {
  return districts.find((d) => x >= d.rect.x0 && x < d.rect.x1 && z >= d.rect.z0 && z < d.rect.z1);
}

/**
 * Wall rectangles just outside every stretch of a district edge that no other given district continues
 * (the outer edge of the playable map). Each wall runs one thickness past its ends so corners close.
 */
export function boundaryWalls(districts: readonly District[], thickness: number = BOUNDARY_WALL.thickness): Rect[] {
  const out: Rect[] = [];
  for (const d of districts) {
    const { x0, x1, z0, z1 } = d.rect;
    const others = districts.filter((o) => o !== d);
    // For each edge: the other districts across it cover some intervals of it; walls go on the rest.
    const openX = (across: (o: Rect) => boolean): [number, number][] =>
      subtract([x0, x1], others.filter((o) => across(o.rect)).map((o) => [o.rect.x0, o.rect.x1] as [number, number]));
    const openZ = (across: (o: Rect) => boolean): [number, number][] =>
      subtract([z0, z1], others.filter((o) => across(o.rect)).map((o) => [o.rect.z0, o.rect.z1] as [number, number]));
    for (const [a, b] of openX((o) => o.z0 === z1)) out.push({ x0: a - thickness, x1: b + thickness, z0: z1, z1: z1 + thickness });
    for (const [a, b] of openX((o) => o.z1 === z0)) out.push({ x0: a - thickness, x1: b + thickness, z0: z0 - thickness, z1: z0 });
    for (const [a, b] of openZ((o) => o.x0 === x1)) out.push({ x0: x1, x1: x1 + thickness, z0: a - thickness, z1: b + thickness });
    for (const [a, b] of openZ((o) => o.x1 === x0)) out.push({ x0: x0 - thickness, x1: x0, z0: a - thickness, z1: b + thickness });
  }
  return out;
}

/** [a, b] minus the given intervals (pieces shorter than 1 cm are dropped). */
function subtract(span: [number, number], cuts: [number, number][]): [number, number][] {
  let parts: [number, number][] = [span];
  for (const [c0, c1] of cuts) {
    parts = parts.flatMap(([a, b]): [number, number][] => {
      if (c1 <= a || c0 >= b) return [[a, b]];
      const rest: [number, number][] = [];
      if (c0 > a) rest.push([a, c0]);
      if (c1 < b) rest.push([c1, b]);
      return rest;
    });
  }
  return parts.filter(([a, b]) => b - a > 0.01);
}

const overlaps = (a: Rect, b: Rect): boolean => a.x0 < b.x1 && b.x0 < a.x1 && a.z0 < b.z1 && b.z0 < a.z1;
const inside = (r: Rect, x: number, z: number): boolean => x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1;

// ---------------------------------------------------------------- helpers

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const HEX = /^#[0-9a-fA-F]{6}$/;
/** Spread helper so optional fields are omitted rather than set to undefined (exactOptionalPropertyTypes-safe). */
function opt<K extends string, V>(key: K, value: V | undefined): { [P in K]?: V } {
  return value === undefined ? {} : ({ [key]: value } as { [P in K]?: V });
}

class FeatureReader {
  readonly ok: boolean;
  readonly layer: string = '';
  private readonly props: Obj = {};
  private readonly geometry: Obj = {};
  private readonly where: string;
  private readonly problems: string[];

  constructor(f: unknown, where: string, problems: string[]) {
    this.problems = problems;
    this.where = where;
    if (!isObj(f) || f.type !== 'Feature' || !isObj(f.properties) || !isObj(f.geometry)) {
      problems.push(`${where}: not a Feature with properties and geometry`);
      this.ok = false;
      return;
    }
    this.props = f.properties;
    this.geometry = f.geometry;
    const id = typeof f.properties.id === 'string' ? ` (${f.properties.id})` : '';
    this.where = `${where}${id}`;
    if (typeof f.properties.layer !== 'string') {
      problems.push(`${this.where}: missing "layer" property`);
      this.ok = false;
      return;
    }
    this.layer = f.properties.layer;
    this.ok = true;
  }

  fail(msg: string): void {
    this.problems.push(`${this.where}: ${msg}`);
  }

  get label(): string {
    return this.where;
  }

  /** Point, or the centre of the polygon's bounding box, without reporting problems (the layer reader does). */
  anchor(): { x: number; z: number } | undefined {
    const c = this.geometry.coordinates;
    if (this.geometry.type === 'Point' && Array.isArray(c) && isNum(c[0]) && isNum(c[1])) return { x: c[0], z: c[1] };
    if (this.geometry.type === 'LineString' && Array.isArray(c) && Array.isArray(c[0]) && isNum(c[0][0]) && isNum(c[0][1])) {
      return { x: c[0][0], z: c[0][1] };
    }
    if (this.geometry.type === 'Polygon' && Array.isArray(c) && Array.isArray(c[0])) {
      const pts = (c[0] as unknown[]).filter((p): p is [number, number] => Array.isArray(p) && isNum(p[0]) && isNum(p[1]));
      if (pts.length === 0) return undefined;
      const xs = pts.map((p) => p[0]);
      const zs = pts.map((p) => p[1]);
      return { x: (Math.min(...xs) + Math.max(...xs)) / 2, z: (Math.min(...zs) + Math.max(...zs)) / 2 };
    }
    return undefined;
  }

  str(key: string): string | undefined {
    const v = this.props[key];
    if (typeof v === 'string' && v.length > 0) return v;
    this.fail(`"${key}" must be a non-empty string`);
    return undefined;
  }
  optStr(key: string): string | undefined {
    return this.props[key] === undefined ? undefined : this.str(key);
  }
  optStrList(key: string): string[] | undefined {
    const v = this.props[key];
    if (v === undefined) return undefined;
    if (Array.isArray(v) && v.length > 0 && v.every((s) => typeof s === 'string' && s.length > 0)) return v as string[];
    this.fail(`"${key}" must be a non-empty list of strings`);
    return undefined;
  }
  num(key: string): number | undefined {
    const v = this.props[key];
    if (isNum(v)) return v;
    this.fail(`"${key}" must be a number`);
    return undefined;
  }
  optNum(key: string): number | undefined {
    return this.props[key] === undefined ? undefined : this.num(key);
  }
  positive(key: string): number | undefined {
    const v = this.num(key);
    if (v === undefined) return undefined;
    if (v > 0) return v;
    this.fail(`"${key}" must be > 0`);
    return undefined;
  }
  bool(key: string): boolean | undefined {
    const v = this.props[key];
    if (v === undefined || typeof v === 'boolean') return v;
    this.fail(`"${key}" must be true or false`);
    return undefined;
  }
  colour(key: string): string | undefined {
    const v = this.props[key];
    if (typeof v === 'string' && HEX.test(v)) return v;
    this.fail(`"${key}" must be a #rrggbb colour`);
    return undefined;
  }
  optColour(key: string): string | undefined {
    return this.props[key] === undefined ? undefined : this.colour(key);
  }
  oneOf<T extends string>(key: string, values: readonly T[]): T | undefined {
    const v = this.props[key];
    if (typeof v === 'string' && (values as readonly string[]).includes(v)) return v as T;
    this.fail(`"${key}" must be one of ${values.join(', ')}`);
    return undefined;
  }
  optOneOf<T extends string>(key: string, values: readonly T[]): T | undefined {
    return this.props[key] === undefined ? undefined : this.oneOf(key, values);
  }

  point(): { x: number; z: number } | undefined {
    const c = this.geometry.coordinates;
    if (this.geometry.type === 'Point' && Array.isArray(c) && c.length >= 2 && isNum(c[0]) && isNum(c[1])) return { x: c[0], z: c[1] };
    this.fail('geometry must be a Point [x, z]');
    return undefined;
  }

  /** A LineString of at least two numeric [x, z] positions. */
  lineString(): { x: number; z: number }[] | undefined {
    const c = this.geometry.coordinates;
    if (this.geometry.type === 'LineString' && Array.isArray(c) && c.length >= 2) {
      const pts = c.map((p) => (Array.isArray(p) && p.length >= 2 && isNum(p[0]) && isNum(p[1]) ? { x: p[0], z: p[1] } : null));
      if (pts.every((p) => p !== null)) return pts as { x: number; z: number }[];
    }
    this.fail('geometry must be a LineString of at least two [x, z] positions');
    return undefined;
  }

  /** An axis-aligned rectangle Polygon (closed ring of 5 positions, no holes). */
  rect(): Rect | undefined {
    const rings = this.geometry.coordinates;
    if (this.geometry.type !== 'Polygon' || !Array.isArray(rings) || rings.length !== 1 || !Array.isArray(rings[0])) {
      this.fail('geometry must be a Polygon with one ring');
      return undefined;
    }
    const ring = rings[0] as unknown[];
    const pts = ring.map((p) => (Array.isArray(p) && p.length >= 2 && isNum(p[0]) && isNum(p[1]) ? ([p[0], p[1]] as const) : null));
    if (pts.length !== 5 || pts.some((p) => p === null)) {
      this.fail('polygon ring must have 5 numeric positions (closed rectangle)');
      return undefined;
    }
    const ps = pts as (readonly [number, number])[];
    const first = ps[0]!;
    const last = ps[4]!;
    if (first[0] !== last[0] || first[1] !== last[1]) {
      this.fail('polygon ring is not closed');
      return undefined;
    }
    const xs = ps.map((p) => p[0]);
    const zs = ps.map((p) => p[1]);
    const rect = { x0: Math.min(...xs), x1: Math.max(...xs), z0: Math.min(...zs), z1: Math.max(...zs) };
    const axisAligned = ps.every((p) => (p[0] === rect.x0 || p[0] === rect.x1) && (p[1] === rect.z0 || p[1] === rect.z1));
    const corners = new Set(ps.slice(0, 4).map((p) => `${p[0]},${p[1]}`));
    if (!axisAligned || corners.size !== 4 || rect.x1 <= rect.x0 || rect.z1 <= rect.z0) {
      this.fail('polygon must be an axis-aligned rectangle (schema v1)');
      return undefined;
    }
    return rect;
  }
}
