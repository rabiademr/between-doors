import { describe, expect, it } from 'vitest';
import { followRoute, headingBetween, type FollowState } from './waypoints';

const route = [
  { x: 0, z: 0 },
  { x: 0, z: 10 },
  { x: 10, z: 10 },
];

describe('followRoute', () => {
  it('moves at exact speed and turns the corner without losing distance', () => {
    let s: FollowState = { x: 0, z: 0, next: 1, done: false };
    s = followRoute(s, route, 2, 6); // 12 m: 10 up, 2 right
    expect(s.x).toBeCloseTo(2);
    expect(s.z).toBeCloseTo(10);
    expect(s.next).toBe(2);
    expect(s.done).toBe(false);
  });

  it('stops at the end and stays there (Finn waits)', () => {
    let s: FollowState = { x: 0, z: 0, next: 1, done: false };
    s = followRoute(s, route, 2, 100);
    expect(s).toEqual({ x: 10, z: 10, next: 2, done: true });
    expect(followRoute(s, route, 2, 1)).toBe(s);
  });

  it('loops for patrols', () => {
    const patrol = [
      { x: 0, z: 0 },
      { x: 4, z: 0 },
    ];
    let s: FollowState = { x: 0, z: 0, next: 1, done: false };
    s = followRoute(s, patrol, 1, 6, true); // 4 out, 2 back toward first point
    expect(s.x).toBeCloseTo(2);
    expect(s.next).toBe(0); // heading back to the first point
    expect(s.done).toBe(false);
  });

  it('degenerate route (overlapping points) terminates', () => {
    const same = [{ x: 1, z: 1 }, { x: 1, z: 1 }];
    const s = followRoute({ x: 1, z: 1, next: 0, done: false }, same, 5, 1, true);
    expect(s.x).toBe(1);
  });

  it('heading points from a to b', () => {
    expect(headingBetween({ x: 0, z: 0 }, { x: 0, z: 1 })).toBeCloseTo(0);
    expect(headingBetween({ x: 0, z: 0 }, { x: 1, z: 0 })).toBeCloseTo(Math.PI / 2);
  });
});
