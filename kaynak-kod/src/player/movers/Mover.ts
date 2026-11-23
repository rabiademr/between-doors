// Pure movement models (no Babylon). A Mover turns input into a new ground position through the
// CollisionWorld; the view (PlayerController) only copies the result onto meshes and the camera.
import type { CollisionWorld } from '../../domain/collision/CollisionWorld';
import type { MoveInput } from '../movement';
import type { VehicleKind } from './vehicles';

export interface MoverState {
  x: number;
  z: number;
  /** yaw: 0 faces +Z, π/2 faces +X */
  heading: number;
  /** Actual ground speed after collisions (m/s). */
  speed: number;
}

export interface MoveContext {
  input: MoveInput;
  /** Third-person camera yaw (ArcRotateCamera alpha); "forward" on the keyboard is away from the camera. */
  cameraAlpha: number;
  dt: number;
  collisions: CollisionWorld;
}

export interface Mover {
  readonly kind: 'foot' | VehicleKind;
  /** Collision circle radius (m); for a capsule body (the van) its half-width. */
  readonly radius: number;
  step(state: MoverState, ctx: MoveContext): MoverState;
}
