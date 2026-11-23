import { describe, expect, it } from 'vitest';
import { emptyProfile } from './Profile';
import { SETTLED_HISTORY, hasProgress, settleAttempt, type CompletedAttempt } from './ProgressService';
import { scoreBreakdown } from './ScoreService';

const NOW = '2026-11-12T18:00:00.000Z';
const attempt = (over: Partial<CompletedAttempt> = {}): CompletedAttempt => {
  const wrong = over.wrongTargetIds ?? [];
  const time = over.timeSeconds ?? 40;
  return {
    attemptId: 'a1',
    chapterId: 'ch1',
    timeSeconds: time,
    wrongTargetIds: wrong,
    hintIds: [],
    equipmentIds: [],
    score: scoreBreakdown({ wrongTargets: wrong.length, hintsUsed: 0, timeSeconds: time, referenceSeconds: 60 }),
    ...over,
  };
};

describe('settleAttempt', () => {
  it('first completion: +100 credits, record, First Delivery + Clean Shift', () => {
    const before = emptyProfile();
    const r = settleAttempt(before, attempt(), NOW);
    expect(r.applied).toBe(true);
    expect(r.creditsAwarded).toBe(100);
    expect(r.profile.credits).toBe(100);
    expect(r.profile.completedChapterIds).toEqual(['ch1']);
    expect(r.unlockedAchievementIds).toEqual(['first_delivery', 'clean_shift']);
    expect(r.profile.chapterRecords.ch1?.bestResult?.score).toBe(1200);
    expect(r.profile.chapterRecords.ch1?.bestResult?.activeMs).toBe(40000);
    expect(before.credits).toBe(0); // input not mutated
  });

  it('same attempt twice (CH1-C): second call changes nothing', () => {
    const once = settleAttempt(emptyProfile(), attempt(), NOW);
    const twice = settleAttempt(once.profile, attempt(), NOW);
    expect(twice.applied).toBe(false);
    expect(twice.profile.credits).toBe(100);
  });

  it('replay: no extra credit, records update only when better, achievement date kept', () => {
    const first = settleAttempt(emptyProfile(), attempt({ wrongTargetIds: ['door_blue_other'] }), NOW);
    expect(first.unlockedAchievementIds).toEqual(['first_delivery']); // not clean
    const replay = settleAttempt(first.profile, attempt({ attemptId: 'a2', timeSeconds: 20 }), '2026-11-13T00:00:00.000Z');
    expect(replay.creditsAwarded).toBe(0);
    expect(replay.profile.credits).toBe(100);
    expect(replay.newBestScore).toBe(true);
    expect(replay.profile.chapterRecords.ch1?.bestTimeResult?.attemptId).toBe('a2');
    expect(replay.unlockedAchievementIds).toEqual(['clean_shift']);
    expect(replay.profile.achievementUnlocks.first_delivery).toBe(NOW);
    const worse = settleAttempt(replay.profile, attempt({ attemptId: 'a3', timeSeconds: 200, wrongTargetIds: ['x'] }), NOW);
    expect(worse.newBestScore).toBe(false);
    expect(worse.profile.chapterRecords.ch1?.bestResult?.attemptId).toBe('a2');
  });

  it('keeps only the last 30 settled attempt ids', () => {
    let p = emptyProfile();
    for (let i = 0; i < SETTLED_HISTORY + 5; i++) p = settleAttempt(p, attempt({ attemptId: `a${i}` }), NOW).profile;
    expect(p.settledAttemptIds).toHaveLength(SETTLED_HISTORY);
    expect(p.credits).toBe(100); // chapter reward still only once
  });

  it('advances Continue to the next chapter, never backwards on replay', () => {
    const p1 = settleAttempt(emptyProfile(), attempt(), NOW).profile;
    expect(p1.currentChapterId).toBe('ch2');
    const p2 = settleAttempt(p1, attempt({ attemptId: 'b1', chapterId: 'ch2' }), NOW);
    expect(p2.profile.currentChapterId).toBe('ch3');
    expect(p2.unlockedAchievementIds).toContain('meet_me_halfway');
    expect(p2.profile.credits).toBe(200);
    const replay1 = settleAttempt(p2.profile, attempt({ attemptId: 'c1' }), NOW);
    expect(replay1.profile.currentChapterId).toBe('ch3');
  });

  it('finishing ch3 unlocks Special Delivery once and moves on to the next day’s chapter', () => {
    const p1 = settleAttempt(emptyProfile(), attempt({ attemptId: 'x1' }), NOW).profile;
    const p2 = settleAttempt(p1, attempt({ attemptId: 'x2', chapterId: 'ch2' }), NOW).profile;
    const r3 = settleAttempt(p2, attempt({ attemptId: 'x3', chapterId: 'ch3' }), NOW);
    expect(r3.unlockedAchievementIds).toContain('special_delivery');
    expect(r3.profile.credits).toBe(300);
    expect(r3.profile.currentChapterId).toBe('ch4');
    const again = settleAttempt(r3.profile, attempt({ attemptId: 'x4', chapterId: 'ch3' }), NOW);
    expect(again.unlockedAchievementIds).not.toContain('special_delivery');
    expect(again.creditsAwarded).toBe(0);
  });

  it('rejects unknown chapters', () => {
    expect(() => settleAttempt(emptyProfile(), attempt({ chapterId: 'ch9' }), NOW)).toThrow();
  });
});

describe('progress', () => {
  it('a fresh profile has nothing to continue; one delivery does', () => {
    expect(hasProgress(emptyProfile())).toBe(false);
    const p1 = settleAttempt(emptyProfile(), attempt({ attemptId: 'u1' }), NOW).profile;
    expect(hasProgress(p1)).toBe(true);
  });
  // Which chapters are open (day + previous chapter) is domain/story.ts (story.test.ts).
});

describe('settleAttempt achievements', () => {
  it('Clean Shift still unlocks when hints were used (hints are not wrong targets)', () => {
    const r = settleAttempt(emptyProfile(), attempt({ attemptId: 'h1', hintIds: ['hint_text', 'hint_area'] }), NOW);
    expect(r.unlockedAchievementIds).toContain('clean_shift');
  });

  it('ch2 completion unlocks Meet Me Halfway once', () => {
    const p1 = settleAttempt(emptyProfile(), attempt({ attemptId: 'm1' }), NOW).profile;
    const r2 = settleAttempt(p1, attempt({ attemptId: 'm2', chapterId: 'ch2' }), NOW);
    expect(r2.unlockedAchievementIds).toEqual(['meet_me_halfway']);
    const r3 = settleAttempt(r2.profile, attempt({ attemptId: 'm3', chapterId: 'ch2' }), NOW);
    expect(r3.unlockedAchievementIds).toEqual([]);
  });
});
