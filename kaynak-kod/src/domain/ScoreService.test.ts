import { describe, expect, it } from 'vitest';
import { chapterScore, hintPenalty, timeBonus } from './ScoreService';

describe('ScoreService', () => {
  it('perfect run within reference time gives 1200', () => {
    expect(chapterScore({ wrongTargets: 0, hintsUsed: 0, timeSeconds: 60, referenceSeconds: 90 })).toBe(1200);
  });

  it('2 wrong doors + 1 hint, finished at 1.4R → 1000-200-50+150 = 900', () => {
    expect(chapterScore({ wrongTargets: 2, hintsUsed: 1, timeSeconds: 126, referenceSeconds: 90 })).toBe(900);
  });

  it('base score never drops below 100', () => {
    expect(chapterScore({ wrongTargets: 20, hintsUsed: 2, timeSeconds: 999, referenceSeconds: 90 })).toBe(100);
  });

  it('hint penalty is capped at 150', () => {
    expect(hintPenalty(5)).toBe(150);
  });

  it('time bonus thresholds R / 1.5R / 2R', () => {
    expect(timeBonus(90, 90)).toBe(200);
    expect(timeBonus(135, 90)).toBe(150);
    expect(timeBonus(180, 90)).toBe(100);
    expect(timeBonus(181, 90)).toBe(0);
  });
});
