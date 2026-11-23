import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder';
import { CreateGround } from '@babylonjs/core/Meshes/Builders/groundBuilder';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { Scene } from '@babylonjs/core/scene';
import { describe, expect, it } from 'vitest';
import { mergeByMaterial } from './modelLibrary';

const meshesOf = (root: TransformNode) => root.getChildMeshes(false).filter((m) => m.getTotalVertices() > 0);

describe('mergeByMaterial', () => {
  it('makes one mesh per material, in the same place', () => {
    const scene = new Scene(new NullEngine());
    const paint = new StandardMaterial('paint', scene);
    const glass = new StandardMaterial('glass', scene);
    const root = new TransformNode('car', scene);
    const body = CreateBox('body', { width: 2, height: 1, depth: 4 }, scene);
    const wheel = CreateBox('wheel', { size: 0.6 }, scene);
    wheel.position.set(1, -0.5, 1.5);
    const window = CreateBox('window', { size: 0.5 }, scene);
    for (const m of [body, wheel]) m.material = paint;
    window.material = glass;
    for (const m of [body, wheel, window]) m.parent = root;

    mergeByMaterial(root, 'car');
    const parts = meshesOf(root);
    expect(parts.map((m) => m.material?.name).sort()).toEqual(['glass', 'paint']);
    const merged = parts.find((m) => m.material === paint)!;
    expect(merged.parent).toBe(root);
    merged.computeWorldMatrix(true);
    merged.refreshBoundingInfo({});
    const bb = merged.getBoundingInfo().boundingBox;
    expect(bb.minimumWorld.asArray().map((v) => +v.toFixed(3))).toEqual([-1, -0.8, -2]);
    expect(bb.maximumWorld.asArray().map((v) => +v.toFixed(3))).toEqual([1.3, 0.5, 2]);
  });

  it('leaves parts it cannot merge (different vertex attributes) as they were', () => {
    const scene = new Scene(new NullEngine());
    const paint = new StandardMaterial('paint', scene);
    const root = new TransformNode('odd', scene);
    const box = CreateBox('box', {}, scene);
    const flat = CreateGround('flat', { width: 1, height: 1 }, scene);
    flat.removeVerticesData('uv'); // no UVs: MergeMeshes refuses
    for (const m of [box, flat]) {
      m.material = paint;
      m.parent = root;
    }
    expect(() => mergeByMaterial(root, 'odd')).not.toThrow();
    expect(meshesOf(root)).toHaveLength(2);
  });
});
