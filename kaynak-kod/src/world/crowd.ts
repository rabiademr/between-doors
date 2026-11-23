// View helpers shared by the ambient characters (world/NpcDirector, world/Animals): cheap animation and
// distance-based level of detail, so a few dozen of them cost little.
// - ClipFader plays ONE clip per character (the player's Animator keeps five running and blends them) and
//   eases into it from whatever pose the character is in.
// - lodFor decides, from the distance to the player, whether a character is animated, frozen or hidden.
// - freezeSkeletons stops the per-frame bone-matrix work of a frozen character.
import type { AnimationGroup } from '@babylonjs/core/Animations/animationGroup';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';

/** Seconds to ease from the current pose into a new clip. */
const FADE_SECONDS = 0.2;
/**
 * A clip never starts at weight 0: Babylon treats that as "paused", and the blend below starts from the pose
 * the character has when the clip first runs.
 */
const START_WEIGHT = 0.02;

export interface PlayOptions {
  loop?: boolean;
  speed?: number;
  /** 0..1 start point in a looping clip (so a crowd does not walk in step). */
  offset?: number;
  /** Jump straight to the clip's last frame and stay there (a pose, e.g. already seated). */
  endPose?: boolean;
}

export class ClipFader {
  private current: AnimationGroup | null = null;
  private fade = 1;

  get clip(): AnimationGroup | null {
    return this.current;
  }

  /**
   * Switch to `clip` (no-op if it is already the current one, apart from the speed). While its weight rises
   * from 0 to 1 Babylon blends it with the pose the bones had when it started, so the old clip can simply stop.
   */
  play(clip: AnimationGroup | null | undefined, options: PlayOptions = {}): void {
    const next = clip ?? null;
    if (next === this.current) {
      if (next && options.speed !== undefined) next.speedRatio = options.speed;
      return;
    }
    this.current?.stop();
    this.current = next;
    this.fade = 1;
    if (!next) return;
    if (options.endPose) {
      next.start(false, 1, next.to, next.to);
      next.weight = 1;
      return;
    }
    const loop = options.loop ?? true;
    next.start(loop, options.speed ?? 1, next.from, next.to);
    if (loop && options.offset) next.goToFrame(next.from + options.offset * (next.to - next.from));
    next.weight = START_WEIGHT;
    this.fade = START_WEIGHT;
  }

  update(dt: number): void {
    if (!this.current || this.fade >= 1) return;
    this.fade = Math.min(1, this.fade + dt / FADE_SECONDS);
    this.current.weight = this.fade;
  }

  /** Stop animating; the bones keep the pose they have. */
  freeze(): void {
    this.current?.stop();
    this.current = null;
    this.fade = 1;
  }
}

/** Length of a clip in seconds (frames ÷ the animation's frame rate). */
export function clipSeconds(clip: AnimationGroup): number {
  const fps = clip.targetedAnimations[0]?.animation.framePerSecond ?? 60;
  return Math.max(0.1, (clip.to - clip.from) / fps);
}

/** 0 = animated, 1 = frozen pose (still moves along its routine), 2 = hidden. */
export type Lod = 0 | 1 | 2;

export interface LodRanges {
  /** Beyond this distance (m) clips stop and bones are no longer updated. */
  freeze: number;
  /** Beyond this distance (m) the character is disabled. */
  hide: number;
}

/** Metres a character must come back inside a range before it switches again (no flicker at the edge). */
const LOD_HYSTERESIS = 2;

export function lodFor(distance: number, current: Lod, ranges: LodRanges): Lod {
  const hide = ranges.hide + (current === 2 ? 0 : LOD_HYSTERESIS);
  if (distance > hide) return 2;
  const freeze = ranges.freeze + (current === 0 ? LOD_HYSTERESIS : 0);
  return distance > freeze ? 1 : 0;
}

/**
 * A frozen character keeps its last bone matrices: skip the skeleton's per-frame `prepare` (which would
 * recompute every bone from its transform node although nothing moved).
 */
export function freezeSkeletons(meshes: readonly AbstractMesh[], frozen: boolean): void {
  for (const mesh of meshes) {
    const skeleton = mesh.skeleton;
    if (!skeleton) continue;
    if (frozen) skeleton.prepare = noPrepare;
    else if (Object.hasOwn(skeleton, 'prepare')) Reflect.deleteProperty(skeleton, 'prepare'); // back to the prototype's
  }
}
const noPrepare = (): void => {};
