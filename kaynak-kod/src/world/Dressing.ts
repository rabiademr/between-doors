// View layer (3D): set dressing for Bellwick — windows, roofs, trims, pavements, street lamps, trees and a
// background skyline. Purely visual: nothing here is pickable or changes the play area, except a few thin
// street props (lamp posts, benches) that block the player like any other obstacle.
// Small parts are merged per material at the end, so the extra detail costs few draw calls.
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Texture } from '@babylonjs/core/Materials/Textures/texture';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder';
import { CreateCylinder } from '@babylonjs/core/Meshes/Builders/cylinderBuilder';
import { CreateGround } from '@babylonjs/core/Meshes/Builders/groundBuilder';
import { CreateIcoSphere } from '@babylonjs/core/Meshes/Builders/icoSphereBuilder';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import type { Scene } from '@babylonjs/core/scene';
import type { ColliderMeta } from './SceneColliders';

/** A street-facing building block (facade plane at x = side × facadeX). */
export interface Facade {
  name: string;
  side: -1 | 1;
  z0: number;
  z1: number;
  height: number;
  colour: string;
  /** Depth of the block behind the facade. */
  depth: number;
  style: 'house' | 'shop';
  /** Distance of the facade plane from x = 0 (default: the street's `facadeX`). */
  facadeX?: number;
}
/** Area of a facade that must stay clear (doors, signs). */
export interface KeepOut {
  side: -1 | 1;
  /** World x of the facade plane this belongs to. */
  x: number;
  z0: number;
  z1: number;
  y0: number;
  y1: number;
}
export interface DressingLayout {
  facadeX: number;
  facades: Facade[];
  keepOuts: KeepOut[];
  /** All active districts: the outer ground ring goes around this. */
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  /** The hand-built core (Indigo Row + Dial Square): pavements, kerbs, cobbles and the centre line are laid in it. */
  core: { x0: number; x1: number; z0: number; z1: number };
}

type MatFn = (hex: string) => StandardMaterial;

export function dressBellwick(scene: Scene, layout: DressingLayout, mat: MatFn): void {
  const batch = new Map<StandardMaterial, Mesh[]>();
  const add = (mesh: Mesh, material: StandardMaterial): Mesh => {
    mesh.material = material;
    mesh.isPickable = false;
    const list = batch.get(material) ?? [];
    list.push(mesh);
    batch.set(material, list);
    return mesh;
  };
  const box = (w: number, h: number, d: number, x: number, y: number, z: number, material: StandardMaterial): Mesh => {
    const b = CreateBox('dress', { width: w, height: h, depth: d }, scene);
    b.position.set(x, y, z);
    return add(b, material);
  };

  const glass = new StandardMaterial('glass', scene);
  glass.diffuseColor = Color3.FromHexString('#56708a');
  glass.specularColor = new Color3(0.9, 0.8, 0.65);
  glass.specularPower = 96;
  glass.emissiveColor = new Color3(0.1, 0.12, 0.15);
  const trim = mat('#f3ead9');

  // ---------------------------------------------------------------- facades
  /** Keep-outs belong to one facade plane: a door elsewhere at the same z must not clear windows here. */
  const onPlane = (k: KeepOut, side: number, x: number): boolean => k.side === side && Math.abs(k.x - x) < 0.6;
  const clear = (side: number, x: number, za: number, zb: number, ya: number, yb: number): boolean =>
    !layout.keepOuts.some((k) => onPlane(k, side, x) && za < k.z1 && zb > k.z0 && ya < k.y1 && yb > k.y0);

  for (const f of layout.facades) {
    const baseX = f.facadeX ?? layout.facadeX;
    const fx = f.side * baseX; // facade plane
    const out = -f.side; // unit step towards the street
    const darker = Color3.FromHexString(f.colour).scale(0.72).toHexString();
    const accent = Color3.FromHexString(f.colour).scale(0.5).toHexString();

    // Base plinth and top cornice, split around doors so they never cover them.
    const plinthH = 0.45;
    for (const [za, zb] of freeSpans(f.z0, f.z1, layout.keepOuts.filter((k) => onPlane(k, f.side, fx) && k.y0 < plinthH))) {
      box(0.1, plinthH, zb - za, fx + out * 0.05, plinthH / 2, (za + zb) / 2, mat(darker));
    }
    box(0.36, 0.28, f.z1 - f.z0 + 0.2, fx + out * 0.12, f.height - 0.14, (f.z0 + f.z1) / 2, trim);
    box(0.2, 0.12, f.z1 - f.z0, fx + out * 0.08, f.height - 0.4, (f.z0 + f.z1) / 2, mat(darker));

    // Windows: ground floor (shops get wide display windows), then upper floors every 2.1 m.
    const rows: { y: number; w: number; h: number; shutters: boolean }[] = [];
    rows.push(f.style === 'shop' ? { y: 1.35, w: 1.9, h: 1.5, shutters: false } : { y: 1.5, w: 0.95, h: 1.25, shutters: true });
    for (let y = 3.6; y + 0.8 < f.height - 0.3; y += 2.1) rows.push({ y, w: 0.95, h: 1.2, shutters: f.style === 'house' });

    for (const row of rows) {
      const pitch = row.w + 1.25;
      const usable = f.z1 - f.z0 - 1.2;
      const count = Math.max(1, Math.floor((usable + 1.25) / pitch));
      const start = (f.z0 + f.z1) / 2 - ((count - 1) * pitch) / 2;
      for (let i = 0; i < count; i++) {
        const z = start + i * pitch;
        const half = row.w / 2 + (row.shutters ? 0.5 : 0.15);
        if (!clear(f.side, fx, z - half, z + half, row.y - row.h / 2 - 0.2, row.y + row.h / 2 + 0.2)) continue;
        // frame, recessed glass, sill, lintel
        box(0.06, row.h + 0.16, row.w + 0.16, fx + out * 0.03, row.y, z, trim);
        box(0.04, row.h, row.w, fx + out * 0.065, row.y, z, glass);
        box(0.05, row.h, 0.05, fx + out * 0.09, row.y, z, trim); // mullion
        box(0.05, 0.05, row.w, fx + out * 0.09, row.y + (f.style === 'shop' && row.y < 2 ? 0.35 : 0), z, trim); // transom
        box(0.2, 0.08, row.w + 0.3, fx + out * 0.1, row.y - row.h / 2 - 0.08, z, trim);
        box(0.12, 0.14, row.w + 0.3, fx + out * 0.06, row.y + row.h / 2 + 0.12, z, mat(darker));
        if (row.shutters) {
          for (const s of [-1, 1]) box(0.05, row.h, 0.38, fx + out * 0.06, row.y, z + s * (row.w / 2 + 0.27), mat(accent));
        }
        if (f.style === 'shop' && row.y < 2) {
          // little awning over the display window
          const aw = box(0.9, 0.06, row.w + 0.4, fx + out * 0.48, row.y + row.h / 2 + 0.35, z, mat(accent));
          aw.rotation.z = f.side * 0.28;
        }
      }
    }

    // Roof: pitched for houses (ridge along the street), flat with a parapet + chimney for shops.
    const cx = f.side * (baseX + f.depth / 2);
    const len = f.z1 - f.z0;
    if (f.style === 'house') {
      const roofColour = ROOF_COLOURS[hashName(f.name) % ROOF_COLOURS.length] ?? '#9c4f36';
      const roof = prism(scene, f.depth + 0.6, Math.min(2.2, 0.28 * f.depth), len + 0.02);
      roof.position.set(cx, f.height, (f.z0 + f.z1) / 2);
      roof.material = mat(roofColour);
      roof.isPickable = false;
      // Solid only so the camera's wall check stops at the roof; the player can never reach this height.
      roof.checkCollisions = true;
      box(0.6, 1.4, 0.6, cx - f.side * 1.6, f.height + 1.2, f.z0 + len * 0.7, mat(darker));
    } else {
      box(0.25, 0.4, len, f.side * (baseX + f.depth) - f.side * 0.12, f.height + 0.2, (f.z0 + f.z1) / 2, mat(darker));
      box(1.4, 0.7, 1.2, cx + f.side * 1.5, f.height + 0.35, f.z0 + len * 0.3, mat('#8f8f8a'));
    }
  }

  // ---------------------------------------------------------------- street surfaces
  const outer = layout.bounds;
  const { z0: minZ, x1: maxX, x0: minX, z1: maxZ } = layout.core;
  // Ground beyond the walls (seen from the mews and from high camera angles): a ring around the play
  // area, so it never sits under the main ground (no overdraw, no depth fighting).
  const R = 100;
  const ring: [number, number, number, number][] = [
    [outer.minX - R, outer.maxX + R, outer.maxZ, outer.maxZ + R], // north
    [outer.minX - R, outer.maxX + R, outer.minZ - R, outer.minZ], // south
    [outer.minX - R, outer.minX, outer.minZ, outer.maxZ], // west
    [outer.maxX, outer.maxX + R, outer.minZ, outer.maxZ], // east
  ];
  for (const [x0, x1, z0, z1] of ring) {
    const g = CreateGround('groundOuter', { width: x1 - x0, height: z1 - z0 }, scene);
    g.position.set((x0 + x1) / 2, -0.02, (z0 + z1) / 2);
    g.material = mat('#a7a58e');
    g.isPickable = false;
  }
  const pavingTex = tileTexture(scene, 'pavingTex', '#d8cdb9', '#bfb29b', 4);
  const pavement = new StandardMaterial('pavement', scene);
  pavement.diffuseTexture = pavingTex;
  pavement.specularColor = Color3.Black();
  pavingTex.uScale = 2 / 2; // one 4-tile repeat per 2 m → 0.5 m slabs
  pavingTex.vScale = (22 - minZ) / 2;
  for (const s of [-1, 1]) {
    const g = CreateGround(`sidewalk_${s}`, { width: 2, height: 22 - minZ }, scene);
    g.position.set(s * 4, 0.012, (minZ + 22) / 2);
    g.material = pavement;
    g.isPickable = false;
    // curb stones
    const curb = CreateBox(`curb_${s}`, { width: 0.18, height: 0.07, depth: 22 - minZ }, scene);
    curb.position.set(s * 3.05, 0.035, (minZ + 22) / 2);
    curb.material = mat('#9a948b');
    curb.isPickable = false;
  }
  // Dial Square cobbles (replaces the flat colour of the graybox paving)
  const square = scene.getMeshByName('squarePaving');
  if (square) {
    const cobbleTex = tileTexture(scene, 'cobbleTex', '#d3c3a6', '#b3a184', 8);
    cobbleTex.uScale = (maxX - minX) / 4;
    cobbleTex.vScale = (maxZ - 22) / 4;
    const cobble = new StandardMaterial('cobble', scene);
    cobble.diffuseTexture = cobbleTex;
    cobble.specularColor = Color3.Black();
    square.material = cobble;
  }
  // dashed centre line
  for (let z = minZ + 1; z < 21; z += 3) {
    const dash = CreateGround('roadLine', { width: 0.12, height: 1.4 }, scene);
    dash.position.set(0, 0.015, z);
    add(dash, mat('#e9e2cf'));
  }

  // ---------------------------------------------------------------- street furniture
  const lampMetal = mat('#2e3a35');
  const lampGlow = new StandardMaterial('lampGlow', scene);
  lampGlow.diffuseColor = Color3.FromHexString('#ffe2a8');
  lampGlow.emissiveColor = Color3.FromHexString('#ffcf7a');
  const lamp = (x: number, z: number): void => {
    const post = CreateCylinder('lampPost', { height: 3.6, diameterTop: 0.1, diameterBottom: 0.18, tessellation: 10 }, scene);
    post.position.set(x, 1.8, z);
    post.material = lampMetal;
    post.checkCollisions = true; // thin obstacle like a real lamp post
    post.metadata = { collider: 'circle' } satisfies ColliderMeta;
    post.isPickable = false;
    box(0.3, 0.3, 0.3, x, 0.15, z, lampMetal);
    const head = CreateCylinder('lampHead', { height: 0.45, diameterTop: 0.2, diameterBottom: 0.42, tessellation: 8 }, scene);
    head.position.set(x, 3.75, z);
    add(head, lampGlow);
    box(0.5, 0.06, 0.5, x, 4.0, z, lampMetal);
  };
  // Street lamps on the curb line, clear of doors, the alley gate and Mara.
  for (const z of [-17, -6, 9, 18]) lamp(-3.35, z);
  for (const z of [-9, 10.5, 18]) lamp(3.35, z);
  // Dial Square corners (Finn's patrol band z≈25.5 and the back lane x 13–18 stay clear).
  for (const [x, z] of [[-9, 37], [9, 37], [-9, 31], [9, 31]] as const) lamp(x, z);

  const bench = (x: number, z: number, rotY: number): void => {
    const seat = CreateBox('bench', { width: 1.8, height: 0.12, depth: 0.5 }, scene);
    seat.position.set(x, 0.45, z);
    seat.rotation.y = rotY;
    seat.material = mat('#8a5f3a');
    seat.checkCollisions = true;
    seat.isPickable = false;
    const back = CreateBox('benchBack', { width: 1.8, height: 0.45, depth: 0.08 }, scene);
    back.parent = seat;
    back.position.set(0, 0.3, 0.22);
    back.material = mat('#8a5f3a');
    back.isPickable = false;
    for (const s of [-0.75, 0.75]) {
      const leg = CreateBox('benchLeg', { width: 0.08, height: 0.45, depth: 0.45 }, scene);
      leg.parent = seat;
      leg.position.set(s, -0.25, 0);
      leg.material = lampMetal;
      leg.isPickable = false;
    }
  };
  bench(-4.5, 37.6, 0);
  bench(4.5, 37.6, 0);
  bench(-14, 24.2, 0); // kept clear of the west wall (Postmark Mews entrance)

  // Flower beds around the square edge.
  const bed = (x: number, z: number, w: number, d: number): void => {
    box(w, 0.35, d, x, 0.175, z, mat('#8d8478')).checkCollisions = true;
    box(w - 0.2, 0.1, d - 0.2, x, 0.38, z, mat('#5a4434'));
    for (let i = 0; i < Math.round((w * d) / 0.5); i++) {
      const fx = x + (pseudo(i * 3.1 + x) - 0.5) * (w - 0.5);
      const fz = z + (pseudo(i * 7.7 + z) - 0.5) * (d - 0.5);
      const flower = CreateIcoSphere('flower', { radius: 0.16, subdivisions: 1, flat: true }, scene);
      flower.position.set(fx, 0.5, fz);
      add(flower, mat(FLOWER_COLOURS[i % FLOWER_COLOURS.length] ?? '#e0606a'));
    }
  };
  bed(-12.5, 38.4, 5, 2.2);
  bed(16, 36, 5, 2.4);

  // Trees: a few more for the square and yard, low-poly crowns to match the characters' style.
  for (const [x, z] of [[-17, 25], [-6, 38.2], [6, 38.2], [22, 24.5], [26, -5]] as const) lowPolyTree(scene, x, z, add, mat);

  // (The skyline behind the walls is made of Kenney models: see TownModels.ts.)

  // ---------------------------------------------------------------- merge per material
  // Solid parts stay out of the merge: a merged mesh is ONE collider the size of everything in it (two
  // flower beds at opposite ends of the square once walled off its whole north side, invisibly).
  for (const [material, all] of batch) {
    const meshes = all.filter((m) => !m.checkCollisions);
    if (meshes.length < 2) continue;
    const merged = Mesh.MergeMeshes(meshes, true, true);
    if (merged) {
      merged.name = `dress_${material.name}`;
      merged.material = material;
      merged.isPickable = false;
    }
  }
}

const ROOF_COLOURS = ['#9c4f36', '#5d6670', '#7b4a3a', '#6f7a5a'];
const FLOWER_COLOURS = ['#e0606a', '#f2c14e', '#f6f1e7', '#b06ad0'];

/** Gable-roof prism: base width `w` (X), rise `h`, length `l` along Z; origin at the middle of the eaves line. */
function prism(scene: Scene, w: number, h: number, l: number): Mesh {
  const hw = w / 2;
  const hl = l / 2;
  // two sloped faces + two gable ends, flat-shaded (separate vertices per face)
  const positions = [
    // west slope
    -hw, 0, -hl, 0, h, -hl, 0, h, hl, -hw, 0, hl,
    // east slope
    hw, 0, hl, 0, h, hl, 0, h, -hl, hw, 0, -hl,
    // south gable
    -hw, 0, -hl, hw, 0, -hl, 0, h, -hl,
    // north gable
    hw, 0, hl, -hw, 0, hl, 0, h, hl,
  ];
  const indices = [0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7, 8, 10, 9, 11, 13, 12];
  const normals: number[] = [];
  VertexData.ComputeNormals(positions, indices, normals);
  const vd = new VertexData();
  vd.positions = positions;
  vd.indices = indices;
  vd.normals = normals;
  const mesh = new Mesh('roof', scene);
  vd.applyToMesh(mesh);
  mesh.sideOrientation = Mesh.DOUBLESIDE;
  return mesh;
}

function lowPolyTree(
  scene: Scene,
  x: number,
  z: number,
  add: (m: Mesh, mat: StandardMaterial) => Mesh,
  mat: MatFn,
): void {
  const trunk = CreateCylinder('treeTrunk', { height: 2, diameterTop: 0.22, diameterBottom: 0.34, tessellation: 7 }, scene);
  trunk.position.set(x, 1, z);
  trunk.material = mat('#6b4a2f');
  trunk.checkCollisions = true;
  trunk.metadata = { collider: 'circle' } satisfies ColliderMeta;
  trunk.isPickable = false;
  const greens = ['#5d8f4a', '#6f9e52', '#4f7f42'];
  for (let i = 0; i < 3; i++) {
    const r = 0.95 - i * 0.12;
    const crown = CreateIcoSphere('treeCrown', { radius: r, subdivisions: 1, flat: true }, scene);
    crown.position.set(x + (i - 1) * 0.45, 2.5 + i * 0.55, z + (i === 1 ? 0.35 : -0.2));
    crown.rotation.y = i;
    add(crown, mat(greens[i] ?? '#5d8f4a'));
  }
}

/** Seamless square tile pattern (grout lines) for pavements. */
function tileTexture(scene: Scene, name: string, fill: string, grout: string, tiles: number): DynamicTexture {
  const size = 256;
  const tex = new DynamicTexture(name, { width: size, height: size }, scene, true);
  const ctx = tex.getContext();
  ctx.fillStyle = fill;
  ctx.fillRect(0, 0, size, size);
  const step = size / tiles;
  // subtle per-tile tone variation
  for (let i = 0; i < tiles; i++) {
    for (let j = 0; j < tiles; j++) {
      ctx.fillStyle = `rgba(0,0,0,${(pseudo(i * 13 + j * 7) * 0.06).toFixed(3)})`;
      ctx.fillRect(i * step, j * step, step, step);
    }
  }
  ctx.strokeStyle = grout;
  ctx.lineWidth = 4;
  for (let i = 0; i <= tiles; i++) {
    ctx.beginPath();
    ctx.moveTo(i * step, 0);
    ctx.lineTo(i * step, size);
    ctx.moveTo(0, i * step);
    ctx.lineTo(size, i * step);
    ctx.stroke();
  }
  tex.update(true);
  tex.wrapU = Texture.WRAP_ADDRESSMODE;
  tex.wrapV = Texture.WRAP_ADDRESSMODE;
  tex.anisotropicFilteringLevel = 8;
  return tex;
}

/** Spans of [z0, z1] not covered by any keep-out. */
function freeSpans(z0: number, z1: number, keepOuts: KeepOut[]): [number, number][] {
  const cuts = keepOuts.filter((k) => k.z1 > z0 && k.z0 < z1).sort((a, b) => a.z0 - b.z0);
  const spans: [number, number][] = [];
  let at = z0;
  for (const k of cuts) {
    if (k.z0 > at) spans.push([at, k.z0]);
    at = Math.max(at, k.z1);
  }
  if (at < z1) spans.push([at, z1]);
  return spans.filter(([a, b]) => b - a > 0.05);
}

/** Deterministic pseudo-random 0..1 (so the town looks the same every run). */
function pseudo(seed: number): number {
  const s = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

function hashName(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
  return Math.abs(h);
}
