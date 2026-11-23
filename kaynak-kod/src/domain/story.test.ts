import { describe, expect, it } from 'vitest';
import { emptyProfile, type Profile } from './Profile';
import { isChapterUnlocked, isOpenToday, pendingToday, storyChapterId, type StoryChapter } from './story';

const WEEK: readonly StoryChapter[] = [
  { id: 'a', day: 1 },
  { id: 'b', day: 1 },
  { id: 'c', day: 2 },
  { id: 'd', day: 3 },
];
const at = (storyDay: number, ...completed: string[]): Profile => ({ ...emptyProfile(), storyDay, completedChapterIds: completed });

describe('the story of the week', () => {
  it('goes on with the first chapter not completed, whatever "Continue" pointed at before', () => {
    expect(storyChapterId(at(1), WEEK)).toBe('a');
    expect(storyChapterId(at(1, 'a'), WEEK)).toBe('b');
    const stuck: Profile = { ...at(3, 'a', 'b'), currentChapterId: 'b' }; // an old save's "Continue"
    expect(storyChapterId(stuck, WEEK)).toBe('c');
    expect(storyChapterId(at(3, 'a', 'b', 'c', 'd'), WEEK)).toBeNull();
  });

  it("a chapter is open once its day has come", () => {
    expect(isOpenToday(at(1), { id: 'c', day: 2 })).toBe(false);
    expect(isOpenToday(at(2), { id: 'c', day: 2 })).toBe(true);
    expect(isOpenToday(at(4), { id: 'c', day: 2 })).toBe(true);
  });

  it("lists today's undelivered chapters, including ones from days already gone", () => {
    expect(pendingToday(at(1), WEEK)).toEqual(['a', 'b']);
    expect(pendingToday(at(1, 'a', 'b'), WEEK)).toEqual([]);
    expect(pendingToday(at(3, 'a', 'b'), WEEK)).toEqual(['c', 'd']);
  });

  it('unlocks a chapter after the one before it, on its day; finished ones stay replayable', () => {
    const ids = WEEK.map((c) => c.id);
    expect(ids.map((id) => isChapterUnlocked(at(1), id, WEEK))).toEqual([true, false, false, false]);
    expect(ids.map((id) => isChapterUnlocked(at(1, 'a', 'b'), id, WEEK))).toEqual([true, true, false, false]);
    expect(ids.map((id) => isChapterUnlocked(at(2, 'a', 'b'), id, WEEK))).toEqual([true, true, true, false]);
    // Day 3 with c still open: d waits for c.
    expect(isChapterUnlocked(at(3, 'a', 'b'), 'd', WEEK)).toBe(false);
    expect(isChapterUnlocked(at(1, 'a', 'b', 'c'), 'c', WEEK)).toBe(true);
    expect(isChapterUnlocked(at(5), 'zz', WEEK)).toBe(false);
  });
});
