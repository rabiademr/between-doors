// The collider shapes measured from scene meshes (headless engine).
import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder';
import { Scene } from '@babylonjs/core/scene';
import { describe, expect, it } from 'vitest';
import { measure } from './SceneColliders';

/** A van-sized box (2 m wide, 4.6 m long) at `heading`, tagged like ParkedVehicles' collider unless `meta` says otherwise. */
function vanAt(heading: number, meta: object = { collider: 'box' }) {
  const scene = new Scene(new NullEngine());
  const box = CreateBox('van', { width: 2, height: 1.6, depth: 4.6 }, scene);
  box.position.set(10, 0.8, 20);
  box.rotation.y = heading;
  box.metadata = meta;
  return measure(box);
}

const lengthOf = (s: ReturnType<typeof measure>): number => {
  if (s?.kind !== 'capsule') throw new Error(`expected a capsule, got ${s?.kind}`);
  return Math.hypot(s.bx - s.ax, s.bz - s.az) + 2 * s.r;
};

describe('measure', () => {
  it('a box parked straight is its exact box', () => {
    expect(vanAt(0)).toMatchObject({ kind: 'box', x0: 9, x1: 11 });
  });

  it('a box parked at an angle stays within its own length (no invisible wall past the bumpers)', () => {
    const shape = vanAt(Math.PI / 4);
    expect(shape?.kind).toBe('capsule');
    expect(lengthOf(shape)).toBeCloseTo(4.6, 5);
    if (shape?.kind === 'capsule') expect(shape.r).toBeCloseTo(1, 5);
  });

  it('an untagged turned panel keeps its full length (gates)', () => {
    expect(lengthOf(vanAt(Math.PI / 4, {}))).toBeCloseTo(4.6 + 2, 5);
  });
});
