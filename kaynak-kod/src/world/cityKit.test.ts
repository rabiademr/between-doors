import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ARTHUR_CAMEO } from '../content/chapters';
import { FINN_PATROL, FINN_ROUTES } from '../content/waypointRoutes';
import { BELLWICK } from '../content/world';
import type { Prop } from '../domain/world/worldData';
import { BUILDING_DEPTH, BUILDING_OVERHANG, BUILDINGS, CITY_SCALE, PROP_KIT } from './cityKit';

/** Bounding box of a GLB in model units (node translations applied; the city kit has no node rotation/scale). */
function glbBounds(asset: string): { w: number; d: number; h: number; minZ: number; maxZ: number } {
  const buf = readFileSync(`src/assets/${asset}`);
  const jsonLength = new DataView(buf.buffer, buf.byteOffset, buf.byteLength).getUint32(12, true); // GLB chunk 0 = JSON
  const json = JSON.parse(new TextDecoder().decode(buf.subarray(20, 20 + jsonLength))) as {
    nodes: { mesh?: number; translation?: number[]; rotation?: number[]; scale?: number[] }[];
    meshes: { primitives: { attributes: { POSITION: number } }[] }[];
    accessors: { min: number[]; max: number[] }[];
  };
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const n of json.nodes) {
    if (n.mesh === undefined) continue;
    expect(n.rotation ?? n.scale, asset).toBeUndefined();
    const t = n.translation ?? [0, 0, 0];
    for (const p of json.meshes[n.mesh]!.primitives) {
      const a = json.accessors[p.attributes.POSITION]!;
      for (let i = 0; i < 3; i++) {
        min[i] = Math.min(min[i]!, a.min[i]! + t[i]!);
        max[i] = Math.max(max[i]!, a.max[i]! + t[i]!);
      }
    }
  }
  return { w: max[0]! - min[0]!, h: max[1]! - min[1]!, d: max[2]! - min[2]!, minZ: min[2]!, maxZ: max[2]! };
}

/** Distance (m) from a point to a prop's footprint rectangle (its collider), honouring its yaw. */
function distToProp(p: Prop, x: number, z: number): number {
  const kit = PROP_KIT[p.model];
  const yaw = (p.rotate * Math.PI) / 180;
  const dx = x - p.x;
  const dz = z - p.z;
  // World → model frame (model +X = (cos, −sin), +Z = (sin, cos) for Babylon's rotation.y).
  const lx = dx * Math.cos(yaw) - dz * Math.sin(yaw);
  const lz = dx * Math.sin(yaw) + dz * Math.cos(yaw);
  const ox = Math.max(0, Math.abs(lx) - (kit.w * CITY_SCALE) / 2);
  const oz = Math.max(0, Math.abs(lz) - (kit.d * CITY_SCALE) / 2);
  return Math.hypot(ox, oz);
}

/** Closest a walked segment gets to a prop (sampled every 5 cm). */
function distAlong(p: Prop, a: { x: number; z: number }, b: { x: number; z: number }): number {
  const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.05));
  let best = Infinity;
  for (let i = 0; i <= steps; i++) best = Math.min(best, distToProp(p, a.x + ((b.x - a.x) * i) / steps, a.z + ((b.z - a.z) * i) / steps));
  return best;
}

describe('city kit sizes', () => {
  it('match the GLB models (colliders and terrace layout depend on them)', () => {
    for (const [model, kit] of Object.entries(PROP_KIT)) {
      const b = glbBounds(kit.asset);
      for (const k of ['w', 'd', 'h'] as const) expect(Math.abs(b[k] - kit[k]), `${model}.${k} (glb ${b[k].toFixed(3)})`).toBeLessThan(0.015);
    }
    for (const [model, kit] of Object.entries(BUILDINGS)) {
      const b = glbBounds(kit.asset);
      expect(Math.abs(b.w - kit.w), `${model}.w`).toBeLessThan(0.015);
      // Body centred on the origin; anything beyond it at the front is the overhang (steps, awnings).
      expect(Math.abs(-b.minZ - BUILDING_DEPTH / 2), `${model} back`).toBeLessThan(0.015);
      expect(b.maxZ - BUILDING_DEPTH / 2, `${model} overhang`).toBeLessThan(BUILDING_OVERHANG + 0.015);
    }
  });
});

describe('Bellwick street props', () => {
  const props = BELLWICK.props;
  it('keep their footprint at least 1 m from doors, interaction spots, NPCs and the spawn', () => {
    for (const p of props) {
      for (const s of BELLWICK.spots) expect(distToProp(p, s.x, s.z), `${p.id} near ${s.id}`).toBeGreaterThan(1);
      for (const d of BELLWICK.doors) expect(distToProp(p, d.x, d.z), `${p.id} near ${d.id}`).toBeGreaterThan(1);
      for (const n of BELLWICK.npcs) expect(distToProp(p, n.x, n.z), `${p.id} near ${n.id}`).toBeGreaterThan(1);
      expect(distToProp(p, BELLWICK.spawn.x, BELLWICK.spawn.z), `${p.id} near spawn`).toBeGreaterThan(1.5);
    }
  });
  it('stay clear of routes walked without collisions (Finn from either end of his patrol, street Arthur)', () => {
    const routes = [
      FINN_PATROL,
      ...FINN_PATROL.flatMap((start) => Object.values(FINN_ROUTES).map((r) => [start, ...r])),
      ARTHUR_CAMEO.exitRoute,
    ];
    for (const route of routes) {
      for (let i = 1; i < route.length; i++) {
        for (const p of props) expect(distAlong(p, route[i - 1]!, route[i]!), `${p.id} on route`).toBeGreaterThan(0.8);
      }
    }
  });
  it('stand on the ground inside the play area', () => {
    const b = BELLWICK.bounds;
    for (const p of props) {
      const inside = p.x > b.minX && p.x < b.maxX && p.z > b.minZ && p.z < b.maxZ;
      expect(inside, p.id).toBe(true);
    }
  });
});
