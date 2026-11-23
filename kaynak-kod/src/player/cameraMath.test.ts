import { describe, expect, it } from 'vitest';
import { BETA_MAX, BETA_MIN, OCCLUDED_MIN, WALL_MARGIN, applyLook, behindAlpha, cameraDistance, cameraHeadingDeg, cameraOffsetDir, compassDirection, easeAngle, facingBearingDeg, orbitFromView, windOf } from './cameraMath';
import { cameraForward } from './movement';

describe('compassDirection', () => {
  it('maps camera heading to N/E/S/W', () => {
    expect(compassDirection(-Math.PI / 2)).toBe('N'); // default camera looks toward +Z
    expect(compassDirection(Math.PI)).toBe('E'); // camera on −X side looks toward +X
    expect(compassDirection(Math.PI / 2)).toBe('S');
    expect(compassDirection(0)).toBe('W');
    expect(compassDirection(-Math.PI / 4)).toBe('NW');
  });
  it('windOf rounds a bearing to the nearest wind, any turn count', () => {
    expect(windOf(0)).toBe('N');
    expect(windOf(22)).toBe('N');
    expect(windOf(23)).toBe('NE');
    expect(windOf(359)).toBe('N');
    expect(windOf(-90)).toBe('W');
    expect(windOf(720 + 135)).toBe('SE');
  });
});

describe('cameraHeadingDeg / facingBearingDeg', () => {
  it('gives the bearing the camera looks toward (0 = north, clockwise)', () => {
    expect(cameraHeadingDeg(-Math.PI / 2)).toBeCloseTo(0);
    expect(cameraHeadingDeg(Math.PI)).toBeCloseTo(90);
    expect(cameraHeadingDeg(Math.PI / 2)).toBeCloseTo(180);
    expect(cameraHeadingDeg(0)).toBeCloseTo(270);
  });
  it('stays in [0, 360) for any number of turns', () => {
    for (const a of [-20, -7.3, 0.001, 9.9, 31.4]) {
      const d = cameraHeadingDeg(a);
      expect(d).toBeGreaterThanOrEqual(0);
      expect(d).toBeLessThan(360);
    }
  });
  it('matches the camera bearing when the camera is straight behind the character', () => {
    for (const heading of [0, 0.7, -2.1, Math.PI]) {
      expect(facingBearingDeg(heading)).toBeCloseTo(cameraHeadingDeg(behindAlpha(heading)));
    }
    expect(facingBearingDeg(Math.PI / 2)).toBeCloseTo(90); // rotation.y +90° faces +X = east
  });
});

describe('applyLook', () => {
  it('mouse right turns the view right (heading moves clockwise toward East)', () => {
    const start = -Math.PI / 2; // looking North
    const { alpha } = applyLook(start, 1.1, 500, 0, 1); // ≈63° right
    expect(compassDirection(alpha)).not.toBe('N');
    expect(['NE', 'E']).toContain(compassDirection(alpha));
  });
  it('pitch is clamped; sensitivity scales the turn', () => {
    expect(applyLook(0, 1.1, 0, -100000, 1).beta).toBe(BETA_MAX);
    expect(applyLook(0, 1.1, 0, 100000, 1).beta).toBe(BETA_MIN);
    const slow = applyLook(0, 1.1, 100, 0, 0.5).alpha;
    const fast = applyLook(0, 1.1, 100, 0, 1).alpha;
    expect(Math.abs(slow)).toBeCloseTo(Math.abs(fast) / 2);
  });
});

describe('cameraDistance', () => {
  it('uses preferred zoom when nothing blocks', () => {
    expect(cameraDistance(7, null)).toBe(7);
    expect(cameraDistance(7, 20)).toBe(7);
  });
  it('moves in front of a wall between player and camera', () => {
    expect(cameraDistance(7, 4)).toBeCloseTo(4 - WALL_MARGIN);
  });
  it('never goes inside the character', () => {
    expect(cameraDistance(7, 0.2)).toBe(OCCLUDED_MIN);
  });
});

describe('orbitFromView (fixed scene shots)', () => {
  it('puts the camera back at `from`, looking at `to`', () => {
    const from = { x: 3, y: 4, z: -7 };
    const to = { x: -1, y: 1.5, z: 2 };
    const o = orbitFromView(from, to);
    const d = cameraOffsetDir(o.alpha, o.beta);
    expect(to.x + d.x * o.radius).toBeCloseTo(from.x, 6);
    expect(to.y + d.y * o.radius).toBeCloseTo(from.y, 6);
    expect(to.z + d.z * o.radius).toBeCloseTo(from.z, 6);
  });

  it('a camera on the spot it looks at has no distance', () => {
    expect(orbitFromView({ x: 1, y: 1, z: 1 }, { x: 1, y: 1, z: 1 }).radius).toBe(0);
  });
});

describe('cameraOffsetDir', () => {
  it('default camera (alpha −π/2) sits behind the player on −Z', () => {
    const d = cameraOffsetDir(-Math.PI / 2, Math.PI / 2);
    expect(d.x).toBeCloseTo(0);
    expect(d.z).toBeCloseTo(-1);
  });
});

describe('vehicle follow camera', () => {
  it('puts the camera behind the heading (camera forward = heading direction)', () => {
    for (const h of [0, Math.PI / 2, -2, 3]) {
      const f = cameraForward(behindAlpha(h));
      expect(f.x).toBeCloseTo(Math.sin(h));
      expect(f.z).toBeCloseTo(Math.cos(h));
    }
  });

  it('eases along the shortest way and converges', () => {
    const a = easeAngle(3, -3, 5, 0.1); // across ±π: should increase past π, not swing the long way
    expect(a).toBeGreaterThan(3);
    let x = 0;
    for (let i = 0; i < 120; i++) x = easeAngle(x, 1, 5, 1 / 60);
    expect(x).toBeCloseTo(1, 3);
    expect(easeAngle(0.5, 1, 5, 0)).toBe(0.5);
  });
});
