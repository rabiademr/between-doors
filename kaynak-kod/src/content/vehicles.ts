// Content: the vehicles a courier can own — sold at the market stall, parked outside Relay.
// Ids match player/movers/vehicles.ts (`VehicleKind`). Prices are first values (balanced in F6).
import type { LocalizedText } from '../i18n';
import type { Pose } from '../domain/vehicles/parking';
import { mapMarker } from './world';
import type { GameRule } from './quests';

export interface VehicleOffer {
  id: 'bike' | 'scooter' | 'motorcycle' | 'van';
  /** Proper names stay English in every language. */
  name: string;
  price: number;
  /** First day of the courier's week the stall sells it. */
  availableFromDay: number;
  description: LocalizedText;
}

export const VEHICLE_OFFERS: readonly VehicleOffer[] = [
  {
    id: 'bike',
    name: 'Relay Bike',
    price: 120,
    availableFromDay: 1,
    description: { en: 'An old courier bike. Quicker than walking, fits every lane.', tr: 'Eski bir kurye bisikleti. Yürümekten hızlı, her sokağa sığar.' },
  },
  {
    id: 'scooter',
    name: 'Scooter',
    price: 300,
    availableFromDay: 1,
    description: { en: 'Nippy off the line. Good for short hops across town.', tr: 'Kalkışta çevik. Kasaba içi kısa işler için iyi.' },
  },
  {
    id: 'motorcycle',
    name: 'Motorcycle',
    price: 600,
    availableFromDay: 2,
    description: { en: 'The fastest way across Bellwick. Brake early.', tr: 'Bellwick’i geçmenin en hızlı yolu. Erken fren yap.' },
  },
  {
    id: 'van',
    name: 'Cargo Van',
    price: 900,
    availableFromDay: 3,
    description: { en: 'Slow and wide, but nothing in the back gets shaken.', tr: 'Yavaş ve geniş, ama arkadaki hiçbir şey sarsılmaz.' },
  },
];

export const findVehicle = (id: string): VehicleOffer | undefined => VEHICLE_OFFERS.find((v) => v.id === id);

// ---------------------------------------------------------------- parking (the rack outside Relay)
// Owned vehicles wait on Indigo Row just north of Relay's front (heading: 0 = north/+Z, π/2 = east/+X).
// Park positions are not saved: every session starts with all owned vehicles here.

/**
 * Rack slots are markers `rack_<id>` in indigo-row.geo.json: two-wheelers side by side across the west
 * pavement (x −5..−3), noses to the road; the van, too wide for the pavement, on the road edge facing north.
 */
export function rackPose(id: string): Pose {
  const m = mapMarker(`rack_${id}`);
  return { x: m.x, z: m.z, heading: m.heading };
}

/** The one shared interaction spot, placed each frame on the nearest parked vehicle (like the townsfolk spot). */
export const VEHICLE_PARKED_SPOT_ID = 'vehicle_parked';
/** How close (m, to the vehicle's centre line) E gets on. */
export const VEHICLE_MOUNT_RANGE = 2.2;

/** Getting on a parked vehicle is the same in every chapter and step: a fallback rule next to DEFAULT_RULES. */
export const VEHICLE_RULES: readonly GameRule[] = [{ on: { interact: VEHICLE_PARKED_SPOT_ID }, do: [{ call: 'vehicle.mount' }] }];
