// Model: the courier's working day. A day of the first week ends when the courier clocks off with Mara,
// which needs that day's story chapter delivered and a few board jobs done; the next day brings the next
// chapter, new stock at the stall, bigger vehicles and (from day 2) the Magpies. Pure rules; the dialog is
// app/GameApp, the save persistence/.
import { STORY_DAYS, type Profile } from './Profile';
import { pendingToday, type StoryChapter } from './story';

/** Board jobs to deliver in a day before the shift can end (CEO, 2026-11-14: "at least 2"). */
export const JOBS_TO_END_DAY = 2;

export type DayStatus =
  | { canEnd: true }
  /** The week is over: there is no next day. */
  | { canEnd: false; reason: 'lastDay' }
  /** Today's story is not delivered yet (CEO, 2026-11-16: story chapter + board jobs end the day). */
  | { canEnd: false; reason: 'needStory'; chapterIds: string[]; missingJobs: number }
  /** `missing` more board jobs today. */
  | { canEnd: false; reason: 'needJobs'; missing: number };

export function dayStatus(profile: Profile, chapters: readonly StoryChapter[]): DayStatus {
  if (profile.storyDay >= STORY_DAYS) return { canEnd: false, reason: 'lastDay' };
  const missing = Math.max(0, JOBS_TO_END_DAY - profile.dayJobs);
  const chapterIds = pendingToday(profile, chapters);
  if (chapterIds.length > 0) return { canEnd: false, reason: 'needStory', chapterIds, missingJobs: missing };
  return missing > 0 ? { canEnd: false, reason: 'needJobs', missing } : { canEnd: true };
}

/** Clock off: the next day begins with its counters at zero. Unchanged when the day cannot end. */
export function endDay(profile: Profile, chapters: readonly StoryChapter[]): Profile {
  if (!dayStatus(profile, chapters).canEnd) return profile;
  return { ...profile, storyDay: profile.storyDay + 1, dayJobs: 0, dayEarnings: 0 };
}
