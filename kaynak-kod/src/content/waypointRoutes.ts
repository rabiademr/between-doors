// Finn's routes (content), drawn in content/world/dial-square.geo.json. The layout (world/WorldBuilder.ts):
// street along Z (x −5..5), Dial Square north (z > 22) with the fountain at (0, 30),
// Crossing Yard behind the east houses (x 13..26, z −8..12), back lane x 13..18 from the yard to the square.
import type { Point2 } from '../world/waypoints';
import { mapMarker, mapRoute } from './world';

export const FINN_SPEED = 1.6; // m/s, a relaxed walk

const at = (id: string): Point2 => {
  const m = mapMarker(id);
  return { x: m.x, z: m.z };
};

/** Before a spot is agreed, Finn strolls across Dial Square (route `finn_patrol`). */
export const FINN_PATROL: readonly Point2[] = mapRoute('finn_patrol');

/** Where Finn stands and waits at each meeting point (markers `finn_wait_<point>`). */
export const MEETING_SPOTS = {
  mp_fountain: at('finn_wait_mp_fountain'),
  mp_yard: at('finn_wait_mp_yard'),
} as const;

/** Route from the square to each meeting point (Finn starts from wherever he is on the patrol). */
export const FINN_ROUTES: Record<keyof typeof MEETING_SPOTS, readonly Point2[]> = {
  mp_fountain: [MEETING_SPOTS.mp_fountain], // straight across the square
  mp_yard: mapRoute('finn_to_mp_yard'), // down the back lane to Crossing Yard
};
