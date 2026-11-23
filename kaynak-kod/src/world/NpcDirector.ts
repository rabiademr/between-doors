// View: Bellwick's townsfolk. One director spawns them all (content/npcs.ts) and moves them from a single
// per-frame `update` — no per-NPC scene observers. Where each one is and what it does comes from the pure
// routine machine (domain/npc/routine.ts); this file only shows it.
//
// Cost control (target: 25+ townsfolk at 60 FPS):
// - one clip playing per person (crowd.ClipFader), unused clips are disposed after loading;
// - beyond FREEZE m from the player: clips stop and bone matrices are no longer updated;
// - beyond HIDE m: the person is disabled, and the routine is advanced in coarse ticks so they are in the
//   right place when they come back.
// People are solid (a small moving circle collider) but polite: a walker waits while the player stands in
// its way, and queues behind another walker instead of walking through them.
import { Quaternion } from '@babylonjs/core/Maths/math.vector';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import type { Observer } from '@babylonjs/core/Misc/observable';
import type { Scene } from '@babylonjs/core/scene';
import { TOWNSFOLK, type TownsfolkDef } from '../content/npcs';
import { Routine, phaseFor } from '../domain/npc/routine';
import { fitModel, loadCharacter, type CharacterModel } from '../player/CharacterModel';
import { SEATED_ARMS, gestureDuration, gestureOffsets, type GestureKind } from '../player/gestures';
import { WALK_SPEED, turnToward } from '../player/movement';
import { ClipFader, clipSeconds, freezeSkeletons, lodFor, type Lod, type LodRanges } from './crowd';
import { NPC_HEIGHT } from './Npc';
import type { ColliderMeta } from './SceneColliders';
import { headingBetween, type Point2 } from './waypoints';

// Hide at 55 m (was 70): each person is 6–9 skinned meshes, the biggest share of Indigo Row's draw calls;
// past the fog's start (45 m) a pop-out is hard to see.
const RANGES: LodRanges = { freeze: 35, hide: 55 };
/** Low graphics: people further than this are hidden. */
const LOW_HIDE = 40;
/** Hidden people advance their routine this often (seconds). */
const FAR_TICK = 0.5;
/** A walker waits while the player is this close in front of it (m). */
const PLAYER_STOP = 0.9;
/** …and while another walker is this close in front of it. */
const QUEUE_STOP = 0.8;
/** "In front": within this angle of the walking direction (cosine). */
const FRONT_COS = 0.35;
const TURN_SPEED = 5;
/** Seconds a greeted person stays turned toward the player. */
const GREET_SECONDS = 3;
/** The clips townsfolk use; every other clip of the shared rig is disposed. */
const CLIPS = ['idle', 'walk', 'sit-down'] as const;
const GESTURE_BONES = ['Head', 'UpperArm.R', 'UpperArm.L'];

/**
 * The sit-down clip lowers the hips almost to the ground (it is a "sit on the floor/low step" clip), while a
 * bench seat is 0.5 m up: without this the sitter is sunk into the bench to the waist. Feet dangle a little.
 */
const SEAT_LIFT = 0.28;
/** Eased, so the body does not pop up as it starts to slide onto the seat. */
const seatLift = (onSeat: number): number => SEAT_LIFT * onSeat * onSeat * (3 - 2 * onSeat);

interface Person {
  def: TownsfolkDef;
  routine: Routine;
  node: TransformNode;
  collider: Mesh;
  model: CharacterModel | null;
  meshes: AbstractMesh[];
  bones: Map<string, TransformNode>;
  fader: ClipFader;
  lod: Lod;
  /** Routine time not yet applied while hidden. */
  pending: number;
  /** Seconds left of a greeting (turned toward the player). */
  greeting: number;
  gesture: { kind: GestureKind; t: number } | null;
  /** Seconds in the seated clip; the arms are lowered into the lap once it has played. */
  seated: number;
  armsDown: boolean;
  wasTalking: boolean;
  /** Waiting for the player or another walker this frame. */
  waiting: boolean;
  /** Start point of its walk cycle (0..1), so the crowd does not march in step. */
  stride: number;
}

export class NpcDirector {
  private readonly scene: Scene;
  private readonly people: Person[] = [];
  private visible = true;
  private ranges: LodRanges = RANGES;

  /** Graphics quality: low hides people sooner. */
  setLowQuality(low: boolean): void {
    this.ranges = low ? { ...RANGES, hide: LOW_HIDE } : RANGES;
  }
  private loading = false;
  private disposed = false;
  /** Bone rotations before this frame's gesture offsets (restored before the clips run again). */
  private readonly saved: { bone: TransformNode; rotation: Quaternion }[] = [];
  private readonly beforeObserver: Observer<Scene>;
  private readonly afterObserver: Observer<Scene>;

  constructor(scene: Scene, defs: readonly TownsfolkDef[] = TOWNSFOLK) {
    this.scene = scene;
    for (const def of defs) this.people.push(this.spawn(def));
    // One pair of observers for the whole crowd (gestures are layered on the bones after the clips).
    this.beforeObserver = scene.onBeforeAnimationsObservable.add(() => this.restoreBones());
    this.afterObserver = scene.onAfterAnimationsObservable.add(() => this.applyGestures());
    scene.onDisposeObservable.addOnce(() => this.dispose());
  }

  get count(): number {
    return this.people.length;
  }

  /** How many are currently shown / animated (debugging and performance checks). */
  get stats(): { loaded: number; animated: number; frozen: number; hidden: number } {
    const of = (lod: Lod): number => this.people.filter((q) => q.model && q.lod === lod).length;
    return { loaded: this.people.filter((q) => q.model).length, animated: of(0), frozen: of(1), hidden: of(2) };
  }

  /**
   * Load the models one after another (each GLB is parsed once per scene, see CharacterModel), so the
   * crowd trickles in without a long stall. People appear — and become solid — as their model arrives.
   */
  async load(): Promise<void> {
    if (this.loading) return;
    this.loading = true;
    for (const person of this.people) {
      if (this.disposed) return;
      try {
        this.attach(person, await loadCharacter(this.scene, person.def.model));
      } catch (err) {
        console.warn(`Townsperson ${person.def.id} failed to load.`, err);
      }
    }
  }

  /** Hide everyone (fixed-camera story moments). Routines keep running, so they reappear mid-routine. */
  setVisible(on: boolean): void {
    this.visible = on;
  }

  /** Call once per frame. `paused` stops routines (pause menu); poses are kept. */
  update(dt: number, player: Point2, paused = false): void {
    const sim = paused ? 0 : dt;
    for (const person of this.people) {
      const { routine, node } = person;
      const distance = Math.hypot(player.x - routine.x, player.z - routine.z);
      const lod: Lod = this.visible && person.model ? lodFor(distance, person.lod, this.ranges) : 2;
      if (lod !== person.lod) this.setLod(person, lod);

      if (lod === 2) {
        // Out of sight: coarse, cheap ticks.
        person.pending += sim;
        if (person.pending >= FAR_TICK) {
          routine.update(person.pending);
          person.pending = 0;
        }
        continue;
      }

      const seatedNow = routine.anim === 'sit';
      if (person.greeting > 0) person.greeting -= dt;
      person.waiting = routine.onWalk && (this.playerInWay(person, player) || this.walkerInWay(person));
      routine.update(sim, paused || person.greeting > 0 || person.waiting);
      node.position.set(routine.x, seatLift(routine.onSeat), routine.z);
      const facePlayer = person.greeting > 0 && !seatedNow;
      const target = facePlayer ? headingBetween(routine, player) : routine.heading;
      node.rotation.y = turnToward(node.rotation.y, target, TURN_SPEED * dt);

      if (lod === 0) this.animate(person, dt, paused);
    }
  }

  /** The nearest visible townsperson within `range` of the player, or null. */
  nearest(player: Point2, range: number): Point2 | null {
    const person = this.nearestPerson(player, range);
    return person ? { x: person.routine.x, z: person.routine.z } : null;
  }

  /**
   * The nearest townsperson within `range` turns to the player and waves or nods (seated people just nod).
   * @returns false if nobody is close enough.
   */
  greet(player: Point2, range: number): boolean {
    const person = this.nearestPerson(player, range);
    if (!person) return false;
    person.greeting = GREET_SECONDS;
    const kind: GestureKind = person.routine.anim === 'sit' || Math.random() < 0.35 ? 'nod' : 'wave';
    person.gesture = { kind, t: 0 };
    return true;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.scene.onBeforeAnimationsObservable.remove(this.beforeObserver);
    this.scene.onAfterAnimationsObservable.remove(this.afterObserver);
    this.restoreBones();
    for (const person of this.people) {
      person.fader.freeze();
      for (const clip of person.model?.clips.values() ?? []) clip.dispose();
      person.node.dispose(false, false); // geometry and materials belong to the shared containers
    }
    this.people.length = 0;
  }

  // ---------------------------------------------------------------- internals

  private spawn(def: TownsfolkDef): Person {
    const routine = new Routine(def.routine, def.phase ?? phaseFor(def.id));
    const node = new TransformNode(def.id, this.scene);
    node.metadata = { noStream: true }; // moves: never part of the static scenery a district streamer switches off
    node.position.set(routine.x, 0, routine.z);
    node.rotation.y = routine.heading;
    const collider = CreateBox(`${def.id}_collider`, { width: 0.6, height: 1.8, depth: 0.6 }, this.scene);
    collider.parent = node;
    collider.position.y = 0.9;
    collider.isVisible = false;
    collider.isPickable = false;
    collider.checkCollisions = false; // solid once the model is there (no invisible obstacles while loading)
    collider.metadata = { collider: 'circle', dynamicCollider: true, noStream: true } satisfies ColliderMeta & { noStream: boolean };
    node.setEnabled(false);
    return {
      def,
      routine,
      node,
      collider,
      model: null,
      meshes: [],
      bones: new Map(),
      fader: new ClipFader(),
      lod: 2,
      pending: 0,
      greeting: 0,
      gesture: null,
      seated: 0,
      armsDown: false,
      wasTalking: false,
      waiting: false,
      stride: phaseFor(`${def.id}/stride`),
    };
  }

  private attach(person: Person, model: CharacterModel): void {
    if (this.disposed) return;
    fitModel(model, person.node, NPC_HEIGHT);
    for (const [name, clip] of [...model.clips]) {
      if ((CLIPS as readonly string[]).includes(name)) continue;
      clip.dispose();
      model.clips.delete(name);
    }
    person.model = model;
    person.meshes = model.root.getChildMeshes(false);
    // Gesture bones by name; a skeleton's own nodes win over same-named mesh groups.
    for (const n of model.root.getChildTransformNodes(false)) if (GESTURE_BONES.includes(n.name) && !person.bones.has(n.name)) person.bones.set(n.name, n);
    for (const mesh of person.meshes) {
      for (const bone of mesh.skeleton?.bones ?? []) {
        const linked = bone.getTransformNode();
        if (linked && GESTURE_BONES.includes(linked.name)) person.bones.set(linked.name, linked);
      }
    }
    person.collider.checkCollisions = true;
    // Stays hidden (lod 2) until the next update decides from the distance.
  }

  private setLod(person: Person, lod: Lod): void {
    const was = person.lod;
    person.lod = lod;
    if (lod === 2) {
      person.fader.freeze();
      person.gesture = null;
      person.greeting = 0;
      person.node.setEnabled(false);
      return;
    }
    if (was === 2) {
      // Back in sight: catch up, and stand where the routine is (no turning on the spot).
      if (person.pending > 0) person.routine.update(person.pending);
      person.pending = 0;
      person.node.position.set(person.routine.x, seatLift(person.routine.onSeat), person.routine.z);
      person.node.rotation.y = person.routine.heading;
      person.node.setEnabled(true);
    }
    if (lod === 1) {
      person.fader.freeze();
      person.gesture = null;
    }
    person.armsDown = false;
    person.seated = 0;
    freezeSkeletons(person.meshes, lod === 1);
  }

  private animate(person: Person, dt: number, paused: boolean): void {
    const { routine, fader } = person;
    const clips = person.model?.clips;
    if (!clips) return;
    const rate = paused ? 0 : 1;
    if (routine.anim === 'sit') {
      const sit = clips.get('sit-down');
      if (fader.clip !== sit) {
        // Already seated for a while (came back into view): straight into the pose, no sitting down again.
        const settled = routine.stepSeconds > 1.5;
        fader.play(sit, settled ? { endPose: true } : { loop: false });
        person.seated = settled && sit ? clipSeconds(sit) : 0;
        person.armsDown = false;
      }
      person.seated += dt;
      if (!person.armsDown && sit && person.seated > clipSeconds(sit) + 0.1) {
        // The clip has ended and holds its last frame (arms out to the sides): hands into the lap, once.
        for (const o of SEATED_ARMS) {
          const bone = person.bones.get(o.bone);
          if (bone?.rotationQuaternion) bone.rotationQuaternion = bone.rotationQuaternion.multiply(Quaternion.RotationYawPitchRoll(o.y, o.x, o.z));
        }
        person.armsDown = true;
      }
    } else {
      person.armsDown = false;
      if (routine.moving) {
        const speed = Math.min(1.5, Math.max(0.6, routine.def.speed / WALK_SPEED)); // as Animator.playbackRate
        fader.play(clips.get('walk'), { speed: speed * rate, offset: person.stride });
      } else {
        fader.play(clips.get('idle'), { speed: rate, offset: person.stride });
      }
    }
    fader.update(dt);

    // Gestures: talking in a chat (a nod when it is the other's turn), or the greeting in progress.
    const g = person.gesture;
    if (g && g.kind !== 'talk') {
      g.t += dt;
      const d = gestureDuration(g.kind);
      if (d !== null && g.t >= d) person.gesture = null;
    } else if (routine.talking) {
      if (g) g.t += dt;
      else person.gesture = { kind: 'talk', t: 0 };
    } else {
      person.gesture = person.wasTalking ? { kind: 'nod', t: 0 } : null;
    }
    person.wasTalking = routine.talking;
  }

  private nearestPerson(player: Point2, range: number): Person | null {
    let best: Person | null = null;
    let bestDistance = range;
    for (const person of this.people) {
      if (person.lod !== 0) continue;
      const d = Math.hypot(person.routine.x - player.x, person.routine.z - player.z);
      if (d <= bestDistance) {
        best = person;
        bestDistance = d;
      }
    }
    return best;
  }

  private playerInWay(person: Person, player: Point2): boolean {
    return inFront(person.routine, player, PLAYER_STOP);
  }

  /** Queue behind another walker; of two walkers facing each other only the later one in the list waits. */
  private walkerInWay(person: Person): boolean {
    const me = person.routine;
    for (const other of this.people) {
      if (other === person || other.lod === 2) continue;
      // Someone from the same loop who has stopped ahead (a wait point) is not walked into either; other
      // standers (the chat groups beside the routes) never hold a walker up.
      if (!other.routine.onWalk && other.routine.def !== me.def) continue;
      if (!inFront(me, other.routine, QUEUE_STOP)) continue;
      const headOn = inFront(other.routine, me, QUEUE_STOP);
      if (!headOn || this.people.indexOf(other) < this.people.indexOf(person)) return true;
    }
    return false;
  }

  private restoreBones(): void {
    for (const s of this.saved) s.bone.rotationQuaternion = s.rotation;
    this.saved.length = 0;
  }

  private applyGestures(): void {
    for (const person of this.people) {
      const g = person.gesture;
      if (!g || person.lod !== 0) continue;
      for (const o of gestureOffsets(g.kind, g.t)) {
        const bone = person.bones.get(o.bone);
        if (!bone?.rotationQuaternion) continue;
        this.saved.push({ bone, rotation: bone.rotationQuaternion });
        bone.rotationQuaternion = bone.rotationQuaternion.multiply(Quaternion.RotationYawPitchRoll(o.y, o.x, o.z));
      }
    }
  }
}

/** True if `other` is within `reach` metres of `me` and ahead of where `me` is heading. */
function inFront(me: { x: number; z: number; heading: number }, other: Point2, reach: number): boolean {
  const dx = other.x - me.x;
  const dz = other.z - me.z;
  const d = Math.hypot(dx, dz);
  if (d > reach) return false;
  if (d < 1e-6) return true;
  return (dx * Math.sin(me.heading) + dz * Math.cos(me.heading)) / d > FRONT_COS;
}
