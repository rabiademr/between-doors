// View helper (3D): loads static GLB models once per scene and places copies of them (town, city kit,
// street props). Loading goes through @asset-source only (works in the zip build).
import '@babylonjs/loaders/glTF';
import { LoadAssetContainerAsync } from '@babylonjs/core/Loading/sceneLoader';
import type { AssetContainer } from '@babylonjs/core/assetContainer';
import type { Material } from '@babylonjs/core/Materials/material';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import type { Scene } from '@babylonjs/core/scene';
import { assetBytes } from '@asset-source';
import { footprintOrigin } from './placementMath';

export interface Placement {
  /** Asset id, e.g. 'models/town/sub-building-type-a.glb'. */
  asset: string;
  x: number;
  z: number;
  /** Yaw in radians; models face +Z at 0. */
  rotY: number;
  /** Uniform scale (model units → metres). */
  scale: number;
  /** Optional per-axis stretch on top of `scale`. */
  stretch?: { x: number; y: number; z: number };
  /**
   * 'origin' (default): the model's origin goes to (x, 0, z).
   * 'footprint': the centre of its bounding box goes to (x, z) and its lowest point to the ground — for kits
   * whose origin is not the footprint centre (KayKit props, cars with wheels below 0).
   * 'ground': the origin goes to (x, z) and the lowest point to the ground (KayKit buildings: the origin is the
   * body's centre, but the removed pavement slab left the base 0.1 above 0).
   */
  anchor?: 'origin' | 'footprint' | 'ground';
  /** Swap a material (colour variants, matte finish). */
  material?: (m: Material) => Material;
  /** Name prefix for the placed nodes (default: derived from the asset). */
  name?: string;
}

interface Box {
  minX: number;
  maxX: number;
  minY: number;
  minZ: number;
  maxZ: number;
}

export class ModelLibrary {
  private readonly scene: Scene;
  private readonly containers = new Map<string, Promise<AssetContainer>>();
  private readonly boxes = new Map<string, Promise<Box>>();

  constructor(scene: Scene) {
    this.scene = scene;
  }

  container(asset: string): Promise<AssetContainer> {
    let c = this.containers.get(asset);
    if (!c) {
      c = assetBytes(asset).then((bytes) => LoadAssetContainerAsync(bytes, this.scene, { pluginExtension: '.glb' }));
      this.containers.set(asset, c);
    }
    return c;
  }

  /** Bounding box of the model in its own units (measured once on a throwaway copy). */
  bounds(asset: string): Promise<Box> {
    let b = this.boxes.get(asset);
    if (!b) {
      b = this.container(asset).then((c) => {
        const probe = c.instantiateModelsToScene(() => 'probe', false, { doNotInstantiate: true });
        const root = probe.rootNodes[0];
        const { min, max } = root ? root.getHierarchyBoundingVectors(true) : { min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 0, z: 0 } };
        probe.dispose();
        return { minX: min.x, maxX: max.x, minY: min.y, minZ: min.z, maxZ: max.z };
      });
      this.boxes.set(asset, b);
    }
    return b;
  }

  /** Place one static copy; its meshes are unpickable, never collide and have frozen world matrices. */
  async place(p: Placement): Promise<TransformNode> {
    const [c, box] = await Promise.all([this.container(p.asset), p.anchor && p.anchor !== 'origin' ? this.bounds(p.asset) : null]);
    const name = p.name ?? p.asset.replace(/^.*\//, '').replace(/\.glb$/, '');
    const root = new TransformNode(`town_${name}`, this.scene);
    const sx = p.scale * (p.stretch?.x ?? 1);
    const sy = p.scale * (p.stretch?.y ?? 1);
    const sz = p.scale * (p.stretch?.z ?? 1);
    root.position.set(p.x, 0, p.z);
    root.rotation.y = p.rotY;
    root.scaling.set(sx, sy, sz);
    if (box) root.position.y = -box.minY * sy;
    if (box && p.anchor === 'footprint') {
      // Shift so the footprint centre lands on (x, z) whatever the yaw.
      const o = footprintOrigin(p.x, p.z, { x: (box.minX + box.maxX) / 2, z: (box.minZ + box.maxZ) / 2 }, { x: sx, z: sz }, p.rotY);
      root.position.x = o.x;
      root.position.z = o.z;
    }
    const inst = c.instantiateModelsToScene((n) => `${name}_${n}`, false, { doNotInstantiate: true });
    // Merge in the root's own space first (root still at the origin), then move the root into place.
    const pose = { position: root.position.clone(), rotationY: root.rotation.y, scaling: root.scaling.clone() };
    root.position.set(0, 0, 0);
    root.rotation.y = 0;
    root.scaling.set(1, 1, 1);
    root.computeWorldMatrix(true);
    try {
      for (const node of inst.rootNodes) node.parent = root;
      for (const mesh of root.getChildMeshes(false)) {
        mesh.isPickable = false;
        mesh.checkCollisions = false;
        if (p.material && mesh.material) mesh.material = p.material(mesh.material);
      }
      mergeByMaterial(root, name);
    } finally {
      // Whatever happened above, the model goes where it belongs (never left at the origin by spawn).
      root.position.copyFrom(pose.position);
      root.rotation.y = pose.rotationY;
      root.scaling.copyFrom(pose.scaling);
    }
    root.computeWorldMatrix(true);
    // Final world matrix and bounds first, then freeze both (culling and shadows use these bounds).
    for (const mesh of root.getChildMeshes(false)) {
      mesh.computeWorldMatrix(true);
      mesh.refreshBoundingInfo({});
      freezeStatic(mesh);
    }
    return root;
  }
}

/**
 * A model made of several meshes with one material (a car: body + 4 wheels) becomes one mesh: one draw call
 * instead of five. Static models never collide or animate, so nothing needs the parts.
 */
export function mergeByMaterial(root: TransformNode, name: string): void {
  const groups = new Map<Material, Mesh[]>();
  for (const m of root.getChildMeshes(false)) {
    if (!(m instanceof Mesh) || !m.material || m.skeleton || m.getTotalVertices() === 0) continue;
    const list = groups.get(m.material) ?? [];
    list.push(m);
    groups.set(m.material, list);
  }
  for (const list of groups.values()) {
    if (list.length < 2) continue;
    for (const m of list) m.computeWorldMatrix(true);
    let merged: Mesh | null = null;
    try {
      merged = Mesh.MergeMeshes(list, true, true);
    } catch {
      continue; // parts with different vertex attributes (UVs, colours): keep them as they are
    }
    if (!merged) continue;
    merged.name = `${name}_merged`;
    merged.parent = root; // vertices are in the root's space (it was at the origin)
    merged.isPickable = false;
    merged.checkCollisions = false;
  }
}

function freezeStatic(mesh: AbstractMesh): void {
  mesh.freezeWorldMatrix();
  mesh.doNotSyncBoundingInfo = true;
}
