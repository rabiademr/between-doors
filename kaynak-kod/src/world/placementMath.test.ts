import { describe, expect, it } from 'vitest';
import { footprintOrigin } from './placementMath';

/** Where a model-space point ends up for a given origin, scale and yaw (Babylon rotation.y). */
function world(origin: { x: number; z: number }, local: { x: number; z: number }, scale: { x: number; z: number }, rotY: number) {
  const lx = local.x * scale.x;
  const lz = local.z * scale.z;
  return { x: origin.x + lx * Math.cos(rotY) + lz * Math.sin(rotY), z: origin.z - lx * Math.sin(rotY) + lz * Math.cos(rotY) };
}

describe('footprintOrigin', () => {
  const centre = { x: 0.3, z: -0.7 };
  const scale = { x: 4.5, z: 2 };
  for (const deg of [0, 90, 180, 270, 25]) {
    it(`puts the footprint centre on the target at ${deg}°`, () => {
      const rotY = (deg * Math.PI) / 180;
      const o = footprintOrigin(10, -4, centre, scale, rotY);
      const c = world(o, centre, scale, rotY);
      expect(c.x).toBeCloseTo(10);
      expect(c.z).toBeCloseTo(-4);
    });
  }
  it('is the target itself for a centred model', () => {
    expect(footprintOrigin(3, 5, { x: 0, z: 0 }, { x: 2, z: 2 }, 1.1)).toEqual({ x: 3, z: 5 });
  });
});
