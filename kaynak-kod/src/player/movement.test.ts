import { describe, expect, it } from 'vitest';
import {
  MAX_FRAME_SECONDS,
  RUN_SPEED,
  WALK_SPEED,
  computeDisplacement,
  headingFor,
  turnToward,
} from './movement';

const BEHIND = -Math.PI / 2; // default camera: behind the player, looking toward +Z
const still = { forward: 0, right: 0, run: false };

describe('movement', () => {
  it('W moves away from the camera (+Z for default camera)', () => {
    const d = computeDisplacement({ ...still, forward: 1 }, BEHIND, 1);
    expect(d.x).toBeCloseTo(0);
    expect(d.z).toBeCloseTo(MAX_FRAME_SECONDS * WALK_SPEED);
  });

  it('D moves to the camera\'s right (+X for default camera)', () => {
    const d = computeDisplacement({ ...still, right: 1 }, BEHIND, 0.05);
    expect(d.x).toBeCloseTo(0.05 * WALK_SPEED);
    expect(d.z).toBeCloseTo(0);
  });

  it('is camera-relative: camera rotated 90° turns W into a different world direction', () => {
    const d = computeDisplacement({ ...still, forward: 1 }, 0, 0.05); // camera on +X side
    expect(d.x).toBeCloseTo(-0.05 * WALK_SPEED);
    expect(d.z).toBeCloseTo(0);
  });

  it('diagonal is not faster than straight', () => {
    const d = computeDisplacement({ forward: 1, right: 1, run: false }, BEHIND, 0.05);
    expect(Math.hypot(d.x, d.z)).toBeCloseTo(0.05 * WALK_SPEED);
  });

  it('run uses run speed and the upgrade multiplier (Steady Pace +10%)', () => {
    const d = computeDisplacement({ forward: 1, right: 0, run: true }, BEHIND, 0.05, 1.1);
    expect(Math.hypot(d.x, d.z)).toBeCloseTo(0.05 * RUN_SPEED * 1.1);
  });

  it('no input → no movement; huge frame time is clamped', () => {
    expect(computeDisplacement(still, BEHIND, 0.05)).toEqual({ x: 0, z: 0 });
    const d = computeDisplacement({ ...still, forward: 1 }, BEHIND, 5);
    expect(Math.hypot(d.x, d.z)).toBeCloseTo(MAX_FRAME_SECONDS * WALK_SPEED);
  });

  it('heading faces the movement direction', () => {
    expect(headingFor({ x: 0, z: 1 })).toBeCloseTo(0);
    expect(headingFor({ x: 1, z: 0 })).toBeCloseTo(Math.PI / 2);
  });

  it('turnToward takes the shortest way around and stops at target', () => {
    expect(turnToward(3, -3, 0.1)).toBeCloseTo(3.1); // across ±π, not the long way
    expect(turnToward(0, 0.05, 0.1)).toBe(0.05);
  });
});
