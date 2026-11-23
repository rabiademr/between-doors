// Model: the single local player profile (design doc p.19). Plain serialisable data only —
// never Babylon objects. Times are integer milliseconds, dates ISO UTC strings.
import { CHAPTER_IDS } from '../content/catalog';
import type { Language } from '../i18n';
import type { QualitySetting } from './quality';

export const SCHEMA_VERSION = 6;
/** How many settled job ids are remembered (guards against paying the same job twice). */
export const SETTLED_JOBS_KEPT = 30;

/** Districts every profile knows from the start (the v1 play area). */
export const STARTING_DISTRICT_IDS: readonly string[] = ['indigo-row', 'dial-square'];
/** The courier's first week (F5): days 1–5. */
export const STORY_DAYS = 5;

export interface RecordedResult {
  attemptId: string;
  score: number;
  baseScore: number;
  bonus: number;
  activeMs: number;
  wrongTargetCount: number;
  hintIds: string[];
  /** Vendor items owned during this attempt (best result and its equipment come from the same attempt). */
  equipmentIds: string[];
}

export interface ChapterRecord {
  bestResult: RecordedResult | null;
  bestTimeResult: RecordedResult | null;
}

export interface Settings {
  musicVolume: number;
  sensitivity: number;
  /** null = not chosen yet → follow the browser language. */
  language: Language | null;
  /** Graphics (added in v6): 'auto' measures the first seconds of play and picks high or low. */
  quality: QualitySetting;
}

export interface Profile {
  schemaVersion: 6;
  profileId: 'local';
  credits: number;
  currentChapterId: string;
  completedChapterIds: string[];
  rewardClaimedChapterIds: string[];
  /** achievementId → unlock date */
  achievementUnlocks: Record<string, string>;
  chapterRecords: Record<string, ChapterRecord>;
  /** Last processed attempts (capped) — guards against settling the same attempt twice. */
  settledAttemptIds: string[];
  settings: Settings;
  // ---- added in v2 (2026-11-13) ----
  /** Districts the player has entered: the map (M) shows these. */
  discoveredDistrictIds: string[];
  /** Vehicles the player owns (bike first; F3). */
  ownedVehicleIds: string[];
  /** Day of the courier's first week, 1..STORY_DAYS (F5). */
  storyDay: number;
  // ---- added in v3 (2026-11-14), replaces v1/v2 `ownedUpgrades` ----
  /** Vendor items (skills and tools) the player owns, in purchase order (content/catalog VENDOR_ITEMS). */
  ownedItemIds: string[];
  // ---- added in v4 (2026-11-14): side jobs from the Relay board ----
  /** Board jobs delivered (any kind). */
  jobsCompleted: number;
  /** Parcels taken back from the Magpies. */
  parcelsRecovered: number;
  /** Last paid jobs (capped) — a job is never paid twice. */
  settledJobIds: string[];
  // ---- added in v5 (2026-11-14): the working day (domain/day.ts) ----
  /** Board jobs delivered since this day began (ending the shift needs a few). */
  dayJobs: number;
  /** Credits those jobs paid. */
  dayEarnings: number;
}

export function emptyProfile(): Profile {
  const chapterRecords: Record<string, ChapterRecord> = {};
  for (const id of CHAPTER_IDS) chapterRecords[id] = { bestResult: null, bestTimeResult: null };
  return {
    schemaVersion: SCHEMA_VERSION,
    profileId: 'local',
    credits: 0,
    currentChapterId: 'ch1',
    completedChapterIds: [],
    rewardClaimedChapterIds: [],
    achievementUnlocks: {},
    chapterRecords,
    settledAttemptIds: [],
    settings: { musicVolume: 0.5, sensitivity: 1, language: null, quality: 'auto' },
    discoveredDistrictIds: [...STARTING_DISTRICT_IDS],
    ownedVehicleIds: [],
    storyDay: 1,
    ownedItemIds: [],
    jobsCompleted: 0,
    parcelsRecovered: 0,
    settledJobIds: [],
    dayJobs: 0,
    dayEarnings: 0,
  };
}

export const ownsItem = (p: Profile, itemId: string): boolean => p.ownedItemIds.includes(itemId);
