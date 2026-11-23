// Smoke test: the outer districts' dressing builds on a headless engine (no WorldBuilder meshes, a stub
// model library), so a broken shape or id rule fails here instead of silently in the town loader.
import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { VertexBuffer } from '@babylonjs/core/Buffers/buffer';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { Scene } from '@babylonjs/core/scene';
import { describe, expect, it } from 'vitest';
import { BELLWICK, coreRect } from '../content/world';
import { dressDistricts } from './districtDressing';
import { OUTER_DISTRICTS } from './districtLayout';
import type { ModelLibrary, Placement } from './modelLibrary';

describe('dressDistricts', () => {
  it('bakes a ground and a dressing mesh per outer district and asks for the models', async () => {
    const engine = new NullEngine();
    const scene = new Scene(engine);
    const placed: Placement[] = [];
    const lib = {
      bounds: () => Promise.resolve({ minX: -0.25, maxX: 0.25, minY: 0, minZ: -0.25, maxZ: 0.25 }),
      place: (p: Placement) => {
        placed.push(p);
        return Promise.resolve(new TransformNode('stub', scene));
      },
    } as unknown as ModelLibrary;
    const c = coreRect(BELLWICK);
    const walls = BELLWICK.solids.filter((s) => s.kind === 'wall').map((s) => s.rect);
    const jobs = dressDistricts(scene, lib, { core: { minX: c.x0, maxX: c.x1, minZ: c.z0, maxZ: c.z1 }, walls, material: (m) => m });
    await Promise.all(jobs);

    for (const id of OUTER_DISTRICTS) {
      for (const name of [`ground_district_${id}`, `district_${id}_dress`, `district_${id}_glow`]) {
        const mesh = scene.getMeshByName(name);
        expect(mesh, name).not.toBeNull();
        const positions = mesh!.getVerticesData(VertexBuffer.PositionKind)!;
        const colours = mesh!.getVerticesData(VertexBuffer.ColorKind)!;
        expect(positions.length).toBeGreaterThan(0);
        expect(colours.length / 4).toBe(positions.length / 3);
        expect(positions.every((v) => Number.isFinite(v)), `${name} positions`).toBe(true);
        expect(mesh!.getVerticesData(VertexBuffer.NormalKind)!.every((v) => Number.isFinite(v)), `${name} normals`).toBe(true);
        // Everything stays inside its district (plus a little overhang) and near the ground.
        const d = BELLWICK.districts.find((x) => x.id === id)!.rect;
        for (let i = 0; i < positions.length; i += 3) {
          if (positions[i]! < d.x0 - 2 || positions[i]! > d.x1 + 2 || positions[i + 2]! < d.z0 - 2 || positions[i + 2]! > d.z1 + 2 || positions[i + 1]! < -0.5 || positions[i + 1]! > 25) {
            throw new Error(`${name}: vertex out of range (${positions[i]}, ${positions[i + 1]}, ${positions[i + 2]})`);
          }
        }
      }
    }
    // Terraces, café parasols and the water tower were requested; the core's terraces got colliders.
    expect(placed.filter((p) => p.asset.includes('/city/building-')).length).toBeGreaterThan(60);
    expect(placed.some((p) => p.asset.endsWith('watertower.glb'))).toBe(true);
    expect(placed.some((p) => p.asset.includes('parasol'))).toBe(true);
    expect(scene.meshes.filter((m) => m.name.startsWith('coreTerrace') && m.checkCollisions && !m.isVisible).length).toBeGreaterThan(10);
    scene.dispose();
    engine.dispose();
  });
});
