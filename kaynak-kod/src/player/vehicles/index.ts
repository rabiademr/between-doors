// View: one placeholder visual per vehicle kind.
import type { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import type { Scene } from '@babylonjs/core/scene';
import type { VehicleKind } from '../movers/vehicles';
import { BikeVisual } from './BikeVisual';
import { MotorcycleVisual } from './MotorcycleVisual';
import { ScooterVisual } from './ScooterVisual';
import { VanVisual } from './VanVisual';
import type { VehicleVisual } from './VehicleVisual';

export type { RiderSeat, VehicleVisual } from './VehicleVisual';

/** Build the (hidden) visual for a vehicle, parented to the player's body; `groundY` = ground in its space. */
export function createVehicleVisual(kind: VehicleKind, scene: Scene, parent: TransformNode, groundY: number): VehicleVisual {
  switch (kind) {
    case 'bike':
      return new BikeVisual(scene, parent, groundY);
    case 'scooter':
      return new ScooterVisual(scene, parent, groundY);
    case 'motorcycle':
      return new MotorcycleVisual(scene, parent, groundY);
    case 'van':
      return new VanVisual(scene, parent, groundY);
  }
}
