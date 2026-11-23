// View: a placeholder motorcycle (tank, seat, two wheels, headlight, courier top box).
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder';
import { CreateCylinder } from '@babylonjs/core/Meshes/Builders/cylinderBuilder';
import { CreateTorus } from '@babylonjs/core/Meshes/Builders/torusBuilder';
import type { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import type { Scene } from '@babylonjs/core/scene';
import { RELAY_RED, VehicleVisual, type RiderSeat } from './VehicleVisual';

const WHEEL_RADIUS = 0.32;
const WHEELBASE = 1.4;

export class MotorcycleVisual extends VehicleVisual {
  readonly kind = 'motorcycle';
  /** Seated (seat top ≈ 0.87 m, a little lower than the bike saddle). */
  readonly seat: RiderSeat = { pose: 'sit-down', lift: 0.39, z: 0, hidden: false };

  constructor(scene: Scene, parent: TransformNode, groundY: number) {
    super(scene, parent, groundY, 'motorcycle');
    const red = this.material('motoRed', RELAY_RED);
    const tyreMat = this.material('motoTyre', '#1e1e1e');
    const dark = this.material('motoDark', '#2b2d31');
    const metal = this.material('motoMetal', '#9aa0a6');
    const lamp = this.material('motoLamp', '#fff2c4', 0.6);

    for (const z of [-WHEELBASE / 2, WHEELBASE / 2]) {
      const hub = this.wheelHub(0, z, WHEEL_RADIUS);
      const tyre = this.part(CreateTorus('motoTyre', { diameter: WHEEL_RADIUS * 1.6, thickness: 0.13, tessellation: 20 }, scene), tyreMat, hub);
      tyre.rotation.z = Math.PI / 2;
      const disc = this.part(CreateCylinder('motoHub', { height: 0.1, diameter: 0.18, tessellation: 10 }, scene), metal, hub);
      disc.rotation.z = Math.PI / 2;
      const spoke = this.part(CreateBox('motoSpoke', { width: 0.05, height: WHEEL_RADIUS * 1.4, depth: 0.05 }, scene), metal, hub);
      spoke.rotation.x = 0.4;
    }
    const box = (name: string, mat: typeof red, w: number, h: number, d: number, y: number, z: number): void => {
      this.part(CreateBox(name, { width: w, height: h, depth: d }, scene), mat).position.set(0, y, z);
    };
    box('motoTank', red, 0.34, 0.24, 0.5, 0.88, 0.2);
    box('motoSeat', dark, 0.3, 0.1, 0.62, 0.82, -0.3);
    box('motoEngine', metal, 0.32, 0.32, 0.46, 0.48, 0.05);
    box('motoTail', red, 0.2, 0.08, 0.5, 0.72, -0.72);
    box('motoFender', red, 0.14, 0.04, 0.4, 0.68, 0.74);
    // Courier top box behind the seat.
    box('motoTopBox', red, 0.42, 0.34, 0.4, 1.0, -0.8);

    // Fork from the front axle up to the steering head, leaning back.
    for (const x of [-0.1, 0.1]) {
      const leg = this.part(CreateCylinder('motoFork', { height: 0.72, diameter: 0.05, tessellation: 6 }, scene), metal);
      leg.position.set(x, 0.66, 0.6);
      leg.rotation.x = -0.29;
    }
    const bar = this.part(CreateCylinder('motoBar', { height: 0.7, diameter: 0.04, tessellation: 6 }, scene), dark);
    bar.position.set(0, 1.04, 0.48);
    bar.rotation.z = Math.PI / 2;
    const light = this.part(CreateCylinder('motoHeadlight', { height: 0.08, diameter: 0.18, tessellation: 12 }, scene), lamp);
    light.position.set(0, 0.94, 0.64);
    light.rotation.x = Math.PI / 2;
    const exhaust = this.part(CreateCylinder('motoExhaust', { height: 0.7, diameter: 0.08, tessellation: 8 }, scene), metal);
    exhaust.position.set(0.2, 0.36, -0.35);
    exhaust.rotation.x = Math.PI / 2 - 0.15;
  }
}
