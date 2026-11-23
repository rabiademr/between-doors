// View: the owned vehicles standing in the world (rack outside Relay, or wherever the rider got off).
// Each is a second instance of the vehicle's visual on its own node (not the player's), with an invisible
// box collider sized from its riding body. The node is switched off while that vehicle is being ridden
// (the player then carries the riding instance). Where they stand is decided by domain/vehicles/parking.
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import type { Scene } from '@babylonjs/core/scene';
import { parkedFootprint, type Place } from '../domain/vehicles/parking';
import { VEHICLES, type VehicleKind } from '../player/movers/vehicles';
import { createVehicleVisual } from '../player/vehicles';
import type { ColliderMeta } from './SceneColliders';

/** The collider spans body height (SceneColliders counts what touches 0.2–1.8 m). */
const COLLIDER_HEIGHT = 1.2;
const COLLIDER_CENTRE_Y = 0.8;

export const isVehicleKind = (id: string): id is VehicleKind => Object.prototype.hasOwnProperty.call(VEHICLES, id);

export class ParkedVehicles {
  private readonly scene: Scene;
  private readonly nodes = new Map<VehicleKind, TransformNode>();

  constructor(scene: Scene) {
    this.scene = scene;
  }

  /** Show every parked vehicle at its pose; hide the ridden ones and those no longer in the registry. */
  sync(places: readonly (readonly [string, Place])[]): void {
    const seen = new Set<VehicleKind>();
    for (const [id, place] of places) {
      if (!isVehicleKind(id)) continue;
      seen.add(id);
      if (place === 'ridden') {
        this.nodes.get(id)?.setEnabled(false);
        continue;
      }
      const node = this.nodeFor(id);
      node.position.set(place.x, 0, place.z);
      node.rotation.y = place.heading;
      node.setEnabled(true);
    }
    for (const [kind, node] of this.nodes) if (!seen.has(kind)) node.setEnabled(false);
  }

  private nodeFor(kind: VehicleKind): TransformNode {
    let node = this.nodes.get(kind);
    if (node) return node;
    node = new TransformNode(`parked_${kind}`, this.scene);
    node.metadata = { noStream: true }; // relocates: never static scenery for the district streamer
    createVehicleVisual(kind, this.scene, node, 0).setVisible(true);
    const fp = parkedFootprint(VEHICLES[kind].body);
    const collider = CreateBox(`parked_${kind}_collider`, { width: fp.halfWidth * 2, height: COLLIDER_HEIGHT, depth: fp.halfLength * 2 }, this.scene);
    collider.parent = node;
    collider.position.y = COLLIDER_CENTRE_Y;
    collider.isVisible = false;
    collider.isPickable = false;
    collider.checkCollisions = true;
    // 'box': parked at any angle, it stays inside its own outline (not a capsule past both bumpers).
    collider.metadata = { collider: 'box', dynamicCollider: true, noStream: true } satisfies ColliderMeta & { noStream: boolean };
    this.nodes.set(kind, node);
    return node;
  }
}
