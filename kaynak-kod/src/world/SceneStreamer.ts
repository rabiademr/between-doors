// View layer (3D): switches off static scenery that is beyond the fog, so a 300 m town costs about the
// same per frame as the part you can see. Works on root nodes (a building, a prop, a tree): each is
// measured once and enabled/disabled by its distance from the player. A disabled mesh also loses its
// collider (SceneColliders reads the same switch) — it is far out of reach by then.
// Never touched: the hand-built core and Postmark Mews (fixed story cameras look across them), anything
// animated or moving (characters, gates, vehicles), the sky, the ground slabs and other very large meshes.
import { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import type { Node } from '@babylonjs/core/node';
import type { Scene } from '@babylonjs/core/scene';
import type { ColliderMeta } from './SceneColliders';
import { streamVisible } from './streaming';

export interface StreamArea {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}
export interface StreamOptions {
  /** Everything further than this from the player is hidden (metres; full fog plus a margin). */
  radius: number;
  /** Nodes centred inside these rectangles are never streamed. */
  keep: readonly StreamArea[];
}

interface Item {
  node: Node;
  x: number;
  z: number;
  /** Horizontal radius of the node's bounds. */
  r: number;
  on: boolean;
  /** Whether it was enabled when we switched it off (someone else may have hidden it meanwhile). */
  restore: boolean;
}
/** `metadata.noStream` keeps a node out of the streamer (anything that will move later). */
export interface StreamMeta extends ColliderMeta {
  noStream?: boolean;
}

/** Bigger than this (ground slabs, merged dressing) is left alone: it is in view from almost anywhere. */
const MAX_NODE_RADIUS = 45;
/** Re-evaluate after the player has moved this far (metres). */
const STEP = 4;
/** Look for newly loaded scenery this often (seconds). */
const ADOPT_EVERY = 3;

export class SceneStreamer {
  private readonly scene: Scene;
  private options: StreamOptions;
  private readonly items: Item[] = [];
  private readonly seen = new Set<Node>();
  private lastX = Number.NaN;
  private lastZ = Number.NaN;
  private sinceAdopt = ADOPT_EVERY;

  constructor(scene: Scene, options: StreamOptions) {
    this.scene = scene;
    this.options = options;
  }

  /** How many nodes are streamed, and how many of them are switched off right now (dev/FPS reports). */
  get stats(): { streamed: number; hidden: number } {
    return { streamed: this.items.length, hidden: this.items.filter((i) => !i.on).length };
  }

  /** A new view distance (graphics quality): applied on the next update. */
  setRadius(radius: number): void {
    this.options = { ...this.options, radius };
    this.lastX = Number.NaN; // re-check every node now
  }

  /** Call once per frame with the player's position. */
  update(dt: number, x: number, z: number): void {
    this.sinceAdopt += dt;
    let fresh = false;
    if (this.sinceAdopt >= ADOPT_EVERY) {
      this.sinceAdopt = 0;
      fresh = this.adopt();
    }
    if (!fresh && Math.abs(x - this.lastX) < STEP && Math.abs(z - this.lastZ) < STEP) return;
    this.lastX = x;
    this.lastZ = z;
    for (const item of this.items) {
      const on = streamVisible(Math.hypot(item.x - x, item.z - z) - item.r, item.on, this.options.radius);
      if (on === item.on) continue;
      item.on = on;
      if (!on) {
        item.restore = item.node.isEnabled(false);
        item.node.setEnabled(false);
      } else if (item.restore) item.node.setEnabled(true);
    }
  }

  /** Takes in static root nodes that appeared since the last call. @returns true if any were added. */
  private adopt(): boolean {
    let added = false;
    for (const node of this.scene.rootNodes) {
      if (this.seen.has(node)) continue;
      this.seen.add(node);
      if (!(node instanceof TransformNode) || !node.isEnabled(false) || !isStatic(node)) continue;
      const { min, max } = node.getHierarchyBoundingVectors(true);
      if (!Number.isFinite(min.x) || !Number.isFinite(max.x)) continue; // an empty node
      const x = (min.x + max.x) / 2;
      const z = (min.z + max.z) / 2;
      const r = Math.hypot(max.x - min.x, max.z - min.z) / 2;
      if (r > MAX_NODE_RADIUS) continue;
      if (this.options.keep.some((k) => x >= k.x0 && x <= k.x1 && z >= k.z0 && z <= k.z1)) continue;
      this.items.push({ node, x, z, r, on: true, restore: true });
      added = true;
    }
    return added;
  }
}

/** Scenery that never moves: no skeleton, no moving collider, not exempt from fog (the sky). */
function isStatic(root: TransformNode): boolean {
  const nodes: Node[] = [root, ...root.getDescendants(false)];
  let meshes = 0;
  for (const n of nodes) {
    const meta = (n.metadata ?? {}) as StreamMeta;
    if (meta.dynamicCollider || meta.noStream) return false;
    if (!(n instanceof AbstractMesh)) continue;
    meshes++;
    if (n.skeleton) return false;
    if (n.material && n.material.fogEnabled === false) return false;
  }
  return meshes > 0;
}
