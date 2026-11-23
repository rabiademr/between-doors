// View: an NPC that walks along waypoint routes (Finn). Scripted movement, no physics.
// It stops while the player stands right next to it or while a conversation is open.
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import type { Scene } from '@babylonjs/core/scene';
import { Animator } from '../player/Animator';
import type { GestureKind } from '../player/gestures';
import { fitModel, type CharacterModel } from '../player/CharacterModel';
import { NPC_HEIGHT } from './Npc';
import type { ColliderMeta } from './SceneColliders';
import { followRoute, headingBetween, type FollowState, type Point2 } from './waypoints';
import { turnToward } from '../player/movement';

/** Player closer than this makes the NPC stop (polite, and avoids walking through the player). */
const STOP_DISTANCE = 1.4;
const TURN_SPEED = 6;

export class WalkingNpc {
  readonly node: TransformNode;
  private readonly collider: Mesh;
  private animator: Animator | null = null;
  private state: FollowState;
  private route: readonly Point2[] = [];
  private loop = false;
  private readonly speed: number;
  /** Set by the controller while a dialog with this NPC is open (the NPC stops and talks with its hands). */
  talking = false;
  private arrivedCallback: (() => void) | null = null;

  constructor(scene: Scene, id: string, start: Point2, speed: number) {
    this.node = new TransformNode(id, scene);
    this.node.position.set(start.x, 0, start.z);
    this.speed = speed;
    this.state = { x: start.x, z: start.z, next: 0, done: true };
    // Moving collider so the player can't walk through the NPC.
    this.collider = CreateBox(`${id}_collider`, { width: 0.7, height: 1.8, depth: 0.7 }, scene);
    this.collider.parent = this.node;
    this.collider.position.y = 0.9;
    this.collider.isVisible = false;
    this.collider.isPickable = false;
    this.collider.checkCollisions = true;
    this.collider.metadata = { collider: 'circle', dynamicCollider: true } satisfies ColliderMeta;
  }

  attachModel(model: CharacterModel): void {
    fitModel(model, this.node, NPC_HEIGHT);
    this.animator = new Animator(model, this.node.getScene());
  }

  get position(): Point2 {
    return { x: this.node.position.x, z: this.node.position.z };
  }

  setEnabled(enabled: boolean): void {
    this.node.setEnabled(enabled);
    this.collider.checkCollisions = enabled;
  }

  /** Teleport and stand still. */
  place(p: Point2, heading = Math.PI): void {
    this.node.position.set(p.x, 0, p.z);
    this.node.rotation.y = heading;
    this.state = { x: p.x, z: p.z, next: 0, done: true };
    this.route = [];
  }

  /** Walk along a route from the current position; `onArrive` fires once at the end (not for loops). */
  walk(route: readonly Point2[], loop: boolean, onArrive?: () => void): void {
    this.route = route;
    this.loop = loop;
    this.state = { x: this.node.position.x, z: this.node.position.z, next: 0, done: route.length === 0 };
    this.arrivedCallback = onArrive ?? null;
  }

  get isWalking(): boolean {
    return !this.state.done;
  }

  update(dt: number, player: Point2): void {
    const near = Math.hypot(player.x - this.node.position.x, player.z - this.node.position.z) < STOP_DISTANCE;
    const halted = this.talking || near;
    let moving = false;
    if (!halted && !this.state.done) {
      const before = { x: this.state.x, z: this.state.z };
      this.state = followRoute(this.state, this.route, this.speed, dt, this.loop);
      this.node.position.set(this.state.x, 0, this.state.z);
      moving = before.x !== this.state.x || before.z !== this.state.z;
      if (moving) {
        this.node.rotation.y = turnToward(this.node.rotation.y, headingBetween(before, this.state), TURN_SPEED * dt);
      }
      if (this.state.done && this.arrivedCallback) {
        const cb = this.arrivedCallback;
        this.arrivedCallback = null;
        cb();
      }
    }
    if (near || this.talking) {
      // Face the player while talking / standing next to them.
      this.node.rotation.y = turnToward(this.node.rotation.y, headingBetween(this.position, player), TURN_SPEED * dt);
    }
    if (this.animator) {
      // Talking gesture while a conversation is open (a wave or nod in progress plays out first).
      const g = this.animator.gestureKind;
      if (this.talking && g === null) this.animator.setGesture('talk');
      else if (!this.talking && g === 'talk') this.animator.setGesture(null);
      this.animator.update(dt, moving ? this.speed : 0);
    }
  }

  /** A one-off gesture (wave hello, nod). */
  gesture(kind: GestureKind): void {
    this.animator?.setGesture(kind);
  }
}
