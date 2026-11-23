// Model: where the courier is in the week's story. Each chapter belongs to a day (content/chapters.ts);
// a chapter can be played once its day has come and the one before it is done. Pure rules over the
// profile — the chapter list is passed in, so tests can use their own.
import type { Profile } from './Profile';

/** What the story rules need to know about a chapter. */
export interface StoryChapter {
  id: string;
  /** Day of the courier's week (1..STORY_DAYS) the chapter belongs to. */
  day: number;
}

type Progress = Pick<Profile, 'completedChapterIds' | 'storyDay'>;

/** The story's next chapter: the first one not completed yet, or null when the whole story is done. */
export function storyChapterId(profile: Progress, chapters: readonly StoryChapter[]): string | null {
  return chapters.find((c) => !profile.completedChapterIds.includes(c.id))?.id ?? null;
}

/** The chapter's day has come. */
export function isOpenToday(profile: Progress, chapter: StoryChapter): boolean {
  return chapter.day <= profile.storyDay;
}

/**
 * Chapters that must be delivered before the shift can end: every chapter whose day has come and that is
 * not done yet (an older save that clocked off without the story catches up here).
 */
export function pendingToday(profile: Progress, chapters: readonly StoryChapter[]): string[] {
  return chapters.filter((c) => isOpenToday(profile, c) && !profile.completedChapterIds.includes(c.id)).map((c) => c.id);
}

/**
 * Chapter select: a completed chapter can always be replayed; the first one is always open; any other
 * opens once the chapter before it is done and its day has come.
 */
export function isChapterUnlocked(profile: Progress, chapterId: string, chapters: readonly StoryChapter[]): boolean {
  const i = chapters.findIndex((c) => c.id === chapterId);
  const chapter = chapters[i];
  if (!chapter) return false;
  if (profile.completedChapterIds.includes(chapterId) || i === 0) return true;
  const previous = chapters[i - 1];
  return previous !== undefined && profile.completedChapterIds.includes(previous.id) && isOpenToday(profile, chapter);
}
