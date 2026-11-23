// View: shoes for the character kit. The Quaternius models end in bare, skin-coloured stubs (no feet at
// all), which reads as "the feet are missing" and makes everyone look as if they hover. Each character gets
// one small skinned mesh: two blocky shoes built around its own leg stubs and bound to its foot bones, so
// they follow every animation. Sizes come from the model itself (works for any character of the kit).
import { VertexBuffer } from '@babylonjs/core/Buffers/buffer';
import type { Material } from '@babylonjs/core/Materials/material';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import { CreateBoxVertexData } from '@babylonjs/core/Meshes/Builders/boxBuilder';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import type { Scene } from '@babylonjs/core/scene';

/** Shoe colours of the town (dark leathers, a navy, a pale trainer, an oxblood): one per character, by its name. */
export const SHOE_COLOURS = ['#2e2723', '#4a3524', '#1f2430', '#6b4a32', '#d9d4c8', '#6e2a22'] as const;
/** The stub a shoe is built around: the lowest part of the legs, as a share of the body's height. */
const STUB_SHARE = 0.055;
/** Shoe height as a share of the body's height. */
const SHOE_HEIGHT_SHARE = 0.06;
/** How much wider than the stub, and how far toe and heel reach beyond it (in stub depths). */
const WIDTH_PAD = 1.3;
const TOE_REACH = 0.9;
const HEEL_REACH = 0.15;
const FOOT_BONES = { left: 'Foot.L', right: 'Foot.R' } as const;

export interface Box3 {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  z0: number;
  z1: number;
}

interface Stub {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  n: number;
}

/**
 * Pure: the two shoe boxes for a body, from its vertex positions (x across, y up, z front/back) and the way
 * it faces (`forward` = +1 or -1 along z). `negative` is the shoe on the x < 0 side. Null when the legs
 * cannot be told apart.
 */
export function shoeBoxes(positions: ArrayLike<number>, forward: 1 | -1): { negative: Box3; positive: Box3 } | null {
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 1; i < positions.length; i += 3) {
    const y = positions[i] as number;
    if (y < lo) lo = y;
    if (y > hi) hi = y;
  }
  const height = hi - lo;
  if (!(height > 0)) return null;
  const stub = (side: -1 | 1): Stub => {
    const b: Stub = { x0: Infinity, x1: -Infinity, z0: Infinity, z1: -Infinity, n: 0 };
    for (let i = 0; i < positions.length; i += 3) {
      const x = positions[i] as number;
      if ((positions[i + 1] as number) > lo + height * STUB_SHARE || Math.sign(x) !== side) continue;
      const z = positions[i + 2] as number;
      b.x0 = Math.min(b.x0, x);
      b.x1 = Math.max(b.x1, x);
      b.z0 = Math.min(b.z0, z);
      b.z1 = Math.max(b.z1, z);
      b.n++;
    }
    return b;
  };
  const box = (b: Stub): Box3 | null => {
    if (b.n < 3) return null;
    const cx = (b.x0 + b.x1) / 2;
    const halfW = ((b.x1 - b.x0) / 2) * WIDTH_PAD;
    const depth = b.z1 - b.z0;
    const toe = forward > 0 ? b.z1 + depth * TOE_REACH : b.z0 - depth * TOE_REACH;
    const heel = forward > 0 ? b.z0 - depth * HEEL_REACH : b.z1 + depth * HEEL_REACH;
    return { x0: cx - halfW, x1: cx + halfW, y0: lo, y1: lo + height * SHOE_HEIGHT_SHARE, z0: Math.min(toe, heel), z1: Math.max(toe, heel) };
  };
  const negative = box(stub(-1));
  const positive = box(stub(1));
  return negative && positive ? { negative, positive } : null;
}

/** Pure: the same character always wears the same colour (stable across sessions). */
export function shoeColourFor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return SHOE_COLOURS[h % SHOE_COLOURS.length] ?? SHOE_COLOURS[0];
}

function shoeMaterial(scene: Scene, colour: string): Material {
  const name = `characterShoes_${colour}`;
  const existing = scene.getMaterialByName(name);
  if (existing) return existing;
  const m = new StandardMaterial(name, scene);
  m.diffuseColor = Color3.FromHexString(colour);
  m.specularColor = Color3.Black();
  return m;
}

function middleZ(list: ArrayLike<number>): number {
  let a = Infinity;
  let b = -Infinity;
  for (let i = 2; i < list.length; i += 3) {
    a = Math.min(a, list[i] as number);
    b = Math.max(b, list[i] as number);
  }
  return (a + b) / 2;
}

/**
 * Give a freshly loaded character its shoes (does nothing if the model is not of the kit's shape).
 * @param colour sRGB hex; shared by every character that wears it (one material per colour)
 */
export function addShoes(root: AbstractMesh, scene: Scene, colour: string): void {
  const parts = root.getChildMeshes(false);
  const skin = parts.find((m) => m.material?.name === 'Skin' && m.skeleton);
  const face = parts.find((m) => m.material?.name === 'Face');
  const skeleton = skin?.skeleton;
  const positions = skin?.getVerticesData(VertexBuffer.PositionKind);
  if (!skin || !skeleton || !positions) return;
  const leftBone = skeleton.getBoneIndexByName(FOOT_BONES.left);
  const rightBone = skeleton.getBoneIndexByName(FOOT_BONES.right);
  if (leftBone < 0 || rightBone < 0) return;

  // The face tells which way the body looks (bind space, the same space as the skin's vertices).
  const facePositions = face?.getVerticesData(VertexBuffer.PositionKind);
  const forward: 1 | -1 = facePositions && middleZ(facePositions) < middleZ(positions) ? -1 : 1;
  const boxes = shoeBoxes(positions, forward);
  if (!boxes) return;

  // Each shoe follows the foot bone on its own side of the body.
  const boneX = (index: number): number => skeleton.bones[index]?.getAbsoluteMatrix().getTranslation().x ?? 0;
  const leftIsNegative = boneX(leftBone) < boneX(rightBone);
  const pairs: readonly (readonly [Box3, number])[] = [
    [boxes.negative, leftIsNegative ? leftBone : rightBone],
    [boxes.positive, leftIsNegative ? rightBone : leftBone],
  ];
  const boneOf: number[] = [];
  const data = pairs.map(([b, bone]) => {
    const vd = CreateBoxVertexData({ width: b.x1 - b.x0, height: b.y1 - b.y0, depth: b.z1 - b.z0 });
    const p = vd.positions as number[];
    for (let i = 0; i < p.length; i += 3) {
      p[i] = (p[i] as number) + (b.x0 + b.x1) / 2;
      p[i + 1] = (p[i + 1] as number) + (b.y0 + b.y1) / 2;
      p[i + 2] = (p[i + 2] as number) + (b.z0 + b.z1) / 2;
      boneOf.push(bone);
    }
    return vd;
  });
  const [first, second] = data;
  if (!first || !second) return;
  first.merge(second);

  const shoes = new Mesh(`${root.name}_shoes`, scene);
  first.applyToMesh(shoes);
  shoes.setVerticesData(
    VertexBuffer.MatricesIndicesKind,
    boneOf.flatMap((b) => [b, 0, 0, 0]),
  );
  shoes.setVerticesData(
    VertexBuffer.MatricesWeightsKind,
    boneOf.flatMap(() => [1, 0, 0, 0]),
  );
  shoes.skeleton = skeleton;
  shoes.numBoneInfluencers = 1;
  shoes.parent = skin.parent;
  shoes.position.copyFrom(skin.position);
  shoes.scaling.copyFrom(skin.scaling);
  if (skin.rotationQuaternion) shoes.rotationQuaternion = skin.rotationQuaternion.clone();
  else shoes.rotation.copyFrom(skin.rotation);
  shoes.material = shoeMaterial(scene, colour);
  shoes.isPickable = false;
  shoes.checkCollisions = false;
  shoes.alwaysSelectAsActiveMesh = skin.alwaysSelectAsActiveMesh;
}
