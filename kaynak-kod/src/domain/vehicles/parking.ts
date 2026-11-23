// Pure rules for parked vehicles: where the rider
// steps off, whether they can get on, and a small registry of where each owned vehicle stands. No Babylon, no DOM.

/** A vehicle on the ground: centre + yaw (0 = +Z, π/2 = +X, like the player's heading). */
export interface Pose {
  x: number;
  z: number;
  heading: number;
}

/** The ground a parked vehicle takes up, from its riding body (`radius`, `halfLength` of the capsule's spine). */
export interface Footprint {
  halfWidth: number;
  halfLength: number;
  /** Half-length of the centre line used for "how close am I to it". */
  spine: number;
}

/** A van (capsule body) parks as its full box; a two-wheeler (circle body) as a narrow, slightly longer one. */
export function parkedFootprint(body: { radius: number; halfLength: number }): Footprint {
  const fp =
    body.halfLength > 0
      ? { halfWidth: body.radius, halfLength: body.halfLength + body.radius }
      : { halfWidth: body.radius * 0.5, halfLength: body.radius + 0.4 };
  return { ...fp, spine: fp.halfLength - fp.halfWidth };
}

/** Free ground between the vehicle's side and where the rider's feet land (m). */
export const STEP_OFF_GAP = 0.6;
const RIDER_RADIUS = 0.35;

export interface DismountOptions {
  /** Half-length of the vehicle (behind/front are measured from it); defaults to the half-width. */
  halfLength?: number;
  /** Radius asked of `isFree` (the rider's feet). */
  footRadius?: number;
  /**
   * Can the rider walk from the vehicle's centre to (x, z)? A free spot behind a thin fence or a closed gate
   * must not count (stepping off would teleport through it); see `pathClear`. Omitted = every spot is reachable.
   */
  reaches?: (x: number, z: number) => boolean;
}

/**
 * Where the rider steps off: left of the vehicle, else right, else behind, else in front — the first that is
 * free and reachable from the vehicle. Null when all four are blocked (then getting off is refused).
 */
export function dismountSpot(
  vehicle: Pose,
  bodyHalfWidth: number,
  isFree: (x: number, z: number, r: number) => boolean,
  opts: DismountOptions = {},
): { x: number; z: number } | null {
  const side = bodyHalfWidth + STEP_OFF_GAP;
  const along = (opts.halfLength ?? bodyHalfWidth) + STEP_OFF_GAP;
  const r = opts.footRadius ?? RIDER_RADIUS;
  const fx = Math.sin(vehicle.heading);
  const fz = Math.cos(vehicle.heading);
  // forward = (fx, fz); right = (fz, -fx); left = (-fz, fx)
  const tries: readonly (readonly [number, number])[] = [
    [-fz * side, fx * side],
    [fz * side, -fx * side],
    [-fx * along, -fz * along],
    [fx * along, fz * along],
  ];
  for (const [dx, dz] of tries) {
    const x = vehicle.x + dx;
    const z = vehicle.z + dz;
    if (isFree(x, z, r) && (opts.reaches?.(x, z) ?? true)) return { x, z };
  }
  return null;
}

/** What mounting needs from the collision world (domain/collision/CollisionWorld). */
export interface MountWorld {
  move(x: number, z: number, r: number, dx: number, dz: number): { x: number; z: number };
  overlaps(x: number, z: number, r: number): boolean;
  overlapsCapsule(body: { x: number; z: number; heading: number; halfLength: number; r: number }): boolean;
}

/** A thin probe from the rider to the vehicle's centre: a fence or wall between them stops it. */
const REACH_PROBE_RADIUS = 0.15;
/** Touching a wall is fine; only real overlap blocks (a vehicle parked flush against a fence). */
const POSE_SKIN = 0.05;
/** How far short of its target a probe may stop and still count as arrived (m). */
const ARRIVE_EPS = 0.05;

/**
 * Does a thin probe get from `from` to `to` without being stopped by anything solid? Used for stepping off a
 * vehicle (`dismountSpot` `reaches`); ask with the ridden vehicle's own collider absent from `world`.
 */
export function pathClear(
  world: Pick<MountWorld, 'move'>,
  from: { x: number; z: number },
  to: { x: number; z: number },
): boolean {
  const end = world.move(from.x, from.z, REACH_PROBE_RADIUS, to.x - from.x, to.z - from.z);
  return Math.hypot(end.x - to.x, end.z - to.z) <= ARRIVE_EPS;
}

/**
 * May the rider get on this parked vehicle? 'unreachable': something solid stands between them (mounting
 * would teleport through a fence); 'noRoom': something moved into its spot since it was parked. Ask with the
 * vehicle's own parked collider already removed from `world`.
 * The probe aims at the vehicle's centre (always open ground: the vehicle was ridden there) and counts as
 * arrived once it is inside the riding body — not at the end of the parked outline, which can poke past a
 * wall a two-wheeler was ridden into at an angle.
 */
export function mountCheck(
  world: MountWorld,
  rider: { x: number; z: number },
  pose: Pose,
  body: { radius: number; halfLength: number },
): 'ok' | 'unreachable' | 'noRoom' {
  const end = world.move(rider.x, rider.z, REACH_PROBE_RADIUS, pose.x - rider.x, pose.z - rider.z);
  const fx = Math.sin(pose.heading);
  const fz = Math.cos(pose.heading);
  const along = Math.max(-body.halfLength, Math.min(body.halfLength, (end.x - pose.x) * fx + (end.z - pose.z) * fz));
  const offAxis = Math.hypot(end.x - (pose.x + fx * along), end.z - (pose.z + fz * along));
  if (offAxis > body.radius) return 'unreachable';
  const r = Math.max(0.01, body.radius - POSE_SKIN);
  const taken =
    body.halfLength > 0
      ? world.overlapsCapsule({ x: pose.x, z: pose.z, heading: pose.heading, halfLength: body.halfLength, r })
      : world.overlaps(pose.x, pose.z, r);
  return taken ? 'noRoom' : 'ok';
}

export type Place = Pose | 'ridden';

export interface NearestParked {
  id: string;
  pose: Pose;
  /** Closest point of the vehicle's centre line to the asker. */
  x: number;
  z: number;
  distance: number;
}

/** Where each owned vehicle stands, or that it is being ridden. Not saved: a new session starts at the rack. */
export class ParkedState {
  private readonly places = new Map<string, Place>();
  private readonly rackOf: (id: string) => Pose;
  private readonly spineOf: (id: string) => number;

  /**
   * @param rackOf the rack slot of a vehicle id
   * @param spineOf half-length of its centre line (0 = measure to the centre)
   */
  constructor(rackOf: (id: string) => Pose, spineOf: (id: string) => number = () => 0) {
    this.rackOf = rackOf;
    this.spineOf = spineOf;
  }

  /** Make the registry match what is owned: new vehicles appear at the rack, others keep their place. */
  setOwned(ids: readonly string[]): void {
    for (const id of [...this.places.keys()]) if (!ids.includes(id)) this.places.delete(id);
    for (const id of ids) if (!this.places.has(id)) this.places.set(id, this.rackOf(id));
  }

  has(id: string): boolean {
    return this.places.has(id);
  }
  placeOf(id: string): Place | undefined {
    return this.places.get(id);
  }
  entries(): [string, Place][] {
    return [...this.places.entries()];
  }
  riddenIds(): string[] {
    return this.entries()
      .filter(([, p]) => p === 'ridden')
      .map(([id]) => id);
  }

  /** Leave an owned vehicle standing at `pose`. */
  park(id: string, pose: Pose): void {
    if (this.places.has(id)) this.places.set(id, { x: pose.x, z: pose.z, heading: pose.heading });
  }
  ride(id: string): void {
    if (this.places.has(id)) this.places.set(id, 'ridden');
  }
  /** Send these (owned) vehicles back to their rack slots. */
  resetToRack(ids: readonly string[]): void {
    for (const id of ids) if (this.places.has(id)) this.places.set(id, this.rackOf(id));
  }

  /** The parked vehicle closest to `from` within `range` (ridden ones don't count). */
  nearest(from: { x: number; z: number }, range: number): NearestParked | null {
    let best: NearestParked | null = null;
    for (const [id, place] of this.places) {
      if (place === 'ridden') continue;
      const fx = Math.sin(place.heading);
      const fz = Math.cos(place.heading);
      const spine = this.spineOf(id);
      const t = Math.max(-spine, Math.min(spine, (from.x - place.x) * fx + (from.z - place.z) * fz));
      const x = place.x + fx * t;
      const z = place.z + fz * t;
      const distance = Math.hypot(from.x - x, from.z - z);
      if (distance <= range && (!best || distance < best.distance)) best = { id, pose: place, x, z, distance };
    }
    return best;
  }
}
