// Model: pure "can a character stand / walk here?" geometry for hand-made NPC routes. No Babylon, no DOM.
// Used by content tests to prove that every route stays on open ground and out of keep-out zones; the
// game itself never path-finds (routes are authored), so this does not run per frame.
import type { Rect } from '../world/worldData';
import type { Point2 } from './waypoints';

export interface Circle {
  x: number;
  z: number;
  r: number;
}

export interface Obstacles {
  /** Solid boxes (buildings, blocks, walls, cars…). */
  rects: readonly Rect[];
  /** Solid round things (the fountain, trunks, lamp posts…). */
  circles: readonly Circle[];
  /** Everything must stay inside this. */
  bounds: Rect;
}

/** Distance from a point to a rectangle (0 inside). */
export function distanceToRect(p: Point2, r: Rect): number {
  const dx = Math.max(r.x0 - p.x, 0, p.x - r.x1);
  const dz = Math.max(r.z0 - p.z, 0, p.z - r.z1);
  return Math.hypot(dx, dz);
}

/** True if a body of radius `clearance` fits at `p`: inside the bounds and touching no obstacle. */
export function isWalkable(p: Point2, o: Obstacles, clearance: number): boolean {
  const b = o.bounds;
  if (p.x < b.x0 + clearance || p.x > b.x1 - clearance || p.z < b.z0 + clearance || p.z > b.z1 - clearance) return false;
  for (const r of o.rects) if (distanceToRect(p, r) < clearance) return false;
  for (const c of o.circles) if (Math.hypot(p.x - c.x, p.z - c.z) < c.r + clearance) return false;
  return true;
}

/** Points every `spacing` metres along a→b, both ends included. */
export function samplesAlong(a: Point2, b: Point2, spacing = 0.25): Point2[] {
  const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / spacing));
  return Array.from({ length: n + 1 }, (_, i) => ({ x: a.x + ((b.x - a.x) * i) / n, z: a.z + ((b.z - a.z) * i) / n }));
}

/** The first point of a→b where a body of radius `clearance` does not fit, or null if the stretch is clear. */
export function firstBlocked(a: Point2, b: Point2, o: Obstacles, clearance: number): Point2 | null {
  return samplesAlong(a, b).find((p) => !isWalkable(p, o, clearance)) ?? null;
}

/** Distance from `p` to the segment a→b. */
export function distanceToSegment(p: Point2, a: Point2, b: Point2): number {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const len2 = dx * dx + dz * dz;
  const t = len2 > 0 ? Math.min(1, Math.max(0, ((p.x - a.x) * dx + (p.z - a.z) * dz) / len2)) : 0;
  return Math.hypot(p.x - (a.x + dx * t), p.z - (a.z + dz * t));
}

/**
 * True if `p` (a body of radius `margin`) can be seen by a camera at `from` looking toward `to` with the
 * given horizontal half-angle — i.e. it is inside the view wedge on the ground.
 */
export function inViewWedge(p: Point2, from: Point2, to: Point2, halfAngle: number, margin = 0): boolean {
  const fx = to.x - from.x;
  const fz = to.z - from.z;
  const len = Math.hypot(fx, fz);
  if (len === 0) return false;
  const px = p.x - from.x;
  const pz = p.z - from.z;
  const along = (px * fx + pz * fz) / len;
  const side = Math.abs((px * fz - pz * fx) / len);
  if (along < -margin) return false; // behind the camera
  return side <= Math.max(0, along) * Math.tan(halfAngle) + margin;
}
