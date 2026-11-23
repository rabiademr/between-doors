// View helper (3D): freeze the world matrices of scene meshes that never move, so the frame does not
// recompute them. Kept apart from WorldBuilder so the rule can be tested on a headless engine.
import type { Scene } from '@babylonjs/core/scene';
import type { ColliderMeta } from './SceneColliders';

/**
 * Freezes every mesh that stands on its own (no hinge, table or chair parent) and does not move:
 * - skipped: parented meshes, moving colliders (`dynamicCollider`), and meshes placed relative to the camera
 *   every frame (`infiniteDistance`: the sky dome; billboards) — a frozen matrix skips that step.
 * @returns how many meshes were frozen
 */
export function freezeStaticMeshes(scene: Scene): number {
  let frozen = 0;
  for (const m of scene.meshes) {
    if (m.parent || m.infiniteDistance || m.billboardMode !== 0) continue;
    if ((m.metadata as ColliderMeta | null)?.dynamicCollider) continue;
    m.computeWorldMatrix(true);
    m.freezeWorldMatrix();
    frozen++;
  }
  return frozen;
}
