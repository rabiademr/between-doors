// View layer (3D): help 2 — a softly pulsing ring on the ground in front of the right door/gate.
// Purely visual (no collisions, not pickable, no shadow).
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { CreateCylinder } from '@babylonjs/core/Meshes/Builders/cylinderBuilder';
import { CreateTorus } from '@babylonjs/core/Meshes/Builders/torusBuilder';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import type { Scene } from '@babylonjs/core/scene';

export class HintMarker {
  private readonly root: TransformNode;
  private t = 0;

  constructor(scene: Scene) {
    this.root = new TransformNode('hintMarker', scene);
    const glow = new StandardMaterial('hintMarkerMat', scene);
    glow.diffuseColor = Color3.Black();
    glow.specularColor = Color3.Black();
    glow.emissiveColor = Color3.FromHexString('#ffb347');
    glow.disableLighting = true;
    glow.alpha = 0.85;

    const ring = CreateTorus('hintRing', { diameter: 2, thickness: 0.09, tessellation: 64 }, scene);
    ring.parent = this.root;
    ring.position.y = 0.05;
    ring.material = glow;

    const veil = new StandardMaterial('hintVeilMat', scene);
    veil.diffuseColor = Color3.Black();
    veil.specularColor = Color3.Black();
    veil.emissiveColor = Color3.FromHexString('#ffcf7a');
    veil.disableLighting = true;
    veil.alpha = 0.12;
    veil.backFaceCulling = false;
    const column = CreateCylinder('hintVeil', { diameter: 2, height: 2.2, tessellation: 48, cap: 0 }, scene);
    column.parent = this.root;
    column.position.y = 1.1;
    column.material = veil;

    for (const m of this.root.getChildMeshes()) {
      m.isPickable = false;
      m.checkCollisions = false;
      m.receiveShadows = false;
    }
    this.root.setEnabled(false);
  }

  get visible(): boolean {
    return this.root.isEnabled();
  }

  /** Mark a circular area of `radius` metres around (x, z). */
  show(x: number, z: number, radius: number): void {
    this.root.position.set(x, 0, z);
    this.root.scaling.set(radius, 1, radius);
    this.root.setEnabled(true);
  }

  hide(): void {
    this.root.setEnabled(false);
  }

  /** Gentle pulse so the area reads as "help", not as part of the town. */
  update(dt: number): void {
    if (!this.visible) return;
    this.t += dt;
    const s = 1 + Math.sin(this.t * 2.4) * 0.03;
    this.root.getChildMeshes().forEach((m) => m.scaling.set(s, 1, s));
  }
}
