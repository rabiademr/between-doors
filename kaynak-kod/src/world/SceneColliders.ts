// View → model adapter: turns the scene's solid meshes (checkCollisions) into CollisionWorld shapes, so
// the scene keeps one source of truth for "what is solid" (the same flag also stops the camera).
// - Static shapes are measured once (rebuilt when a solid mesh is added or removed — not for every
//   visual mesh that streams in); each keeps a live
//   `active` switch, so disabling a node (Mews guests between chapters) removes its collider.
// - Meshes tagged `metadata.dynamicCollider` move (swinging gates, walking NPCs, Mews cast): they are
//   re-measured every frame.
// Shape choice: `metadata.collider === 'circle'` → circle (posts, trunks, the fountain, NPCs); thin oriented
// panels (gates) and props standing at an angle → capsule along their long side; everything else → its
// world bounding box (axis-aligned, so it is exact).
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import type { Scene } from '@babylonjs/core/scene';
import { CollisionWorld, type Collider, type Shape } from '../domain/collision/CollisionWorld';

/** Things whose top is lower than this are stepped over (floors, kerbs, rubble). */
const STEP_HEIGHT = 0.2;
/** Things whose bottom is higher than this pass over the head (roofs, signs, the alley arch). */
const HEAD_HEIGHT = 1.8;

export interface ColliderMeta {
  collider?: 'circle' | 'box';
  dynamicCollider?: boolean;
}

export class SceneColliders {
  readonly world = new CollisionWorld();
  private readonly scene: Scene;
  private dirty = true;
  private dynamicMeshes: AbstractMesh[] = [];
  /** Meshes added since the last check: most are purely visual (town models), so they don't force a rebuild. */
  private added: AbstractMesh[] = [];
  /** Meshes that currently have a collider (removing one forces a rebuild). */
  private readonly tracked = new Set<AbstractMesh>();

  constructor(scene: Scene) {
    this.scene = scene;
    // Flags such as checkCollisions are set right after a mesh is created, so new meshes are only
    // inspected at the next sync.
    scene.onNewMeshAddedObservable.add((m) => void this.added.push(m));
    scene.onMeshRemovedObservable.add((m) => {
      if (this.tracked.has(m)) this.dirty = true;
    });
  }

  /** Call once per frame before anything moves. */
  sync(): void {
    if (this.added.length) {
      if (this.added.some((m) => m.checkCollisions || ((m.metadata ?? {}) as ColliderMeta).dynamicCollider)) this.dirty = true;
      this.added = [];
    }
    if (this.dirty) this.rebuildStatic();
    const dynamics: Collider[] = [];
    for (const m of this.dynamicMeshes) {
      if (!isSolid(m)) continue;
      const shape = measure(m);
      if (shape) dynamics.push({ shape });
    }
    this.world.setDynamic(dynamics);
  }

  private rebuildStatic(): void {
    this.dirty = false;
    this.world.clearStatic();
    this.dynamicMeshes = [];
    this.tracked.clear();
    for (const m of this.scene.meshes) {
      const meta = (m.metadata ?? {}) as ColliderMeta;
      if (meta.dynamicCollider) {
        this.dynamicMeshes.push(m);
        this.tracked.add(m);
        continue;
      }
      if (!m.checkCollisions) continue;
      this.tracked.add(m);
      const shape = measure(m);
      if (shape) this.world.addStatic({ shape, active: () => isSolid(m) });
    }
  }
}

function isSolid(m: AbstractMesh): boolean {
  return m.checkCollisions && m.isEnabled() && !m.isDisposed();
}

/** The mesh's footprint on the ground, or null if it is not at body height. Exported for tests. */
export function measure(m: AbstractMesh): Shape | null {
  m.computeWorldMatrix(true);
  const bb = m.getBoundingInfo().boundingBox;
  if (bb.maximumWorld.y < STEP_HEIGHT || bb.minimumWorld.y > HEAD_HEIGHT) return null;
  const meta = (m.metadata ?? {}) as ColliderMeta;
  const c = bb.centerWorld;
  if (meta.collider === 'circle') {
    const r = Math.max(bb.maximumWorld.x - bb.minimumWorld.x, bb.maximumWorld.z - bb.minimumWorld.z) / 2;
    return { kind: 'circle', x: c.x, z: c.z, r };
  }
  // Oriented box: local x and z axes in world space with their half-lengths (local size × world scale;
  // extendSizeWorld would be the axis-aligned box instead).
  const ax = bb.directions[0];
  const az = bb.directions[2];
  if (!ax || !az) return null;
  const wm = m.getWorldMatrix();
  const ex = bb.extendSize.x * Vector3.TransformNormal(Vector3.Right(), wm).length();
  const ez = bb.extendSize.z * Vector3.TransformNormal(Vector3.Forward(), wm).length();
  const axisAligned = Math.abs(ax.y) < 0.2 && (Math.abs(ax.x) > 0.999 || Math.abs(ax.z) > 0.999);
  if (axisAligned) {
    return { kind: 'box', x0: bb.minimumWorld.x, x1: bb.maximumWorld.x, z0: bb.minimumWorld.z, z1: bb.maximumWorld.z };
  }
  const [long, full, thin] = ex >= ez ? [ax, ex, ez] : [az, ez, ex];
  // A prop standing at an angle (a car parked askew, a crate): its world bounding box would be far bigger
  // than the thing itself — an invisible wall around its corners. A capsule inside its own outline fits.
  // A turned panel (an opening gate) keeps its full length: a capsule along its long side, as thick as it.
  const half = meta.collider === 'box' ? Math.max(0, full - thin) : full;
  return { kind: 'capsule', ax: c.x - long.x * half, az: c.z - long.z * half, bx: c.x + long.x * half, bz: c.z + long.z * half, r: thin };
}
