// Mouse look for the third-person camera.
// Click the game once → the pointer is captured (Pointer Lock) and moving the mouse turns the camera,
// no button needed. Esc releases it (browser behaviour). If pointer lock is unavailable,
// dragging with the left button still works as a fallback.
import type { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera';
import { applyLook } from './cameraMath';

export class MouseLook {
  /** Multiplier from settings (1 = default). */
  sensitivity = 1;
  /** When false (dialog open) mouse movement is ignored and the pointer is not captured. */
  enabled = true;
  private readonly camera: ArcRotateCamera;
  private readonly canvas: HTMLCanvasElement;
  private readonly lockListeners = new Set<(locked: boolean) => void>();
  /** performance.now() of the last mouse look (the vehicle camera waits for the player to stop looking). */
  lastLookAt = -Infinity;
  /** A lock was requested and the browser has not answered yet (pointer lock is granted asynchronously). */
  private pending = false;

  constructor(camera: ArcRotateCamera, canvas: HTMLCanvasElement) {
    this.camera = camera;
    this.canvas = canvas;
    // Our own handler replaces Babylon's drag-to-rotate input; wheel zoom stays with Babylon.
    camera.inputs.removeByType('ArcRotateCameraPointersInput');

    canvas.addEventListener('click', () => {
      if (this.enabled && !this.isLocked) this.lock();
    });
    document.addEventListener('pointerlockchange', () => {
      this.pending = false;
      // A lock asked for when a dialog closed can arrive after the next dialog opened (scene lines follow
      // each other at once): the pointer would be captured and hidden over the buttons. Let it go again.
      if (this.isLocked && !this.enabled) {
        document.exitPointerLock();
        return;
      }
      for (const fn of this.lockListeners) fn(this.isLocked);
    });
    document.addEventListener('pointerlockerror', () => {
      this.pending = false;
    });
    window.addEventListener('pointermove', (e) => {
      if (!this.enabled) return;
      const dragging = e.target === canvas && (e.buttons & 1) === 1; // fallback without lock
      if (!this.isLocked && !dragging) return;
      const next = applyLook(this.camera.alpha, this.camera.beta, e.movementX, e.movementY, this.sensitivity);
      this.camera.alpha = next.alpha;
      this.camera.beta = next.beta;
      if (e.movementX !== 0 || e.movementY !== 0) this.lastLookAt = performance.now();
    });
  }

  get isLocked(): boolean {
    return document.pointerLockElement === this.canvas;
  }

  /** Captured, or about to be (a request is on its way): what "was the mouse captured?" should ask. */
  get wantsLock(): boolean {
    return this.isLocked || this.pending;
  }

  /** Must run inside a user gesture (click / key press handler); failures are harmless. */
  lock(): void {
    try {
      this.pending = true;
      const r = this.canvas.requestPointerLock() as unknown;
      if (r instanceof Promise) r.catch(() => (this.pending = false));
    } catch {
      this.pending = false; /* pointer lock unsupported → drag fallback */
    }
  }

  /** Release the pointer; a lock still on its way is let go when it lands, if `enabled` is false by then. */
  unlock(): void {
    if (this.isLocked) document.exitPointerLock();
  }

  onLockChange(fn: (locked: boolean) => void): void {
    this.lockListeners.add(fn);
  }
}
