// View: a placeholder electric kick scooter (deck, stem, small wheels). The rider stands on the deck.
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder';
import { CreateCylinder } from '@babylonjs/core/Meshes/Builders/cylinderBuilder';
import { CreateTorus } from '@babylonjs/core/Meshes/Builders/torusBuilder';
import type { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import type { Scene } from '@babylonjs/core/scene';
import { RELAY_RED, VehicleVisual, type RiderSeat } from './VehicleVisual';

const WHEEL_RADIUS = 0.11;
const WHEELBASE = 0.96;
const DECK_TOP = 0.17;

export class ScooterVisual extends VehicleVisual {
  readonly kind = 'scooter';
  /** Standing on the deck (normal idle pose). */
  readonly seat: RiderSeat = { pose: null, lift: DECK_TOP, z: -0.08, hidden: false };

  constructor(scene: Scene, parent: TransformNode, groundY: number) {
    super(scene, parent, groundY, 'scooter');
    const deckMat = this.material('scooterDeck', '#33373d');
    const tyreMat = this.material('scooterTyre', '#1e1e1e');
    const metal = this.material('scooterMetal', '#9aa0a6');
    const red = this.material('scooterRed', RELAY_RED);

    for (const z of [-WHEELBASE / 2, WHEELBASE / 2]) {
      const hub = this.wheelHub(0, z, WHEEL_RADIUS);
      const tyre = this.part(CreateTorus('scooterTyre', { diameter: WHEEL_RADIUS * 1.6, thickness: 0.06, tessellation: 16 }, scene), tyreMat, hub);
      tyre.rotation.z = Math.PI / 2;
      const spoke = this.part(CreateBox('scooterSpoke', { width: 0.03, height: WHEEL_RADIUS * 1.5, depth: 0.03 }, scene), metal, hub);
      spoke.rotation.x = 0.5;
    }
    const deck = this.part(CreateBox('scooterDeck', { width: 0.18, height: 0.05, depth: 0.78 }, scene), deckMat);
    deck.position.set(0, DECK_TOP - 0.025, -0.02);
    const fender = this.part(CreateBox('scooterFender', { width: 0.1, height: 0.03, depth: 0.22 }, scene), red);
    fender.position.set(0, WHEEL_RADIUS * 2 + 0.02, -WHEELBASE / 2);
    // Stem from the front axle up to the bars, leaning back a little toward the rider.
    const stem = this.part(CreateCylinder('scooterStem', { height: 0.95, diameter: 0.05, tessellation: 8 }, scene), metal);
    stem.position.set(0, 0.6, 0.43);
    stem.rotation.x = -0.12;
    const bar = this.part(CreateCylinder('scooterBar', { height: 0.5, diameter: 0.035, tessellation: 6 }, scene), metal);
    bar.position.set(0, 1.06, 0.37);
    bar.rotation.z = Math.PI / 2;
    for (const x of [-0.22, 0.22]) {
      const grip = this.part(CreateCylinder('scooterGrip', { height: 0.1, diameter: 0.045, tessellation: 6 }, scene), tyreMat);
      grip.position.set(x, 1.06, 0.37);
      grip.rotation.z = Math.PI / 2;
    }
    // Courier bag hung on the front of the stem.
    const bag = this.part(CreateBox('scooterBag', { width: 0.3, height: 0.28, depth: 0.16 }, scene), red);
    bag.position.set(0, 0.72, 0.55);
  }
}
