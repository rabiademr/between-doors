// Content: the Magpies — a gang of parcel thieves from the Railway Yard. Where they lie in wait, the way each
// one runs home, and the rules that send E on a thief / on the den's crate to the game. The chase rules are in
// domain/chase; wording in i18n (`magpies`). Ambushes and runs are drawn in content/world/railway-yard.geo.json.
import type { ThiefDef } from '../domain/chase/chase';
import type { Rect } from '../domain/world/worldData';
import type { GameRule } from './quests';
import { mapMarker, mapRoute, wallsRect } from './world';

/** The synthetic spot that follows a fleeing thief (kind `magpie`). */
export const MAGPIE_THIEF_SPOT_ID = 'magpie_thief';
/** The crate in the den (a `spot` in railway-yard.geo.json). */
export const MAGPIE_CRATE_ID = 'magpie_crate';

/** The fenced pen in the Railway Yard (walls `ry_fence_den_*`); its opening is on the west side. */
export const MAGPIE_DEN: Rect = wallsRect('ry_fence_den_');

/**
 * A thief from the map (railway-yard.geo.json): marker `ambush_<id>` is where it waits, route `run_<id>` the
 * way it runs home — down Yard Road, through the yard gate, round the water tower and in through the pen's
 * west opening to its own corner of the pen (they do not stand inside one another).
 */
const thief = (id: string, story = false): ThiefDef => {
  const ambush = mapMarker(`ambush_${id}`);
  return { id, ...(story ? { story: true } : {}), ambush: { x: ambush.x, z: ambush.z }, route: mapRoute(`run_${id}`) };
};

export const MAGPIES: readonly ThiefDef[] = [
  thief('magpie_indigo'), // south end of Indigo Row, just outside the core's opening
  thief('magpie_yard_road'), // Yard Road, west paving in front of the big hall
  thief('magpie_sidings'), // Sidings Road, west of the crossing with Yard Road
  thief('magpie_wharf'), // Wharf Road in Canal Side: the long run west and down Yard Road
];

/**
 * Story thieves: hidden and harmless until a chapter arms them (`magpie.arm`). What happens then is the
 * chapter's: its quest hears `magpie:snatched / recovered / atDen / lost` (QUEST_EVENTS.magpie).
 */
const storyMagpies = {
  // Chapter 4: on Market Street, waiting for the courier who carries Mara's spices up to the stall; runs
  // down the street, round the west side of the fountain, through Indigo Row and on to the den.
  magpie_market: thief('magpie_market', true),
  // Chapter 6: Finn's decoy. Waits on Yard Road's east paving; to be followed home, not caught.
  magpie_decoy: thief('magpie_decoy', true),
};
export type StoryThiefId = keyof typeof storyMagpies;
export const STORY_MAGPIES: Record<StoryThiefId, ThiefDef> = storyMagpies;

/**
 * The gang is the same in every chapter and step, so its rules are fallbacks next to DEFAULT_RULES:
 * E on a fleeing thief grabs the parcel back; E on the crate looks for a parcel in it.
 */
export const MAGPIE_RULES: readonly GameRule[] = [
  { on: { interact: MAGPIE_THIEF_SPOT_ID }, do: [{ call: 'magpie.grab' }] },
  { on: { interact: MAGPIE_CRATE_ID }, do: [{ call: 'magpie.crate' }] },
];

/** The gang is out from this day of the courier's week. */
export const MAGPIES_FROM_DAY = 2;
