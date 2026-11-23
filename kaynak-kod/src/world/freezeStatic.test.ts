import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder';
import { CreateSphere } from '@babylonjs/core/Meshes/Builders/sphereBuilder';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { Scene } from '@babylonjs/core/scene';
import { describe, expect, it } from 'vitest';
import { freezeStaticMeshes } from './freezeStatic';

describe('freezeStaticMeshes', () => {
  it('freezes standing scenery only: not the sky, billboards, moving colliders or hinged parts', () => {
    const scene = new Scene(new NullEngine());
    const wall = CreateBox('wall', {}, scene);
    const sky = CreateSphere('sky', {}, scene);
    sky.infiniteDistance = true;
    const sign = CreateBox('sign', {}, scene);
    sign.billboardMode = Mesh.BILLBOARDMODE_ALL;
    const npc = CreateBox('npc_collider', {}, scene);
    npc.metadata = { dynamicCollider: true };
    const hinge = new TransformNode('hinge', scene);
    const bar = CreateBox('bar', {}, scene);
    bar.parent = hinge;

    expect(freezeStaticMeshes(scene)).toBe(1);
    expect(wall.isWorldMatrixFrozen).toBe(true);
    for (const m of [sky, sign, npc, bar]) expect(m.isWorldMatrixFrozen, m.name).toBe(false);
  });
});
