// Model: 2D collision for everything that walks or rides (player, vehicles, NPCs). Pure — no Babylon.
// The world is flat (no ramps), so collision is solved on the ground plane (x, z): movers are circles
// (or, for long vehicles like the van, a capsule along the heading), obstacles are boxes, circles and
// capsules (a thick segment: a swinging gate). Height filtering (roofs above the head, kerbs you step
// over) is done by whoever builds the shapes.
//
// move() / moveCapsule() sub-step long moves so fast movers can't tunnel through thin walls, and resolve
// overlaps by pushing the mover out along the contact normal — which makes it slide along walls naturally.

export type Shape =
  | { kind: 'box'; x0: number; x1: number; z0: number; z1: number }
  | { kind: 'circle'; x: number; z: number; r: number }
  | { kind: 'capsule'; ax: number; az: number; bx: number; bz: number; r: number };

/** A shape plus an optional live switch (e.g. an NPC collider that is turned off between chapters). */
export interface Collider {
  shape: Shape;
  active?: () => boolean;
}

export interface MoveResult {
  x: number;
  z: number;
  /** True when something stopped or deflected the move. */
  blocked: boolean;
}

/**
 * A moving capsule body: the segment through (x, z) along `heading` (0 = +Z, π/2 = +X), reaching
 * `halfLength` to the front and back, thickened by `r`. A 4.6 × 2 m van is halfLength 1.3, r 1.
 */
export interface CapsuleBody {
  x: number;
  z: number;
  heading: number;
  halfLength: number;
  r: number;
}

/** Sub-step length as a fraction of the mover's radius (≤ 0.5 keeps 0.1 m gates solid at any speed). */
const SUBSTEP_FRACTION = 0.5;
const RESOLVE_ITERATIONS = 4;
/** A capsule can touch two walls of a corner at once with both ends; give it a few more passes. */
const CAPSULE_RESOLVE_ITERATIONS = 8;
/** Golden-section steps to find the point of a segment closest to a shape (0.618^28 ≈ 1e-6 of its length). */
const CLOSEST_ITERATIONS = 28;
const GOLDEN = 0.6180339887498949;
const EPS = 1e-9;

export class CollisionWorld {
  private readonly cellSize: number;
  private readonly grid = new Map<string, number[]>();
  private readonly statics: Collider[] = [];
  private dynamics: Collider[] = [];
  /** Visit stamp per static collider, so a shape spanning several cells is tested once per query. */
  private stamps: number[] = [];
  private stamp = 0;

  constructor(cellSize = 4) {
    this.cellSize = cellSize;
  }

  get staticCount(): number {
    return this.statics.length;
  }

  addStatic(collider: Collider): void {
    const index = this.statics.push(collider) - 1;
    this.stamps.push(0);
    const b = bounds(collider.shape);
    for (let i = this.cell(b.x0); i <= this.cell(b.x1); i++) {
      for (let j = this.cell(b.z0); j <= this.cell(b.z1); j++) {
        const key = `${i},${j}`;
        const list = this.grid.get(key);
        if (list) list.push(index);
        else this.grid.set(key, [index]);
      }
    }
  }

  clearStatic(): void {
    this.statics.length = 0;
    this.stamps = [];
    this.grid.clear();
  }

  /** Replace the moving colliders (call once per frame, before movers step). */
  setDynamic(colliders: Collider[]): void {
    this.dynamics = colliders;
  }

  /** True if a circle at (x, z) overlaps any active collider. */
  overlaps(x: number, z: number, r: number): boolean {
    let hit = false;
    this.forEachNear(x, z, r, (s) => {
      if (!hit && penetration(x, z, r, s)) hit = true;
    });
    return hit;
  }

  /** Move a circle by (dx, dz), sliding along obstacles. */
  move(x: number, z: number, r: number, dx: number, dz: number): MoveResult {
    const len = Math.hypot(dx, dz);
    const steps = Math.max(1, Math.ceil(len / (r * SUBSTEP_FRACTION)));
    let px = x;
    let pz = z;
    let blocked = false;
    for (let s = 0; s < steps; s++) {
      px += dx / steps;
      pz += dz / steps;
      for (let it = 0; it < RESOLVE_ITERATIONS; it++) {
        let pushed = false;
        this.forEachNear(px, pz, r, (shape) => {
          const p = penetration(px, pz, r, shape);
          if (!p) return;
          px += p.x;
          pz += p.z;
          pushed = true;
        });
        if (!pushed) break;
        blocked = true;
      }
    }
    return { x: px, z: pz, blocked };
  }

  /** True if a capsule body overlaps any active collider. */
  overlapsCapsule(body: CapsuleBody): boolean {
    const seg = segmentOf(body);
    let hit = false;
    this.forEachNear(body.x, body.z, body.halfLength + body.r, (s) => {
      if (hit || !nearSegment(seg, body.r, s)) return;
      const c = closestOnSegment(seg, s);
      if (penetration(c.x, c.z, body.r, s)) hit = true;
    });
    return hit;
  }

  /**
   * Move a capsule body by (dx, dz) without turning it, sliding along obstacles. Turning is the caller's
   * job (check the turned pose with overlapsCapsule first, so a turn never shoves the body into a wall).
   * A zero move just pushes the body out of anything it overlaps.
   */
  moveCapsule(body: CapsuleBody, dx: number, dz: number): MoveResult {
    const { r, halfLength: h } = body;
    const fx = Math.sin(body.heading) * h;
    const fz = Math.cos(body.heading) * h;
    const len = Math.hypot(dx, dz);
    const steps = Math.max(1, Math.ceil(len / (r * SUBSTEP_FRACTION)));
    let px = body.x;
    let pz = body.z;
    let blocked = false;
    for (let s = 0; s < steps; s++) {
      px += dx / steps;
      pz += dz / steps;
      for (let it = 0; it < CAPSULE_RESOLVE_ITERATIONS; it++) {
        let pushed = false;
        this.forEachNear(px, pz, h + r, (shape) => {
          const seg = { ax: px - fx, az: pz - fz, bx: px + fx, bz: pz + fz };
          if (!nearSegment(seg, r, shape)) return;
          const c = closestOnSegment(seg, shape);
          const p = penetration(c.x, c.z, r, shape);
          if (!p) return;
          px += p.x;
          pz += p.z;
          pushed = true;
        });
        if (!pushed) break;
        blocked = true;
      }
    }
    return { x: px, z: pz, blocked };
  }

  private cell(v: number): number {
    return Math.floor(v / this.cellSize);
  }

  private forEachNear(x: number, z: number, r: number, visit: (s: Shape) => void): void {
    const stamp = ++this.stamp;
    for (let i = this.cell(x - r); i <= this.cell(x + r); i++) {
      for (let j = this.cell(z - r); j <= this.cell(z + r); j++) {
        const list = this.grid.get(`${i},${j}`);
        if (!list) continue;
        for (const index of list) {
          if (this.stamps[index] === stamp) continue;
          this.stamps[index] = stamp;
          const c = this.statics[index];
          if (c && (!c.active || c.active())) visit(c.shape);
        }
      }
    }
    for (const c of this.dynamics) if (!c.active || c.active()) visit(c.shape);
  }
}

/** Axis-aligned bounds of a shape (for the grid). */
export function bounds(s: Shape): { x0: number; x1: number; z0: number; z1: number } {
  switch (s.kind) {
    case 'box':
      return { x0: s.x0, x1: s.x1, z0: s.z0, z1: s.z1 };
    case 'circle':
      return { x0: s.x - s.r, x1: s.x + s.r, z0: s.z - s.r, z1: s.z + s.r };
    case 'capsule':
      return {
        x0: Math.min(s.ax, s.bx) - s.r,
        x1: Math.max(s.ax, s.bx) + s.r,
        z0: Math.min(s.az, s.bz) - s.r,
        z1: Math.max(s.az, s.bz) + s.r,
      };
  }
}

/** Smallest push that separates a circle (x, z, r) from the shape, or null if they don't overlap. */
export function penetration(x: number, z: number, r: number, s: Shape): { x: number; z: number } | null {
  if (s.kind === 'box') {
    const cx = Math.min(Math.max(x, s.x0), s.x1);
    const cz = Math.min(Math.max(z, s.z0), s.z1);
    const dx = x - cx;
    const dz = z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 >= r * r) return null;
    if (d2 > EPS) {
      const d = Math.sqrt(d2);
      return { x: (dx / d) * (r - d), z: (dz / d) * (r - d) };
    }
    // Centre inside the box: leave through the nearest face.
    const exits = [
      { x: s.x0 - x - r, z: 0 },
      { x: s.x1 - x + r, z: 0 },
      { x: 0, z: s.z0 - z - r },
      { x: 0, z: s.z1 - z + r },
    ];
    return exits.reduce((a, b) => (Math.abs(a.x + a.z) <= Math.abs(b.x + b.z) ? a : b));
  }
  let ox: number;
  let oz: number;
  let rr: number;
  if (s.kind === 'circle') {
    ox = s.x;
    oz = s.z;
    rr = s.r;
  } else {
    const ex = s.bx - s.ax;
    const ez = s.bz - s.az;
    const e2 = ex * ex + ez * ez;
    const t = e2 > EPS ? Math.min(1, Math.max(0, ((x - s.ax) * ex + (z - s.az) * ez) / e2)) : 0;
    ox = s.ax + ex * t;
    oz = s.az + ez * t;
    rr = s.r;
  }
  const dx = x - ox;
  const dz = z - oz;
  const d = Math.hypot(dx, dz);
  const min = r + rr;
  if (d >= min) return null;
  if (d < EPS) return { x: min, z: 0 }; // exactly on top: any direction will do
  return { x: (dx / d) * (min - d), z: (dz / d) * (min - d) };
}

interface Segment {
  ax: number;
  az: number;
  bx: number;
  bz: number;
}

function segmentOf(b: CapsuleBody): Segment {
  const fx = Math.sin(b.heading) * b.halfLength;
  const fz = Math.cos(b.heading) * b.halfLength;
  return { ax: b.x - fx, az: b.z - fz, bx: b.x + fx, bz: b.z + fz };
}

/** Cheap bounds test: can a capsule (segment + r) touch the shape at all? */
function nearSegment(seg: Segment, r: number, s: Shape): boolean {
  const b = bounds(s);
  return (
    Math.min(seg.ax, seg.bx) - r < b.x1 &&
    Math.max(seg.ax, seg.bx) + r > b.x0 &&
    Math.min(seg.az, seg.bz) - r < b.z1 &&
    Math.max(seg.az, seg.bz) + r > b.z0
  );
}

/** Signed distance from a point to a shape's outline (negative inside). Convex in (x, z) for every shape. */
export function signedDistance(x: number, z: number, s: Shape): number {
  switch (s.kind) {
    case 'box': {
      const qx = Math.abs(x - (s.x0 + s.x1) / 2) - (s.x1 - s.x0) / 2;
      const qz = Math.abs(z - (s.z0 + s.z1) / 2) - (s.z1 - s.z0) / 2;
      return Math.hypot(Math.max(qx, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qz), 0);
    }
    case 'circle':
      return Math.hypot(x - s.x, z - s.z) - s.r;
    case 'capsule': {
      const ex = s.bx - s.ax;
      const ez = s.bz - s.az;
      const e2 = ex * ex + ez * ez;
      const t = e2 > EPS ? Math.min(1, Math.max(0, ((x - s.ax) * ex + (z - s.az) * ez) / e2)) : 0;
      return Math.hypot(x - (s.ax + ex * t), z - (s.az + ez * t)) - s.r;
    }
  }
}

/**
 * The point of a segment closest to (deepest into) a shape. The signed distance along a segment is a
 * convex function of the segment parameter, so a golden-section search finds its minimum; a circle
 * placed there is the part of the capsule that touches the shape first.
 */
export function closestOnSegment(seg: Segment, s: Shape): { x: number; z: number } {
  const ex = seg.bx - seg.ax;
  const ez = seg.bz - seg.az;
  if (ex * ex + ez * ez < EPS) return { x: seg.ax, z: seg.az };
  const at = (t: number): number => signedDistance(seg.ax + ex * t, seg.az + ez * t, s);
  let lo = 0;
  let hi = 1;
  let t1 = hi - GOLDEN * (hi - lo);
  let t2 = lo + GOLDEN * (hi - lo);
  let f1 = at(t1);
  let f2 = at(t2);
  for (let i = 0; i < CLOSEST_ITERATIONS; i++) {
    if (f1 <= f2) {
      hi = t2;
      t2 = t1;
      f2 = f1;
      t1 = hi - GOLDEN * (hi - lo);
      f1 = at(t1);
    } else {
      lo = t1;
      t1 = t2;
      f1 = f2;
      t2 = lo + GOLDEN * (hi - lo);
      f2 = at(t2);
    }
  }
  const t = (lo + hi) / 2;
  return { x: seg.ax + ex * t, z: seg.az + ez * t };
}
