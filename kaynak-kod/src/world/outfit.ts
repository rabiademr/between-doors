// View: recolour a character's clothes — its own copies of the kit's materials, shared by everyone who
// wears the same outfit (`prefix`), so the townsfolk keep theirs. Used for the Magpies' gang colours and
// story actors in uniform (Swift Parcel).
import { Color3 } from '@babylonjs/core/Maths/math.color';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import type { Scene } from '@babylonjs/core/scene';

/** Material names of the character kit → sRGB hex. */
export type OutfitColours = Readonly<Record<string, string>>;

export function dressModel(scene: Scene, root: AbstractMesh, colours: OutfitColours, prefix: string): void {
  for (const mesh of root.getChildMeshes(false)) {
    const hex = mesh.material ? colours[mesh.material.name] : undefined;
    if (!mesh.material || !hex) continue;
    const name = `${prefix}_${mesh.material.name}`;
    let dressed = scene.getMaterialByName(name);
    if (!dressed) {
      dressed = mesh.material.clone(name);
      if (dressed && 'albedoColor' in dressed) (dressed as { albedoColor: Color3 }).albedoColor = Color3.FromHexString(hex).toLinearSpace();
      else if (dressed && 'diffuseColor' in dressed) (dressed as { diffuseColor: Color3 }).diffuseColor = Color3.FromHexString(hex);
    }
    if (dressed) mesh.material = dressed;
  }
}
