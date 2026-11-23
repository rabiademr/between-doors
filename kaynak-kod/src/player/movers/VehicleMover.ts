// On a vehicle (bike, scooter, motorcycle, van): arcade kinematics, no physics engine. W pedals /
// throttles, S brakes (then rolls back slowly), A/D steer relative to the VEHICLE (not the camera), Shift
// goes hard. Turning is limited by a turn radius, so nothing spins on the spot. A wall takes away only the
// speed that went INTO it, and over time rather than per frame: brushing along a wall barely slows a
// two-wheeler (it also noses round to run along the wall), a head-on hit stops it within a few tenths of a
// second. Handling and body come from the data in vehicles.ts.
//
// Two-wheelers are circles (CollisionWorld.move). The van is a capsule along its heading: it turns about
// its rear axle, and a turn that would swing the body into a wall is refused (it keeps its heading and
// slides instead), so turning never shoves it through anything.
import type { CapsuleBody } from '../../domain/collision/CollisionWorld';
import { MAX_FRAME_SECONDS } from '../movement';
import type { MoveContext, Mover, MoverState } from './Mover';
import { VEHICLES, type VehicleBody, type VehicleKind, type VehicleSpec, type VehicleTuning } from './vehicles';

/** Below this the vehicle counts as stopped (S then means reverse, not brake). */
const STOPPED = 0.05;
/**
 * Tolerance when checking a turned capsule pose: resting contact with a wall must not lock the steering
 * forever; anything the turn digs in deeper than this is refused.
 */
const TURN_SKIN = 0.02;
/** `bumpKeep` is the share of the blocked speed still there this long (s) after the hit. */
const BUMP_TIME = 0.05;
/** A two-wheeler that brushes a wall turns to run along it, this fast (rad/s)… */
const DEFLECT_RATE = 3.2;
/** …unless it met the wall squarer than this (rad from the wall's line): then it is a crash, not a brush. */
const DEFLECT_MAX_ANGLE = 1.1;

export class VehicleMover implements Mover {
  readonly kind: VehicleKind;
  readonly radius: number;
  readonly tuning: VehicleTuning;
  readonly body: VehicleBody;

  constructor(spec: VehicleSpec = VEHICLES.bike) {
    this.kind = spec.kind;
    this.tuning = spec.tuning;
    this.body = spec.body;
    this.radius = spec.body.radius;
  }

  /** `state.speed` is the signed speed along the heading (negative = rolling back). */
  step(state: MoverState, ctx: MoveContext): MoverState {
    const t = this.tuning;
    const dt = Math.min(Math.max(ctx.dt, 0), MAX_FRAME_SECONDS);
    if (dt === 0) return state;
    const { forward, right, run } = ctx.input;
    let v = state.speed;

    // Throttle / brake / reverse
    if (forward > 0) {
      const top = run ? t.sprintSpeed : t.cruiseSpeed;
      v = v < top ? Math.min(top, v + (v < 0 ? t.braking : t.acceleration) * dt) : Math.max(top, v - t.drag * dt);
    } else if (forward < 0) {
      if (v > STOPPED) v = Math.max(0, v - t.braking * dt);
      else v = Math.max(-t.reverseSpeed, v - t.acceleration * dt);
    } else {
      v = Math.sign(v) * Math.max(0, Math.abs(v) - t.drag * dt);
    }

    // Steering: yaw rate = v / R, capped; reversed when rolling back (like a real bike or car).
    // With the pedal or brake held, steering never drops below walking pace: a rider stuck nose-first against
    // a wall can swing the front round instead of having to back all the way out.
    const steerSpeed = forward !== 0 ? Math.max(Math.abs(v), t.minSteerSpeed) : Math.abs(v);
    const yawRate = Math.min(t.maxYawRate, steerSpeed / t.turnRadius) * Math.sign(v);
    const turned = this.turn(state, right * yawRate * dt, ctx);
    let { heading } = turned;

    const dx = Math.sin(heading) * v * dt;
    const dz = Math.cos(heading) * v * dt;
    if (dx === 0 && dz === 0) return { x: turned.x, z: turned.z, heading, speed: v };
    const to = this.isCapsule
      ? ctx.collisions.moveCapsule(this.capsule(turned.x, turned.z, heading), dx, dz)
      : ctx.collisions.move(turned.x, turned.z, this.radius, dx, dz);
    if (to.blocked) {
      // `along` is the speed that actually got through (sliding along the wall); the rest drains away.
      const mx = to.x - turned.x;
      const mz = to.z - turned.z;
      const along = (mx * Math.sin(heading) + mz * Math.cos(heading)) / dt;
      if (Math.abs(along) < Math.abs(v)) v = along + (v - along) * Math.pow(t.bumpKeep, dt / BUMP_TIME);
      // Brushing a wall: nose round to the way the body really went, so it runs along instead of grinding.
      if (!this.isCapsule && Math.hypot(mx, mz) > 1e-6) {
        const way = v < 0 ? Math.atan2(-mx, -mz) : Math.atan2(mx, mz);
        const off = wrap(way - heading);
        if (Math.abs(off) < DEFLECT_MAX_ANGLE) heading = wrap(heading + Math.sign(off) * Math.min(Math.abs(off), DEFLECT_RATE * dt));
      }
    }
    return { x: to.x, z: to.z, heading, speed: v };
  }

  get isCapsule(): boolean {
    return this.body.halfLength > 0;
  }

  /** The collision capsule at a pose (only meaningful for capsule bodies). */
  capsule(x: number, z: number, heading: number): CapsuleBody {
    return { x, z, heading, halfLength: this.body.halfLength, r: this.body.radius };
  }

  /**
   * Turn by `yaw` about the pivot (rear axle). Circles turn freely; a capsule tries the full turn, then
   * half of it, and otherwise keeps its heading.
   */
  private turn(state: MoverState, yaw: number, ctx: MoveContext): { x: number; z: number; heading: number } {
    const keep = { x: state.x, z: state.z, heading: state.heading };
    if (yaw === 0) return keep;
    for (const part of this.isCapsule ? [1, 0.5] : [1]) {
      const heading = wrap(state.heading + yaw * part);
      const a = this.body.pivotBack;
      const pose = {
        x: state.x + a * (Math.sin(heading) - Math.sin(state.heading)),
        z: state.z + a * (Math.cos(heading) - Math.cos(state.heading)),
        heading,
      };
      if (!this.isCapsule) return pose;
      const skinned = { ...this.capsule(pose.x, pose.z, heading), r: this.body.radius - TURN_SKIN };
      if (!ctx.collisions.overlapsCapsule(skinned)) return pose;
    }
    return keep;
  }
}

function wrap(a: number): number {
  return Math.atan2(Math.sin(a), Math.cos(a));
}
