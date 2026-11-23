// View + control: the player's body, model and animation. Movement is a pure Mover (on foot or on a
// vehicle: bike, scooter, motorcycle, van) resolved by the CollisionWorld (2D, flat world, no physics
// engine); the camera is a CameraRig. This class copies the movers' result onto the meshes.
import { Color3 } from '@babylonjs/core/Maths/math.color';
import type { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder';
import { CreateCapsule } from '@babylonjs/core/Meshes/Builders/capsuleBuilder';
import type { Scene } from '@babylonjs/core/scene';
import type { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera';
import type { CollisionWorld } from '../domain/collision/CollisionWorld';
import { Animator } from './Animator';
import { CameraRig, type FollowTarget } from './CameraRig';
import { fitModel, type CharacterModel } from './CharacterModel';
import type { MouseLook } from './MouseLook';
import { MAX_FRAME_SECONDS, type MoveInput } from './movement';
import { FOOT_RADIUS, FootMover } from './movers/FootMover';
import type { Mover } from './movers/Mover';
import { VehicleMover } from './movers/VehicleMover';
import { VEHICLES, nextVehicle, type VehicleKind } from './movers/vehicles';
import { createVehicleVisual, type RiderSeat, type VehicleVisual } from './vehicles';

const PLAYER_HEIGHT = 1.8;
const CAMERA_TARGET_HEIGHT = 1.4; // look at shoulders, not feet
/** Visual height of the character model (the body capsule stays PLAYER_HEIGHT). */
const MODEL_HEIGHT = 1.7;

export interface PlayerOptions {
  spawn: Vector3;
  canvas: HTMLCanvasElement;
  collisions: CollisionWorld;
}

export class PlayerController {
  readonly body: Mesh;
  readonly rig: CameraRig;
  /** When false (panel/menu open), the player does not move. Camera still works. */
  movementEnabled = true;
  /** Actual speed last frame (after collisions), m/s; signed along the heading on a vehicle. */
  speed = 0;

  private readonly scene: Scene;
  private readonly collisions: CollisionWorld;
  private readonly foot = new FootMover();
  private mover: Mover = this.foot;
  private vehicleKind: VehicleKind | null = null;
  /** Built on first use and kept, so switching back is instant. */
  private readonly vehicleMovers = new Map<VehicleKind, VehicleMover>();
  private readonly vehicleVisuals = new Map<VehicleKind, VehicleVisual>();
  private model: CharacterModel | null = null;
  /** Clips + gestures of the loaded model (null until it has loaded). */
  animator: Animator | null = null;
  /** A parcel in hand: walking and running use the carry clips. */
  carrying = false;

  constructor(scene: Scene, opts: PlayerOptions) {
    // Placeholder body until the character model has loaded.
    this.body = CreateCapsule('player', { height: PLAYER_HEIGHT, radius: FOOT_RADIUS }, scene);
    const mat = new StandardMaterial('playerMat', scene);
    mat.diffuseColor = new Color3(0.2, 0.45, 0.85);
    this.body.material = mat;
    // Little "backpack" so you can see which way the player faces.
    const pack = CreateBox('playerPack', { width: 0.45, height: 0.5, depth: 0.2 }, scene);
    pack.parent = this.body;
    pack.position.set(0, 0.15, -0.35);
    pack.material = mat;
    pack.isPickable = false;

    this.body.position.set(opts.spawn.x, opts.spawn.y + PLAYER_HEIGHT / 2, opts.spawn.z); // spawn is at the feet
    this.body.checkCollisions = false; // the player itself is not an obstacle
    this.scene = scene;
    this.collisions = opts.collisions;
    this.rig = new CameraRig(scene, opts.canvas);
    this.rig.snap(this.followTarget());
  }

  get camera(): ArcRotateCamera {
    return this.rig.camera;
  }
  get mouseLook(): MouseLook {
    return this.rig.mouseLook;
  }

  /** Upgrade "Steady Pace" sets this to 1.1. */
  get runMultiplier(): number {
    return this.foot.runMultiplier;
  }
  set runMultiplier(v: number) {
    this.foot.runMultiplier = v;
  }

  /** The vehicle the player is on, or null on foot. */
  get vehicle(): VehicleKind | null {
    return this.vehicleKind;
  }

  get isRiding(): boolean {
    return this.vehicleKind !== null;
  }

  /** Get on a vehicle, swap vehicles, or get off (null). Stops dead either way. */
  setVehicle(kind: VehicleKind | null): void {
    if (kind === this.vehicleKind) return;
    if (this.vehicleKind) this.visualFor(this.vehicleKind).setVisible(false);
    this.vehicleKind = kind;
    this.speed = 0;
    if (kind) {
      const mover = this.moverFor(kind);
      this.mover = mover;
      this.visualFor(kind).setVisible(true);
      if (mover.isCapsule) {
        // A long body may not fit where the player stood: push it out of whatever it overlaps.
        const p = this.body.position;
        const out = this.collisions.moveCapsule(mover.capsule(p.x, p.z, this.body.rotation.y), 0, 0);
        p.x = out.x;
        p.z = out.z;
      }
    } else {
      this.mover = this.foot;
    }
    this.placeModel();
    this.applyRiderVisibility();
    this.animator?.hold(this.seat?.pose ?? null);
  }

  /** For callers that only know "riding or not": true gets on the bike, false gets off anything. */
  setRiding(riding: boolean): void {
    if (riding !== this.isRiding) this.setVehicle(riding ? 'bike' : null);
  }

  /** Dev: foot → bike → scooter → motorcycle → van → foot. */
  cycleVehicle(): void {
    this.setVehicle(nextVehicle(this.vehicleKind));
  }

  /** 1 = default; settings value (0.25–4). */
  setCameraSensitivity(multiplier: number): void {
    this.mouseLook.sensitivity = multiplier;
  }

  /** Called once per frame by the game loop. */
  update(rawInput: MoveInput, dtSeconds: number): void {
    const dt = Math.min(Math.max(dtSeconds, 0), MAX_FRAME_SECONDS);
    const p = this.body.position;
    if (this.movementEnabled) {
      const next = this.mover.step(
        { x: p.x, z: p.z, heading: this.body.rotation.y, speed: this.speed },
        { input: rawInput, cameraAlpha: this.rig.alpha, dt, collisions: this.collisions },
      );
      p.x = next.x;
      p.z = next.z;
      this.body.rotation.y = next.heading;
      this.speed = next.speed;
    } else {
      // A menu, the map or a dialogue is open: freeze in place. A vehicle must not coast on its momentum
      // (it could roll away from the door the player is delivering to).
      this.speed = 0;
    }
    if (this.vehicleKind) this.visualFor(this.vehicleKind).update(this.speed, dt);
    this.updateAnimation(dt);
    this.rig.update(this.followTarget(), dt);
  }

  /** Swap the placeholder capsule for the real character model (the capsule stays as the invisible body). */
  attachModel(model: CharacterModel): void {
    this.model = model;
    this.placeModel();
    this.applyRiderVisibility();
    this.animator = new Animator(model, this.body.getScene());
    this.animator.hold(this.seat?.pose ?? null);
  }

  /** Where the rider goes on the current vehicle (null on foot). */
  private get seat(): RiderSeat | null {
    return this.vehicleKind ? this.visualFor(this.vehicleKind).seat : null;
  }

  private moverFor(kind: VehicleKind): VehicleMover {
    let m = this.vehicleMovers.get(kind);
    if (!m) {
      m = new VehicleMover(VEHICLES[kind]);
      this.vehicleMovers.set(kind, m);
    }
    return m;
  }

  private visualFor(kind: VehicleKind): VehicleVisual {
    let v = this.vehicleVisuals.get(kind);
    if (!v) {
      v = createVehicleVisual(kind, this.scene, this.body, -PLAYER_HEIGHT / 2);
      this.vehicleVisuals.set(kind, v);
    }
    return v;
  }

  private placeModel(): void {
    if (!this.model) return;
    // Feet at the bottom of the body capsule (capsule origin = its centre); on a vehicle, at its seat/deck.
    const seat = this.seat;
    fitModel(this.model, this.body, MODEL_HEIGHT, -PLAYER_HEIGHT / 2 + (seat?.lift ?? 0));
    this.model.root.position.z = seat?.z ?? 0;
  }

  /** The rider disappears inside the van's cab; the placeholder capsule only shows until the model loads. */
  private applyRiderVisibility(): void {
    const hidden = this.seat?.hidden ?? false;
    this.model?.root.setEnabled(!hidden);
    const showCapsule = !this.model && !hidden;
    this.body.isVisible = showCapsule;
    for (const child of this.body.getChildMeshes(true)) {
      if (child.name === 'playerPack') child.isVisible = showCapsule;
    }
  }

  private updateAnimation(dt: number): void {
    // On a vehicle the rider holds its pose (or idles on the scooter deck); the vehicle's speed must not
    // drive the walk cycle.
    this.animator?.update(dt, this.isRiding ? 0 : this.speed, this.carrying);
  }

  private followTarget(): FollowTarget {
    const p = this.body.position;
    const t = { x: p.x, y: p.y - PLAYER_HEIGHT / 2 + CAMERA_TARGET_HEIGHT, z: p.z };
    if (!this.vehicleKind) return t;
    const spec = VEHICLES[this.vehicleKind];
    return {
      ...t,
      y: t.y + spec.cameraLift,
      vehicle: { heading: this.body.rotation.y, speed: this.speed, extraDistance: spec.cameraExtra },
    };
  }

  /** Move the player instantly (feet at `feet`), e.g. when restarting a chapter. */
  teleport(feet: Vector3): void {
    this.body.position.set(feet.x, feet.y + PLAYER_HEIGHT / 2, feet.z);
    this.body.rotation.y = 0;
    this.speed = 0;
    this.body.computeWorldMatrix(true);
    this.rig.snap(this.followTarget());
  }

  get position(): Vector3 {
    return this.body.position;
  }
}
