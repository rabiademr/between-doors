// View layer (3D): the four outer districts (Market Hill, Canal Side, Railway Yard, Hillside Park).
// Everything is driven by the map data (content/world/<district>.geo.json): WorldBuilder has already made the
// gameplay blocks (colliders) and plain placeholders; this file turns them into the districts' look.
//  - Per district, all small geometry is baked into a few meshes with vertex colours: one for the ground
//    surfaces, one for solid things (walls, halls, wagons, boats, trees, stalls, lamps…), one for lamp glow.
//    The placeholders are hidden (they stay as colliders) or disposed, so a district costs a handful of draw
//    calls however much stands in it.
//  - `building` features become terraces of city-kit models (districtLayout.terraceUnits); the block stays
//    as the collider and is hidden once its models are in — collisions never wait for a download.
//  - The terraces around the core (TownModels) get their colliders here, now that the land behind them is
//    walkable.
// What a block, wall or area is, is read from its id tokens — see districtLayout.ts for the list.
// Purely visual apart from those terrace colliders: no rules, no interaction.
import { VertexBuffer } from '@babylonjs/core/Buffers/buffer';
import type { Material } from '@babylonjs/core/Materials/material';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import { CreateBox, CreateBoxVertexData } from '@babylonjs/core/Meshes/Builders/boxBuilder';
import { CreateCylinderVertexData } from '@babylonjs/core/Meshes/Builders/cylinderBuilder';
import { CreateIcoSphereVertexData } from '@babylonjs/core/Meshes/Builders/icoSphereBuilder';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import type { Scene } from '@babylonjs/core/scene';
import { BELLWICK } from '../content/world';
import type { Area, District, Poi, Rect, Solid, Surface, WorldData } from '../domain/world/worldData';
import { BUILDINGS, CITY_SCALE } from './cityKit';
import { coreTerraceColliders, freeEdges, hallFront, hashId, hasToken, outerDistrictAt, terraceUnits } from './districtLayout';
import type { ModelLibrary } from './modelLibrary';
import { PALETTE } from './palette';
import type { Bounds } from './townLayout';

export interface DistrictDressingOptions {
  /** The hand-built core and every wall footprint (as passed to the town loader). */
  core: Bounds;
  walls: readonly Rect[];
  /** Kit materials are made matte like the rest of the town. */
  material: (m: Material) => Material;
  data?: WorldData;
}

type RGB = readonly [number, number, number];
interface Shape {
  positions: ArrayLike<number>;
  normals: ArrayLike<number>;
  indices: ArrayLike<number>;
}

const rgb = (hex: string, k = 1): RGB => {
  const c = Color3.FromHexString(hex);
  return [Math.min(1, c.r * k), Math.min(1, c.g * k), Math.min(1, c.b * k)];
};
const shade = (c: RGB, k: number): RGB => [Math.min(1, c[0] * k), Math.min(1, c[1] * k), Math.min(1, c[2] * k)];
/** Deterministic pseudo-random 0..1 (the districts look the same every run). */
const rnd = (seed: number): number => {
  const s = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
};
const pick = <T>(list: readonly T[], seed: number): T => list[Math.floor(rnd(seed) * list.length) % list.length]!;

// ---------------------------------------------------------------- shapes (unit size, reused)

const asShape = (v: VertexData): Shape => ({ positions: v.positions ?? [], normals: v.normals ?? [], indices: v.indices ?? [] });
const BOX = asShape(CreateBoxVertexData({ size: 1 }));
const ICO = asShape(CreateIcoSphereVertexData({ radius: 1, subdivisions: 1, flat: true }));
const cylinders = new Map<string, Shape>();
/** Unit-height cylinder/cone around the Y axis: bottom diameter 1, top diameter `top`. */
function cylinder(tessellation: number, top = 1): Shape {
  const key = `${tessellation}|${top}`;
  let s = cylinders.get(key);
  if (!s) {
    s = asShape(CreateCylinderVertexData({ height: 1, diameterBottom: 1, diameterTop: top, tessellation }));
    cylinders.set(key, s);
  }
  return s;
}
/** Both sides of the given triangles, flat-shaded (so the shape is lit whatever the winding). */
function twoSided(points: number[][], triangles: number[][]): Shape {
  const positions: number[] = [];
  const indices: number[] = [];
  for (const t of triangles) {
    for (const order of [t, [t[0]!, t[2]!, t[1]!]]) {
      const base = positions.length / 3;
      for (const i of order) positions.push(...points[i]!);
      indices.push(base, base + 1, base + 2);
    }
  }
  const normals: number[] = [];
  VertexData.ComputeNormals(positions, indices, normals);
  return { positions, normals, indices };
}
/** Gable roof: 1 wide (X), 1 high, 1 long (Z, the ridge), base centred on the origin. */
const GABLE = twoSided(
  [[-0.5, 0, -0.5], [0.5, 0, -0.5], [0, 1, -0.5], [-0.5, 0, 0.5], [0.5, 0, 0.5], [0, 1, 0.5]],
  [[0, 2, 5], [0, 5, 3], [1, 4, 5], [1, 5, 2], [0, 1, 2], [3, 5, 4]],
);
/** A flat square on the ground plane (1 × 1, facing up). */
const TILE = twoSided([[-0.5, 0, -0.5], [0.5, 0, -0.5], [0.5, 0, 0.5], [-0.5, 0, 0.5]], [[0, 1, 2], [0, 2, 3]]);

// ---------------------------------------------------------------- batch

/** Collects coloured geometry and turns it into one mesh. */
class Batch {
  private readonly positions: number[] = [];
  private readonly normals: number[] = [];
  private readonly colors: number[] = [];
  private readonly indices: number[] = [];

  /** Adds a shape: scaled, tilted about X, turned about Y (Babylon yaw: +Z towards +X), then moved. */
  add(shape: Shape, colour: RGB, sx: number, sy: number, sz: number, x: number, y: number, z: number, yaw = 0, tilt = 0): void {
    const base = this.positions.length / 3;
    const cy = Math.cos(yaw);
    const syw = Math.sin(yaw);
    const ct = Math.cos(tilt);
    const st = Math.sin(tilt);
    const p = shape.positions;
    const n = shape.normals;
    for (let i = 0; i < p.length; i += 3) {
      const px = p[i]! * sx;
      const py0 = p[i + 1]! * sy;
      const pz0 = p[i + 2]! * sz;
      const py = py0 * ct - pz0 * st;
      const pz = py0 * st + pz0 * ct;
      this.positions.push(px * cy + pz * syw + x, py + y, -px * syw + pz * cy + z);
      // Normals: inverse scale, same rotations.
      let nx = n[i]! / sx;
      const ny0 = n[i + 1]! / sy;
      const nz0 = n[i + 2]! / sz;
      let ny = ny0 * ct - nz0 * st;
      let nz = ny0 * st + nz0 * ct;
      const len = Math.hypot(nx, ny, nz) || 1;
      nx /= len;
      ny /= len;
      nz /= len;
      this.normals.push(nx * cy + nz * syw, ny, -nx * syw + nz * cy);
      this.colors.push(colour[0], colour[1], colour[2], 1);
    }
    const idx = shape.indices;
    for (let i = 0; i < idx.length; i++) this.indices.push(base + idx[i]!);
  }
  /** Box by size and centre. */
  box(w: number, h: number, d: number, x: number, y: number, z: number, colour: RGB, yaw = 0, tilt = 0): void {
    this.add(BOX, colour, w, h, d, x, y, z, yaw, tilt);
  }
  /** Box standing on the ground over a rectangle. */
  block(r: Rect, y0: number, y1: number, colour: RGB, grow = 0): void {
    this.box(r.x1 - r.x0 + grow * 2, y1 - y0, r.z1 - r.z0 + grow * 2, (r.x0 + r.x1) / 2, (y0 + y1) / 2, (r.z0 + r.z1) / 2, colour);
  }
  /** Upright cylinder/cone: bottom diameter `d`, top `d × top`, from y0 up. */
  post(d: number, h: number, x: number, y0: number, z: number, colour: RGB, tessellation = 8, top = 1, yaw = 0): void {
    this.add(cylinder(tessellation, top), colour, d, h, d, x, y0 + h / 2, z, yaw);
  }
  ball(r: number, x: number, y: number, z: number, colour: RGB, yaw = 0, squash = 1): void {
    this.add(ICO, colour, r, r * squash, r, x, y, z, yaw);
  }
  /** Flat rectangle at height y. */
  flat(x0: number, x1: number, z0: number, z1: number, y: number, colour: RGB): void {
    this.add(TILE, colour, x1 - x0, 1, z1 - z0, (x0 + x1) / 2, y, (z0 + z1) / 2);
  }
  /** Bakes an existing mesh (world position, its material's colour). */
  mesh(m: AbstractMesh): void {
    const p = m.getVerticesData(VertexBuffer.PositionKind);
    const n = m.getVerticesData(VertexBuffer.NormalKind);
    const idx = m.getIndices();
    if (!p || !n || !idx) return;
    const world = m.computeWorldMatrix(true);
    const colour = m.material instanceof StandardMaterial ? m.material.diffuseColor : Color3.Gray();
    const base = this.positions.length / 3;
    const v = new Vector3();
    for (let i = 0; i < p.length; i += 3) {
      Vector3.TransformCoordinatesFromFloatsToRef(p[i]!, p[i + 1]!, p[i + 2]!, world, v);
      this.positions.push(v.x, v.y, v.z);
      Vector3.TransformNormalFromFloatsToRef(n[i]!, n[i + 1]!, n[i + 2]!, world, v);
      v.normalize();
      this.normals.push(v.x, v.y, v.z);
      this.colors.push(colour.r, colour.g, colour.b, 1);
    }
    for (let i = 0; i < idx.length; i++) this.indices.push(base + idx[i]!);
  }
  build(scene: Scene, name: string, material: Material): Mesh | null {
    if (this.indices.length === 0) return null;
    const mesh = new Mesh(name, scene);
    const data = new VertexData();
    data.positions = this.positions;
    data.normals = this.normals;
    data.colors = this.colors;
    data.indices = this.indices;
    data.applyToMesh(mesh);
    mesh.material = material;
    mesh.isPickable = false;
    mesh.freezeWorldMatrix();
    return mesh;
  }
}

// ---------------------------------------------------------------- palette of the districts

const STONE = rgb('#b9ae9b');
const IRON = rgb('#2e3a35');
const WOOD = rgb(PALETTE.wood);
const TIMBER = rgb('#8a5f3a');
const CREAM = rgb('#efe6d8');
const GLASS = rgb('#56708a');
const ROOFS = ['#6b6f76', '#7b4a3a', '#5d6670', '#8a5a44'].map((h) => rgb(h));
const TILE_RED = rgb('#9c4f36');
const DOORS = ['#3d4a55', '#5a4636', '#4d5a48', '#6a3b34'].map((h) => rgb(h));
const CABINS = ['#a13a32', '#2f6f5e', '#d9a441', '#3b5f8a'].map((h) => rgb(h));
const CRATES = ['#b08a5a', '#a47c4c', '#c29a66', '#9a7446'].map((h) => rgb(h));
const FLOWERS = ['#e0606a', '#f2c14e', '#f6f1e7', '#b06ad0', '#e88a4a'].map((h) => rgb(h));
const PRODUCE = ['#e08a2e', '#7fa650', '#c8443a', '#e9c84a', '#8a4f7d', '#d9d2c0'].map((h) => rgb(h));
const LEAVES: RGB[][] = [
  ['#5d8f4a', '#6f9e52', '#4f7f42'].map((h) => rgb(h)),
  ['#6c9a4a', '#82ab57', '#5a8a40'].map((h) => rgb(h)),
  ['#4f8250', '#63965a', '#437444'].map((h) => rgb(h)),
  ['#c9a24a', '#d6b25a', '#b9703c'].map((h) => rgb(h)), // turning
];
const CONIFER = ['#3f6b47', '#4a7a50', '#35603f'].map((h) => rgb(h));

/** Height of each floor surface above the ground slab (later features of the same kind lie a hair higher). */
const SURFACE_Y: Record<Exclude<Surface, 'water'>, number> = { grass: 0.012, gravel: 0.016, paving: 0.02, road: 0.024, bridge: 0.03 };
/** Size of the colour patches a surface is laid in (m) and how much their tone varies. */
const SURFACE_TILE: Record<Exclude<Surface, 'water'>, { size: number; vary: number }> = {
  grass: { size: 4, vary: 0.035 },
  gravel: { size: 2.5, vary: 0.035 },
  paving: { size: 2, vary: 0.03 },
  road: { size: 4, vary: 0.012 },
  bridge: { size: 0.8, vary: 0.05 },
};

// ---------------------------------------------------------------- entry point

/**
 * Dresses the outer districts. The baked geometry is in the scene when this returns; the returned promises
 * are the model placements still loading (terraces, parasols, the water tower).
 */
export function dressDistricts(scene: Scene, lib: ModelLibrary, opts: DistrictDressingOptions): Promise<unknown>[] {
  const data = opts.data ?? BELLWICK;
  const jobs: Promise<unknown>[] = [];

  const paint = new StandardMaterial('districtPaint', scene);
  paint.diffuseColor = Color3.White();
  paint.specularColor = Color3.Black(); // matte, like the rest of Bellwick
  const glow = new StandardMaterial('districtGlow', scene);
  glow.diffuseColor = Color3.FromHexString('#ffe2a8');
  glow.emissiveColor = Color3.FromHexString('#ffcf7a');
  glow.specularColor = Color3.Black();

  // WorldBuilder's meshes by feature id ("<id>" and "<id>_part").
  const byId = new Map<string, AbstractMesh[]>();
  for (const m of scene.meshes) {
    for (const key of [m.name, m.name.slice(0, Math.max(0, m.name.lastIndexOf('_')))]) {
      if (!key) continue;
      const list = byId.get(key) ?? [];
      list.push(m);
      byId.set(key, list);
    }
  }
  const named = (id: string): AbstractMesh | undefined => byId.get(id)?.find((m) => m.name === id);
  /** The placeholder stays as the collider (and still stops the camera if it is tall). */
  const keepAsCollider = (m: AbstractMesh | undefined, tall: boolean): void => {
    if (!m) return;
    m.isVisible = false;
    if (tall) m.metadata = { ...(m.metadata ?? {}), cameraBlocker: true };
  };
  const inDistrict = (d: District, x: number, z: number): boolean => outerDistrictAt(data.districts, x, z) === d;
  const centreIn = (d: District, r: Rect): boolean => inDistrict(d, (r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2);

  for (const d of data.districts) {
    if (outerDistrictAt(data.districts, (d.rect.x0 + d.rect.x1) / 2, (d.rect.z0 + d.rect.z1) / 2) !== d) continue;
    const ground = new Batch();
    const solid = new Batch();
    const lights = new Batch();
    const areas = data.areas.filter((a) => !a.mapOnly && centreIn(d, a.rect));
    const water = areas.filter((a) => a.surface === 'water');

    layGround(ground, solid, d, areas);
    keepAsCollider(scene.getMeshByName(`ground_${d.id}`) ?? undefined, true);
    for (const a of areas) if (a.surface !== 'water') named(a.id)?.dispose();
    for (const w of water) waterEdge(solid, w, areas);

    const solids = data.solids.filter((s) => !s.id.startsWith('boundary_') && centreIn(d, s.rect));
    for (const s of solids) {
      if (hasToken(s.id, 'watertower')) {
        jobs.push(placeWaterTower(scene, lib, opts, s, named(s.id)));
        continue;
      }
      keepAsCollider(named(s.id), s.height > 1.8);
      dressSolid(solid, s, solids, water);
    }

    for (const p of data.pois) {
      if (!inDistrict(d, p.x, p.z)) continue;
      const parts = byId.get(p.id) ?? [];
      const job = dressPoi(solid, lights, lib, opts, p, parts, d.id === 'hillside-park');
      if (job) jobs.push(job);
    }

    for (const b of data.buildings) {
      if (!centreIn(d, b.rect)) continue;
      const units = terraceUnits(b);
      const placed = units.map((u, i) =>
        lib.place({
          asset: BUILDINGS[u.model].asset,
          x: u.x,
          z: u.z,
          rotY: u.rotY,
          scale: CITY_SCALE,
          // A little height variety on top of the kit's 2–4 storeys.
          stretch: { x: u.stretchAlong, y: 0.94 + rnd(hashId(b.id) + i) * 0.14, z: u.stretchDepth },
          anchor: 'ground',
          material: opts.material,
          name: `${b.id}_${i}`,
        }),
      );
      // The block is the collider from the first frame; it disappears once the whole terrace stands.
      jobs.push(Promise.all(placed).then(() => keepAsCollider(named(b.id), true)));
    }

    const g = ground.build(scene, `ground_district_${d.id}`, paint); // "ground…" never casts shadows (Atmosphere)
    if (g) g.receiveShadows = true;
    solid.build(scene, `district_${d.id}_dress`, paint);
    lights.build(scene, `district_${d.id}_glow`, glow);
  }

  // The terraces around the core: solid now that the districts behind them are open.
  coreTerraceColliders(opts.core, opts.walls).forEach((r, i) => {
    const c = CreateBox(`coreTerrace${i}_collider`, { width: r.x1 - r.x0, height: 3, depth: r.z1 - r.z0 }, scene);
    c.position.set((r.x0 + r.x1) / 2, 1.5, (r.z0 + r.z1) / 2);
    c.isVisible = false;
    c.isPickable = false;
    c.checkCollisions = true;
    c.metadata = { cameraBlocker: true };
    c.freezeWorldMatrix();
  });
  return jobs;
}

// ---------------------------------------------------------------- ground

/** Lays `r` in patches of slightly varying tone (a hand-laid look instead of one flat slab); `strips` = bands
 * following one another along that axis, each as wide as the rectangle. */
function patches(b: Batch, r: Rect, y: number, colour: RGB, size: number, vary: number, seed: number, strips?: 'x' | 'z'): void {
  const nx = strips === 'z' ? 1 : Math.max(1, Math.round((r.x1 - r.x0) / size));
  const nz = strips === 'x' ? 1 : Math.max(1, Math.round((r.z1 - r.z0) / size));
  const dx = (r.x1 - r.x0) / nx;
  const dz = (r.z1 - r.z0) / nz;
  for (let i = 0; i < nx; i++) {
    for (let k = 0; k < nz; k++) {
      const tone = 1 + (rnd(seed + i * 13.37 + k * 7.77) - 0.5) * 2 * vary;
      b.flat(r.x0 + i * dx, r.x0 + (i + 1) * dx, r.z0 + k * dz, r.z0 + (k + 1) * dz, y, shade(colour, tone));
    }
  }
}

/** True when water lies along the rectangle's north and south sides (so one crosses it east–west). */
function crossedAlongX(r: Rect, water: readonly Area[]): boolean {
  const dry = freeEdges(r, water.map((w) => w.rect)).filter((e) => e.axis === 'x').reduce((s, e) => s + e.to - e.from, 0);
  return dry < r.x1 - r.x0;
}

function layGround(ground: Batch, solid: Batch, d: District, areas: readonly Area[]): void {
  const seed = hashId(d.id) % 1000;
  patches(ground, d.rect, 0.004, rgb(d.ground ?? PALETTE.ground), 6, d.id === 'hillside-park' ? 0.05 : 0.03, seed);
  const water = areas.filter((a) => a.surface === 'water');
  const crossings = areas.filter((a) => hasToken(a.id, 'crossing'));
  areas.forEach((a, i) => {
    if (a.surface === 'water') return;
    const y = SURFACE_Y[a.surface] + i * 0.00004;
    const { size, vary } = SURFACE_TILE[a.surface];
    const long: 'x' | 'z' = a.rect.x1 - a.rect.x0 >= a.rect.z1 - a.rect.z0 ? 'x' : 'z';
    const colour = rgb(a.colour);
    const s = seed + i * 31;
    if (a.surface === 'bridge') {
      // Planks (or flags) lie across the way one walks.
      patches(ground, a.rect, y, colour, size, vary, s, crossedAlongX(a.rect, water) ? 'x' : 'z');
    } else if (a.surface === 'road') {
      patches(ground, a.rect, y, colour, size, vary, s, long);
      roadMarks(ground, a.rect, long, y + 0.003);
    } else {
      patches(ground, a.rect, y, colour, size, vary, s);
    }
    if (hasToken(a.id, 'track')) layTrack(solid, a.rect, long, crossings);
  });
}

/** Dashed centre line along a road's long side. */
function roadMarks(ground: Batch, r: Rect, long: 'x' | 'z', y: number): void {
  const width = long === 'x' ? r.z1 - r.z0 : r.x1 - r.x0;
  if (width < 5) return;
  const line = rgb('#e9e2cf');
  const [a, b] = long === 'x' ? [r.x0, r.x1] : [r.z0, r.z1];
  const mid = long === 'x' ? (r.z0 + r.z1) / 2 : (r.x0 + r.x1) / 2;
  for (let t = a + 1.2; t + 1.4 < b; t += 3) {
    if (long === 'x') ground.flat(t, t + 1.4, mid - 0.06, mid + 0.06, y, line);
    else ground.flat(mid - 0.06, mid + 0.06, t, t + 1.4, y, line);
  }
}

/** Sleepers and two rails along a track bed (no sleepers where a crossing is paved over them). */
function layTrack(solid: Batch, r: Rect, long: 'x' | 'z', crossings: readonly Area[]): void {
  const sleeper = rgb('#5a4636');
  const rail = rgb('#70757a');
  const [a, b] = long === 'x' ? [r.x0, r.x1] : [r.z0, r.z1];
  const mid = long === 'x' ? (r.z0 + r.z1) / 2 : (r.x0 + r.x1) / 2;
  const width = Math.min(2.3, (long === 'x' ? r.z1 - r.z0 : r.x1 - r.x0) - 0.2);
  for (let t = a + 0.4; t < b - 0.2; t += 0.75) {
    const [x, z] = long === 'x' ? [t, mid] : [mid, t];
    if (crossings.some((c) => x > c.rect.x0 && x < c.rect.x1 && z > c.rect.z0 && z < c.rect.z1)) continue;
    solid.box(long === 'x' ? 0.24 : width, 0.1, long === 'x' ? width : 0.24, x, 0.06, z, shade(sleeper, 0.92 + rnd(t) * 0.16));
  }
  for (const side of [-0.72, 0.72]) {
    if (long === 'x') solid.box(b - a, 0.14, 0.09, (a + b) / 2, 0.13, mid + side, rail);
    else solid.box(0.09, 0.14, b - a, mid + side, 0.13, (a + b) / 2, rail);
  }
}

/** Coping stones along a water's edge (not where a bridge or more water continues), bollards, reeds, lily pads. */
function waterEdge(solid: Batch, w: Area, areas: readonly Area[]): void {
  const others = areas.filter((a) => a !== w && (a.surface === 'water' || a.surface === 'bridge')).map((a) => a.rect);
  const canal = hasToken(w.id, 'canal') || hasToken(w.id, 'basin');
  const seed = hashId(w.id) % 997;
  for (const e of freeEdges(w.rect, others)) {
    const n = Math.max(1, Math.round((e.to - e.from) / 2.4));
    const step = (e.to - e.from) / n;
    for (let i = 0; i < n; i++) {
      const t = e.from + (i + 0.5) * step;
      const at = e.at + e.out * 0.22;
      const tone = shade(STONE, 0.94 + rnd(seed + i * 3.3 + e.at) * 0.12);
      if (e.axis === 'x') solid.box(step - 0.04, 0.16, 0.5, t, 0.08, at, tone);
      else solid.box(0.5, 0.16, step - 0.04, at, 0.08, t, tone);
      if (canal && i % 4 === 1) {
        const [x, z] = e.axis === 'x' ? [t, at] : [at, t];
        solid.post(0.26, 0.42, x, 0.16, z, IRON, 8, 0.75);
        solid.post(0.34, 0.08, x, 0.56, z, IRON, 8);
      }
      if (!canal && rnd(seed + i * 9.1 + e.at * 1.7) > 0.45) {
        // Reeds just inside the bank.
        const inAt = e.at - e.out * 0.55;
        for (let k = 0; k < 5; k++) {
          const off = (rnd(seed + i + k * 2.3) - 0.5) * 1.6;
          const h = 0.7 + rnd(seed + i * 5 + k) * 0.7;
          const [x, z] = e.axis === 'x' ? [t + off, inAt - e.out * rnd(k + i) * 0.5] : [inAt - e.out * rnd(k + i) * 0.5, t + off];
          solid.box(0.07, h, 0.07, x, h / 2, z, rgb('#5c7d3e', 0.9 + rnd(k + i * 7) * 0.3), rnd(k) * 3);
        }
      }
    }
  }
  if (!canal) {
    const pads = Math.round(((w.rect.x1 - w.rect.x0) * (w.rect.z1 - w.rect.z0)) / 45);
    for (let i = 0; i < pads; i++) {
      const x = w.rect.x0 + 1.5 + rnd(seed + i * 4.1) * (w.rect.x1 - w.rect.x0 - 3);
      const z = w.rect.z0 + 1.5 + rnd(seed + i * 6.7) * (w.rect.z1 - w.rect.z0 - 3);
      solid.post(0.5 + rnd(i) * 0.4, 0.02, x, 0.03, z, rgb('#5f9450', 0.9 + rnd(i * 3) * 0.2), 7);
      if (i % 3 === 0) solid.ball(0.1, x + 0.1, 0.1, z, rgb('#f6e9ef'));
    }
  }
}

// ---------------------------------------------------------------- solids (walls and blocks)

function dressSolid(b: Batch, s: Solid, all: readonly Solid[], water: readonly Area[]): void {
  const colour = rgb(s.colour);
  const r = s.rect;
  const cx = (r.x0 + r.x1) / 2;
  const cz = (r.z0 + r.z1) / 2;
  const w = r.x1 - r.x0;
  const d = r.z1 - r.z0;
  const seed = hashId(s.id);
  const is = (token: string): boolean => hasToken(s.id, token);

  if (s.kind === 'wall') {
    b.block(r, 0, s.height, colour);
    if (is('gatepost')) {
      b.block(r, s.height, s.height + 0.22, shade(colour, 1.25), 0.12);
      b.ball(0.3, cx, s.height + 0.5, cz, shade(colour, 1.3));
      // The `_a` post carries the arch over to its `_b` partner.
      if (s.id.endsWith('_a')) {
        const partner = all.find((o) => o.id === `${s.id.slice(0, -2)}_b`);
        if (partner) {
          const span: Rect = { x0: Math.min(r.x0, partner.rect.x0), x1: Math.max(r.x1, partner.rect.x1), z0: Math.min(r.z0, partner.rect.z0), z1: Math.max(r.z1, partner.rect.z1) };
          b.block(span, s.height - 1.6, s.height, shade(colour, 0.92));
          b.block(span, s.height - 1.78, s.height - 1.6, shade(colour, 1.25), 0.06);
        }
      }
    } else {
      b.block(r, s.height, s.height + 0.1, shade(colour, 1.18), 0.07); // coping
    }
    return;
  }
  if (is('hall')) return hall(b, s, colour, seed);
  if (is('chimney')) {
    b.block(r, 0, s.height, colour);
    for (const t of [0.4, 0.72]) b.block(r, s.height * t, s.height * t + 0.3, shade(colour, 1.18), 0.08);
    b.block(r, s.height - 0.5, s.height, shade(colour, 0.7), 0.14);
    return;
  }
  if (is('wagon')) return wagon(b, s, colour);
  if (is('boat')) return boat(b, s, colour, seed, water.some((a) => cx > a.rect.x0 && cx < a.rect.x1 && cz > a.rect.z0 && cz < a.rect.z1));
  if (is('stack')) {
    const nx = Math.max(1, Math.floor(w / 0.98));
    const nz = Math.max(1, Math.floor(d / 0.98));
    const layers = Math.max(1, Math.round(s.height / 0.85));
    for (let l = 0; l < layers; l++) {
      for (let i = 0; i < nx; i++) {
        for (let k = 0; k < nz; k++) {
          const k2 = seed + l * 17 + i * 5 + k * 3;
          if (l > 0 && l === layers - 1 && rnd(k2) < 0.35) continue; // a ragged top
          const size = 0.84 + rnd(k2 + 1) * 0.1;
          b.box(size, 0.83, size, r.x0 + (i + 0.5) * (w / nx), 0.415 + l * 0.85, r.z0 + (k + 0.5) * (d / nz), shade(pick(CRATES, k2 + 2), 0.95 + rnd(k2 + 3) * 0.1), (rnd(k2 + 4) - 0.5) * 0.3);
        }
      }
    }
    return;
  }
  if (is('bed')) {
    b.block(r, 0, s.height, colour);
    b.block({ x0: r.x0 + 0.12, x1: r.x1 - 0.12, z0: r.z0 + 0.12, z1: r.z1 - 0.12 }, s.height, s.height + 0.04, rgb('#5a4434'));
    const n = Math.round(w * d * 2.4);
    for (let i = 0; i < n; i++) {
      const x = r.x0 + 0.3 + rnd(seed + i * 3.1) * (w - 0.6);
      const z = r.z0 + 0.3 + rnd(seed + i * 7.7) * (d - 0.6);
      if (i % 3 === 0) b.ball(0.22, x, s.height + 0.14, z, rgb('#5d8f4a'), i);
      else b.ball(0.15, x, s.height + 0.16, z, pick(FLOWERS, seed + i), i);
    }
    return;
  }
  if (is('cross')) {
    // Market cross: three steps, a column, a small lantern roof on four posts.
    const steps = 3;
    for (let i = 0; i < steps; i++) b.box(w - i * 0.7, s.height / steps, d - i * 0.7, cx, (i + 0.5) * (s.height / steps), cz, shade(colour, 1 + i * 0.05));
    const top = s.height;
    b.post(0.75, 0.3, cx, top, cz, shade(colour, 0.9), 8);
    b.post(0.5, 4, cx, top + 0.3, cz, colour, 8, 0.8);
    b.box(1.5, 0.22, 1.5, cx, top + 4.4, cz, shade(colour, 1.1));
    for (const [px, pz] of [[-0.6, -0.6], [0.6, -0.6], [-0.6, 0.6], [0.6, 0.6]] as const) b.post(0.12, 1.1, cx + px, top + 4.5, cz + pz, colour, 6);
    b.ball(0.24, cx, top + 4.95, cz, rgb('#d9a441'));
    b.post(2.6, 1.5, cx, top + 5.6, cz, TILE_RED, 4, 0.02, Math.PI / 4);
    b.ball(0.16, cx, top + 7.2, cz, rgb('#d9a441'));
    return;
  }
  if (is('bandstand')) {
    const R = Math.min(w, d) / 2;
    b.post(R * 2.08, s.height, cx, 0, cz, colour, 8, 1, Math.PI / 8);
    b.post(R * 2.2, 0.1, cx, s.height, cz, shade(colour, 1.1), 8, 1, Math.PI / 8);
    const roofY = s.height + 2.9;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const px = cx + Math.sin(a) * (R - 0.3);
      const pz = cz + Math.cos(a) * (R - 0.3);
      b.post(0.16, 2.9, px, s.height, pz, CREAM, 6);
      // Railing between this post and the next (one bay is left open as the steps).
      if (i !== 4) {
        const a2 = ((i + 0.5) / 8) * Math.PI * 2;
        const len = 2 * (R - 0.3) * Math.sin(Math.PI / 8);
        const mx = cx + Math.sin(a2) * (R - 0.3) * Math.cos(Math.PI / 8);
        const mz = cz + Math.cos(a2) * (R - 0.3) * Math.cos(Math.PI / 8);
        b.box(len, 0.08, 0.08, mx, s.height + 0.95, mz, CREAM, a2);
        b.box(len, 0.5, 0.04, mx, s.height + 0.6, mz, rgb('#2f5d3a'), a2);
      }
    }
    b.post(R * 2.5, 0.16, cx, roofY, cz, CREAM, 8, 1, Math.PI / 8);
    b.post(R * 2.4, 1.7, cx, roofY + 0.16, cz, rgb('#7b4a3a'), 8, 0.12, Math.PI / 8);
    b.post(0.9, 0.5, cx, roofY + 1.86, cz, CREAM, 8, 1, Math.PI / 8);
    b.post(1.2, 0.7, cx, roofY + 2.36, cz, rgb('#7b4a3a'), 8, 0.05, Math.PI / 8);
    b.ball(0.16, cx, roofY + 3.15, cz, rgb('#d9a441'));
    return;
  }
  if (is('kiosk')) {
    b.block(r, 0, s.height, colour);
    b.block(r, s.height, s.height + 0.16, rgb('#2f5d3a'), 0.3);
    b.box(w * 0.7, 0.9, 0.08, cx, 1.55, r.z0 - 0.02, GLASS); // the hatch
    b.box(w * 0.8, 0.06, 0.4, cx, 1.05, r.z0 - 0.2, CREAM); // counter shelf
    const n = 6;
    for (let i = 0; i < n; i++) b.box(w / n, 0.05, 1.1, r.x0 + (i + 0.5) * (w / n), s.height - 0.25, r.z0 - 0.5, i % 2 ? CREAM : rgb('#c8553d'), 0, -0.28);
    return;
  }
  if (is('obelisk')) {
    b.block(r, 0, s.height, colour);
    b.block(r, s.height, s.height + 0.12, shade(colour, 1.12), 0.1);
    b.post(Math.min(w, d) * 0.95, 5.2, cx, s.height + 0.12, cz, shade(colour, 1.05), 4, 0.55, Math.PI / 4);
    b.post(Math.min(w, d) * 0.52, 0.7, cx, s.height + 5.32, cz, shade(colour, 1.12), 4, 0.02, Math.PI / 4);
    return;
  }
  if (is('platform')) {
    b.block(r, 0, s.height, colour);
    b.block(r, s.height, s.height + 0.06, shade(colour, 1.15), 0.06);
    return;
  }
  if (is('bunker')) {
    b.block(r, 0, s.height, colour);
    for (let i = 0; i < 14; i++) b.ball(0.9 + rnd(seed + i) * 0.5, r.x0 + 1 + rnd(seed + i * 2.2) * (w - 2), s.height + 0.1, r.z0 + 1 + rnd(seed + i * 5.1) * (d - 2), rgb('#2c2a28', 0.9 + rnd(i) * 0.4), i, 0.55);
    return;
  }
  b.block(r, 0, s.height, colour);
}

/** Depot, shed, mill, lodge: a plain block with a plinth, big doors on its front, high windows and a gable roof. */
function hall(b: Batch, s: Solid, colour: RGB, seed: number): void {
  const r = s.rect;
  const w = r.x1 - r.x0;
  const d = r.z1 - r.z0;
  const cx = (r.x0 + r.x1) / 2;
  const cz = (r.z0 + r.z1) / 2;
  const h = s.height;
  const small = Math.max(w, d) < 10;
  b.block(r, 0, h, colour);
  b.block(r, 0, 0.5, shade(colour, 0.72), 0.05);
  b.block(r, h - 0.3, h, shade(colour, 1.14), 0.08);
  // Roof: the ridge runs along the longer side.
  const ridgeX = w >= d;
  const span = (ridgeX ? d : w) + 1;
  const rise = Math.min(3.4, span * 0.24);
  const roof = small ? TILE_RED : pick(ROOFS, seed);
  b.add(GABLE, roof, span, rise, (ridgeX ? w : d) + 0.8, cx, h, cz, ridgeX ? Math.PI / 2 : 0);
  if (!small) {
    const len = ridgeX ? w : d;
    for (const t of [-0.25, 0.25]) {
      const [x, z] = ridgeX ? [cx + t * len, cz] : [cx, cz + t * len];
      b.box(ridgeX ? 2.2 : 0.9, 0.5, ridgeX ? 0.9 : 2.2, x, h + rise + 0.1, z, shade(roof, 0.8));
    }
  }
  // Faces: [outward normal, length of the face]. Doors on the front, windows on the long sides.
  const front = hallFront(s.id);
  const faces = [
    { name: 'north', nx: 0, nz: 1, len: w },
    { name: 'south', nx: 0, nz: -1, len: w },
    { name: 'east', nx: 1, nz: 0, len: d },
    { name: 'west', nx: -1, nz: 0, len: d },
  ] as const;
  for (const f of faces) {
    const alongX = f.nz !== 0;
    /** A panel on this face: `t` along the face from its centre, `y` centre height. */
    const panel = (t: number, y: number, pw: number, ph: number, c: RGB, proud = 0.05): void => {
      const fx = alongX ? cx + t : cx + f.nx * (w / 2 + proud / 2);
      const fz = alongX ? cz + f.nz * (d / 2 + proud / 2) : cz + t;
      b.box(alongX ? pw : proud, ph, alongX ? proud : pw, fx, y, fz, c);
    };
    if (f.name === front) {
      if (small) {
        panel(0, 1.1, 1.2, 2.2, pick(DOORS, seed + 1), 0.08);
        panel(0, 2.3, 1.5, 0.14, CREAM, 0.1);
        for (const t of [-f.len / 4 - 0.3, f.len / 4 + 0.3]) {
          panel(t, 1.6, 1.25, 1.35, CREAM, 0.06);
          panel(t, 1.6, 1.05, 1.15, GLASS, 0.09);
        }
      } else {
        const doors = Math.max(1, Math.floor(f.len / 8));
        const dh = Math.min(4.2, h - 1.6);
        const door = pick(DOORS, seed + 1);
        for (let i = 0; i < doors; i++) {
          const t = (i - (doors - 1) / 2) * (f.len / doors);
          panel(t, dh / 2, 3.6, dh, door, 0.1);
          panel(t, dh + 0.14, 4.1, 0.28, shade(colour, 1.25), 0.16);
          for (const rib of [-0.9, 0, 0.9]) panel(t + rib, dh / 2, 0.1, dh, shade(door, 0.75), 0.14);
          panel(t, dh * 0.62, 3.6, 0.12, shade(door, 0.75), 0.14);
        }
      }
    }
    if (!small && f.len >= 12 && h > 5) {
      const n = Math.max(2, Math.floor(f.len / 3.4));
      for (let i = 0; i < n; i++) {
        const t = (i - (n - 1) / 2) * (f.len / n);
        panel(t, h - 1.25, 1.5, 1.0, CREAM, 0.05);
        panel(t, h - 1.25, 1.3, 0.8, GLASS, 0.08);
      }
    }
  }
}

/** Freight wagon: body on an underframe, four wheels, sliding doors, ribs, a roof. */
function wagon(b: Batch, s: Solid, colour: RGB): void {
  const r = s.rect;
  const alongX = r.x1 - r.x0 >= r.z1 - r.z0;
  const len = alongX ? r.x1 - r.x0 : r.z1 - r.z0;
  const wid = alongX ? r.z1 - r.z0 : r.x1 - r.x0;
  const cx = (r.x0 + r.x1) / 2;
  const cz = (r.z0 + r.z1) / 2;
  const yaw = alongX ? 0 : Math.PI / 2;
  /** Box in the wagon's own frame: `l` along it, `s` across. */
  const part = (l: number, h: number, sz: number, al: number, y: number, ac: number, c: RGB): void => {
    const [x, z] = alongX ? [cx + al, cz + ac] : [cx + ac, cz + al];
    b.box(l, h, sz, x, y, z, c, yaw);
  };
  const dark = rgb('#2b2b2b');
  part(len - 0.1, s.height - 1.05, wid - 0.2, 0, (s.height + 1.05) / 2 - 0.1, 0, colour);
  part(len, 0.28, wid - 0.5, 0, 0.82, 0, dark);
  part(len + 0.16, 0.14, wid + 0.1, 0, s.height - 0.06, 0, rgb('#3d3f42'));
  for (const al of [-len / 2 + 1.6, len / 2 - 1.6]) {
    for (const ac of [-wid / 2 + 0.42, wid / 2 - 0.42]) {
      const [x, z] = alongX ? [cx + al, cz + ac] : [cx + ac, cz + al];
      // A wheel is a short cylinder laid on its side, axle across the wagon.
      b.add(cylinder(12), dark, 0.92, 0.16, 0.92, x, 0.46, z, yaw, Math.PI / 2);
    }
    part(0.5, 0.5, 0.2, al < 0 ? -len / 2 - 0.2 : len / 2 + 0.2, 0.95, -0.7, dark);
    part(0.5, 0.5, 0.2, al < 0 ? -len / 2 - 0.2 : len / 2 + 0.2, 0.95, 0.7, dark);
  }
  for (const side of [-1, 1]) {
    const ac = side * (wid / 2 - 0.08);
    part(2.2, s.height - 1.5, 0.08, 0, (s.height + 1.05) / 2 - 0.1, ac, shade(colour, 0.82));
    for (let al = -len / 2 + 0.6; al < len / 2 - 0.3; al += 1.45) part(0.09, s.height - 1.2, 0.07, al, (s.height + 1.05) / 2 - 0.1, ac, shade(colour, 0.7));
  }
}

/** Narrowboat: hull with a pointed bow, a cabin with windows, a tiller. On land it rests on trestles. */
function boat(b: Batch, s: Solid, colour: RGB, seed: number, afloat: boolean): void {
  const r = s.rect;
  const alongX = r.x1 - r.x0 >= r.z1 - r.z0;
  const len = alongX ? r.x1 - r.x0 : r.z1 - r.z0;
  const wid = alongX ? r.z1 - r.z0 : r.x1 - r.x0;
  const cx = (r.x0 + r.x1) / 2;
  const cz = (r.z0 + r.z1) / 2;
  const yaw = alongX ? 0 : Math.PI / 2;
  const bow = seed % 2 ? 1 : -1;
  const y0 = afloat ? 0 : 0.35;
  const part = (l: number, h: number, sz: number, al: number, y: number, ac: number, c: RGB, turn = 0): void => {
    const [x, z] = alongX ? [cx + al, cz + ac] : [cx + ac, cz + al];
    b.box(l, h, sz, x, y0 + y, z, c, yaw + turn);
  };
  const hull = s.height;
  part(len - wid * 0.5, hull, wid, -bow * wid * 0.25, hull / 2, 0, colour);
  // No two faces in the same plane (they would fight for the same depth and crawl): the bow block is a
  // touch shorter than the hull at both ends, the gunwale stands a touch proud of the deck.
  part(wid * 0.707, hull - 0.04, wid * 0.707, bow * (len / 2 - wid * 0.5), hull / 2, 0, colour, Math.PI / 4);
  part(len - wid * 0.5, 0.1, wid + 0.06, -bow * wid * 0.25, hull - 0.03, 0, rgb('#e9dfcc'));
  if (len > 6) {
    const cabin = pick(CABINS, seed);
    const cl = len * 0.56;
    part(cl, 0.85, wid * 0.74, -bow * len * 0.06, hull + 0.42, 0, cabin);
    part(cl + 0.2, 0.08, wid * 0.8, -bow * len * 0.06, hull + 0.89, 0, rgb('#e9dfcc'));
    for (const side of [-1, 1]) {
      for (const t of [-0.3, 0, 0.3]) part(0.7, 0.36, 0.05, -bow * len * 0.06 + t * cl, hull + 0.5, side * wid * 0.375, GLASS);
    }
    part(0.1, 0.5, 0.1, -bow * (len / 2 - 0.5), hull + 0.25, 0, WOOD);
    part(0.9, 0.07, 0.07, -bow * (len / 2 - 0.9), hull + 0.5, 0, WOOD);
    part(0.18, 0.5, 0.18, -bow * len * 0.2, hull + 1.15, 0.2, rgb('#2b2b2b')); // stove pipe
  } else {
    // A rowing boat: two thwarts.
    for (const t of [-0.2, 0.15]) part(0.25, 0.06, wid - 0.1, t * len, hull + 0.03, 0, TIMBER);
  }
  if (!afloat) for (const t of [-0.3, 0.3]) part(0.3, 0.37, wid + 0.5, t * len, -0.165, 0, WOOD); // cradles the hull a little
}

// ---------------------------------------------------------------- points of interest

function dressPoi(solid: Batch, lights: Batch, lib: ModelLibrary, opts: DistrictDressingOptions, p: Poi, parts: readonly AbstractMesh[], park: boolean): Promise<unknown> | null {
  const seed = hashId(p.id);
  const main = parts.find((m) => m.name === p.id);
  switch (p.kind) {
    case 'tree': {
      for (const m of parts) {
        if (m.checkCollisions) m.isVisible = false; // the trunk stays as the collider
        else m.dispose();
      }
      tree(solid, p.x, p.z, seed, park);
      return null;
    }
    case 'lamp': {
      for (const m of parts) {
        if (m.checkCollisions) m.isVisible = false;
        else m.dispose();
      }
      solid.box(0.32, 0.3, 0.32, p.x, 0.15, p.z, IRON);
      solid.post(0.18, 3.5, p.x, 0.3, p.z, IRON, 8, 0.55);
      solid.box(0.5, 0.05, 0.5, p.x, 3.84, p.z, IRON, Math.PI / 4);
      lights.post(0.42, 0.42, p.x, 3.86, p.z, [1, 1, 1], 6, 0.6);
      solid.post(0.56, 0.2, p.x, 4.28, p.z, IRON, 6, 0.1);
      return null;
    }
    case 'bench': {
      if (main) main.isVisible = false;
      if (hasToken(p.id, 'cafe')) {
        solid.post(0.9, 0.05, p.x, 0.72, p.z, CREAM, 10);
        solid.post(0.1, 0.72, p.x, 0, p.z, IRON, 6);
        solid.post(0.5, 0.04, p.x, 0, p.z, IRON, 8);
        for (const side of [-0.72, 0.72]) {
          solid.post(0.36, 0.05, p.x + side, 0.44, p.z, pick(FLOWERS, seed + side), 8);
          solid.post(0.08, 0.44, p.x + side, 0, p.z, IRON, 6);
        }
        const model = seed % 2 ? 'a' : 'b';
        return lib.place({ asset: `models/town/com-detail-parasol-${model}.glb`, x: p.x, z: p.z, rotY: (seed % 4) * (Math.PI / 2), scale: 6, material: opts.material, name: p.id });
      }
      // Park bench along X; the id's last token says which way the sitter looks (default south).
      const back = p.id.endsWith('_n') ? -1 : 1;
      solid.box(1.8, 0.07, 0.48, p.x, 0.46, p.z, TIMBER);
      solid.box(1.8, 0.42, 0.07, p.x, 0.8, p.z + back * 0.24, TIMBER, 0, back * 0.18);
      for (const side of [-0.78, 0.78]) {
        solid.box(0.07, 0.44, 0.44, p.x + side, 0.22, p.z, IRON);
        solid.box(0.07, 0.5, 0.07, p.x + side, 0.68, p.z + back * 0.24, IRON);
      }
      return null;
    }
    case 'stall': {
      // WorldBuilder's stall as it is (counter, posts, striped awning), plus goods on the counter.
      for (const m of parts) {
        solid.mesh(m);
        if (m.checkCollisions) m.isVisible = false;
        else m.dispose();
      }
      for (let i = 0; i < 4; i++) {
        const x = p.x - 0.96 + i * 0.64;
        const goods = pick(PRODUCE, seed + i * 3);
        solid.box(0.56, 0.16, 0.8, x, 1.04, p.z + 0.08, TIMBER, 0, 0.16);
        for (let k = 0; k < 5; k++) solid.ball(0.11, x - 0.16 + (k % 3) * 0.16, 1.17 + (k > 2 ? 0.08 : 0), p.z + 0.02 + (k % 2) * 0.22, shade(goods, 0.9 + rnd(seed + i + k) * 0.2), k);
      }
      if (hasToken(p.id, 'vendor')) {
        // The vendor's pitch stands out: a board over the awning and a lantern at each front corner.
        solid.box(2.0, 0.5, 0.08, p.x, 2.86, p.z + 0.5, rgb('#2f5d3a'));
        solid.box(2.12, 0.08, 0.1, p.x, 3.14, p.z + 0.5, rgb('#d9a441'));
        for (const side of [-1.3, 1.3]) lights.ball(0.14, p.x + side, 2.2, p.z + 0.62, [1, 1, 1]);
      }
      return null;
    }
    default:
      return null;
  }
}

/** A tree in the batch: broadleaf (three or four crowns) or, in the park, sometimes a conifer. */
function tree(b: Batch, x: number, z: number, seed: number, park: boolean): void {
  const s = 0.9 + rnd(seed) * 0.6;
  const turn = rnd(seed + 1) * Math.PI * 2;
  if (park && rnd(seed + 2) < 0.28) {
    const h = 4.6 * s;
    b.post(0.34 * s, 1.1, x, 0, z, WOOD, 6, 0.8);
    for (let i = 0; i < 3; i++) b.post((2.7 - i * 0.7) * s, h * 0.42, x, 0.9 + i * h * 0.27, z, CONIFER[(seed + i) % CONIFER.length]!, 7, 0.02, turn + i);
    return;
  }
  const leaves = LEAVES[rnd(seed + 3) < 0.1 ? 3 : seed % 3]!;
  const trunk = 2.2 * s;
  b.post(0.36 * s, trunk, x, 0, z, WOOD, 6, 0.62);
  const crowns = s > 1.25 ? 4 : 3;
  for (let i = 0; i < crowns; i++) {
    const a = turn + i * 2.2;
    const r = (1.2 - i * 0.14) * s;
    const off = i === crowns - 1 ? 0 : 0.5 * s;
    b.ball(r, x + Math.sin(a) * off, trunk + 0.55 * s + i * 0.5 * s, z + Math.cos(a) * off, leaves[i % leaves.length]!, a, 0.92);
  }
}

// ---------------------------------------------------------------- models

/** The yard's water tower: the kit model scaled to stand on its block. */
async function placeWaterTower(scene: Scene, lib: ModelLibrary, opts: DistrictDressingOptions, s: Solid, block: AbstractMesh | undefined): Promise<void> {
  const asset = 'models/city/watertower.glb';
  const box = await lib.bounds(asset);
  const scale = Math.min(s.rect.x1 - s.rect.x0, s.rect.z1 - s.rect.z0) / Math.max(box.maxX - box.minX, box.maxZ - box.minZ);
  await lib.place({ asset, x: (s.rect.x0 + s.rect.x1) / 2, z: (s.rect.z0 + s.rect.z1) / 2, rotY: 0, scale, anchor: 'footprint', material: opts.material, name: s.id });
  if (block && !scene.isDisposed) {
    block.isVisible = false;
    block.metadata = { ...(block.metadata ?? {}), cameraBlocker: true };
  }
}
