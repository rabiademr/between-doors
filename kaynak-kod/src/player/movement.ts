// Pure movement math (no Babylon) so it can be unit-tested.
// Coordinates: Babylon is left-handed, X = right, Z = forward, Y = up.

export const WALK_SPEED = 3.5; // m/s
export const RUN_SPEED = 6; // m/s
/** Frames longer than this are clamped, so a lag spike / tab switch can't teleport the player through walls. */
export const MAX_FRAME_SECONDS = 0.1;

export interface MoveInput {
  /** -1 (back) .. 1 (forward) */
  forward: number;
  /** -1 (left) .. 1 (right) */
  right: number;
  run: boolean;
}

export interface Vec2 {
  x: number;
  z: number;
}

/**
 * Horizontal "forward" of an ArcRotateCamera: the direction from the camera to its target.
 * Camera position = target + r·(cos α·sin β, cos β, sin α·sin β), so forward = (−cos α, −sin α).
 */
export function cameraForward(alpha: number): Vec2 {
  return { x: -Math.cos(alpha), z: -Math.sin(alpha) };
}

/** Displacement for this frame, relative to camera heading. Diagonals are not faster. */
export function computeDisplacement(
  input: MoveInput,
  cameraAlpha: number,
  dtSeconds: number,
  runMultiplier = 1,
): Vec2 {
  const f = cameraForward(cameraAlpha);
  const r = { x: f.z, z: -f.x }; // right = forward rotated 90° clockwise (seen from above)
  let x = f.x * input.forward + r.x * input.right;
  let z = f.z * input.forward + r.z * input.right;
  const len = Math.hypot(x, z);
  if (len < 1e-6) return { x: 0, z: 0 };
  const speed = input.run ? RUN_SPEED * runMultiplier : WALK_SPEED;
  const dt = Math.min(Math.max(dtSeconds, 0), MAX_FRAME_SECONDS);
  x = (x / len) * speed * dt;
  z = (z / len) * speed * dt;
  return { x, z };
}

/** Yaw (rotation.y) that makes a mesh face along the displacement. rotation.y = 0 faces +Z. */
export function headingFor(d: Vec2): number {
  return Math.atan2(d.x, d.z);
}

/** Rotate `current` toward `target` by at most `maxStep` radians along the shortest path. */
export function turnToward(current: number, target: number, maxStep: number): number {
  let diff = target - current;
  diff = Math.atan2(Math.sin(diff), Math.cos(diff)); // wrap to (−π, π]
  if (Math.abs(diff) <= maxStep) return target;
  return current + Math.sign(diff) * maxStep;
}
