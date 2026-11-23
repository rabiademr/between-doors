// Persistence: save-format migrations. Pure functions from one validated version to the next, so an
// old save is upgraded step by step (v1 → v2 → v3 → …) and every step is unit-tested on its own.
import { findItem } from '../content/catalog';
import { findVehicle } from '../content/vehicles';
import { STARTING_DISTRICT_IDS, type Profile, type Settings } from '../domain/Profile';

/** How v1 and v2 stored a purchase (the menu shop's upgrades). v3 keeps only the ids. */
export interface OwnedUpgrade {
  upgradeId: string;
  purchasedAt: string;
}

/** The v5 save (2026-11-14, the working day): the v6 profile without the graphics setting. */
export type ProfileV5 = Omit<Profile, 'schemaVersion' | 'settings'> & {
  schemaVersion: 5;
  settings: Omit<Settings, 'quality'>;
};

/** The v4 save (2026-11-14, side jobs): the v5 profile without the working-day counters. */
export type ProfileV4 = Omit<ProfileV5, 'schemaVersion' | 'dayJobs' | 'dayEarnings'> & {
  schemaVersion: 4;
};

/** The v3 save (2026-11-14, market stall): the v4 profile without the side-job counters. */
export type ProfileV3 = Omit<ProfileV4, 'schemaVersion' | 'jobsCompleted' | 'parcelsRecovered' | 'settledJobIds'> & {
  schemaVersion: 3;
};

/** The v2 save (2026-11-13): the v3 profile with `ownedUpgrades` instead of `ownedItemIds`. */
export type ProfileV2 = Omit<ProfileV3, 'schemaVersion' | 'ownedItemIds'> & {
  schemaVersion: 2;
  ownedUpgrades: OwnedUpgrade[];
};

/** The v1 save (Between Doors 1.0, chapters 1–3): the v2 profile without the fields v2 added. */
export type ProfileV1 = Omit<ProfileV2, 'schemaVersion' | 'discoveredDistrictIds' | 'ownedVehicleIds' | 'storyDay'> & {
  schemaVersion: 1;
};

/**
 * v1 → v2: everything the player earned is kept as it is (credits, chapters, records, upgrades,
 * achievements, settings). New v2 fields start where a v1 player stands: the v1 play area is already
 * known, no vehicles yet, day 1 of the courier's week (the v1 chapters are its opening).
 */
export function migrateV1toV2(v1: ProfileV1): ProfileV2 {
  const { schemaVersion: _v1, ...kept } = v1;
  return {
    ...structuredClone(kept),
    schemaVersion: 2,
    discoveredDistrictIds: [...STARTING_DISTRICT_IDS],
    ownedVehicleIds: [],
    storyDay: 1,
  };
}

/**
 * v2 → v3: the menu shop became the market stall. Owned upgrades (compass, Steady Pace) carry over as
 * vendor items with the same ids, in purchase order; ids the catalogue no longer knows and duplicates are
 * dropped (purchase dates are not kept). Everything else is unchanged.
 */
export function migrateV2toV3(v2: ProfileV2): ProfileV3 {
  const { schemaVersion: _v2, ownedUpgrades, ...kept } = v2;
  const ownedItemIds = [...new Set(ownedUpgrades.map((u) => u.upgradeId))].filter((id) => findItem(id) !== undefined);
  return { ...structuredClone(kept), schemaVersion: 3, ownedItemIds };
}

/**
 * v3 → v4: side jobs arrive. Nothing earned changes; the new counters start at zero. Vehicles the
 * catalogue does not know are dropped (v2/v3 never sold any, so the list is normally empty).
 */
export function migrateV3toV4(v3: ProfileV3): ProfileV4 {
  const { schemaVersion: _v3, ...kept } = v3;
  const clone = structuredClone(kept);
  return {
    ...clone,
    ownedVehicleIds: clone.ownedVehicleIds.filter((id) => findVehicle(id) !== undefined),
    schemaVersion: 4,
    jobsCompleted: 0,
    parcelsRecovered: 0,
    settledJobIds: [],
  };
}

/**
 * v4 → v5: days can end (Mara, after a few board jobs). Nothing earned changes and the day stays what it
 * was; the new day counters start at zero, so jobs done before the update do not count toward today.
 */
export function migrateV4toV5(v4: ProfileV4): ProfileV5 {
  const { schemaVersion: _v4, ...kept } = v4;
  return { ...structuredClone(kept), schemaVersion: 5, dayJobs: 0, dayEarnings: 0 };
}

/**
 * v5 → v6 (2026-11-16): graphics quality joins the settings, on 'auto' (the first seconds of play pick high
 * or low for this machine). Everything else is kept as it is.
 */
export function migrateV5toV6(v5: ProfileV5): Profile {
  const { schemaVersion: _v5, settings, ...kept } = v5;
  return { ...structuredClone(kept), schemaVersion: 6, settings: { ...settings, quality: 'auto' } };
}
