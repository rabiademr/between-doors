// View: a placeholder small cargo van (box body, cab, four wheels, Relay red side stripe). 4.6 × 2 m, the
// same footprint as its collision capsule (vehicles.ts). The driver sits in the cab, out of sight.
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder';
import { CreateCylinder } from '@babylonjs/core/Meshes/Builders/cylinderBuilder';
import type { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import type { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import type { Scene } from '@babylonjs/core/scene';
import { RELAY_RED, VehicleVisual, type RiderSeat } from './VehicleVisual';

const LENGTH = 4.6;
const WIDTH = 2;
const WHEEL_RADIUS = 0.38;
/** Axles (z): rear axle = the turning pivot (VEHICLES.van.body.pivotBack). */
const FRONT_AXLE = 1.5;
const REAR_AXLE = -1.4;
/** Floor of the body above the ground. */
const FLOOR = 0.55;

export class VanVisual extends VehicleVisual {
  readonly kind = 'van';
  readonly seat: RiderSeat = { pose: 'sit-down', lift: 0.5, z: 1.5, hidden: true };

  constructor(scene: Scene, parent: TransformNode, groundY: number) {
    super(scene, parent, groundY, 'van');
    const paint = this.material('vanPaint', '#ece7dc');
    const red = this.material('vanRed', RELAY_RED);
    const dark = this.material('vanDark', '#2b2d31');
    const glass = this.material('vanGlass', '#2f3a45');
    const tyreMat = this.material('vanTyre', '#1e1e1e');
    const metal = this.material('vanMetal', '#9aa0a6');
    const lamp = this.material('vanLamp', '#fff2c4', 0.6);
    const tail = this.material('vanTail', '#e0473a', 0.5);

    const box = (name: string, mat: StandardMaterial, w: number, h: number, d: number, x: number, y: number, z: number): void => {
      this.part(CreateBox(name, { width: w, height: h, depth: d }, scene), mat).position.set(x, y, z);
    };
    const back = -LENGTH / 2;
    const front = LENGTH / 2;
    const cabStart = 0.9;
    // Chassis, cargo box and cab.
    box('vanChassis', dark, WIDTH - 0.15, 0.3, LENGTH - 0.2, 0, 0.45, 0);
    const cargoH = 1.9;
    box('vanCargo', paint, WIDTH, cargoH, cabStart - back, 0, FLOOR + cargoH / 2, (back + cabStart) / 2);
    const cabH = 1.5;
    box('vanCab', paint, WIDTH - 0.04, cabH, front - cabStart, 0, FLOOR + cabH / 2, (cabStart + front) / 2);
    // Windows.
    box('vanWindshield', glass, WIDTH - 0.3, 0.55, 0.04, 0, 1.65, front + 0.01);
    for (const x of [-1, 1]) box('vanSideWindow', glass, 0.04, 0.5, 0.8, x * (WIDTH / 2 - 0.01), 1.65, 1.65);
    // Relay livery: a red band round the cargo box (no text).
    for (const x of [-1, 1]) box('vanStripe', red, 0.03, 0.4, cabStart - back - 0.1, x * (WIDTH / 2 + 0.005), 1.35, (back + cabStart) / 2);
    box('vanStripeBack', red, WIDTH - 0.1, 0.4, 0.03, 0, 1.35, back - 0.005);
    box('vanRoofStripe', red, WIDTH - 0.3, 0.04, 0.5, 0, FLOOR + cargoH + 0.02, cabStart - 0.4);
    // Lights and bumpers.
    for (const x of [-1, 1]) {
      box('vanHeadlight', lamp, 0.3, 0.15, 0.04, x * 0.65, 0.95, front + 0.01);
      box('vanTaillight', tail, 0.15, 0.3, 0.04, x * 0.85, 1.0, back - 0.01);
    }
    box('vanBumperFront', dark, WIDTH, 0.18, 0.12, 0, 0.5, front + 0.04);
    box('vanBumperBack', dark, WIDTH, 0.18, 0.12, 0, 0.5, back - 0.04);

    for (const z of [REAR_AXLE, FRONT_AXLE]) {
      for (const x of [-1, 1]) {
        const hub = this.wheelHub(x * (WIDTH / 2 - 0.12), z, WHEEL_RADIUS);
        const tyre = this.part(CreateCylinder('vanTyre', { height: 0.26, diameter: WHEEL_RADIUS * 2, tessellation: 16 }, scene), tyreMat, hub);
        tyre.rotation.z = Math.PI / 2;
        const cap = this.part(CreateCylinder('vanHubcap', { height: 0.28, diameter: 0.34, tessellation: 10 }, scene), metal, hub);
        cap.rotation.z = Math.PI / 2;
        // A bar across the hubcap so the spin shows.
        this.part(CreateBox('vanHubBar', { width: 0.29, height: 0.5, depth: 0.08 }, scene), dark, hub);
      }
    }
  }
}
