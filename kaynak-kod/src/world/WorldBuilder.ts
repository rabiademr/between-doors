// View layer (3D): builds Bellwick — gameplay blocks (collisions, doors, spots) here; purely visual detail
// lives in Dressing.ts and lighting/post-process in Atmosphere.ts.
// Layout comes from content/world/*.geo.json (metres, +Z = north, +X = east):
//   street x −5..5, z −20..20  ·  Dial Square z 22..40 with the fountain at (0, 30)
//   Crossing Yard x 13..28, z −8..12, reached by the alley (z 0..3, gate at x≈6) or the back lane (x 13..18) from the square.
// Domain logic never lives here; interaction uses the `spots` list.
import type { Engine } from '@babylonjs/core/Engines/engine';
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder';
import { CreateCylinder } from '@babylonjs/core/Meshes/Builders/cylinderBuilder';
import { CreateGround } from '@babylonjs/core/Meshes/Builders/groundBuilder';
import { CreatePlane } from '@babylonjs/core/Meshes/Builders/planeBuilder';
import { CreateIcoSphere } from '@babylonjs/core/Meshes/Builders/icoSphereBuilder';
import { CreateSphere } from '@babylonjs/core/Meshes/Builders/sphereBuilder';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { Scene } from '@babylonjs/core/scene';
import type { InteractionSpot } from '../app/interaction';
import { setupAtmosphere } from './Atmosphere';
import { freezeStaticMeshes } from './freezeStatic';
import { PALETTE } from './palette';
import type { ColliderMeta } from './SceneColliders';
import { dressBellwick, type Facade, type KeepOut } from './Dressing';
import { BELLWICK, coreRect } from '../content/world';
import { facesAcross, facingSide, type Prop, type Rect, type WorldData } from '../domain/world/worldData';
import { CITY_SCALE, PROP_KIT, propColliderName } from './cityKit';
import { isTerrace } from './districtLayout';

import type { SpotKind } from '../domain/world/worldData';
/** How far (m) a sign stands off the surface it is mounted on. */
const SIGN_STANDOFF = 0.03;

export type { SpotKind };
export interface WorldSpot extends InteractionSpot {
  kind: SpotKind;
  /** Chapters in which this spot is interactive (undefined = always). */
  chapters?: readonly string[];
  /** A name for the prompt (an address, a story actor: "Talk to Arthur"). */
  name?: string;
}
export interface NpcPlacement {
  id: string;
  position: Vector3;
  /** yaw: 0 faces +Z, π/2 faces +X */
  heading: number;
}

/** A gate that swings open on its hinge (Crossing Yard, Postmark Mews). */
export class YardGate {
  private readonly hinge: TransformNode;
  private readonly openAngle: number;
  private target = 0;
  /** @param openAngle yaw when open (sign picks the side it swings to). */
  constructor(hinge: TransformNode, openAngle = Math.PI / 2) {
    this.hinge = hinge;
    this.openAngle = openAngle;
  }
  get isOpen(): boolean {
    return this.target !== 0;
  }
  setOpen(open: boolean, animate = true): void {
    this.target = open ? this.openAngle : 0;
    if (!animate) this.hinge.rotation.y = this.target;
  }
  update(dt: number): void {
    const r = this.hinge.rotation.y;
    if (r === this.target) return;
    const step = 2.2 * dt; // rad/s
    this.hinge.rotation.y = Math.abs(this.target - r) <= step ? this.target : r + Math.sign(this.target - r) * step;
  }
}

export interface CameraView {
  from: Vector3;
  to: Vector3;
}

/** Postmark Mews (chapter 3): where people stand, and the two fixed camera views. */
export interface MewsLayout {
  arthurDoorstep: NpcPlacement;
  arthurSeat: NpcPlacement;
  playerSeat: NpcPlacement;
  /** Neighbours waiting at the table (Mara, Finn, June). */
  guests: NpcPlacement[];
  /** Sylvie's old photo: the entrance seen from Dial Square. */
  oldPhotoView: CameraView;
  /** The final picture at the table. */
  finaleView: CameraView;
}

export interface World {
  scene: Scene;
  spawn: Vector3;
  spots: WorldSpot[];
  npcs: NpcPlacement[];
  gate: YardGate;
  postmarkGate: YardGate;
  mews: MewsLayout;
  /** Street props from the map; their colliders are built here, their models load with the town. */
  props: readonly Prop[];
  /** All active districts. */
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  /** The hand-built core (Indigo Row + Dial Square). */
  core: Rect;
  /** Footprints of every wall (the terraces leave the core's wall openings clear). */
  walls: readonly Rect[];
}

const STREET_HALF = 5; // Indigo Row's facades at x = ±5 (dressing: lamps, pavements)
const FACE_EAST = -Math.PI / 2; // plane rotation so its front faces +X (seen from the street, west side)
const FACE_WEST = Math.PI / 2; // front faces −X (east side)
const WALL = PALETTE.wall;
const WOOD = PALETTE.wood;
/** Mews chairs: seat size and height (m), and how far behind the sitter's placement the seat sits. */
const CHAIR_SEAT = 0.46;
const CHAIR_HEIGHT = 0.46;
const SEAT_BACKSET = 0.1;

/** Builds the scene from the map layers (content/world/*.geo.json); set pieces are still placed in code. */
export function buildBellwick(engine: Engine, data: WorldData = BELLWICK): World {
  const { minX: MIN_X, maxX: MAX_X, minZ: MIN_Z, maxZ: MAX_Z } = data.bounds;
  const core = coreRect(data);
  // The square's west and east walls (from the map): the Postmark Mews gate, its clues and the decoy gate sit on them.
  const wallById = (id: string): Rect => {
    const w = data.solids.find((s) => s.id === id);
    if (!w) throw new Error(`world data has no wall "${id}"`);
    return w.rect;
  };
  const WEST_WALL_X = wallById('wallW_n1').x1; // inner face of the square's west wall
  const EAST_WALL_X = wallById('wallE_n').x0; // inner face of the square's east wall
  const scene = new Scene(engine);
  scene.collisionsEnabled = true; // fixed late-afternoon light (no day/night); sky + fog in Atmosphere.ts
  scene.skipPointerMovePicking = true; // the game picks with the camera ray only, never under the mouse

  // Lights from the palette (palette.ts): cool sky fill + warm bounce, low western sun.
  const ambient = new HemisphericLight('ambient', new Vector3(0.2, 1, 0.1), scene);
  ambient.intensity = PALETTE.ambient.intensity;
  ambient.diffuse = Color3.FromHexString(PALETTE.ambient.sky);
  ambient.groundColor = Color3.FromHexString(PALETTE.ambient.ground);
  ambient.specular = Color3.Black();
  const sun = new DirectionalLight('sun', new Vector3(...PALETTE.sun.direction), scene);
  sun.intensity = PALETTE.sun.intensity;
  sun.diffuse = Color3.FromHexString(PALETTE.sun.colour);
  sun.specular = Color3.FromHexString(PALETTE.sun.specular);

  const mats = new Map<string, StandardMaterial>();
  const mat = (hex: string): StandardMaterial => {
    let m = mats.get(hex);
    if (!m) {
      m = new StandardMaterial(`m_${hex}`, scene);
      m.diffuseColor = Color3.FromHexString(hex);
      m.specularColor = Color3.Black(); // matte, toy-like surfaces (only glass/water shine)
      mats.set(hex, m);
    }
    return m;
  };

  const solid = (name: string, size: { w: number; h: number; d: number }, pos: Vector3, colour: string, collide = true): Mesh => {
    const box = CreateBox(name, { width: size.w, height: size.h, depth: size.d }, scene);
    box.position.copyFrom(pos);
    box.material = mat(colour);
    box.checkCollisions = collide;
    return box;
  };
  /** Axis-aligned solid block from (x0,z0) to (x1,z1). */
  const block = (name: string, x0: number, x1: number, z0: number, z1: number, h: number, colour: string): Mesh =>
    solid(name, { w: x1 - x0, h, d: z1 - z0 }, new Vector3((x0 + x1) / 2, h / 2, (z0 + z1) / 2), colour);
  const flat = (name: string, x0: number, x1: number, z0: number, z1: number, y: number, colour: string): Mesh => {
    const g = CreateGround(name, { width: x1 - x0, height: z1 - z0 }, scene);
    g.position.set((x0 + x1) / 2, y, (z0 + z1) / 2);
    g.material = mat(colour);
    return g;
  };

  // ---- ground: one slab per active district (its own colour); surfaces (road, paving, grass…) lie on top.
  for (const d of data.districts) {
    if (d.status !== 'active') continue;
    const ground = flat(`ground_${d.id}`, d.rect.x0, d.rect.x1, d.rect.z0, d.rect.z1, 0, d.ground ?? PALETTE.ground);
    ground.checkCollisions = true;
  }
  const waterMat = new StandardMaterial('water', scene);
  waterMat.diffuseColor = Color3.FromHexString('#4f9ccc');
  waterMat.specularColor = new Color3(1, 0.9, 0.75);
  waterMat.specularPower = 48;
  waterMat.emissiveColor = new Color3(0.05, 0.12, 0.18);
  for (const a of data.areas) {
    if (a.mapOnly) continue;
    if (a.surface === 'water') {
      // Water: a shining sheet, and an unseen block so nobody walks (or rides) into it.
      flat(a.id, a.rect.x0, a.rect.x1, a.rect.z0, a.rect.z1, 0.02, a.colour).material = waterMat;
      const stop = block(`${a.id}_collider`, a.rect.x0, a.rect.x1, a.rect.z0, a.rect.z1, 1, '#000000');
      stop.isVisible = false;
      stop.isPickable = false;
      continue;
    }
    // Walkable areas lie outside the main ground and are the floor there (they meet it exactly at the edge).
    const f = flat(a.id, a.rect.x0, a.rect.x1, a.rect.z0, a.rect.z1, a.walkable ? 0.012 : 0.01, a.colour);
    f.checkCollisions = a.walkable;
  }

  // ---- walls and blocks (the west wall's gap and broken stretch are the ch3 photo clues)
  for (const s of data.solids) block(s.id, s.rect.x0, s.rect.x1, s.rect.z0, s.rect.z1, s.height, s.colour);

  const facades: Facade[] = [];
  const keepOuts: KeepOut[] = [];
  // ---- buildings: the facade is the rect edge facing the street; depth is the rect's x extent.
  // Facades looking north or south (the outer districts) are dressed by world/districtDressing.
  for (const b of data.buildings) {
    block(b.id, b.rect.x0, b.rect.x1, b.rect.z0, b.rect.z1, b.height, b.colour);
    if (!facesAcross(b.facing) || isTerrace(data, b)) continue; // outer districts: terrace models, not windows
    const side = facingSide(b.facing);
    const facadeX = side < 0 ? -b.rect.x1 : b.rect.x0;
    const depth = b.rect.x1 - b.rect.x0;
    facades.push({ name: b.id, side, z0: b.rect.z0, z1: b.rect.z1, height: b.height, colour: b.colour, depth, style: b.style, facadeX });
  }
  // ---- door slabs on facades (visual only; interaction uses spots)
  for (const d of data.doors) {
    if (!facesAcross(d.facing)) {
      // On a north/south facade the slab runs along X and stands just outside the wall.
      const out = d.facing === 'north' ? 1 : -1;
      solid(d.id, { w: 1.2, h: 2.2, d: 0.12 }, new Vector3(d.x, 1.1, d.z + out * 0.04), d.colour, false);
      solid(`${d.id}_frame`, { w: 1.45, h: 2.4, d: 0.08 }, new Vector3(d.x, 1.2, d.z + out * 0.01), '#efe6d8', false);
      continue;
    }
    const side = facingSide(d.facing);
    keepOuts.push({ side, x: d.x, z0: d.z - 0.85, z1: d.z + 0.85, y0: 0, y1: 2.6 });
    solid(d.id, { w: 0.12, h: 2.2, d: 1.2 }, new Vector3(d.x - side * 0.04, 1.1, d.z), d.colour, false);
    solid(`${d.id}_frame`, { w: 0.08, h: 2.4, d: 1.45 }, new Vector3(d.x - side * 0.01, 1.2, d.z), '#efe6d8', false);
  }
  /** A text sign plane; `rotY` 0 faces −Z viewers… use FACE_EAST / FACE_WEST for street facades. */
  const signAt = (name: string, text: string, pos: Vector3, rotY: number, width: number, bg: string): void => {
    const plane = CreatePlane(name, { width, height: width / 4 }, scene);
    plane.position.copyFrom(pos);
    plane.rotation.y = rotY;
    // Map data puts a sign ON its wall or gate arch: stand it a finger off, or the two surfaces fight for
    // the same depth and the lettering crawls (the district gate signs did).
    plane.position.x -= Math.sin(rotY) * SIGN_STANDOFF;
    plane.position.z -= Math.cos(rotY) * SIGN_STANDOFF;
    const tex = new DynamicTexture(`${name}_tex`, { width: 512, height: 128 }, scene, true);
    tex.anisotropicFilteringLevel = 8; // read at a slant from the street without shimmering
    tex.drawText(text, null, 86, `bold ${text.length > 12 ? 52 : 64}px sans-serif`, '#fff8ec', bg, true);
    const m = new StandardMaterial(`${name}_mat`, scene);
    m.diffuseTexture = tex;
    m.emissiveColor = new Color3(0.35, 0.35, 0.35); // readable at normal camera distance
    m.specularColor = Color3.Black();
    m.zOffset = -2; // wins the depth test against the wall right behind it, at any distance
    plane.material = m;
  };
  // ---- signs; facade signs (facing east/west) keep the dressing's windows clear around them.
  const SIGN_ROTATION = { east: FACE_EAST, west: FACE_WEST, south: 0, north: Math.PI } as const;
  for (const s of data.signs) {
    if (s.facing === 'east' || s.facing === 'west') {
      const pad = s.width / 8 + 0.15;
      keepOuts.push({ side: facingSide(s.facing), x: s.x, z0: s.z - s.width / 2 - 0.2, z1: s.z + s.width / 2 + 0.2, y0: s.y - pad, y1: s.y + pad });
    }
    signAt(s.id, s.text, new Vector3(s.x, s.y, s.z), SIGN_ROTATION[s.facing], s.width, s.background);
  }
  /** Terracotta pot with a chilli plant (green bush + red chillies): the clue for June's door. */
  const chilliPot = (name: string, x: number, z: number): void => {
    const pot = CreateCylinder(name, { height: 0.5, diameterTop: 0.55, diameterBottom: 0.4 }, scene);
    pot.position.set(x, 0.25, z);
    pot.material = mat('#b5532d');
    pot.checkCollisions = true;
    pot.metadata = { collider: 'circle' } satisfies ColliderMeta;
    const bush = CreateSphere(`${name}_bush`, { diameter: 0.6, segments: 8 }, scene);
    bush.position.set(x, 0.75, z);
    bush.material = mat('#3f7d3a');
    const CHILLIES = 9;
    const chillies: Mesh[] = [];
    for (let i = 0; i < CHILLIES; i++) {
      const a = (i / CHILLIES) * Math.PI * 2;
      const chilli = CreateSphere(`${name}_c${i}`, { diameterX: 0.12, diameterY: 0.3, diameterZ: 0.12, segments: 6 }, scene);
      chilli.position.set(x + Math.cos(a) * 0.3, 0.68 + (i % 3) * 0.12, z + Math.sin(a) * 0.3);
      chilli.material = mat('#e01f14');
      chillies.push(chilli);
    }
    Mesh.MergeMeshes(chillies, true); // one draw call per pot (they never move)
  };
  /** Dial Square's fountain: basin, water, column and bowl. */
  const fountain = (name: string, x: number, z: number): void => {
    const basin = CreateCylinder(`${name}Basin`, { height: 0.6, diameter: 5, tessellation: 32 }, scene);
    basin.position.set(x, 0.3, z);
    basin.material = mat('#9fa3a6');
    basin.checkCollisions = true;
    basin.metadata = { collider: 'circle' } satisfies ColliderMeta;
    const water = CreateCylinder(`${name}Water`, { height: 0.05, diameter: 4.5, tessellation: 32 }, scene);
    water.position.set(x, 0.58, z);
    water.material = waterMat;
    const column = CreateCylinder(`${name}Column`, { height: 1.8, diameter: 0.5 }, scene);
    column.position.set(x, 0.9, z);
    column.material = mat('#8d9194');
    const bowl = CreateCylinder(`${name}Bowl`, { height: 0.3, diameterTop: 1.6, diameterBottom: 0.6 }, scene);
    bowl.position.set(x, 1.95, z);
    bowl.material = mat('#9fa3a6');
  };
  /** Market stall: a counter under a striped awning (the stripe colour varies from stall to stall). */
  const AWNINGS = ['#c8553d', '#3f7d6b', '#d9a441', '#4a6fa5', '#8a4f7d'];
  let stalls = 0;
  const stall = (name: string, x: number, z: number): void => {
    const colour = AWNINGS[stalls++ % AWNINGS.length]!;
    solid(name, { w: 2.6, h: 0.9, d: 1.1 }, new Vector3(x, 0.45, z), '#a9825a');
    solid(`${name}_top`, { w: 2.8, h: 0.06, d: 1.3 }, new Vector3(x, 0.93, z), '#e9dcc3', false);
    for (const [px, pz] of [[-1.3, -0.6], [1.3, -0.6], [-1.3, 0.6], [1.3, 0.6]] as const) {
      solid(`${name}_post`, { w: 0.08, h: 2.4, d: 0.08 }, new Vector3(x + px, 1.2, z + pz), WOOD, false);
    }
    for (let i = 0; i < 6; i++) {
      const strip = solid(`${name}_awning${i}`, { w: 0.5, h: 0.06, d: 1.7 }, new Vector3(x - 1.25 + i * 0.5, 2.42, z), i % 2 ? '#f4efe6' : colour, false);
      strip.rotation.x = 0.12; // a slight pitch towards the front
    }
  };
  const tree = (name: string, x: number, z: number): void => {
    const trunk = CreateCylinder(`${name}_trunk`, { height: 2.2, diameter: 0.35 }, scene);
    trunk.position.set(x, 1.1, z);
    trunk.material = mat(WOOD);
    trunk.checkCollisions = true;
    trunk.metadata = { collider: 'circle' } satisfies ColliderMeta;
    const greens = ['#5d8f4a', '#6f9e52', '#4f7f42'];
    for (let i = 0; i < 3; i++) {
      const crown = CreateIcoSphere(`${name}_crown${i}`, { radius: 1.15 - i * 0.15, subdivisions: 1, flat: true }, scene);
      crown.position.set(x + (i - 1) * 0.5, 2.8 + i * 0.6, z + (i === 1 ? 0.4 : -0.25));
      crown.rotation.y = i;
      crown.material = mat(greens[i] ?? '#5d8f4a');
    }
  };

  /** Street lamp: a thin post that blocks like any other, and a glowing head (the outer districts' dressing redraws it). */
  const lampPost = (name: string, x: number, z: number): void => {
    const post = CreateCylinder(name, { height: 3.6, diameterTop: 0.1, diameterBottom: 0.18, tessellation: 10 }, scene);
    post.position.set(x, 1.8, z);
    post.material = mat('#2e3a35');
    post.checkCollisions = true;
    post.metadata = { collider: 'circle' } satisfies ColliderMeta;
    post.isPickable = false;
    const head = CreateCylinder(`${name}_head`, { height: 0.45, diameterTop: 0.2, diameterBottom: 0.42, tessellation: 8 }, scene);
    head.position.set(x, 3.75, z);
    head.material = mat('#ffe2a8');
    head.isPickable = false;
  };

  // ---- points of interest (June's chilli pots are the ch1 clue; the fountain marks Dial Square)
  for (const p of data.pois) {
    if (p.kind === 'chilli_pot') chilliPot(p.id, p.x, p.z);
    else if (p.kind === 'tree') tree(p.id, p.x, p.z);
    else if (p.kind === 'bench') solid(p.id, { w: 1.8, h: 0.5, d: 0.6 }, new Vector3(p.x, 0.25, p.z), '#7a5a3a');
    else if (p.kind === 'stall') stall(p.id, p.x, p.z);
    else if (p.kind === 'lamp') lampPost(p.id, p.x, p.z);
    else fountain(p.id, p.x, p.z);
  }

  // ---- street props (city kit): colliders now, so collisions never wait for the models. Each collider is a
  // plain placeholder block until its model arrives (TownModels hides it then) — never an invisible wall.
  // Tagged 'box' so a turned crate collides as its bounding box, not as a gate-style capsule.
  for (const p of data.props) {
    const kit = PROP_KIT[p.model];
    if (!kit.collider) continue;
    const h = Math.max(kit.h * CITY_SCALE, 0.5);
    const c = solid(propColliderName(p.id), { w: kit.w * CITY_SCALE, h, d: kit.d * CITY_SCALE }, new Vector3(p.x, h / 2, p.z), PALETTE.placeholder);
    c.rotation.y = (p.rotate * Math.PI) / 180;
    c.isPickable = false;
    c.metadata = { collider: kit.collider } satisfies ColliderMeta;
  }

  // ---- set pieces (bespoke geometry tied to the story; still placed in code — move to data with F3 props)
  // Alley arch with the yard sign, and the gate on its hinge (hinge at the south side of the alley).
  solid('alleyArch', { w: 0.3, h: 0.6, d: 3 }, new Vector3(STREET_HALF + 0.15, 3.0, 1.5), '#6d5f52', false);
  signAt('yardSign', 'CROSSING YARD', new Vector3(STREET_HALF - 0.02, 3.0, 1.5), FACE_WEST, 2.9, '#3c5a46');
  const hinge = new TransformNode('gateHinge', scene);
  hinge.position.set(6.2, 0, 0.02);
  const gatePanel = solid('gate_yard', { w: 0.12, h: 2.1, d: 2.96 }, new Vector3(0, 1.05, 1.48), '#2f3b33');
  gatePanel.metadata = { dynamicCollider: true } satisfies ColliderMeta; // swings on its hinge
  gatePanel.parent = hinge;
  for (let i = 0; i < 6; i++) {
    const bar = solid(`gateBar${i}`, { w: 0.16, h: 2.1, d: 0.06 }, new Vector3(0, 1.05, 0.25 + i * 0.5), '#b08d3c', false);
    bar.parent = hinge;
  }
  const gate = new YardGate(hinge);

  // ---- Postmark Mews entrance (west wall of Dial Square): brass gate + the three photo clues.
  const BRASS = '#b08d3c';
  const PILLAR = '#7a6a5c';
  /** Brass-barred gate panel on a hinge (closed = panel along +Z from the hinge). */
  const brassGate = (name: string, hingeAt: Vector3, faceX: number): TransformNode => {
    const hinge = new TransformNode(`${name}Hinge`, scene);
    hinge.position.copyFrom(hingeAt);
    const panel = solid(name, { w: 0.1, h: 2.2, d: 2.9 }, new Vector3(0, 1.1, 1.45), '#2b2f2c');
    panel.metadata = { dynamicCollider: true } satisfies ColliderMeta;
    panel.parent = hinge;
    for (let i = 0; i < 6; i++) {
      const bar = solid(`${name}Bar${i}`, { w: 0.14, h: 2.2, d: 0.06 }, new Vector3(faceX * 0.02, 1.1, 0.25 + i * 0.48), BRASS, false);
      bar.parent = hinge;
    }
    const rail = solid(`${name}Rail`, { w: 0.14, h: 0.1, d: 2.9 }, new Vector3(faceX * 0.02, 1.9, 1.45), BRASS, false);
    rail.parent = hinge;
    return hinge;
  };
  for (const z of [29.8, 33.2]) solid(`mewsPillar${z}`, { w: 0.6, h: 3.4, d: 0.5 }, new Vector3(WEST_WALL_X - 0.25, 1.7, z), PILLAR);
  const postmarkGate = new YardGate(brassGate('gate_postmark', new Vector3(WEST_WALL_X - 0.25, 0, 30.05), 1), -Math.PI / 2); // swings into the mews
  // Clue 1: the old enamel post sign beside the gate.
  signAt('oldPostSign', 'BELLWICK POST', new Vector3(WEST_WALL_X + 0.07, 2.05, 28.3), FACE_EAST, 2.2, '#8a4434');
  solid('oldPostSignFrame', { w: 0.04, h: 0.7, d: 2.35 }, new Vector3(WEST_WALL_X + 0.02, 2.05, 28.3), '#3d3a36', false); // behind the sign plane
  // Clue 2: the broken wall (rubble at its foot).
  for (let i = 0; i < 7; i++) {
    const r = solid(`rubble${i}`, { w: 0.35, h: 0.22, d: 0.3 }, new Vector3(WEST_WALL_X + 0.3 + (i % 3) * 0.25, 0.11 + (i > 4 ? 0.2 : 0), 34.3 + i * 0.22), WALL, false);
    r.rotation.y = i * 0.7;
  }
  // Clue 3: the leaning tree over the wall.
  const lean = new TransformNode('leaningTree', scene);
  lean.position.set(WEST_WALL_X + 1.4, 0, 35.2);
  lean.rotation.z = 0.34; // leans west, over the broken wall
  const leanTrunk = CreateCylinder('leaningTree_trunk', { height: 2.8, diameterTop: 0.22, diameterBottom: 0.38, tessellation: 8 }, scene);
  leanTrunk.parent = lean;
  leanTrunk.position.y = 1.4;
  leanTrunk.material = mat(WOOD);
  leanTrunk.checkCollisions = true;
  leanTrunk.metadata = { collider: 'circle' } satisfies ColliderMeta;
  const leanGreens = ['#5d8f4a', '#6f9e52', '#4f7f42'];
  for (let i = 0; i < 3; i++) {
    const crown = CreateIcoSphere(`leaningTree_crown${i}`, { radius: 1.1 - i * 0.15, subdivisions: 1, flat: true }, scene);
    crown.parent = lean;
    crown.position.set((i - 1) * 0.5, 3.0 + i * 0.5, i === 1 ? 0.35 : -0.25);
    crown.material = mat(leanGreens[i] ?? '#5d8f4a');
  }

  // Decoy: a similar old gate on the east wall of the square (no sign, no broken wall, an upright tree).
  for (const z of [25.9, 29.1]) solid(`eastPillar${z}`, { w: 0.5, h: 3.4, d: 0.5 }, new Vector3(EAST_WALL_X - 0.1, 1.7, z), PILLAR);
  brassGate('gate_east', new Vector3(EAST_WALL_X - 0.08, 0, 26.05), -1);

  // ---- Postmark Mews: a short walled lane behind the gate, Arthur's house at the end.
  // (Paving, walls, Arthur's house, door and sign come from dial-square.geo.json.)
  // The neighbours' table (they wait here for Arthur: the surprise).
  const table = new TransformNode('mewsTable', scene);
  table.position.set(-27, 0, 33.6);
  const top = solid('mewsTableTop', { w: 2.4, h: 0.08, d: 1.1 }, new Vector3(0, 0.78, 0), '#f4efe6');
  top.parent = table;
  const tableBlock = solid('mewsTable_collider', { w: 2.4, h: 0.8, d: 1.1 }, new Vector3(0, 0.4, 0), '#000000');
  tableBlock.parent = table;
  tableBlock.isVisible = false;
  tableBlock.isPickable = false;
  for (const [lx, lz] of [[-1.05, -0.45], [1.05, -0.45], [-1.05, 0.45], [1.05, 0.45]] as const) {
    const leg = solid('mewsTableLeg', { w: 0.08, h: 0.76, d: 0.08 }, new Vector3(lx, 0.38, lz), WOOD, false);
    leg.parent = table;
  }
  const cake = CreateCylinder('mewsCake', { height: 0.25, diameter: 0.45, tessellation: 16 }, scene);
  cake.parent = table;
  cake.position.set(0, 0.95, 0);
  cake.material = mat('#f2d7c4');
  for (const [cx, cz, colour] of [[-0.7, 0.2, '#d96c5f'], [0.7, -0.15, '#5f8fd9'], [0.45, 0.3, '#f2c14e']] as const) {
    const cup = CreateCylinder('mewsCup', { height: 0.14, diameterTop: 0.12, diameterBottom: 0.09, tessellation: 10 }, scene);
    cup.parent = table;
    cup.position.set(cx, 0.89, cz);
    cup.material = mat(colour);
  }
  /** A simple wooden chair under a seated character: seat just behind the placement, back behind that. */
  const chair = (name: string, seat: NpcPlacement): void => {
    const node = new TransformNode(name, scene);
    node.position.copyFrom(seat.position);
    node.rotation.y = seat.heading;
    const part = (n: string, size: { w: number; h: number; d: number }, x: number, y: number, z: number, collide = false): void => {
      solid(`${name}_${n}`, size, new Vector3(x, y, z), WOOD, collide).parent = node;
    };
    const c = -SEAT_BACKSET; // local −Z is behind the sitter
    part('seat', { w: CHAIR_SEAT, h: 0.06, d: CHAIR_SEAT }, 0, CHAIR_HEIGHT, c, true);
    part('back', { w: CHAIR_SEAT, h: 0.5, d: 0.05 }, 0, CHAIR_HEIGHT + 0.28, c - CHAIR_SEAT / 2 + 0.025);
    for (const [lx, lz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
      const at = CHAIR_SEAT / 2 - 0.04;
      part(`leg${lx}${lz}`, { w: 0.05, h: CHAIR_HEIGHT, d: 0.05 }, lx * at, CHAIR_HEIGHT / 2, c + lz * at);
    }
  };

  // String lights along the tops of the mews walls (kept out of the camera's way above the lane).
  const bulb = new StandardMaterial('bulb', scene);
  bulb.diffuseColor = Color3.FromHexString('#ffe6b0');
  bulb.emissiveColor = Color3.FromHexString('#ffc96b');
  const bulbs: Mesh[] = [];
  for (const z of [27.3, 35.7]) {
    for (let i = 0; i < 12; i++) {
      const b = CreateSphere('mewsBulb', { diameter: 0.16, segments: 6 }, scene);
      b.position.set(-33 + i * 1.08, 3.12 + Math.abs(Math.sin(i * 1.3)) * 0.06, z);
      b.material = bulb;
      bulbs.push(b);
    }
  }
  const lights = Mesh.MergeMeshes(bulbs, true); // 24 bulbs, one draw call
  if (lights) {
    lights.name = 'mewsBulbs';
    lights.isPickable = false;
  }

  // Copies: GameApp moves the npc_finn spot every frame (it follows Finn), so the shared data stays untouched.
  const spots: WorldSpot[] = data.spots.map((s) => ({ ...s }));
  const npcs: NpcPlacement[] = data.npcs.map((n) => ({ id: n.id, position: new Vector3(n.x, 0, n.z), heading: n.heading }));
  for (const npc of npcs) {
    // Invisible collider so the player can't walk through NPCs.
    const c = solid(`${npc.id}_collider`, { w: 0.7, h: 1.8, d: 0.7 }, npc.position.add(new Vector3(0, 0.9, 0)), '#000000');
    c.isVisible = false;
    c.metadata = { collider: 'circle' } satisfies ColliderMeta;
    c.isPickable = false;
  }

  const bounds = { minX: MIN_X, maxX: MAX_X, minZ: MIN_Z, maxZ: MAX_Z };
  dressBellwick(scene, { facadeX: STREET_HALF, facades, keepOuts, bounds, core }, mat);
  setupAtmosphere(scene, sun);

  const mews: MewsLayout = {
    arthurDoorstep: { id: 'npc_arthur', position: new Vector3(-33.5, 0, 31.5), heading: Math.PI / 2 },
    // Final picture: Arthur in the middle behind the table, neighbours either side, Alex and June in front.
    arthurSeat: { id: 'npc_arthur', position: new Vector3(-28.9, 0, 33.6), heading: Math.PI / 2 },
    playerSeat: { id: 'player', position: new Vector3(-25.9, 0, 32.1), heading: 1.25 },
    guests: [
      // Facing the gate (where they expect Arthur's surprise to come from) and the picture's camera.
      { id: 'npc_mara', position: new Vector3(-28.7, 0, 32.55), heading: 1.45 },
      { id: 'npc_finn', position: new Vector3(-28.7, 0, 34.65), heading: 1.7 },
      { id: 'npc_june', position: new Vector3(-25.9, 0, 34.9), heading: 1.9 },
    ],
    oldPhotoView: { from: new Vector3(-12.6, 1.75, 30.6), to: new Vector3(-20, 1.85, 31.6) },
    finaleView: { from: new Vector3(-21.6, 2.1, 33.4), to: new Vector3(-27.6, 1.05, 33.5) },
  };

  // Wooden chairs where the neighbours sit, and Arthur's (empty until the final picture).
  for (const [i, seat] of [...mews.guests, mews.arthurSeat].entries()) chair(`mewsChair${i}`, seat);

  // Everything built so far that never moves: frozen, so the frame does not recompute ~1000 matrices.
  freezeStaticMeshes(scene);

  return { scene, spawn: new Vector3(data.spawn.x, 0, data.spawn.z), spots, npcs, gate, postmarkGate, mews, props: data.props, bounds, core, walls: data.solids.filter((s) => s.kind === 'wall').map((s) => s.rect) };
}
