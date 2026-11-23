// View: Bellwick's cats and dogs (content/npcs.ts ANIMALS). They wander along the same pure routine machine
// as the townsfolk (domain/npc/routine.ts), with their own two clips (Idle, Walking) from the Quaternius
// Animal Pack (models/animals/*.glb, see build/animals/convert.mjs). Small and not solid: no colliders.
// One `update` per frame for all of them; far from the player they freeze, then hide (see world/crowd.ts).
import { assetBytes } from '@asset-source';
import '@babylonjs/loaders/glTF';
import type { AnimationGroup } from '@babylonjs/core/Animations/animationGroup';
import type { AssetContainer } from '@babylonjs/core/assetContainer';
import { LoadAssetContainerAsync } from '@babylonjs/core/Loading/sceneLoader';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import type { Scene } from '@babylonjs/core/scene';
import { ANIMALS, type AnimalDef } from '../content/npcs';
import { Routine, phaseFor } from '../domain/npc/routine';
import { fitModel } from '../player/CharacterModel';
import { turnToward } from '../player/movement';
import { ClipFader, freezeSkeletons, lodFor, type Lod, type LodRanges } from './crowd';
import type { Point2 } from './waypoints';

interface Species {
  asset: string;
  /** Height in metres (ear tips / raised tail). */
  height: number;
  /** Material that carries the coat colour. */
  coat: string;
}
const SPECIES: Record<AnimalDef['species'], Species> = {
  cat: { asset: 'models/animals/cat.glb', height: 0.42, coat: 'Grey' },
  dog: { asset: 'models/animals/dog.glb', height: 0.62, coat: 'Dog' },
};
/** The pack's animals look along the model's −X (after the glTF loader's flip); turn them to face +Z. */
const MODEL_YAW = Math.PI / 2;
const RANGES: LodRanges = { freeze: 30, hide: 50 }; // like the townsfolk (NpcDirector)
const LOW_HIDE = 35;
const FAR_TICK = 0.5;
const TURN_SPEED = 4;

interface Animal {
  def: AnimalDef;
  routine: Routine;
  node: TransformNode;
  meshes: AbstractMesh[];
  clips: Map<string, AnimationGroup> | null;
  fader: ClipFader;
  lod: Lod;
  pending: number;
  stride: number;
}

export class Animals {
  private readonly scene: Scene;
  private readonly animals: Animal[] = [];
  private ranges: LodRanges = RANGES;

  /** Graphics quality: low hides animals sooner. */
  setLowQuality(low: boolean): void {
    this.ranges = low ? { ...RANGES, hide: LOW_HIDE } : RANGES;
  }
  private readonly containers = new Map<string, Promise<AssetContainer>>();
  private visible = true;
  private loading = false;
  private disposed = false;

  constructor(scene: Scene, defs: readonly AnimalDef[] = ANIMALS) {
    this.scene = scene;
    for (const def of defs) {
      const routine = new Routine(def.routine, def.phase ?? phaseFor(def.id));
      const node = new TransformNode(def.id, scene);
      node.metadata = { noStream: true }; // moves: not static scenery for a district streamer
      node.setEnabled(false);
      this.animals.push({ def, routine, node, meshes: [], clips: null, fader: new ClipFader(), lod: 2, pending: 0, stride: phaseFor(`${def.id}/stride`) });
    }
    scene.onDisposeObservable.addOnce(() => this.dispose());
  }

  get count(): number {
    return this.animals.length;
  }

  /** Load the models (one GLB per species, parsed once; every animal is a copy with its own coat colour). */
  async load(): Promise<void> {
    if (this.loading) return;
    this.loading = true;
    for (const animal of this.animals) {
      if (this.disposed) return;
      try {
        this.attach(animal, await this.containerFor(SPECIES[animal.def.species].asset));
      } catch (err) {
        console.warn(`Animal ${animal.def.id} failed to load.`, err);
      }
    }
  }

  setVisible(on: boolean): void {
    this.visible = on;
  }

  /** Call once per frame. `paused` stops the routines (pause menu). */
  update(dt: number, player: Point2, paused = false): void {
    const sim = paused ? 0 : dt;
    for (const animal of this.animals) {
      const { routine, node } = animal;
      const distance = Math.hypot(player.x - routine.x, player.z - routine.z);
      const lod: Lod = this.visible && animal.clips ? lodFor(distance, animal.lod, this.ranges) : 2;
      if (lod !== animal.lod) this.setLod(animal, lod);
      if (lod === 2) {
        animal.pending += sim;
        if (animal.pending >= FAR_TICK) {
          routine.update(animal.pending);
          animal.pending = 0;
        }
        continue;
      }
      routine.update(sim);
      node.position.set(routine.x, 0, routine.z);
      node.rotation.y = turnToward(node.rotation.y, routine.heading, TURN_SPEED * dt);
      if (lod !== 0) continue;
      const rate = paused ? 0 : 1;
      animal.fader.play(animal.clips?.get(routine.moving ? 'walking' : 'idle'), { speed: rate, offset: animal.stride });
      animal.fader.update(dt);
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const animal of this.animals) {
      animal.fader.freeze();
      for (const clip of animal.clips?.values() ?? []) clip.dispose();
      animal.node.dispose(false, true); // coat materials are per animal
    }
    this.animals.length = 0;
  }

  private containerFor(asset: string): Promise<AssetContainer> {
    let c = this.containers.get(asset);
    if (!c) {
      c = assetBytes(asset).then((bytes) => LoadAssetContainerAsync(bytes, this.scene, { pluginExtension: '.glb' }));
      this.containers.set(asset, c);
    }
    return c;
  }

  private attach(animal: Animal, container: AssetContainer): void {
    if (this.disposed) return;
    const species = SPECIES[animal.def.species];
    // Own materials (cloned) so each animal can have its coat colour; geometry is shared.
    const inst = container.instantiateModelsToScene((name) => name, true, { doNotInstantiate: true });
    const root = inst.rootNodes[0] as AbstractMesh | undefined;
    if (!root) throw new Error(`${species.asset} has no meshes`);
    for (const g of inst.animationGroups) g.stop(); // the loader auto-plays the first clip
    const pivot = new TransformNode(`${animal.def.id}_pivot`, this.scene);
    pivot.parent = animal.node;
    pivot.rotation.y = MODEL_YAW;
    const clips = new Map(inst.animationGroups.map((g) => [g.name.toLowerCase(), g]));
    fitModel({ root, clips }, pivot, species.height);
    animal.meshes = root.getChildMeshes(false);
    const coat = Color3.FromHexString(animal.def.colour).toLinearSpace();
    for (const mesh of animal.meshes) {
      mesh.isPickable = false;
      mesh.checkCollisions = false;
      const material = mesh.material as { name: string; albedoColor?: Color3 } | null;
      // Clones are named after the original ("Grey", or "Clone of Grey" depending on the loader version).
      if (material?.albedoColor && material.name.endsWith(species.coat)) material.albedoColor = coat;
    }
    animal.clips = clips;
  }

  private setLod(animal: Animal, lod: Lod): void {
    const was = animal.lod;
    animal.lod = lod;
    if (lod === 2) {
      animal.fader.freeze();
      animal.node.setEnabled(false);
      return;
    }
    if (was === 2) {
      if (animal.pending > 0) animal.routine.update(animal.pending);
      animal.pending = 0;
      animal.node.position.set(animal.routine.x, 0, animal.routine.z);
      animal.node.rotation.y = animal.routine.heading;
      animal.node.setEnabled(true);
    }
    if (lod === 1) animal.fader.freeze();
    freezeSkeletons(animal.meshes, lod === 1);
  }
}
