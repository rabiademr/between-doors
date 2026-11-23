// Controller (pure — no Babylon/DOM): one delivery attempt as a small state machine.
//
//   READY ──accept()──▶ ACTIVE ──deliver(correct)──▶ COMPLETED
//                         │  checkTarget(wrong): stays ACTIVE, unique penalty list grows
//                         │  recordClue(id): remembers inspected clues (ch3 photo puzzle)
//
// COMPLETED never goes back to READY; a replay is a new controller (new attempt).
import type { ChapterDefinition } from '../content/chapters';
import { HINT_COSTS, scoreBreakdown, type ScoreBreakdown } from '../domain/ScoreService';
import { TimerService } from '../domain/TimerService';

export type ChapterPhase = 'READY' | 'ACTIVE' | 'COMPLETED';

/** Hint ids in the order they are offered (FR-13): text clue, then the search area. */
export const HINT_IDS = ['hint_text', 'hint_area'] as const;
export type HintId = (typeof HINT_IDS)[number];

export type HintResult =
  | { kind: 'unavailable' }
  | { kind: 'shown'; hintId: HintId; cost: number };

export type CheckResult =
  | { kind: 'no-parcel' }
  | { kind: 'already-delivered' }
  | { kind: 'wrong'; penalized: boolean }
  | { kind: 'correct' };

export interface AttemptResult {
  attemptId: string;
  chapterId: string;
  timeSeconds: number;
  wrongTargetIds: string[];
  hintsUsed: number;
  hintIds: string[];
  /** Upgrades owned when this attempt started. */
  equipmentIds: string[];
  score: ScoreBreakdown;
}

let attemptCounter = 0;
/** Unique per attempt (no crypto needed; works on file://). */
export function newAttemptId(): string {
  attemptCounter += 1;
  return `att-${Date.now().toString(36)}-${attemptCounter}-${Math.floor(Math.random() * 1e6).toString(36)}`;
}

export class ChapterController {
  readonly definition: ChapterDefinition;
  readonly attemptId: string;
  readonly equipmentIds: readonly string[];
  readonly timer = new TimerService();
  private phaseValue: ChapterPhase = 'READY';
  private readonly wrongTargets = new Set<string>();
  private readonly clues = new Set<string>();
  private readonly hints: HintId[] = [];
  private result: AttemptResult | null = null;

  constructor(definition: ChapterDefinition, equipmentIds: readonly string[] = [], attemptId = newAttemptId()) {
    this.definition = definition;
    this.equipmentIds = [...equipmentIds];
    this.attemptId = attemptId;
  }

  get phase(): ChapterPhase {
    return this.phaseValue;
  }

  get wrongTargetIds(): readonly string[] {
    return [...this.wrongTargets];
  }

  /** Player confirmed the note: parcel in hand, mission clock starts. Idempotent: true only when it started now. */
  accept(): boolean {
    if (this.phaseValue !== 'READY') return false;
    this.phaseValue = 'ACTIVE';
    this.timer.start();
    return true;
  }

  /** Hints taken so far, in order (re-opening them is free). */
  get hintIds(): readonly HintId[] {
    return [...this.hints];
  }

  /** The next hint that would cost points, or null when both are taken. */
  get nextHint(): { hintId: HintId; cost: number } | null {
    const i = this.hints.length;
    const hintId = HINT_IDS[i];
    const cost = HINT_COSTS[i];
    return hintId !== undefined && cost !== undefined ? { hintId, cost } : null;
  }

  /**
   * Take the next hint (sequential: text first, then area). Only while the parcel is in hand.
   * Each hint is charged once per attempt; the total is capped at 50 + 100 by ScoreService.
   */
  takeNextHint(): HintResult {
    const next = this.nextHint;
    if (this.phaseValue !== 'ACTIVE' || !next) return { kind: 'unavailable' };
    this.hints.push(next.hintId);
    return { kind: 'shown', hintId: next.hintId, cost: next.cost };
  }

  /** Remember an inspected clue. Only counts while the parcel is in hand. Returns true the first time. */
  recordClue(clueId: string): boolean {
    if (this.phaseValue !== 'ACTIVE' || this.clues.has(clueId)) return false;
    this.clues.add(clueId);
    return true;
  }

  /** True when every clue the chapter needs has been found (or it needs none). */
  get clueSatisfied(): boolean {
    return (this.definition.requiredClueIds ?? []).every((id) => this.clues.has(id));
  }

  /** Clues inspected in this attempt, in the order they were found. */
  get clueIds(): readonly string[] {
    return [...this.clues];
  }

  /** Player pressed E on a delivery candidate. Wrong targets cost 100 once per distinct id. */
  checkTarget(targetId: string): CheckResult {
    if (this.phaseValue === 'READY') return { kind: 'no-parcel' };
    if (this.phaseValue === 'COMPLETED') return { kind: 'already-delivered' };
    if (targetId === this.definition.targetId) return { kind: 'correct' };
    const penalized = !this.wrongTargets.has(targetId);
    this.wrongTargets.add(targetId);
    return { kind: 'wrong', penalized };
  }

  /**
   * Hand over the parcel at the correct target. Returns the result; calling it again
   * (double click, repeated event) returns the SAME result — never a second one.
   */
  deliver(targetId: string): AttemptResult | null {
    if (this.result) return this.result;
    if (this.phaseValue !== 'ACTIVE' || targetId !== this.definition.targetId) return null;
    this.timer.stop();
    this.phaseValue = 'COMPLETED';
    const timeSeconds = this.timer.seconds;
    this.result = {
      attemptId: this.attemptId,
      chapterId: this.definition.id,
      timeSeconds,
      wrongTargetIds: this.wrongTargetIds.slice(),
      hintsUsed: this.hints.length,
      hintIds: [...this.hints],
      equipmentIds: [...this.equipmentIds],
      score: scoreBreakdown({
        wrongTargets: this.wrongTargets.size,
        hintsUsed: this.hints.length,
        timeSeconds,
        referenceSeconds: this.definition.referenceSeconds,
      }),
    };
    return this.result;
  }

  tick(dtSeconds: number): void {
    this.timer.tick(dtSeconds);
  }
}
