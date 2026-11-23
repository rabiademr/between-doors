import { describe, expect, it } from 'vitest';
import { SHOE_COLOURS, shoeBoxes, shoeColourFor } from './characterShoes';

/** A 2 m body: two leg stubs at x = ±0.2 (0.1 wide, 0.1 deep, z −0.05..0.05) and a head on top. */
const body = (): number[] => {
  const p: number[] = [];
  for (const side of [-1, 1]) {
    for (const dx of [-0.05, 0.05]) for (const dz of [-0.05, 0.05]) for (const y of [0, 0.05, 0.9]) p.push(side * 0.2 + dx, y, dz);
  }
  p.push(0, 2, 0);
  return p;
};

describe('shoeBoxes', () => {
  it('builds one shoe round each leg stub, standing on the same ground', () => {
    const boxes = shoeBoxes(body(), 1);
    expect(boxes).not.toBeNull();
    if (!boxes) return;
    for (const [b, centre] of [
      [boxes.negative, -0.2],
      [boxes.positive, 0.2],
    ] as const) {
      expect((b.x0 + b.x1) / 2).toBeCloseTo(centre);
      expect(b.x1 - b.x0).toBeGreaterThan(0.1); // wider than the stub
      expect(b.y0).toBe(0); // never below the feet: the model's height and footing stay as they were
      expect(b.y1).toBeCloseTo(0.12);
    }
    expect(boxes.negative.x1).toBeLessThan(boxes.positive.x0); // the two never merge
  });

  it('points the toes the way the body faces', () => {
    const front = shoeBoxes(body(), 1);
    const back = shoeBoxes(body(), -1);
    expect(front?.positive.z1).toBeGreaterThan(0.1);
    expect(front?.positive.z0).toBeGreaterThan(-0.1);
    expect(back?.positive.z0).toBeLessThan(-0.1);
    expect(back?.positive.z1).toBeLessThan(0.1);
  });

  it('gives up on a shape without two legs', () => {
    expect(shoeBoxes([0, 0, 0, 0, 1, 0], 1)).toBeNull();
    expect(shoeBoxes([], 1)).toBeNull();
  });
});

describe('shoeColourFor', () => {
  it('always gives the same character the same colour, and the town more than one', () => {
    const ids = ['models/chars/courier.glb', 'models/chars/mara.glb', 'models/chars/casual_f.glb', 'models/chars/suit_m.glb', 'models/chars/chef_f.glb'];
    for (const id of ids) {
      expect(shoeColourFor(id)).toBe(shoeColourFor(id));
      expect(SHOE_COLOURS).toContain(shoeColourFor(id));
    }
    expect(new Set(ids.map(shoeColourFor)).size).toBeGreaterThan(1);
  });
});
