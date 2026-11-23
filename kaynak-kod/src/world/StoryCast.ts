// View: the week's story actors (content/actors.ts) — walking NPCs the chapters place, walk and hide.
// Each has a talk spot that follows it (kind 'npc', with its name for the prompt). Hidden by default and
// between chapters; never streamed out (they stand far from the core).
import type { Scene } from '@babylonjs/core/scene';
import { ACTOR_IDS, MARKS, ROUTES, STORY_ACTORS, actorSpotId, type ActorId, type MarkId, type RouteId } from '../content/actors';
import { localized } from '../i18n';
import { loadCharacter } from '../player/CharacterModel';
import type { GestureKind } from '../player/gestures';
import { dressModel } from './outfit';
import { WalkingNpc } from './WalkingNpc';
import type { WorldSpot } from './WorldBuilder';
import type { Point2 } from './waypoints';

/** Range (m) from which E reaches an actor. */
const TALK_RANGE = 2.2;

interface Actor {
  npc: WalkingNpc;
  spot: WorldSpot;
  on: boolean;
}

export class StoryCast {
  private readonly actors = new Map<ActorId, Actor>();
  private readonly scene: Scene;

  constructor(scene: Scene) {
    this.scene = scene;
    for (const id of ACTOR_IDS) {
      const def = STORY_ACTORS[id];
      const npc = new WalkingNpc(scene, `actor_${id}`, { x: 0, z: -400 }, def.speed);
      npc.node.metadata = { noStream: true };
      npc.setEnabled(false);
      const spot: WorldSpot = { id: actorSpotId(id), kind: 'npc', x: 0, z: -400, range: TALK_RANGE, name: localized(def.name) };
      this.actors.set(id, { npc, spot, on: false });
    }
  }

  /** Load every actor's model (in the background; an actor can be placed before it has loaded). */
  load(): Promise<void>[] {
    return ACTOR_IDS.map(async (id) => {
      const def = STORY_ACTORS[id];
      const model = await loadCharacter(this.scene, def.model);
      if (def.outfit) dressModel(this.scene, model.root, def.outfit, `actor_${id}`);
      this.get(id).npc.attachModel(model);
    });
  }

  place(id: ActorId, at: MarkId): void {
    const a = this.get(id);
    const m = MARKS[at];
    a.npc.place({ x: m.x, z: m.z }, m.heading);
    a.npc.talking = false;
    a.npc.setEnabled(true);
    a.on = true;
    this.syncSpot(a);
  }

  /** Walk a route from where the actor stands (placed first if hidden). */
  walk(id: ActorId, route: RouteId, onArrive?: () => void): void {
    const a = this.get(id);
    if (!a.on) return;
    a.npc.walk(ROUTES[route], false, onArrive);
  }

  hide(id: ActorId): void {
    const a = this.get(id);
    a.npc.talking = false;
    a.npc.setEnabled(false);
    a.on = false;
  }

  hideAll(): void {
    for (const id of ACTOR_IDS) this.hide(id);
  }

  /** The actor who talks in an open dialogue (null: nobody); a wave or nod first. */
  setTalking(id: ActorId | null, gesture?: GestureKind): void {
    for (const [aid, a] of this.actors) a.npc.talking = aid === id && a.on;
    if (id && gesture) this.get(id).npc.gesture(gesture);
  }

  isOn(id: ActorId): boolean {
    return this.get(id).on;
  }

  /** Talk spots of the actors on stage. */
  get spots(): WorldSpot[] {
    return [...this.actors.values()].filter((a) => a.on).map((a) => a.spot);
  }

  update(dt: number, player: Point2): void {
    for (const a of this.actors.values()) {
      if (!a.on) continue;
      a.npc.update(dt, player);
      this.syncSpot(a);
    }
  }

  /** Re-read the prompt names (language switch). */
  relabel(): void {
    for (const [id, a] of this.actors) a.spot.name = localized(STORY_ACTORS[id].name);
  }

  private syncSpot(a: Actor): void {
    const p = a.npc.position;
    a.spot.x = p.x;
    a.spot.z = p.z;
  }

  private get(id: ActorId): Actor {
    const a = this.actors.get(id);
    if (!a) throw new Error(`Unknown actor ${id}`);
    return a;
  }
}
