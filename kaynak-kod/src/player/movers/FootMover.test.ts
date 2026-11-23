import { describe, expect, it } from 'vitest';
import { CollisionWorld } from '../../domain/collision/CollisionWorld';
import { RUN_SPEED, WALK_SPEED } from '../movement';
import { FOOT_RADIUS, FootMover } from './FootMover';

// Camera alpha −π/2 sits south of the player looking north, so "forward" = +Z.
const NORTH = -Math.PI / 2;
const still = { x: 0, z: 0, heading: 0, speed: 0 };

describe('FootMover', () => {
  it('walks forward at walk speed and runs faster', () => {
    const m = new FootMover();
    const collisions = new CollisionWorld();
    const walk = m.step(still, { input: { forward: 1, right: 0, run: false }, cameraAlpha: NORTH, dt: 0.1, collisions });
    expect(walk.z).toBeCloseTo(WALK_SPEED * 0.1);
    expect(walk.speed).toBeCloseTo(WALK_SPEED);
    const run = m.step(still, { input: { forward: 1, right: 0, run: true }, cameraAlpha: NORTH, dt: 0.1, collisions });
    expect(run.speed).toBeCloseTo(RUN_SPEED);
  });

  it('applies the Steady Pace multiplier to running only', () => {
    const m = new FootMover();
    m.runMultiplier = 1.1;
    const collisions = new CollisionWorld();
    const run = m.step(still, { input: { forward: 1, right: 0, run: true }, cameraAlpha: NORTH, dt: 0.1, collisions });
    expect(run.speed).toBeCloseTo(RUN_SPEED * 1.1);
  });

  it('reports the real speed when a wall stops it (animation goes idle)', () => {
    const collisions = new CollisionWorld();
    collisions.addStatic({ shape: { kind: 'box', x0: -5, x1: 5, z0: FOOT_RADIUS, z1: 1 } });
    const s = new FootMover().step(still, { input: { forward: 1, right: 0, run: false }, cameraAlpha: NORTH, dt: 0.1, collisions });
    expect(s.z).toBeCloseTo(0);
    expect(s.speed).toBeCloseTo(0);
  });

  it('turns toward the movement direction gradually and keeps heading when idle', () => {
    const m = new FootMover();
    const collisions = new CollisionWorld();
    const s = m.step(still, { input: { forward: 0, right: 1, run: false }, cameraAlpha: NORTH, dt: 0.05, collisions });
    expect(s.heading).toBeGreaterThan(0);
    expect(s.heading).toBeLessThan(Math.PI / 2);
    const idle = m.step(s, { input: { forward: 0, right: 0, run: false }, cameraAlpha: NORTH, dt: 0.05, collisions });
    expect(idle.heading).toBe(s.heading);
    expect(idle.speed).toBe(0);
  });
});
