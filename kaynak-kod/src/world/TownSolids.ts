// View layer (3D): what the generated town needs besides its models — the suburban houses around the core
// (world/townLayout) are placed from code, not from the map layers, so they get their collision blocks here (models never collide: ModelLibrary), built at once so nobody walks through a row
// while its models are still loading. Also the plain ground under the corners of the map that no district covers.
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder';
import { CreateGround } from '@babylonjs/core/Meshes/Builders/groundBuilder';
import type { Scene } from '@babylonjs/core/scene';
import { PALETTE } from './palette';
import { houseFootprints, type Bounds } from './townLayout';

interface RectXZ {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}

export function buildTownSolids(scene: Scene, core: Bounds, outer: Bounds): void {
  // The terraces get theirs in districtDressing (with the districts they now stand in); here: the suburban houses.
  const rects: RectXZ[] = houseFootprints(core, outer);
  rects.forEach((r, i) => {
    const box = CreateBox(`townSolid${i}_collider`, { width: r.x1 - r.x0, height: 3, depth: r.z1 - r.z0 }, scene);
    box.position.set((r.x0 + r.x1) / 2, 1.5, (r.z0 + r.z1) / 2);
    box.isVisible = false;
    box.isPickable = false;
    box.checkCollisions = true;
  });

  // Seen over the boundary walls: ground in the corners of the map's bounding box that belong to no district.
  const filler = CreateGround('ground_filler', { width: outer.maxX - outer.minX, height: outer.maxZ - outer.minZ }, scene);
  filler.position.set((outer.minX + outer.maxX) / 2, -0.03, (outer.minZ + outer.maxZ) / 2);
  const mat = new StandardMaterial('ground_filler_mat', scene);
  mat.diffuseColor = Color3.FromHexString(PALETTE.ground);
  mat.specularColor = Color3.Black();
  filler.material = mat;
  filler.isPickable = false;
}
