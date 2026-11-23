// Pure target selection for the single contextual E action (FR-07):
// only ONE target, it must be close AND roughly in front of the player; far targets never work.

export interface InteractionSpot {
  id: string;
  /** World position of the "stand here" spot in front of the object. */
  x: number;
  z: number;
  /** Max distance (m) from which E works. */
  range: number;
}

/** Half-angle (radians) of the "looking at" cone in front of the player. */
export const FACING_HALF_ANGLE = (70 * Math.PI) / 180;
/** Closer than this, facing is ignored (direction is unstable when standing on top of it). */
const POINT_BLANK = 0.6;

export interface SelectOptions {
  /**
   * Any direction counts (riding: a vehicle cannot turn on the spot, and a door is usually passed side-on).
   * Range still applies; the closest wins.
   */
  anyDirection?: boolean;
}

/**
 * @param heading player yaw (rotation.y; 0 = +Z, π/2 = +X)
 * @returns the id of the best target, or null
 */
export function selectTarget(
  px: number,
  pz: number,
  heading: number,
  spots: readonly InteractionSpot[],
  opts: SelectOptions = {},
): string | null {
  let best: string | null = null;
  let bestScore = Infinity;
  for (const s of spots) {
    const dx = s.x - px;
    const dz = s.z - pz;
    const dist = Math.hypot(dx, dz);
    if (dist > s.range) continue;
    let angle = 0;
    if (dist > POINT_BLANK && !opts.anyDirection) {
      const toTarget = Math.atan2(dx, dz);
      angle = Math.abs(Math.atan2(Math.sin(toTarget - heading), Math.cos(toTarget - heading)));
      if (angle > FACING_HALF_ANGLE) continue;
    }
    // Prefer what is straight ahead, then what is closer.
    const score = dist + angle * 1.5;
    if (score < bestScore) {
      bestScore = score;
      best = s.id;
    }
  }
  return best;
}
