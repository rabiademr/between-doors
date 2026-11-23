// Persistence: one local profile in localStorage (no accounts/servers). Works on file:// too.
// Rules (design doc p.19–20): validate on load; a damaged or unsupported save is NEVER silently
// deleted — the caller is told, and offers backup export + an explicit "start new".
// Versions: each schema version lives under its own key; only the current one (v6) is written. With no
// v6 save, the newest older save (v5, v4, v3, v2, else v1 — Between Doors 1.0) is read, migrated step by step
// (v1 → v2 → v3 → v4 → v5 → v6) and written as v6. Old keys are left untouched (a fallback if anything goes wrong)
// until an explicit reset, which removes all of them.
import { findAchievement, findItem, isChapterId } from '../content/catalog';
import { isLanguage } from '../i18n';
import { findVehicle } from '../content/vehicles';
import { SETTLED_JOBS_KEPT, STORY_DAYS, emptyProfile, type ChapterRecord, type Profile, type RecordedResult } from '../domain/Profile';
import { isQualitySetting } from '../domain/quality';
import { migrateV1toV2, migrateV2toV3, migrateV3toV4, migrateV4toV5, migrateV5toV6, type OwnedUpgrade } from './migrations';

export const SAVE_KEY = 'betweenDoors.save.v6';
/** Read-only: migrated on first load, never written, removed only by an explicit reset. */
export const SAVE_KEY_V5 = 'betweenDoors.save.v5';
/** Read-only: migrated on first load, never written, removed only by an explicit reset. */
export const SAVE_KEY_V4 = 'betweenDoors.save.v4';
/** Read-only: migrated on first load, never written, removed only by an explicit reset. */
export const SAVE_KEY_V3 = 'betweenDoors.save.v3';
/** Read-only: migrated on first load, never written, removed only by an explicit reset. */
export const SAVE_KEY_V2 = 'betweenDoors.save.v2';
/** Read-only: migrated on first load, never written, removed only by an explicit reset. */
export const SAVE_KEY_V1 = 'betweenDoors.save.v1';

/** Older saves, newest first: the first one found is migrated. */
const LEGACY_KEYS: readonly { key: string; version: 1 | 2 | 3 | 4 | 5 }[] = [
  { key: SAVE_KEY_V5, version: 5 },
  { key: SAVE_KEY_V4, version: 4 },
  { key: SAVE_KEY_V3, version: 3 },
  { key: SAVE_KEY_V2, version: 2 },
  { key: SAVE_KEY_V1, version: 1 },
];

export type LoadResult =
  | { status: 'new'; profile: Profile }
  | { status: 'ok'; profile: Profile; migratedFrom?: 1 | 2 | 3 | 4 | 5 }
  /** Save exists but can't be used. `raw` is the untouched original for backup export. */
  | { status: 'corrupt'; profile: Profile; raw: string; reason: string };

export class SaveRepository {
  private readonly storage: Storage | null;

  constructor(storage?: Storage | null) {
    this.storage = storage !== undefined ? storage : safeLocalStorage();
  }

  /** False if the browser gives us no storage at all (e.g. blocked) → temporary session. */
  get available(): boolean {
    return this.storage !== null;
  }

  load(): LoadResult {
    const raw = this.read(SAVE_KEY);
    if (raw !== null) return parseRaw(raw);
    // No v3 save yet: bring the newest older save over (once: the v3 copy is written right away).
    for (const { key, version } of LEGACY_KEYS) {
      const old = this.read(key);
      if (old === null) continue;
      const result = parseRaw(old);
      if (result.status !== 'ok') return result; // damaged old save: reported like any damaged save, never deleted
      this.save(result.profile);
      return { status: 'ok', profile: result.profile, migratedFrom: version };
    }
    return { status: 'new', profile: emptyProfile() };
  }

  private read(key: string): string | null {
    try {
      return this.storage?.getItem(key) ?? null;
    } catch {
      return null;
    }
  }

  /** Write the whole snapshot. Returns false on failure (quota, privacy mode…) — never throws. */
  save(profile: Profile): boolean {
    if (!this.storage) return false;
    try {
      this.storage.setItem(SAVE_KEY, JSON.stringify(profile));
      return true;
    } catch {
      return false;
    }
  }

  /** Explicit, user-confirmed reset: removes ONLY this game's keys (v6, and v5…v1 — or they would come back). */
  reset(): boolean {
    try {
      this.storage?.removeItem(SAVE_KEY);
      for (const { key } of LEGACY_KEYS) this.storage?.removeItem(key);
      return true;
    } catch {
      return false;
    }
  }
}

function safeLocalStorage(): Storage | null {
  try {
    const s = window.localStorage;
    const probe = '__betweenDoors_probe__';
    s.setItem(probe, '1');
    s.removeItem(probe);
    return s;
  } catch {
    return null;
  }
}

// ---------- validation ----------

class SaveFormatError extends Error {}
const fail = (msg: string): never => {
  throw new SaveFormatError(msg);
};

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const strArray = (v: unknown, field: string): string[] => {
  if (!Array.isArray(v) || !v.every((x) => typeof x === 'string')) fail(`${field} must be a list of strings`);
  return [...new Set(v as string[])]; // duplicates removed
};
const nonNegInt = (v: unknown, field: string): number => {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 0) fail(`${field} must be a non-negative integer`);
  return v as number;
};

function parseRaw(raw: string): LoadResult {
  try {
    return { status: 'ok', profile: parseProfile(JSON.parse(raw)) };
  } catch (err) {
    return { status: 'corrupt', profile: emptyProfile(), raw, reason: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Validate unknown JSON into a current Profile; an older version is validated, then migrated.
 * Throws SaveFormatError when the save is unusable (including a version newer than this build).
 */
export function parseProfile(data: unknown): Profile {
  if (!isObj(data)) return fail('not an object');
  const version = data.schemaVersion;
  if (version !== 1 && version !== 2 && version !== 3 && version !== 4 && version !== 5 && version !== 6) {
    return fail(`unsupported schemaVersion ${String(version)}`);
  }
  const common = parseCommon(data);
  const toV6 = migrateV5toV6;
  if (version === 1) {
    return toV6(migrateV4toV5(migrateV3toV4(migrateV2toV3(migrateV1toV2({ ...common, ownedUpgrades: parseOwnedUpgrades(data), schemaVersion: 1 })))));
  }
  const week = parseWeekFields(data);
  if (version === 2) {
    return toV6(migrateV4toV5(migrateV3toV4(migrateV2toV3({ ...common, ...week, ownedUpgrades: parseOwnedUpgrades(data), schemaVersion: 2 }))));
  }
  // Unknown ids (an item removed from the catalogue) are dropped; duplicates are removed by strArray.
  const ownedItemIds = strArray(data.ownedItemIds, 'ownedItemIds').filter((id) => findItem(id) !== undefined);
  if (version === 3) return toV6(migrateV4toV5(migrateV3toV4({ ...common, ...week, ownedItemIds, schemaVersion: 3 })));
  const v4 = {
    ...common,
    ...week,
    ownedVehicleIds: week.ownedVehicleIds.filter((id) => findVehicle(id) !== undefined),
    ownedItemIds,
    schemaVersion: 4 as const,
    jobsCompleted: nonNegInt(data.jobsCompleted, 'jobsCompleted'),
    parcelsRecovered: nonNegInt(data.parcelsRecovered, 'parcelsRecovered'),
    settledJobIds: strArray(data.settledJobIds, 'settledJobIds').slice(-SETTLED_JOBS_KEPT),
  };
  if (version === 4) return toV6(migrateV4toV5(v4));
  const v5 = { ...v4, schemaVersion: 5 as const, dayJobs: nonNegInt(data.dayJobs, 'dayJobs'), dayEarnings: nonNegInt(data.dayEarnings, 'dayEarnings') };
  if (version === 5) return toV6(v5);
  return { ...v5, schemaVersion: 6, settings: common.settings };
}

type JobFields = 'jobsCompleted' | 'parcelsRecovered' | 'settledJobIds' | 'dayJobs' | 'dayEarnings';
type CommonFields = Omit<Profile, 'schemaVersion' | 'discoveredDistrictIds' | 'ownedVehicleIds' | 'storyDay' | 'ownedItemIds' | JobFields>;
type WeekFields = Pick<Profile, 'discoveredDistrictIds' | 'ownedVehicleIds' | 'storyDay'>;

/** Fields added in v2 (kept in v3), validated the same way in both. */
function parseWeekFields(data: Record<string, unknown>): WeekFields {
  const base = emptyProfile();
  const day = data.storyDay;
  return {
    discoveredDistrictIds: Array.isArray(data.discoveredDistrictIds)
      ? strArray(data.discoveredDistrictIds, 'discoveredDistrictIds')
      : base.discoveredDistrictIds,
    ownedVehicleIds: Array.isArray(data.ownedVehicleIds) ? strArray(data.ownedVehicleIds, 'ownedVehicleIds') : base.ownedVehicleIds,
    storyDay: typeof day === 'number' && Number.isInteger(day) ? clamp(day, 1, STORY_DAYS) : base.storyDay,
  };
}

/** v1/v2 purchases: well-formed entries are kept; unknown ids and duplicates are dropped by migrateV2toV3. */
function parseOwnedUpgrades(data: Record<string, unknown>): OwnedUpgrade[] {
  if (!Array.isArray(data.ownedUpgrades)) fail('ownedUpgrades must be a list');
  return (data.ownedUpgrades as unknown[])
    .filter(isObj)
    .filter((u) => typeof u.upgradeId === 'string' && typeof u.purchasedAt === 'string')
    .map((u) => ({ upgradeId: u.upgradeId as string, purchasedAt: u.purchasedAt as string }));
}

/** Fields shared by v1, v2 and v3, validated the same way in all of them. */
function parseCommon(data: Record<string, unknown>): CommonFields {
  const base = emptyProfile();

  const credits = nonNegInt(data.credits, 'credits');
  const completed = strArray(data.completedChapterIds, 'completedChapterIds').filter(isChapterId);
  const claimed = strArray(data.rewardClaimedChapterIds, 'rewardClaimedChapterIds').filter(isChapterId);
  // Earned credit must belong to a completed chapter.
  for (const id of claimed) if (!completed.includes(id)) fail(`reward claimed for uncompleted ${id}`);

  const achievements: Record<string, string> = {};
  if (isObj(data.achievementUnlocks)) {
    for (const [id, date] of Object.entries(data.achievementUnlocks)) {
      if (findAchievement(id) && typeof date === 'string') achievements[id] = date;
    }
  }

  const records = base.chapterRecords;
  if (isObj(data.chapterRecords)) {
    for (const [id, rec] of Object.entries(data.chapterRecords)) {
      if (isChapterId(id) && isObj(rec)) records[id] = parseChapterRecord(rec);
    }
  }

  const settings = { ...base.settings };
  if (isObj(data.settings)) {
    if (typeof data.settings.musicVolume === 'number') settings.musicVolume = clamp(data.settings.musicVolume, 0, 1);
    if (typeof data.settings.sensitivity === 'number') settings.sensitivity = clamp(data.settings.sensitivity, 0.25, 4);
    if (isLanguage(data.settings.language)) settings.language = data.settings.language;
    if (isQualitySetting(data.settings.quality)) settings.quality = data.settings.quality; // v6; older saves: 'auto'
  }

  return {
    profileId: 'local',
    credits,
    currentChapterId: typeof data.currentChapterId === 'string' && isChapterId(data.currentChapterId) ? data.currentChapterId : 'ch1',
    completedChapterIds: completed,
    rewardClaimedChapterIds: claimed,
    achievementUnlocks: achievements,
    chapterRecords: records,
    settledAttemptIds: Array.isArray(data.settledAttemptIds) ? strArray(data.settledAttemptIds, 'settledAttemptIds').slice(-30) : [],
    settings,
  };
}

function parseChapterRecord(rec: Record<string, unknown>): ChapterRecord {
  return { bestResult: parseResult(rec.bestResult), bestTimeResult: parseResult(rec.bestTimeResult) };
}

function parseResult(v: unknown): RecordedResult | null {
  if (!isObj(v)) return null;
  if (typeof v.attemptId !== 'string') return null;
  return {
    attemptId: v.attemptId,
    score: nonNegInt(v.score, 'score'),
    baseScore: nonNegInt(v.baseScore ?? 0, 'baseScore'),
    bonus: nonNegInt(v.bonus ?? 0, 'bonus'),
    activeMs: nonNegInt(v.activeMs, 'activeMs'),
    wrongTargetCount: nonNegInt(v.wrongTargetCount ?? 0, 'wrongTargetCount'),
    hintIds: Array.isArray(v.hintIds) ? strArray(v.hintIds, 'hintIds') : [],
    equipmentIds: Array.isArray(v.equipmentIds) ? strArray(v.equipmentIds, 'equipmentIds') : [],
  };
}

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
