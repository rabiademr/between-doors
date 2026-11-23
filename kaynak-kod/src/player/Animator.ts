// View: drives one character's clips — blended locomotion (idle / walk / sprint, carry variants), one-shots
// over it (pick-up, victory…), a held pose (sitting on the bike), and procedural gestures layered on the
// bones afterwards (talk, wave, nod). Rules live in animationState.ts and gestures.ts (pure, tested).
import type { AnimationGroup } from '@babylonjs/core/Animations/animationGroup';
import { Quaternion } from '@babylonjs/core/Maths/math.vector';
import type { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import type { Observer } from '@babylonjs/core/Misc/observable';
import type { Scene } from '@babylonjs/core/scene';
import { LOCOMOTION_CLIPS, clipForSpeed, oneShotWeight, playbackRate, stepWeights, weightsFor, type Weights } from './animationState';
import type { CharacterModel } from './CharacterModel';
import { gestureDuration, gestureOffsets, type GestureKind } from './gestures';

interface OneShot {
  clip: AnimationGroup;
  elapsed: number;
  duration: number;
  onDone?: () => void;
}

export class Animator {
  private readonly model: CharacterModel;
  private readonly scene: Scene;
  private weights: Weights = weightsFor('idle');
  private oneShot: OneShot | null = null;
  private held: AnimationGroup | null = null;
  private gesture: { kind: GestureKind; t: number } | null = null;
  private readonly bones = new Map<string, TransformNode>();
  /** Bone rotations before this frame's gesture offsets (restored before the clips run again). */
  private readonly saved: { node: TransformNode; rotation: Quaternion }[] = [];
  private readonly beforeObserver: Observer<Scene>;
  private readonly afterObserver: Observer<Scene>;

  constructor(model: CharacterModel, scene: Scene) {
    this.model = model;
    this.scene = scene;
    for (const n of model.root.getChildTransformNodes(false)) this.bones.set(n.name, n);
    for (const name of LOCOMOTION_CLIPS) {
      const clip = model.clips.get(name);
      if (!clip) continue;
      clip.start(true); // all locomotion clips loop together; weights decide what you see
      clip.weight = this.weights[name];
    }
    this.beforeObserver = scene.onBeforeAnimationsObservable.add(() => this.restoreBones());
    this.afterObserver = scene.onAfterAnimationsObservable.add(() => this.applyGesture());
  }

  /** Call once per frame with the actual ground speed. */
  update(dt: number, speed: number, carrying = false): void {
    const target = clipForSpeed(Math.abs(speed), carrying);
    this.weights = stepWeights(this.weights, target, dt);

    let shot = 0;
    const os = this.oneShot;
    if (os) {
      os.elapsed += dt;
      shot = oneShotWeight(os.elapsed, os.duration);
      os.clip.weight = shot;
      if (os.elapsed >= os.duration) {
        os.clip.stop();
        this.oneShot = null;
        os.onDone?.();
      }
    }
    const base = this.held ? 0 : 1 - shot;
    for (const name of LOCOMOTION_CLIPS) {
      const clip = this.model.clips.get(name);
      if (!clip) continue;
      clip.weight = this.weights[name] * base;
      clip.speedRatio = playbackRate(name, Math.abs(speed));
    }

    if (this.gesture) {
      this.gesture.t += dt;
      const d = gestureDuration(this.gesture.kind);
      if (d !== null && this.gesture.t >= d) this.gesture = null;
    }
  }

  /** Play a clip once over the locomotion (it blends back afterwards). Unknown clip → just calls onDone. */
  playOnce(name: string, onDone?: () => void): void {
    const clip = this.model.clips.get(name);
    if (!clip) return onDone?.();
    this.oneShot?.clip.stop();
    clip.start(false, 1, clip.from, clip.to);
    clip.weight = 0;
    this.oneShot = { clip, elapsed: 0, duration: clipSeconds(clip), onDone };
  }

  /** Freeze the last frame of a clip at full weight (null releases it). E.g. 'sit-down' on the saddle. */
  hold(name: string | null): void {
    if (this.held) {
      this.held.stop();
      this.held = null;
    }
    if (!name) return;
    const clip = this.model.clips.get(name);
    if (!clip) return;
    clip.start(false, 1, clip.to, clip.to);
    clip.weight = 1;
    this.held = clip;
  }

  /** Start a gesture (talk loops until set to null; wave and nod stop by themselves). */
  setGesture(kind: GestureKind | null): void {
    if (kind === null) this.gesture = null;
    else if (this.gesture?.kind !== kind) this.gesture = { kind, t: 0 };
  }

  get gestureKind(): GestureKind | null {
    return this.gesture?.kind ?? null;
  }

  dispose(): void {
    this.scene.onBeforeAnimationsObservable.remove(this.beforeObserver);
    this.scene.onAfterAnimationsObservable.remove(this.afterObserver);
    this.restoreBones();
  }

  private restoreBones(): void {
    for (const s of this.saved) s.node.rotationQuaternion = s.rotation;
    this.saved.length = 0;
  }

  private applyGesture(): void {
    const g = this.gesture;
    if (!g) return;
    for (const o of gestureOffsets(g.kind, g.t)) {
      const bone = this.bones.get(o.bone);
      if (!bone?.rotationQuaternion) continue;
      this.saved.push({ node: bone, rotation: bone.rotationQuaternion });
      bone.rotationQuaternion = bone.rotationQuaternion.multiply(Quaternion.RotationYawPitchRoll(o.y, o.x, o.z));
    }
  }
}

/** Length of a clip in seconds (frames ÷ the animation's frame rate). */
function clipSeconds(clip: AnimationGroup): number {
  const fps = clip.targetedAnimations[0]?.animation.framePerSecond ?? 60;
  return Math.max(0.1, (clip.to - clip.from) / fps);
}
