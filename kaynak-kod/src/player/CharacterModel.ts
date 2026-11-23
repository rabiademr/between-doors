// Loads an animated GLB character by asset id (e.g. 'models/chars/finn.glb'). The bytes come from the
// asset source of the current build (see src/assets), so this works on file:// as well as on a server.
//
// Characters in models/chars/ (Quaternius UACP, see build/characters) carry no animations of their own:
// every one shares the same 23-bone rig, so the 17 clips live once in models/chars/anims.glb and are
// re-targeted onto each character by bone name. Clip names are normalised to the game's names
// (idle, walk, sprint, walk_carry, …) so callers don't depend on the pack.
import { assetBytes } from '@asset-source';
import '@babylonjs/loaders/glTF'; // registers the glTF/GLB loader + extensions (e.g. KHR_texture_transform)
import type { AnimationGroup } from '@babylonjs/core/Animations/animationGroup';
import type { AssetContainer } from '@babylonjs/core/assetContainer';
import { LoadAssetContainerAsync } from '@babylonjs/core/Loading/sceneLoader';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import type { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import type { Scene } from '@babylonjs/core/scene';
import { addShoes, shoeColourFor } from './characterShoes';

export interface CharacterModel {
  root: AbstractMesh;
  /** Animation clips by game name, e.g. "idle", "walk", "sprint", "walk_carry", "pick-up". */
  clips: Map<string, AnimationGroup>;
}

const CAST_PREFIX = 'models/chars/';
const SHARED_ANIMATIONS = 'models/chars/anims.glb';
/** UACP action → game clip name (anything else is lower-cased). */
const CLIP_NAMES: Record<string, string> = {
  Idle: 'idle',
  Walk: 'walk',
  Run: 'sprint',
  Walk_Carry: 'walk_carry',
  Run_Carry: 'sprint_carry',
  PickUp: 'pick-up',
  Punch: 'punch',
  RecieveHit: 'hit',
  Roll: 'roll',
  SitDown: 'sit-down',
  StandUp: 'stand-up',
  Victory: 'victory',
  Jump: 'jump',
  Death: 'death',
  Defeat: 'defeat',
  Shoot_OneHanded: 'shoot',
  SwordSlash: 'slash',
};
export const clipName = (raw: string): string => CLIP_NAMES[raw] ?? raw.toLowerCase();

/** One shared-animation container per scene (never added to the scene: only its clips are used). */
const sharedAnimations = new WeakMap<Scene, Promise<AssetContainer>>();
function animationsFor(scene: Scene): Promise<AssetContainer> {
  let p = sharedAnimations.get(scene);
  if (!p) {
    p = assetBytes(SHARED_ANIMATIONS).then((bytes) => LoadAssetContainerAsync(bytes, scene, { pluginExtension: '.glb' }));
    sharedAnimations.set(scene, p);
  }
  return p;
}

/** One parsed container per character asset and scene; every character on screen is a copy of it. */
const characterContainers = new WeakMap<Scene, Map<string, Promise<AssetContainer>>>();
function containerFor(scene: Scene, assetId: string): Promise<AssetContainer> {
  let perScene = characterContainers.get(scene);
  if (!perScene) {
    perScene = new Map();
    characterContainers.set(scene, perScene);
  }
  let p = perScene.get(assetId);
  if (!p) {
    p = assetBytes(assetId).then((bytes) => LoadAssetContainerAsync(bytes, scene, { pluginExtension: '.glb' }));
    perScene.set(assetId, p);
  }
  return p;
}

/**
 * A new copy of a character (own skeleton, own animation groups, shared geometry and materials). The GLB is
 * parsed once per scene however many townsfolk use it.
 */
export async function loadCharacter(scene: Scene, assetId: string, opts: { shoes?: string } = {}): Promise<CharacterModel> {
  const isCast = assetId.startsWith(CAST_PREFIX);
  const [container, shared] = await Promise.all([containerFor(scene, assetId), isCast ? animationsFor(scene) : Promise.resolve(null)]);
  // Keep the node names (bone names are how the shared clips find their targets).
  const inst = container.instantiateModelsToScene((name) => name, false, { doNotInstantiate: true });
  const root = inst.rootNodes[0] as AbstractMesh | undefined;
  if (!root) throw new Error('Character GLB has no meshes');

  let groups = inst.animationGroups;
  if (shared && groups.length === 0) {
    // Same rig, same bone names: point each shared track at this copy's bone.
    const bones = new Map<string, TransformNode>();
    // Names are not unique ("Body" is a bone and also a mesh group): the skeleton's own nodes win.
    for (const n of root.getChildTransformNodes(false)) if (!bones.has(n.name)) bones.set(n.name, n);
    for (const mesh of root.getChildMeshes(false)) {
      for (const bone of mesh.skeleton?.bones ?? []) {
        const linked = bone.getTransformNode();
        if (linked) bones.set(linked.name, linked);
      }
    }
    groups = shared.animationGroups.map((g) => g.clone(g.name, (target: TransformNode) => bones.get(target.name) ?? target));
  }
  // The glTF loader auto-plays the first clip; we control playback ourselves.
  for (const g of groups) g.stop();

  if (isCast) addShoes(root, scene, opts.shoes ?? shoeColourFor(assetId)); // the kit's bodies end in bare stubs
  for (const m of root.getChildMeshes(false)) {
    m.isPickable = false;
    m.checkCollisions = false;
  }
  root.isPickable = false;
  root.checkCollisions = false;
  return { root, clips: new Map(groups.map((g) => [clipName(g.name), g])) };
}

/**
 * Scale the model to `height` metres and parent it so its feet sit at `feetY` in the parent's space.
 * Measures the model in its own space first (bind pose), so it works for any GLB scale.
 */
export function fitModel(model: CharacterModel, parent: TransformNode, height: number, feetY = 0): void {
  const { root } = model;
  root.parent = null;
  root.position.setAll(0);
  root.computeWorldMatrix(true);
  const { min, max } = root.getHierarchyBoundingVectors(true);
  const h = max.y - min.y;
  const scale = h > 0 ? height / h : 1;
  root.scaling.scaleInPlace(scale);
  root.parent = parent;
  root.position.set(0, feetY - min.y * scale, 0);
}
