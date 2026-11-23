// Pure animation logic (no Babylon): which clip to play and how to cross-fade.
import { RUN_SPEED, WALK_SPEED } from './movement';

/** Looping clips blended by weight. The *_carry variants hold a parcel in both hands. */
export const LOCOMOTION_CLIPS = ['idle', 'walk', 'sprint', 'walk_carry', 'sprint_carry'] as const;
export type LocomotionClip = (typeof LOCOMOTION_CLIPS)[number];
export type Weights = Record<LocomotionClip, number>;

/** Below this horizontal speed (m/s) the character counts as standing still. */
export const IDLE_THRESHOLD = 0.2;
/** Seconds for a full cross-fade between two clips. */
export const FADE_SECONDS = 0.15;
/** Seconds to blend a one-shot (pick-up, victory…) in and out over the locomotion. */
export const ONE_SHOT_FADE = 0.12;

/** All weight on one clip. */
export function weightsFor(clip: LocomotionClip): Weights {
  const w = Object.fromEntries(LOCOMOTION_CLIPS.map((c) => [c, 0])) as Weights;
  w[clip] = 1;
  return w;
}

/**
 * Pick the clip from the ACTUAL speed (after collisions), so walking into a wall shows idle, not running on
 * the spot. Carrying a parcel swaps walk/sprint for their carry variants (standing still looks the same).
 */
export function clipForSpeed(speedMps: number, carrying = false): LocomotionClip {
  if (speedMps < IDLE_THRESHOLD) return 'idle';
  const fast = speedMps >= (WALK_SPEED + RUN_SPEED) / 2;
  if (carrying) return fast ? 'sprint_carry' : 'walk_carry';
  return fast ? 'sprint' : 'walk';
}

/** Move every clip weight toward 1 (target clip) or 0 (others). Weights always sum to ~1 during a fade. */
export function stepWeights(current: Weights, target: LocomotionClip, dtSeconds: number, fadeSeconds = FADE_SECONDS): Weights {
  const step = fadeSeconds <= 0 ? 1 : Math.max(0, dtSeconds) / fadeSeconds;
  const next = { ...current };
  for (const clip of LOCOMOTION_CLIPS) {
    const goal = clip === target ? 1 : 0;
    const w = current[clip];
    next[clip] = w < goal ? Math.min(goal, w + step) : Math.max(goal, w - step);
  }
  return next;
}

/** Playback speed so feet roughly match ground speed (avoids "ice skating"). */
export function playbackRate(clip: LocomotionClip, speedMps: number): number {
  if (clip === 'idle') return 1;
  const reference = clip === 'walk' || clip === 'walk_carry' ? WALK_SPEED : RUN_SPEED;
  return Math.min(1.5, Math.max(0.6, speedMps / reference));
}

/**
 * Weight of a one-shot clip `elapsed` seconds into a `duration`-second play: fades in, holds at 1, fades out
 * at the end (0 once finished). The locomotion underneath gets (1 − this).
 */
export function oneShotWeight(elapsed: number, duration: number, fade = ONE_SHOT_FADE): number {
  if (elapsed < 0 || elapsed >= duration || duration <= 0) return 0;
  const f = Math.min(fade, duration / 2);
  if (f <= 0) return 1;
  return Math.min(1, elapsed / f, (duration - elapsed) / f);
}
