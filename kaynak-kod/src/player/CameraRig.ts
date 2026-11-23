// View: the third-person camera — mouse look, wheel zoom, wall occlusion and following a target.
// On a vehicle it swings behind the direction of travel once the player stops moving the mouse, and
// pulls back by the vehicle's extra distance (a van needs more room than a bike).
import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera';
import { Ray } from '@babylonjs/core/Culling/ray'; // also registers scene.pickWithRay
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { Scene } from '@babylonjs/core/scene';
import {
  BETA_MAX,
  BETA_MIN,
  FOLLOW_DELAY,
  FOLLOW_MIN_SPEED,
  ZOOM_MAX,
  ZOOM_MIN,
  behindAlpha,
  cameraDistance,
  cameraOffsetDir,
  easeAngle,
  orbitFromView,
} from './cameraMath';
import { MouseLook } from './MouseLook';
import { PALETTE } from '../world/palette';

/** How quickly the vehicle camera swings behind (1/s, exponential). */
const FOLLOW_RATE = 2.5;
/** How quickly the camera pulls back / comes in when the vehicle's extra distance changes (1/s). */
const EXTRA_DISTANCE_RATE = 3;

export interface FollowTarget {
  x: number;
  /** Height the camera looks at (shoulders). */
  y: number;
  z: number;
  /** Set when riding: the heading to swing behind, the current speed (m/s), extra camera distance (m). */
  vehicle?: { heading: number; speed: number; extraDistance?: number };
}

/** A fixed camera for a story line: where it stands and what it looks at (world metres). */
export interface CameraShot {
  from: { x: number; y: number; z: number };
  to: { x: number; y: number; z: number };
}

export class CameraRig {
  readonly camera: ArcRotateCamera;
  readonly mouseLook: MouseLook;
  /** Zoom the player chose with the wheel; the actual radius may be shorter when a wall is in the way. */
  private preferredRadius = 7;
  private lastAppliedRadius = 7;
  /** Vehicle extra distance currently applied (eased toward the target's). */
  private extraDistance = 0;
  private readonly ray = new Ray(Vector3.Zero(), Vector3.Forward(), 1);
  /** A fixed shot is on screen (story scene). */
  private shotOn = false;
  /** The follow camera as it was before the shot. */
  private saved: { alpha: number; beta: number; lower: number | null; upper: number | null; upperRadius: number | null } | null = null;

  constructor(scene: Scene, canvas: HTMLCanvasElement) {
    this.camera = new ArcRotateCamera('thirdPerson', -Math.PI / 2, 1.15, 7, Vector3.Zero(), scene);
    // Wheel zoom range is enforced on preferredRadius; the camera itself may come closer to avoid walls.
    this.camera.lowerRadiusLimit = 0.5;
    this.camera.upperRadiusLimit = ZOOM_MAX;
    this.camera.lowerBetaLimit = BETA_MIN; // not straight down from above
    this.camera.upperBetaLimit = BETA_MAX; // never below the ground
    this.camera.wheelDeltaPercentage = 0.01;
    this.camera.maxZ = PALETTE.view.far; // everything beyond is fogged out anyway (the sky dome sits inside)
    this.camera.panningSensibility = 0; // no right-drag panning; camera always follows the player
    this.camera.inputs.removeByType('ArcRotateCameraKeyboardMoveInput'); // arrows move the player, not the camera
    this.camera.attachControl(canvas, true); // wheel zoom
    this.mouseLook = new MouseLook(this.camera, canvas); // mouse turns the camera (pointer lock)
    scene.activeCamera = this.camera;
  }

  /** Yaw used for camera-relative walking. */
  get alpha(): number {
    return this.camera.alpha;
  }

  /**
   * A fixed story shot (camera at `from`, looking at `to`), or null to go back to following the player
   * exactly as before (angle and zoom kept). While a shot is set, `update` does not move the camera.
   */
  setShot(shot: CameraShot | null): void {
    const cam = this.camera;
    if (shot) {
      if (!this.saved) {
        this.saved = { alpha: cam.alpha, beta: cam.beta, lower: cam.lowerBetaLimit, upper: cam.upperBetaLimit, upperRadius: cam.upperRadiusLimit };
      }
      const o = orbitFromView(shot.from, shot.to);
      cam.lowerBetaLimit = 0.01; // a shot may look from straight above or from the ground
      cam.upperBetaLimit = Math.PI - 0.01;
      cam.upperRadiusLimit = Math.max(ZOOM_MAX, o.radius);
      cam.target.set(shot.to.x, shot.to.y, shot.to.z);
      cam.alpha = o.alpha;
      cam.beta = o.beta;
      cam.radius = o.radius;
      this.shotOn = true;
      return;
    }
    if (!this.saved) return;
    cam.lowerBetaLimit = this.saved.lower;
    cam.upperBetaLimit = this.saved.upper;
    cam.upperRadiusLimit = this.saved.upperRadius;
    cam.alpha = this.saved.alpha;
    cam.beta = this.saved.beta;
    cam.radius = this.lastAppliedRadius; // wheel zoom is not touched by the shot
    this.saved = null;
    this.shotOn = false;
  }

  /** Follow the target this frame (call after it moved). */
  update(target: FollowTarget, dt: number): void {
    if (this.shotOn) return;
    // Move the existing target vector in place: keeps the camera's angle/zoom, just follows.
    this.camera.target.set(target.x, target.y, target.z);
    const v = target.vehicle;
    const k = 1 - Math.exp(-EXTRA_DISTANCE_RATE * Math.max(0, dt));
    this.extraDistance += ((v?.extraDistance ?? 0) - this.extraDistance) * k;
    if (v && v.speed >= FOLLOW_MIN_SPEED && (performance.now() - this.mouseLook.lastLookAt) / 1000 > FOLLOW_DELAY) {
      this.camera.alpha = easeAngle(this.camera.alpha, behindAlpha(v.heading), FOLLOW_RATE, dt);
    }
    this.updateOcclusion();
  }

  /** Jump to the target without easing (teleports, chapter restarts). */
  snap(target: FollowTarget): void {
    if (this.shotOn) return;
    this.camera.target.set(target.x, target.y, target.z);
    this.extraDistance = target.vehicle?.extraDistance ?? 0;
    this.updateOcclusion();
  }

  /** Pull the camera in front of any wall between the character and the camera (no seeing through walls). */
  private updateOcclusion(): void {
    const cam = this.camera;
    // Wheel input changes cam.radius; fold that change into the player's preferred zoom.
    this.preferredRadius = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, this.preferredRadius + (cam.radius - this.lastAppliedRadius)));
    const dir = cameraOffsetDir(cam.alpha, cam.beta);
    this.ray.origin.copyFrom(cam.target);
    this.ray.direction.set(dir.x, dir.y, dir.z);
    const preferred = this.preferredRadius + this.extraDistance;
    this.ray.length = preferred;
    const hit = cam.getScene().pickWithRay(this.ray, (m) => m.checkCollisions && m.isEnabled() && (m.isVisible || m.metadata?.cameraBlocker === true));
    const radius = cameraDistance(preferred, hit?.hit ? hit.distance : null);
    // Babylon clamps the radius to the limit; let the vehicle's extra distance go past the wheel range.
    cam.upperRadiusLimit = ZOOM_MAX + this.extraDistance;
    cam.radius = radius;
    this.lastAppliedRadius = radius;
  }
}
