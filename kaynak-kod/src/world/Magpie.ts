// View: the Magpies — one character per thief (content/magpies.ts), moved by the pure chase rules in
// domain/chase. Scripted movement: no collider, no physics. A thief holding a parcel carries a small box.
// Like the townsfolk they play one clip at a time (crowd.ClipFader) and are switched off far from the player.
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import type { Scene } from '@babylonjs/core/scene';
import { MAGPIES, STORY_MAGPIES } from '../content/magpies';
import { Thief, type ThiefDef, type ThiefEvent } from '../domain/chase/chase';
import { fitModel, loadCharacter, type CharacterModel } from '../player/CharacterModel';
import { ClipFader } from './crowd';
import { NPC_HEIGHT } from './Npc';
import { dressModel } from './outfit';
import type { Point2 } from './waypoints';

const MODEL = 'models/chars/casual_bald.glb';
/**
 * The gang wears the bird's colours, so a thief is told apart from the townsfolk at a glance: black top and
 * trousers, a white belt, white shoes. (Material names of the character kit → sRGB hex.)
 */
const GANG_COLOURS: Readonly<Record<string, string>> = { Shirt: '#17171c', Pants: '#22222a', Belt: '#f2f0ea' };
const GANG_SHOES = '#f2f0ea';
/** Beyond this distance (m) from the player a thief is not drawn. */
const HIDE_DISTANCE = 80;
/** The clips a thief uses; every other clip of the shared rig is disposed. */
const CLIPS = ['idle', 'walk', 'sprint', 'sprint_carry'] as const;

interface Actor {
  thief: Thief;
  node: TransformNode;
  parcel: Mesh;
  model: CharacterModel | null;
  fader: ClipFader;
}

export interface MagpieEvent {
  thief: Thief;
  event: ThiefEvent;
}

export class Magpies {
  private readonly scene: Scene;
  private readonly actors: Actor[];
  private loaded = false;
  private disposed = false;

  constructor(scene: Scene, defs: readonly ThiefDef[] = [...MAGPIES, ...Object.values(STORY_MAGPIES)]) {
    this.scene = scene;
    const paper = new StandardMaterial('magpie_parcel_mat', scene);
    paper.diffuseColor = new Color3(0.72, 0.55, 0.36);
    paper.specularColor = Color3.Black();
    this.actors = defs.map((def) => {
      const thief = new Thief(def);
      const node = new TransformNode(def.id, scene);
      node.metadata = { noStream: true }; // moves: never part of the static scenery a district streamer switches off
      node.position.set(thief.x, 0, thief.z);
      const parcel = CreateBox(`${def.id}_parcel`, { width: 0.36, height: 0.26, depth: 0.3 }, scene);
      parcel.parent = node;
      parcel.position.set(0, 1.0, 0.36);
      parcel.material = paper;
      parcel.isPickable = false;
      parcel.checkCollisions = false;
      parcel.metadata = { noStream: true };
      parcel.setEnabled(false);
      node.setEnabled(false);
      return { thief, node, parcel, model: null, fader: new ClipFader() };
    });
  }

  get thieves(): readonly Thief[] {
    return this.actors.map((a) => a.thief);
  }

  /** A story thief by id (content/magpies STORY_MAGPIES). */
  storyThief(id: string): Thief | undefined {
    return this.actors.find((a) => a.thief.isStory && a.thief.def.id === id)?.thief;
  }

  /** Load the models one after another (the GLB is parsed once per scene). Until then nobody steals. */
  async load(): Promise<void> {
    for (const actor of this.actors) {
      const model = await loadCharacter(this.scene, MODEL, { shoes: GANG_SHOES });
      if (this.disposed) {
        model.root.dispose();
        return;
      }
      fitModel(model, actor.node, NPC_HEIGHT);
      this.dress(model);
      for (const [name, clip] of [...model.clips]) {
        if ((CLIPS as readonly string[]).includes(name)) continue;
        clip.dispose();
        model.clips.delete(name);
      }
      actor.model = model;
    }
    this.loaded = true;
  }

  /** Recolour a thief's clothes (its own copies of the kit's materials: the townsfolk keep theirs). */
  private dress(model: CharacterModel): void {
    dressModel(this.scene, model.root, GANG_COLOURS, 'magpie');
  }

  /**
   * Advance every thief and draw them.
   * @param carrying a board job's parcel is in the courier's hands (and the gang is out)
   * @param out the gang is about today: lurking thieves are shown
   * @param storyCarrying the chapter's parcel is in the courier's hands (only armed story thieves care)
   */
  update(dt: number, player: Point2, carrying: boolean, out: boolean, storyCarrying = false): MagpieEvent[] {
    const events: MagpieEvent[] = [];
    if (this.disposed) return events;
    for (const actor of this.actors) {
      const { thief, node, fader } = actor;
      // The gang waits for its models; a story thief must work without one (a chapter depends on it).
      if (!this.loaded && !thief.isStory) continue;
      const has = thief.isStory ? storyCarrying : carrying;
      for (const event of thief.update(dt, { x: player.x, z: player.z, carrying: has })) events.push({ thief, event });
      // A story thief is seen only once the story has sent it out.
      const shown = thief.isStory ? thief.mode !== null || thief.state !== 'lurking' : out || thief.state !== 'lurking';
      const visible = shown && Math.hypot(thief.x - player.x, thief.z - player.z) <= HIDE_DISTANCE;
      if (visible !== node.isEnabled()) {
        node.setEnabled(visible);
        if (!visible) fader.freeze();
      }
      if (!visible) continue;
      node.position.set(thief.x, 0, thief.z);
      node.rotation.y = thief.heading;
      actor.parcel.setEnabled(thief.hasParcel);
      const clips = actor.model?.clips;
      if (clips) {
        const run = thief.hasParcel ? (clips.get('sprint_carry') ?? clips.get('sprint')) : clips.get('sprint');
        const clip = !thief.moving ? clips.get('idle') : thief.state === 'lurking' ? clips.get('walk') : run;
        fader.play(clip ?? clips.get('idle'));
        fader.update(dt);
      }
    }
    return events;
  }

  /** The thief whose parcel the courier can grab from here (the nearest one in reach). */
  grabbable(p: Point2): Thief | null {
    let best: Thief | null = null;
    let bestDist = Infinity;
    for (const { thief } of this.actors) {
      if (!thief.canGrab(p)) continue;
      const d = Math.hypot(thief.x - p.x, thief.z - p.z);
      if (d < bestDist) {
        best = thief;
        bestDist = d;
      }
    }
    return best;
  }

  dispose(): void {
    this.disposed = true;
    for (const actor of this.actors) {
      actor.fader.freeze();
      actor.node.dispose();
    }
  }
}
