// Pure camera helpers (no Babylon).

/** Player-controlled zoom range (mouse wheel). */
export const ZOOM_MIN = 3;
export const ZOOM_MAX = 12;
/** Keep the camera this far in front of a blocking wall. */
export const WALL_MARGIN = 0.3;
/** Never pull the camera closer than this, even in a tight corner. */
export const OCCLUDED_MIN = 0.8;

/**
 * Distance to place the camera: the player's preferred zoom, unless a wall is between the
 * character and the camera — then just in front of that wall.
 */
export function cameraDistance(preferred: number, wallHitDistance: number | null): number {
  if (wallHitDistance === null || wallHitDistance - WALL_MARGIN >= preferred) return preferred;
  return Math.max(OCCLUDED_MIN, wallHitDistance - WALL_MARGIN);
}

/** Radians of camera turn per pixel of mouse movement at sensitivity 1.0 (≈ 125° per 1000 px). */
export const LOOK_RADIANS_PER_PIXEL = 0.0022;
/** Camera pitch limits (beta): never straight down, never below the ground. */
export const BETA_MIN = 0.35;
export const BETA_MAX = 1.45;

/** New camera angles after a mouse movement. Moving the mouse right turns the view right. */
export function applyLook(
  alpha: number,
  beta: number,
  dxPixels: number,
  dyPixels: number,
  sensitivity: number,
): { alpha: number; beta: number } {
  const k = LOOK_RADIANS_PER_PIXEL * sensitivity;
  return {
    alpha: alpha - dxPixels * k,
    beta: Math.min(BETA_MAX, Math.max(BETA_MIN, beta - dyPixels * k)),
  };
}

const WINDS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as const;

/** Compass bearing the camera looks toward, in degrees [0, 360): 0 = north (+Z), 90 = east (+X). */
export function cameraHeadingDeg(alpha: number): number {
  const fx = -Math.cos(alpha);
  const fz = -Math.sin(alpha);
  return bearingDeg(fx, fz);
}

/** Compass bearing of a facing (Babylon rotation.y: 0 = +Z, turning toward +X), in degrees [0, 360). */
export function facingBearingDeg(rotationY: number): number {
  return bearingDeg(Math.sin(rotationY), Math.cos(rotationY));
}

function bearingDeg(dx: number, dz: number): number {
  const deg = ((Math.atan2(dx, dz) * 180) / Math.PI + 360) % 360;
  return deg >= 360 - 1e-9 ? 0 : deg;
}

/** 8-wind direction the camera looks toward. North = +Z, East = +X. */
export function compassDirection(alpha: number): Wind {
  return windOf(cameraHeadingDeg(alpha));
}

export type Wind = (typeof WINDS)[number];

/** Nearest of the 8 winds for a compass bearing in degrees. */
export function windOf(bearingDeg: number): Wind {
  const d = ((bearingDeg % 360) + 360) % 360;
  return WINDS[Math.round(d / 45) % 8] ?? 'N';
}

/** Direction from target to an ArcRotateCamera at (alpha, beta). */
export function cameraOffsetDir(alpha: number, beta: number): { x: number; y: number; z: number } {
  return { x: Math.cos(alpha) * Math.sin(beta), y: Math.cos(beta), z: Math.sin(alpha) * Math.sin(beta) };
}

/** ArcRotateCamera orbit (alpha, beta, radius) that puts the camera at `from` looking at `to` (fixed shots). */
export function orbitFromView(from: Vec3, to: Vec3): { alpha: number; beta: number; radius: number } {
  const dx = from.x - to.x;
  const dy = from.y - to.y;
  const dz = from.z - to.z;
  const radius = Math.hypot(dx, dy, dz);
  if (radius < 1e-6) return { alpha: -Math.PI / 2, beta: Math.PI / 2, radius: 0 };
  return { alpha: Math.atan2(dz, dx), beta: Math.acos(Math.max(-1, Math.min(1, dy / radius))), radius };
}

interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** Camera yaw (alpha) that puts the camera straight behind something facing `heading` (0 = +Z). */
export function behindAlpha(heading: number): number {
  return -Math.PI / 2 - heading;
}

/** Ease an angle toward a target along the shortest way; `rate` = fraction per second (exponential). */
export function easeAngle(current: number, target: number, rate: number, dtSeconds: number): number {
  const diff = Math.atan2(Math.sin(target - current), Math.cos(target - current));
  const k = 1 - Math.exp(-rate * Math.max(0, dtSeconds));
  return current + diff * k;
}

/** Seconds without mouse movement before the camera starts swinging behind a vehicle. */
export const FOLLOW_DELAY = 1.2;
/** Below this speed (m/s) the camera does not swing behind (standing still: look around freely). */
export const FOLLOW_MIN_SPEED = 1.5;
