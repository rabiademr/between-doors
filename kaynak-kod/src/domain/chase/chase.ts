// Model: a Magpie thief — lurks at an ambush point, snatches the courier's parcel and runs for the gang's den.
// No fighting: the courier catches up and grabs the parcel back, or takes it out of the crate in the den.
// Pure (no Babylon, no DOM). The thief moves along hand-made polylines (no path-finding, no collision).
import { followRoute, headingBetween, type FollowState, type Point2 } from '../npc/waypoints';

export const CHASE_TUNING = {
  /** The courier runs 6 m/s on foot: the thief is faster in a straight line… */
  approachSpeed: 6.8,
  fleeSpeed: 6.4,
  /** …but fumbles with the parcel right after the snatch, which is the courier's chance on foot. */
  stumbleSeconds: 1.2,
  /** A carrying courier this close to a lurking thief is attacked. */
  ambushRadius: 9,
  /** The thief gives up when the courier gets this far away (a vehicle), or no longer carries. */
  giveUpRadius: 22,
  /** Thief this close to the courier: the parcel is gone. */
  snatchReach: 1.0,
  /** Courier this close to the fleeing thief can grab the parcel back. */
  grabReach: 1.6,
  /** Seconds before the same thief strikes again. */
  cooldownSeconds: 75,
  /** Walking back to the ambush point after giving up. */
  returnSpeed: 2.2,
  /** 'lead' (story: follow, don't catch): the thief jogs, so a walking-and-running courier keeps up… */
  leadSpeed: 4.6,
  /** …and waits while the courier is further behind than this… */
  leadGap: 12,
  /** …but is lost once the courier is this far away for `loseSeconds`. */
  loseRadius: 30,
  loseSeconds: 6,
  /** A lost story thief waits this long at its ambush before it strikes again (no snatch the moment it is back). */
  relurkSeconds: 8,
} as const;

export type ThiefState = 'lurking' | 'approaching' | 'fleeing' | 'atDen' | 'beaten';
/** `lost`: a thief leading the courier (story) got too far ahead and gave up; it is back at its ambush. */
export type ThiefEvent = 'snatched' | 'reachedDen' | 'lost';
/** A story thief strikes only when the story arms it: 'snatch' (chase it), 'lead' (follow it home). */
export type ThiefMode = 'snatch' | 'lead';

export interface ThiefDef {
  id: string;
  /** Where the thief waits. */
  ambush: Point2;
  /** From the ambush to the den (the last point is inside the den). */
  route: readonly Point2[];
  /** A story thief: hidden and harmless until a chapter arms it (`arm`). */
  story?: boolean;
}

export interface Courier extends Point2 {
  /** A parcel is really in the courier's hands. */
  carrying: boolean;
}

export class Thief {
  readonly def: ThiefDef;
  private _state: ThiefState = 'lurking';
  private _x: number;
  private _z: number;
  private _heading = 0;
  private _moving = false;
  private follow: FollowState;
  private stumble = 0;
  private cooldown = 0;
  private armedMode: ThiefMode | null = null;
  /** Seconds the courier has been out of reach of a leading thief. */
  private lostFor = 0;

  constructor(def: ThiefDef) {
    this.def = def;
    this._x = def.ambush.x;
    this._z = def.ambush.z;
    this.follow = { x: this._x, z: this._z, next: 0, done: true };
  }

  get state(): ThiefState {
    return this._state;
  }
  get x(): number {
    return this._x;
  }
  get z(): number {
    return this._z;
  }
  /** rotation.y (0 = +Z). */
  get heading(): number {
    return this._heading;
  }
  /** Moved on the last update (run clip) or stood (idle clip). */
  get moving(): boolean {
    return this._moving;
  }
  /** The parcel is in the thief's hands. */
  get hasParcel(): boolean {
    return this._state === 'fleeing';
  }
  /** The parcel lies in the den's crate. */
  get parcelInCrate(): boolean {
    return this._state === 'atDen';
  }
  /** Seconds until this thief may strike again. */
  get cooldownLeft(): number {
    return this.cooldown;
  }
  get isStory(): boolean {
    return this.def.story === true;
  }
  /** How the story armed this thief (null: not armed; gang thieves are never armed). */
  get mode(): ThiefMode | null {
    return this.armedMode;
  }

  /** Story: lie in wait at once (no cooldown) for the courier's parcel; `lead` = to be followed, not caught. */
  arm(mode: ThiefMode): void {
    if (!this.isStory) return;
    this.toAmbush(0);
    this.armedMode = mode;
  }

  /** Story: stand down — back to the ambush, hidden, harmless. */
  disarm(): void {
    if (!this.isStory) return;
    this.toAmbush(0);
    this.armedMode = null;
  }

  update(dt: number, courier: Courier): ThiefEvent[] {
    const events: ThiefEvent[] = [];
    if (!(dt > 0)) return events;
    this._moving = false;
    switch (this._state) {
      case 'lurking':
        this.lurk(dt, courier);
        break;
      case 'approaching':
        if (this.approach(dt, courier)) events.push('snatched');
        break;
      case 'fleeing': {
        if (this.armedMode === 'lead') {
          const event = this.lead(dt, courier);
          if (event) events.push(event);
          break;
        }
        const pause = Math.min(dt, this.stumble);
        this.stumble -= pause;
        if (this.run(dt - pause)) {
          this._state = 'atDen';
          events.push('reachedDen');
        }
        break;
      }
      case 'atDen':
        break;
      case 'beaten':
        this.cooldown = Math.max(0, this.cooldown - dt);
        this.run(dt);
        if (this.cooldown <= 0 && this.follow.done) this.toAmbush(0);
        break;
    }
    return events;
  }

  /** The courier can take the parcel out of the thief's hands from here (never from one leading the way). */
  canGrab(courier: Point2): boolean {
    return this._state === 'fleeing' && this.armedMode !== 'lead' && Math.hypot(courier.x - this._x, courier.z - this._z) <= CHASE_TUNING.grabReach;
  }

  /** The courier caught up and took the parcel back: the thief runs off to the den, empty-handed. */
  grab(): 'recovered' | null {
    if (this._state !== 'fleeing' || this.armedMode === 'lead') return null;
    this._state = 'beaten';
    this.stumble = 0;
    this.cooldown = CHASE_TUNING.cooldownSeconds;
    this.armedMode = null; // a story thief strikes once
    return 'recovered';
  }

  /** The courier took the parcel out of the den's crate. @returns false if this thief's parcel is not there. */
  takeFromCrate(): boolean {
    if (this._state !== 'atDen') return false;
    this._state = 'beaten';
    this.cooldown = CHASE_TUNING.cooldownSeconds;
    this.armedMode = null;
    return true;
  }

  /** The stolen job is over (too late, given up): back to the ambush point, empty-handed, after the cooldown. */
  reset(): void {
    this.toAmbush(CHASE_TUNING.cooldownSeconds);
  }

  private toAmbush(cooldown: number): void {
    this._state = 'lurking';
    this._x = this.def.ambush.x;
    this._z = this.def.ambush.z;
    this.follow = { x: this._x, z: this._z, next: 0, done: true };
    this.stumble = 0;
    this.cooldown = cooldown;
    this._moving = false;
    this.lostFor = 0;
  }

  /**
   * Leading the courier home (story, 'lead'): jog the route, wait while they are far behind, give up if they
   * stay out of sight. @returns the event of this tick, if any.
   */
  private lead(dt: number, courier: Courier): ThiefEvent | null {
    const dist = Math.hypot(courier.x - this._x, courier.z - this._z);
    this.lostFor = dist > CHASE_TUNING.loseRadius ? this.lostFor + dt : 0;
    if (this.lostFor >= CHASE_TUNING.loseSeconds) {
      this.toAmbush(CHASE_TUNING.relurkSeconds);
      return 'lost';
    }
    if (dist > CHASE_TUNING.leadGap) {
      this._moving = false;
      this._heading = Math.atan2(courier.x - this._x, courier.z - this._z); // looks back for the courier
      return null;
    }
    if (this.run(dt, CHASE_TUNING.leadSpeed)) {
      this._state = 'atDen';
      return 'reachedDen';
    }
    return null;
  }

  private lurk(dt: number, courier: Courier): void {
    this.cooldown = Math.max(0, this.cooldown - dt);
    const home = this.def.ambush;
    const away = Math.hypot(home.x - this._x, home.z - this._z);
    // A story thief strikes only when the story has armed it (and not again the moment it was lost).
    const ready = this.cooldown <= 0 && (!this.isStory || this.armedMode !== null);
    if (ready && courier.carrying && Math.hypot(courier.x - this._x, courier.z - this._z) <= CHASE_TUNING.ambushRadius) {
      this._state = 'approaching';
      return;
    }
    if (away > 1e-6) {
      // Gave up a little way off: stroll back.
      const step = Math.min(away, CHASE_TUNING.returnSpeed * dt);
      this._heading = headingBetween(this, home);
      this._x += ((home.x - this._x) / away) * step;
      this._z += ((home.z - this._z) / away) * step;
      this._moving = true;
    }
  }

  /** Straight at the courier, re-aimed every tick. @returns true when the parcel was snatched. */
  private approach(dt: number, courier: Courier): boolean {
    const dx = courier.x - this._x;
    const dz = courier.z - this._z;
    const dist = Math.hypot(dx, dz);
    if (!courier.carrying || dist > CHASE_TUNING.giveUpRadius) {
      this._state = 'lurking';
      return false;
    }
    const gap = dist - CHASE_TUNING.snatchReach;
    if (gap > 0) {
      const step = Math.min(gap, CHASE_TUNING.approachSpeed * dt);
      this._heading = Math.atan2(dx, dz);
      this._x += (dx / dist) * step;
      this._z += (dz / dist) * step;
      this._moving = true;
      if (step < gap - 1e-9) return false;
    }
    this._state = 'fleeing';
    this.stumble = CHASE_TUNING.stumbleSeconds;
    this.follow = { x: this._x, z: this._z, next: this.nearestLeg(), done: false };
    return true;
  }

  /** The waypoint to run to first: the end of the route leg the thief is closest to (never runs backwards). */
  private nearestLeg(): number {
    const route = this.def.route;
    let best = 0;
    let bestDist = Infinity;
    for (let i = 0; i < route.length; i++) {
      const a = route[Math.max(0, i - 1)]!;
      const b = route[i]!;
      const d = distanceToSegment(this._x, this._z, a, b);
      if (d < bestDist - 1e-9) {
        bestDist = d;
        best = i;
      }
    }
    return best;
  }

  /** Along the flee route. @returns true on the tick the end of the route is reached. */
  private run(dt: number, speed: number = CHASE_TUNING.fleeSpeed): boolean {
    if (this.follow.done || dt <= 0) return false;
    const before = { x: this._x, z: this._z };
    this.follow = followRoute(this.follow, this.def.route, speed, dt);
    this._x = this.follow.x;
    this._z = this.follow.z;
    const target = this.def.route[this.follow.next];
    if (!this.follow.done && target) this._heading = headingBetween(this, target);
    else if (Math.hypot(this._x - before.x, this._z - before.z) > 1e-6) this._heading = headingBetween(before, this);
    this._moving = !this.follow.done;
    return this.follow.done;
  }
}

function distanceToSegment(x: number, z: number, a: Point2, b: Point2): number {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const len2 = dx * dx + dz * dz;
  const t = len2 > 0 ? Math.min(1, Math.max(0, ((x - a.x) * dx + (z - a.z) * dz) / len2)) : 0;
  return Math.hypot(x - (a.x + t * dx), z - (a.z + t * dz));
}
