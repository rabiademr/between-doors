// View layer: a non-player character standing at a fixed spot (idle, plus gestures while talking).
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import type { Scene } from '@babylonjs/core/scene';
import { Animator } from '../player/Animator';
import { fitModel, loadCharacter } from '../player/CharacterModel';
import type { NpcPlacement } from './WorldBuilder';

export const NPC_HEIGHT = 1.7;

export interface StaticNpc {
  node: TransformNode;
  animator: Animator;
}

export async function spawnNpc(scene: Scene, url: string, placement: NpcPlacement): Promise<StaticNpc> {
  const node = new TransformNode(placement.id, scene);
  node.position.copyFrom(placement.position);
  node.rotation.y = placement.heading;
  const model = await loadCharacter(scene, url);
  fitModel(model, node, NPC_HEIGHT);
  return { node, animator: new Animator(model, scene) };
}
