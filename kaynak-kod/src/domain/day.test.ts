import { describe, expect, it } from 'vitest';
import { JOBS_TO_END_DAY, dayStatus, endDay } from './day';
import { settleJob, type JobResult } from './jobs/jobs';
import { STORY_DAYS, emptyProfile, type Profile } from './Profile';
import type { StoryChapter } from './story';

const PAY = 40;
const paid = (n: number, from = emptyProfile()) => {
  let p = from;
  for (let i = 0; i < n; i++) {
    const result: JobResult = { jobId: `job-${p.jobsCompleted}`, kind: 'plain', delivered: true, payout: PAY, seconds: 30, condition: 100 };
    p = settleJob(p, result).profile;
  }
  return p;
};
/** No story: only the board jobs decide. */
const NONE: readonly StoryChapter[] = [];
/** A small week: two chapters on day 1, one on day 2. */
const WEEK: readonly StoryChapter[] = [
  { id: 'a', day: 1 },
  { id: 'b', day: 1 },
  { id: 'c', day: 2 },
];
const done = (p: Profile, ...ids: string[]): Profile => ({ ...p, completedChapterIds: [...p.completedChapterIds, ...ids] });

describe('the working day', () => {
  it('cannot end before enough board jobs are delivered today', () => {
    expect(dayStatus(emptyProfile(), NONE)).toEqual({ canEnd: false, reason: 'needJobs', missing: JOBS_TO_END_DAY });
    expect(dayStatus(paid(1), NONE)).toEqual({ canEnd: false, reason: 'needJobs', missing: JOBS_TO_END_DAY - 1 });
    expect(endDay(paid(1), NONE).storyDay).toBe(1);
  });

  it('ends after enough jobs: the next day starts with empty counters, earnings and totals kept', () => {
    const worked = paid(JOBS_TO_END_DAY);
    expect(worked.dayJobs).toBe(JOBS_TO_END_DAY);
    expect(worked.dayEarnings).toBe(PAY * JOBS_TO_END_DAY);
    expect(dayStatus(worked, NONE)).toEqual({ canEnd: true });
    const next = endDay(worked, NONE);
    expect(next.storyDay).toBe(2);
    expect(next.dayJobs).toBe(0);
    expect(next.dayEarnings).toBe(0);
    expect(next.credits).toBe(worked.credits);
    expect(next.jobsCompleted).toBe(worked.jobsCompleted);
    expect(dayStatus(next, NONE)).toEqual({ canEnd: false, reason: 'needJobs', missing: JOBS_TO_END_DAY });
  });

  it('extra jobs from yesterday do not count toward today', () => {
    const next = endDay(paid(JOBS_TO_END_DAY + 3), NONE);
    expect(dayStatus(next, NONE).canEnd).toBe(false);
  });

  it("needs today's story chapters as well as the board jobs", () => {
    const worked = paid(JOBS_TO_END_DAY);
    expect(dayStatus(worked, WEEK)).toEqual({ canEnd: false, reason: 'needStory', chapterIds: ['a', 'b'], missingJobs: 0 });
    expect(dayStatus(done(emptyProfile(), 'a'), WEEK)).toEqual({ canEnd: false, reason: 'needStory', chapterIds: ['b'], missingJobs: JOBS_TO_END_DAY });
    expect(endDay(worked, WEEK)).toBe(worked);
    // Day 1's story done: tomorrow's chapter does not count yet.
    const story = done(worked, 'a', 'b');
    expect(dayStatus(story, WEEK)).toEqual({ canEnd: true });
    const day2 = endDay(story, WEEK);
    expect(day2.storyDay).toBe(2);
    expect(dayStatus(paid(JOBS_TO_END_DAY, day2), WEEK)).toEqual({ canEnd: false, reason: 'needStory', chapterIds: ['c'], missingJobs: 0 });
  });

  it('an older save that is days ahead of its story catches up first', () => {
    const behind = paid(JOBS_TO_END_DAY, { ...emptyProfile(), storyDay: 3 });
    expect(dayStatus(behind, WEEK)).toMatchObject({ reason: 'needStory', chapterIds: ['a', 'b', 'c'] });
  });

  it('stops at the last day of the week', () => {
    let p = emptyProfile();
    for (let d = 1; d < STORY_DAYS; d++) p = endDay(paid(JOBS_TO_END_DAY, p), NONE);
    expect(p.storyDay).toBe(STORY_DAYS);
    const last = paid(JOBS_TO_END_DAY, p);
    expect(dayStatus(last, NONE)).toEqual({ canEnd: false, reason: 'lastDay' });
    expect(endDay(last, NONE)).toBe(last);
  });
});
