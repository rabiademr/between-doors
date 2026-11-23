// View: shared base for the placeholder vehicles built from primitives (until real models arrive).
// A visual is parented to the player's body (origin = vehicle centre on the ground plane, +Z = forward),
// tells PlayerController where the rider goes, and spins its wheels with the ground speed.
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import type { Mesh } from '@babylonjs/core/Meshes/mesh';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import type { Scene } from '@babylonjs/core/scene';
import type { VehicleKind } from '../movers/vehicles';

/** Relay courier red (bike frame, crates, the van's side stripe). */
export const RELAY_RED = '#c0392b';

/** Where and how the rider sits. */
export interface RiderSeat {
  /** Clip frozen while riding (e.g. 'sit-down'); null = the normal idle (standing on a scooter deck). */
  pose: string | null;
  /** How far the rider's feet are lifted above the ground (m). */
  lift: number;
  /** Rider offset along the vehicle (m, + = forward). */
  z: number;
  /** True when the rider is out of sight (inside the van's cab). */
  hidden: boolean;
}

export abstract class VehicleVisual {
  abstract readonly kind: VehicleKind;
  abstract readonly seat: RiderSeat;
  protected readonly scene: Scene;
  protected readonly root: TransformNode;
  private readonly wheels: { hub: TransformNode; radius: number }[] = [];

  /** @param groundY ground height in the parent's space (the body origin is at its centre). */
  constructor(scene: Scene, parent: TransformNode, groundY: number, name: string) {
    this.scene = scene;
    this.root = new TransformNode(name, scene);
    this.root.parent = parent;
    this.root.position.y = groundY;
    this.root.setEnabled(false);
  }

  setVisible(visible: boolean): void {
    this.root.setEnabled(visible);
  }

  /** Spin the wheels for the current speed (m/s, signed). */
  update(speed: number, dt: number): void {
    for (const w of this.wheels) w.hub.rotation.x += (speed * dt) / w.radius;
  }

  /** A matte material like the rest of the game (no shiny highlights). */
  protected material(name: string, hex: string, emissive = 0): StandardMaterial {
    const m = new StandardMaterial(name, this.scene);
    m.diffuseColor = Color3.FromHexString(hex);
    m.specularColor = Color3.Black();
    if (emissive > 0) m.emissiveColor = m.diffuseColor.scale(emissive);
    return m;
  }

  /** Attach a primitive: no picking, no collisions (the vehicle's body is the mover's, not the meshes'). */
  protected part<T extends Mesh>(m: T, material: StandardMaterial, parent: TransformNode = this.root): T {
    m.parent = parent;
    m.material = material;
    m.isPickable = false;
    m.checkCollisions = false;
    return m;
  }

  /** A wheel hub at (x, radius, z) that spins about X; build the tyre and spokes under it. */
  protected wheelHub(x: number, z: number, radius: number): TransformNode {
    const hub = new TransformNode(`${this.root.name}Wheel`, this.scene);
    hub.parent = this.root;
    hub.position.set(x, radius, z);
    this.wheels.push({ hub, radius });
    return hub;
  }
}
