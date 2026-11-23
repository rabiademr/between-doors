// Model: pure waypoint following for NPCs (no physics, no path-finding — routes are hand-made polylines).
// No Babylon, no DOM. Views import it through world/waypoints.ts.

export interface Point2 {
  x: number;
  z: number;
}

export interface FollowState {
  x: number;
  z: number;
  /** Index of the waypoint we are walking TO. */
  next: number;
  done: boolean;
}

/**
 * Move along `route` by speed·dt. Carries leftover distance across waypoints so speed is exact.
 * With `loop`, wraps from the last waypoint back to the first (patrol).
 */
export function followRoute(s: FollowState, route: readonly Point2[], speed: number, dt: number, loop = false): FollowState {
  if (s.done || route.length === 0) return s;
  let { x, z, next } = s;
  let budget = Math.max(0, speed * dt);
  // Guard: a route of overlapping points must not spin forever.
  for (let guard = 0; budget > 0 && guard < 4 * route.length + 4; guard++) {
    const target = route[next];
    if (!target) return { x, z, next, done: true };
    const dx = target.x - x;
    const dz = target.z - z;
    const dist = Math.hypot(dx, dz);
    if (dist > budget) {
      x += (dx / dist) * budget;
      z += (dz / dist) * budget;
      budget = 0;
    } else {
      x = target.x;
      z = target.z;
      budget -= dist;
      next += 1;
      if (next >= route.length) {
        if (!loop) return { x, z, next: route.length - 1, done: true };
        next = 0;
      }
    }
  }
  return { x, z, next, done: false };
}

/** Yaw that faces from `a` toward `b` (rotation.y; 0 = +Z). */
export function headingBetween(a: Point2, b: Point2): number {
  return Math.atan2(b.x - a.x, b.z - a.z);
}
