// Model: credits, records and achievements (design doc p.10, 19, 20). Purchases: domain/Economy.
// Pure functions: take a profile, return a NEW profile (input is never mutated). The real
// protection against double rewards lives here, not in the UI.
import { CHAPTER_ACHIEVEMENTS, CHAPTER_IDS, CHAPTER_REWARD_CREDITS, isChapterId } from '../content/catalog';
import type { ScoreBreakdown } from './ScoreService';
import type { Profile, RecordedResult } from './Profile';

export const SETTLED_HISTORY = 30;

export interface CompletedAttempt {
  attemptId: string;
  chapterId: string;
  timeSeconds: number;
  wrongTargetIds: readonly string[];
  hintIds: readonly string[];
  score: ScoreBreakdown;
  equipmentIds: readonly string[];
}

export interface SettleOutcome {
  profile: Profile;
  /** false if this attempt was already settled (nothing changed). */
  applied: boolean;
  creditsAwarded: number;
  unlockedAchievementIds: string[];
  newBestScore: boolean;
}

export function settleAttempt(profile: Profile, a: CompletedAttempt, nowIso: string): SettleOutcome {
  if (!isChapterId(a.chapterId)) throw new Error(`Unknown chapter ${a.chapterId}`);
  if (profile.settledAttemptIds.includes(a.attemptId)) {
    return { profile, applied: false, creditsAwarded: 0, unlockedAchievementIds: [], newBestScore: false };
  }
  const p = clone(profile);

  // Credits: only the FIRST completion of a chapter pays (replays update records, not credits).
  let creditsAwarded = 0;
  if (!p.rewardClaimedChapterIds.includes(a.chapterId)) {
    creditsAwarded = CHAPTER_REWARD_CREDITS;
    p.credits += creditsAwarded;
    p.rewardClaimedChapterIds.push(a.chapterId);
  }
  if (!p.completedChapterIds.includes(a.chapterId)) p.completedChapterIds.push(a.chapterId);
  // "Continue" moves on after finishing the furthest chapter (replaying an older one doesn't move it back).
  const done = CHAPTER_IDS.indexOf(a.chapterId);
  const current = CHAPTER_IDS.indexOf(p.currentChapterId as (typeof CHAPTER_IDS)[number]);
  const nextId = CHAPTER_IDS[done + 1];
  if (nextId && done >= current) p.currentChapterId = nextId;

  // Records: best score and best time are kept separately, each from one whole attempt.
  const rec = toRecord(a);
  const chapter = p.chapterRecords[a.chapterId] ?? { bestResult: null, bestTimeResult: null };
  const newBestScore = !chapter.bestResult || rec.score > chapter.bestResult.score;
  if (newBestScore) chapter.bestResult = rec;
  if (!chapter.bestTimeResult || rec.activeMs < chapter.bestTimeResult.activeMs) chapter.bestTimeResult = rec;
  p.chapterRecords[a.chapterId] = chapter;

  // Achievements: unlock once; an existing unlock keeps its original date.
  const unlockedAchievementIds: string[] = [];
  const unlock = (id: string): void => {
    if (p.achievementUnlocks[id]) return;
    p.achievementUnlocks[id] = nowIso;
    unlockedAchievementIds.push(id);
  };
  const chapterAchievement = CHAPTER_ACHIEVEMENTS[a.chapterId];
  if (chapterAchievement) unlock(chapterAchievement);
  if (a.wrongTargetIds.length === 0) unlock('clean_shift');

  p.settledAttemptIds = [...p.settledAttemptIds, a.attemptId].slice(-SETTLED_HISTORY);
  return { profile: p, applied: true, creditsAwarded, unlockedAchievementIds, newBestScore };
}

function toRecord(a: CompletedAttempt): RecordedResult {
  return {
    attemptId: a.attemptId,
    score: a.score.total,
    baseScore: a.score.base,
    bonus: a.score.timeBonus,
    activeMs: Math.round(a.timeSeconds * 1000),
    wrongTargetCount: a.wrongTargetIds.length,
    hintIds: [...a.hintIds],
    equipmentIds: [...a.equipmentIds],
  };
}

function clone(p: Profile): Profile {
  return structuredClone(p);
}

/** Chapter select and "Continue" follow the week's story: domain/story.ts. */

/** True once the player has done anything worth "Continue" (finished a chapter or moved past ch1). */
export function hasProgress(profile: Profile): boolean {
  return profile.completedChapterIds.length > 0 || profile.currentChapterId !== CHAPTER_IDS[0];
}
