// View: a placeholder bicycle built from primitives (until the bike model arrives).
// Parented to the player's body; wheels spin with the ground speed.
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder';
import { CreateCylinder } from '@babylonjs/core/Meshes/Builders/cylinderBuilder';
import { CreateTorus } from '@babylonjs/core/Meshes/Builders/torusBuilder';
import type { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import type { Scene } from '@babylonjs/core/scene';
import { RELAY_RED, VehicleVisual, type RiderSeat } from './VehicleVisual';

const WHEEL_RADIUS = 0.34;
const WHEELBASE = 1.05;

export class BikeVisual extends VehicleVisual {
  readonly kind = 'bike';
  /** Seated on the saddle (sit-down pose lifted to saddle height). */
  readonly seat: RiderSeat = { pose: 'sit-down', lift: 0.45, z: 0, hidden: false };

  constructor(scene: Scene, parent: TransformNode, groundY: number) {
    super(scene, parent, groundY, 'bike');
    const frameMat = this.material('bikeFrame', RELAY_RED);
    const tyreMat = this.material('bikeTyre', '#222222');
    const metal = this.material('bikeMetal', '#9aa0a6');

    for (const z of [-WHEELBASE / 2, WHEELBASE / 2]) {
      const hub = this.wheelHub(0, z, WHEEL_RADIUS);
      const tyre = this.part(CreateTorus('bikeTyre', { diameter: WHEEL_RADIUS * 2, thickness: 0.07, tessellation: 20 }, scene), tyreMat, hub);
      tyre.rotation.z = Math.PI / 2; // stand the ring up in the y–z plane
      const spoke = this.part(CreateBox('bikeSpoke', { width: 0.02, height: WHEEL_RADIUS * 1.9, depth: 0.03 }, scene), metal, hub);
      spoke.rotation.x = 0.4;
    }
    // Frame: top tube, down tube, seat post, saddle, fork and handlebar.
    const tube = (len: number, x: number, y: number, z: number, tilt: number): void => {
      const t = this.part(CreateCylinder('bikeTube', { height: len, diameter: 0.05, tessellation: 6 }, scene), frameMat);
      t.position.set(x, y, z);
      t.rotation.x = tilt;
    };
    tube(0.8, 0, 0.72, 0.02, Math.PI / 2 - 0.12); // top tube
    tube(0.75, 0, 0.55, 0.18, Math.PI / 2 + 0.75); // down tube
    tube(0.55, 0, 0.6, -0.2, -0.25); // seat tube
    tube(0.6, 0, 0.62, 0.5, 0.25); // fork
    const saddle = this.part(CreateBox('bikeSaddle', { width: 0.16, height: 0.06, depth: 0.28 }, scene), tyreMat);
    saddle.position.set(0, 0.9, -0.28);
    const bar = this.part(CreateCylinder('bikeBar', { height: 0.55, diameter: 0.04, tessellation: 6 }, scene), metal);
    bar.position.set(0, 0.95, 0.42);
    bar.rotation.z = Math.PI / 2;
    // Courier crate on the rear rack.
    const crate = this.part(CreateBox('bikeCrate', { width: 0.38, height: 0.25, depth: 0.32 }, scene), frameMat);
    crate.position.set(0, 0.78, -0.6);
  }
}
