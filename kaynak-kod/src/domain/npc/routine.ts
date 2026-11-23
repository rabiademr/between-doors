// Model: a townsperson's (or an animal's) daily routine as a small, pure state machine. No Babylon, no DOM.
//
// A routine is a looping list of steps — walk a path, wait, sit on a seat, chat facing someone. `update(dt)`
// advances it and exposes where the character is, which way it faces and which animation fits. It is
// deterministic: the same definition, phase and sequence of dt always give the same result, and one big dt
// equals many small ones (so characters far from the player can be advanced in coarse, cheap ticks and are
// in the right place when they come back into view).
import { followRoute, headingBetween, type Point2 } from './waypoints';

/** What the character is doing, for the view to pick a clip/pose. */
export type NpcAnim = 'idle' | 'walk' | 'sit' | 'chat';

export type RoutineStep =
  /** Walk through the points in order, from wherever the previous step ended. */
  | { kind: 'walk'; path: readonly Point2[] }
  /** Stand still; `face` turns the character toward a point (a shop window, the fountain). */
  | { kind: 'wait'; seconds: number; face?: Point2 }
  /** Sit down on `seat` facing `heading`, then get up and step back to where the step began. */
  | { kind: 'sit'; seat: Point2; heading: number; seconds: number }
  /**
   * Stand and talk toward `face` (the partner, or the middle of a group). The members take turns talking:
   * give each its own `turn` (0, 1, …) and, for more than two, the group size in `of`.
   */
  | { kind: 'chat'; seconds: number; face: Point2; turn?: number; of?: number };

export interface RoutineDef {
  /** Where the character stands when the routine begins (the loop should come back here). */
  start: Point2;
  /** Initial yaw (rotation.y; 0 = +Z). */
  heading?: number;
  /** Walking speed, m/s. */
  speed: number;
  steps: readonly RoutineStep[];
}

/** Seconds to slide between the standing point and the seat when sitting down / getting up. */
export const SIT_MOVE_SECONDS = 0.5;
/** The character is already standing (idle) this long before a sit step ends. */
export const SIT_RISE_SECONDS = 0.6;
/** A sit step shorter than this would never show the seated pose. */
export const MIN_SIT_SECONDS = SIT_MOVE_SECONDS + SIT_RISE_SECONDS + 1;
/** Seconds each partner of a chat talks before the other answers. */
export const CHAT_TURN_SECONDS = 3.5;

const EPS = 1e-6;
const dist = (a: Point2, b: Point2): number => Math.hypot(b.x - a.x, b.z - a.z);

/** Length of a walk from `from` through `path`. */
export function pathLength(from: Point2, path: readonly Point2[]): number {
  let total = 0;
  let at = from;
  for (const p of path) {
    total += dist(at, p);
    at = p;
  }
  return total;
}

/** Where the character stands after `step` when it began at `from` (sitting ends back at the approach point). */
function endOf(step: RoutineStep, from: Point2): Point2 {
  return step.kind === 'walk' ? (step.path[step.path.length - 1] ?? from) : from;
}

/** Where the loop arrives after one full pass (the entry point of step 0 from the second cycle on). */
function loopPoint(def: RoutineDef): Point2 {
  return def.steps.reduce((at, step) => endOf(step, at), def.start);
}

export interface RoutineLayout {
  /** Every straight stretch the character walks in the steady loop (including the closing one). */
  segments: { a: Point2; b: Point2 }[];
  /** Points where it stands still (wait, chat, and the standing point in front of a seat). */
  stops: Point2[];
  /** Seat points (on furniture: allowed inside an obstacle). */
  seats: Point2[];
  /** Duration of one steady loop. */
  cycleSeconds: number;
}

/** The routine's geometry and duration, for content checks (walkable ground, keep-out zones). */
export function routineLayout(def: RoutineDef): RoutineLayout {
  const layout: RoutineLayout = { segments: [], stops: [], seats: [], cycleSeconds: 0 };
  let at = loopPoint(def);
  for (const step of def.steps) {
    if (step.kind === 'walk') {
      for (const p of step.path) {
        if (dist(at, p) > EPS) layout.segments.push({ a: at, b: p });
        at = p;
      }
    } else {
      layout.stops.push(at);
      if (step.kind === 'sit') layout.seats.push(step.seat);
      layout.cycleSeconds += Math.max(0, step.seconds);
    }
  }
  if (def.speed > 0) layout.cycleSeconds += layout.segments.reduce((sum, s) => sum + dist(s.a, s.b), 0) / def.speed;
  return layout;
}

/** Content problems that would make a routine misbehave (empty = fine). */
export function validateRoutine(def: RoutineDef): string[] {
  const problems: string[] = [];
  if (def.steps.length === 0) problems.push('no steps');
  if (!(def.speed > 0) && def.steps.some((s) => s.kind === 'walk')) problems.push('walks with speed 0');
  for (const [i, s] of def.steps.entries()) {
    if (s.kind === 'walk' && s.path.length === 0) problems.push(`step ${i}: empty path`);
    if (s.kind !== 'walk' && !(s.seconds > 0)) problems.push(`step ${i}: no duration`);
    if (s.kind === 'sit' && s.seconds < MIN_SIT_SECONDS) problems.push(`step ${i}: sits for less than ${MIN_SIT_SECONDS}s`);
  }
  if (routineLayout(def).cycleSeconds <= 0) problems.push('the loop takes no time');
  return problems;
}

/** A stable 0..1 phase from an id (FNV-1a), so townsfolk sharing a routine are spread along it. */
export function phaseFor(id: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) / 0x1_0000_0000;
}

export class Routine {
  readonly def: RoutineDef;
  /** Seconds one steady loop takes. */
  readonly cycleSeconds: number;
  x: number;
  z: number;
  /** Yaw the character wants to face (the view turns toward it smoothly). */
  heading: number;
  anim: NpcAnim = 'idle';
  /** True while its side of a chat is talking. */
  talking = false;
  /** True if the last update moved the character along a path. */
  moving = false;
  /** 0 standing … 1 on the seat of a sit step (the view lifts the body onto the furniture by this much). */
  onSeat = 0;

  private stepIndex = 0;
  /** Seconds spent in the current timed step. */
  private stepTime = 0;
  /** Next waypoint of the current walk step. */
  private next = 0;
  /** Where the current step began (a sit step returns here). */
  private fromX: number;
  private fromZ: number;

  /**
   * @param phase 0..1: how far into its loop the routine starts (see `phaseFor`), so characters sharing a
   * routine do not move in step.
   */
  constructor(def: RoutineDef, phase = 0) {
    this.def = def;
    this.cycleSeconds = routineLayout(def).cycleSeconds;
    this.x = this.fromX = def.start.x;
    this.z = this.fromZ = def.start.z;
    this.heading = def.heading ?? 0;
    const offset = (((phase % 1) + 1) % 1) * this.cycleSeconds;
    this.pose();
    if (offset > 0) this.update(offset);
  }

  /** Index of the step in progress (for tests and debugging). */
  get step(): number {
    return this.stepIndex;
  }

  /** True while the step in progress is a walk (even when held up on the way). */
  get onWalk(): boolean {
    return this.def.steps[this.stepIndex]?.kind === 'walk';
  }

  /** Seconds spent in the timed step in progress (0 on a walk). */
  get stepSeconds(): number {
    return this.stepTime;
  }

  /**
   * Advance by `dt` seconds. While `held` nothing advances (someone is in the way, or the character was
   * spoken to): the character stands where it is.
   */
  update(dt: number, held = false): void {
    this.moving = false;
    const steps = this.def.steps;
    if (steps.length === 0) return;
    if (held) {
      if (this.anim === 'walk') this.anim = 'idle';
      this.talking = false;
      return;
    }
    let left = Math.max(0, dt);
    // Guard: zero-length steps must not spin forever; a huge dt (hidden tab) is simply cut short.
    for (let guard = 0; left > 0 && guard < 4 * steps.length + 8; guard++) {
      const step = steps[this.stepIndex];
      if (!step) break;
      left = step.kind === 'walk' ? this.walk(step.path, left) : this.stay(step.seconds, left);
    }
    this.pose();
  }

  /** Walk for up to `left` seconds; returns the time not used (> 0 only if the path ended). */
  private walk(path: readonly Point2[], left: number): number {
    const speed = this.def.speed;
    const here = { x: this.x, z: this.z };
    const target = path[this.next];
    const remaining = target ? dist(here, target) + pathLength(target, path.slice(this.next + 1)) : 0;
    if (!(speed > 0) || remaining <= speed * left) {
      // Arrives within this update.
      const end = path[path.length - 1] ?? here;
      const from = path.length > 1 && this.next >= path.length - 1 ? here : (path[path.length - 2] ?? here);
      if (dist(from, end) > EPS) this.heading = headingBetween(from, end);
      else if (dist(here, end) > EPS) this.heading = headingBetween(here, end);
      this.moving = this.moving || remaining > EPS;
      this.x = end.x;
      this.z = end.z;
      this.enter(this.stepIndex + 1);
      return speed > 0 ? left - remaining / speed : 0;
    }
    const s = followRoute({ x: this.x, z: this.z, next: this.next, done: false }, path, speed, left);
    this.x = s.x;
    this.z = s.z;
    this.next = s.next;
    const ahead = path[s.next];
    if (ahead && dist(s, ahead) > EPS) this.heading = headingBetween(s, ahead);
    this.moving = true;
    return 0;
  }

  /** Spend up to `left` seconds in a timed step; returns the time not used (> 0 only if the step ended). */
  private stay(seconds: number, left: number): number {
    const used = Math.min(left, Math.max(0, seconds - this.stepTime));
    this.stepTime += used;
    if (this.stepTime >= seconds - EPS) {
      // A sit step ends back where it began.
      this.x = this.fromX;
      this.z = this.fromZ;
      this.enter(this.stepIndex + 1);
    }
    return left - used;
  }

  private enter(index: number): void {
    this.stepIndex = index % this.def.steps.length;
    this.stepTime = 0;
    this.next = 0;
    this.fromX = this.x;
    this.fromZ = this.z;
  }

  /** Position, facing and animation of the step in progress. */
  private pose(): void {
    const step = this.def.steps[this.stepIndex];
    this.talking = false;
    this.onSeat = 0;
    if (!step) return;
    if (step.kind === 'walk') {
      this.anim = 'walk';
      return;
    }
    const t = this.stepTime;
    if (step.kind === 'wait') {
      this.anim = 'idle';
      if (step.face && dist(this, step.face) > EPS) this.heading = headingBetween(this, step.face);
    } else if (step.kind === 'chat') {
      this.anim = 'chat';
      if (dist(this, step.face) > EPS) this.heading = headingBetween(this, step.face);
      this.talking = Math.floor(t / CHAT_TURN_SECONDS) % Math.max(2, step.of ?? 2) === (step.turn ?? 0);
    } else {
      // Sit: slide onto the seat, stay, get up and slide back to the standing point.
      const k = Math.min(1, t / SIT_MOVE_SECONDS, Math.max(0, step.seconds - t) / SIT_MOVE_SECONDS);
      this.x = this.fromX + (step.seat.x - this.fromX) * k;
      this.z = this.fromZ + (step.seat.z - this.fromZ) * k;
      this.heading = step.heading;
      this.onSeat = k;
      this.anim = t < step.seconds - SIT_RISE_SECONDS ? 'sit' : 'idle';
    }
  }
}
