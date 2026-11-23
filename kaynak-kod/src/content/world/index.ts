// Content: Bellwick's map layers (GeoJSON, local metres). Edit the .geo.json files in geojson.io or QGIS;
// `parseWorld` validates them at startup (and in tests), so a broken edit fails loudly instead of silently.
import { districtsRect, parseWorld, type Marker, type Rect, type WorldData } from '../../domain/world/worldData';
import indigoRow from './indigo-row.geo.json';
import dialSquare from './dial-square.geo.json';
import districts from './districts.geo.json';
import marketHill from './market-hill.geo.json';
import canalSide from './canal-side.geo.json';
import railwayYard from './railway-yard.geo.json';
import hillsidePark from './hillside-park.geo.json';

/** Order matters only for drawing (later features draw over earlier ones on the map). */
export const WORLD_SOURCES: readonly unknown[] = [indigoRow, dialSquare, districts, marketHill, canalSide, railwayYard, hillsidePark];

export const BELLWICK: WorldData = parseWorld(WORLD_SOURCES);

/** The hand-built core (the three v1 chapters): its dressing, terraces and suburban houses are laid out around it. */
export const CORE_DISTRICTS = ['indigo-row', 'dial-square'] as const;
export const coreRect = (world: WorldData): Rect => districtsRect(world.districts, CORE_DISTRICTS);

/** A `marker` from the map by id (thief ambushes, rack slots, where Finn waits). Throws if missing: a content bug. */
export function mapMarker(id: string): Marker {
  const m = BELLWICK.markers.find((x) => x.id === id);
  if (!m) throw new Error(`map marker "${id}" is missing (content/world/*.geo.json)`);
  return m;
}

/** A `route` from the map by id (a thief's run home, Finn's patrol). Throws if missing. */
export function mapRoute(id: string): { x: number; z: number }[] {
  const r = BELLWICK.routes.find((x) => x.id === id);
  if (!r) throw new Error(`map route "${id}" is missing (content/world/*.geo.json)`);
  return r.points.map((p) => ({ ...p }));
}

/** Bounding rectangle of the walls whose id starts with `prefix` (a fenced pen drawn as walls). */
export function wallsRect(prefix: string): Rect {
  const walls = BELLWICK.solids.filter((s) => s.kind === 'wall' && s.id.startsWith(prefix));
  if (walls.length === 0) throw new Error(`no walls "${prefix}*" on the map`);
  return {
    x0: Math.min(...walls.map((w) => w.rect.x0)),
    x1: Math.max(...walls.map((w) => w.rect.x1)),
    z0: Math.min(...walls.map((w) => w.rect.z0)),
    z1: Math.max(...walls.map((w) => w.rect.z1)),
  };
}
