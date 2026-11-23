import { describe, expect, it } from 'vitest';
import { CH1, CH3, CH4, PLAYABLE_CHAPTERS, chapterById, storyChapter } from '../content/chapters';
import { ChapterController, HINT_IDS } from './ChapterController';

const play = (c: ChapterController, seconds: number): void => {
  for (let t = 0; t < seconds; t += 0.05) c.tick(0.05);
};

describe('ChapterController (ch1)', () => {
  it('cannot deliver before taking the parcel', () => {
    const c = new ChapterController(CH1);
    expect(c.checkTarget('door_june')).toEqual({ kind: 'no-parcel' });
    expect(c.deliver('door_june')).toBeNull();
    expect(c.phase).toBe('READY');
  });

  it('clock only runs after accepting the note', () => {
    const c = new ChapterController(CH1);
    play(c, 5);
    expect(c.timer.seconds).toBe(0);
    c.accept();
    play(c, 5);
    expect(c.timer.seconds).toBeCloseTo(5, 1);
  });

  it('accept reports whether it started the attempt (a double click must not move the quest twice)', () => {
    const c = new ChapterController(CH1);
    expect(c.accept()).toBe(true);
    expect(c.accept()).toBe(false);
    c.deliver('door_june');
    expect(c.accept()).toBe(false);
  });

  it('CH1-B: same wrong door twice costs 100 only once', () => {
    const c = new ChapterController(CH1);
    c.accept();
    expect(c.checkTarget('door_blue_other')).toEqual({ kind: 'wrong', penalized: true });
    expect(c.checkTarget('door_blue_other')).toEqual({ kind: 'wrong', penalized: false });
    expect(c.phase).toBe('ACTIVE'); // parcel stays with the player
    const r = c.deliver('door_june');
    expect(r?.score.wrongPenalty).toBe(100);
    expect(r?.wrongTargetIds).toEqual(['door_blue_other']);
  });

  it('CH1-C: delivering twice yields one and the same result', () => {
    const c = new ChapterController(CH1);
    c.accept();
    play(c, 10);
    const first = c.deliver('door_june');
    play(c, 10); // clock is stopped after delivery
    const second = c.deliver('door_june');
    expect(first).not.toBeNull();
    expect(second).toBe(first);
    expect(first?.timeSeconds).toBeCloseTo(10, 1);
    expect(first?.score.total).toBe(1200); // no mistakes, under R=60s
  });

  it('wrong id cannot complete; checks after completion are ignored', () => {
    const c = new ChapterController(CH1);
    c.accept();
    expect(c.deliver('door_blue_other')).toBeNull();
    c.deliver('door_june');
    expect(c.checkTarget('door_blue_other')).toEqual({ kind: 'already-delivered' });
  });

  it('each attempt has its own id and records equipment owned at start', () => {
    const a = new ChapterController(CH1, ['steady_pace']);
    const b = new ChapterController(CH1);
    expect(a.attemptId).not.toBe(b.attemptId);
    a.accept();
    expect(a.deliver('door_june')?.equipmentIds).toEqual(['steady_pace']);
  });
});

describe('ChapterController (ch3 photo puzzle)', () => {
  it('clues only count while the album is in hand, once each', () => {
    const c = new ChapterController(CH3);
    expect(c.recordClue('old_post_sign')).toBe(false); // not taken yet
    expect(c.clueSatisfied).toBe(false);
    c.accept();
    expect(c.recordClue('old_post_sign')).toBe(true);
    expect(c.recordClue('old_post_sign')).toBe(false);
    expect(c.clueSatisfied).toBe(true);
  });

  it('chapters without a required clue are always satisfied', () => {
    expect(new ChapterController(CH1).clueSatisfied).toBe(true);
  });

  it('the decoy gate costs 100 once; Arthur is the only correct target', () => {
    const c = new ChapterController(CH3);
    c.accept();
    expect(c.checkTarget('gate_east')).toEqual({ kind: 'wrong', penalized: true });
    expect(c.checkTarget('gate_east')).toEqual({ kind: 'wrong', penalized: false });
    expect(c.checkTarget('door_arthur')).toEqual({ kind: 'correct' });
    const r = c.deliver('door_arthur');
    expect(r?.wrongTargetIds).toEqual(['gate_east']);
    expect(r?.score.wrongPenalty).toBe(100);
  });
});

describe('chapter order', () => {
  it('Continue follows the story: ch1–3 on day 1, then the next day’s chapter', () => {
    const p = (storyDay: number, ...done: string[]) => ({ storyDay, completedChapterIds: done });
    expect(storyChapter(p(1))).toBe(CH1);
    expect(storyChapter(p(1, 'ch1', 'ch2'))).toBe(CH3);
    // A save from before the week (ch3 done, "Continue" stuck on ch3) moves on to day 2's chapter.
    expect(storyChapter(p(3, 'ch1', 'ch2', 'ch3'))).toBe(CH4);
    // Story done: the last chapter, to wander the town in.
    expect(storyChapter(p(5, ...PLAYABLE_CHAPTERS.map((c) => c.id)))).toBe(PLAYABLE_CHAPTERS[PLAYABLE_CHAPTERS.length - 1]);
  });
});

describe('ChapterController hints (FR-13)', () => {
  it('no hints before taking the parcel', () => {
    expect(new ChapterController(CH1).takeNextHint()).toEqual({ kind: 'unavailable' });
  });

  it('two sequential hints cost 50 then 100, never more', () => {
    const c = new ChapterController(CH1);
    c.accept();
    expect(c.nextHint).toEqual({ hintId: 'hint_text', cost: 50 });
    expect(c.takeNextHint()).toEqual({ kind: 'shown', hintId: 'hint_text', cost: 50 });
    expect(c.takeNextHint()).toEqual({ kind: 'shown', hintId: 'hint_area', cost: 100 });
    expect(c.nextHint).toBeNull();
    expect(c.takeNextHint()).toEqual({ kind: 'unavailable' });
    expect(c.hintIds).toEqual([...HINT_IDS]);
    const r = c.deliver(CH1.targetId);
    expect(r?.hintsUsed).toBe(2);
    expect(r?.hintIds).toEqual(['hint_text', 'hint_area']);
    expect(r?.score.hintPenalty).toBe(150);
    expect(r?.score.base).toBe(850);
  });

  it('a hint does not block Clean Shift (no wrong targets recorded)', () => {
    const c = new ChapterController(CH1);
    c.accept();
    c.takeNextHint();
    expect(c.deliver(CH1.targetId)?.wrongTargetIds).toEqual([]);
  });
});

describe('hints and chapter lookup edge cases', () => {
  it('no hints after delivery; a replay starts with none', () => {
    const c = new ChapterController(CH1);
    c.accept();
    c.takeNextHint();
    c.deliver(CH1.targetId);
    expect(c.takeNextHint()).toEqual({ kind: 'unavailable' });
    expect(new ChapterController(CH1).hintIds).toEqual([]);
  });

  it('unknown chapter ids are not chapters', () => {
    expect(chapterById('ch9')).toBeUndefined();
  });
});
