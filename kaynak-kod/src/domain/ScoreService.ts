// Model layer: pure game rules. Must NOT import Babylon or touch the DOM,
// so it can be unit-tested in isolation (like the Battleship model in the course).

export const BASE_SCORE = 1000;
export const WRONG_TARGET_PENALTY = 100;
export const HINT_COSTS = [50, 100] as const; // 1st hint 50, 2nd hint 100 (max 150)
export const MIN_BASE_SCORE = 100;

export interface ChapterResult {
  /** Number of DISTINCT wrong targets tried (same wrong door twice counts once). */
  wrongTargets: number;
  /** Hints used, 0..2. */
  hintsUsed: number;
  /** Completion time in seconds. */
  timeSeconds: number;
  /** Reference time R for this chapter, in seconds. */
  referenceSeconds: number;
}

export function hintPenalty(hintsUsed: number): number {
  const n = Math.max(0, Math.min(hintsUsed, HINT_COSTS.length));
  return HINT_COSTS.slice(0, n).reduce((sum, c) => sum + c, 0);
}

export function timeBonus(timeSeconds: number, referenceSeconds: number): number {
  if (timeSeconds <= referenceSeconds) return 200;
  if (timeSeconds <= referenceSeconds * 1.5) return 150;
  if (timeSeconds <= referenceSeconds * 2) return 100;
  return 0;
}

export interface ScoreBreakdown {
  wrongPenalty: number;
  hintPenalty: number;
  /** max(100, 1000 − penalties) */
  base: number;
  timeBonus: number;
  total: number;
}

/** Same rule as chapterScore, with each part exposed for the result screen. */
export function scoreBreakdown(r: ChapterResult): ScoreBreakdown {
  const wrongPenalty = Math.max(0, r.wrongTargets) * WRONG_TARGET_PENALTY;
  const hints = hintPenalty(r.hintsUsed);
  const base = Math.max(MIN_BASE_SCORE, BASE_SCORE - wrongPenalty - hints);
  const bonus = timeBonus(r.timeSeconds, r.referenceSeconds);
  return { wrongPenalty, hintPenalty: hints, base, timeBonus: bonus, total: base + bonus };
}

export function chapterScore(r: ChapterResult): number {
  return scoreBreakdown(r).total;
}
