// On foot: the v1 movement (camera-relative WASD, Shift to run), now resolved by the CollisionWorld.
import { MAX_FRAME_SECONDS, computeDisplacement, headingFor, turnToward } from '../movement';
import type { MoveContext, Mover, MoverState } from './Mover';

/** rad/s — how fast the body turns to face movement */
export const FOOT_TURN_SPEED = 12;
export const FOOT_RADIUS = 0.35;

export class FootMover implements Mover {
  readonly kind = 'foot';
  readonly radius = FOOT_RADIUS;
  /** Upgrade "Steady Pace" sets this to 1.1. */
  runMultiplier = 1;

  step(state: MoverState, ctx: MoveContext): MoverState {
    const dt = Math.min(Math.max(ctx.dt, 0), MAX_FRAME_SECONDS);
    const move = computeDisplacement(ctx.input, ctx.cameraAlpha, dt, this.runMultiplier);
    const moving = move.x !== 0 || move.z !== 0;
    const to = moving ? ctx.collisions.move(state.x, state.z, this.radius, move.x, move.z) : { x: state.x, z: state.z };
    return {
      x: to.x,
      z: to.z,
      heading: moving ? turnToward(state.heading, headingFor(move), FOOT_TURN_SPEED * dt) : state.heading,
      speed: dt > 0 ? Math.hypot(to.x - state.x, to.z - state.z) / dt : 0,
    };
  }
}
