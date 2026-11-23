// The courier's first week, walked end to end with the real chapter list, quests and morning scenes:
// what GameApp does each day (domain/story + domain/day + the quests' Mara rules), without the 3D side.
import { describe, expect, it } from 'vitest';
import { JOBS_TO_END_DAY, dayStatus, endDay } from '../domain/day';
import { settleJob } from '../domain/jobs/jobs';
import { STORY_DAYS, emptyProfile, type Profile } from '../domain/Profile';
import { QuestRunner } from '../domain/quest/QuestRunner';
import { isChapterUnlocked, isOpenToday, storyChapterId } from '../domain/story';
import { type ChapterId } from './catalog';
import { PLAYABLE_CHAPTERS, chapterById } from './chapters';
import { CHAPTER_QUESTS, QUEST_EVENTS, type GameEffect } from './quests';
import { MORNING_SCENES, SCENES } from './scenes';
import { WORLD_RULES } from './worldRules';

/** E on Mara in a freshly set-up chapter; `open` = GameApp reported its day has come. */
function maraSays(id: ChapterId, open: boolean): unknown[] {
  const r = new QuestRunner<GameEffect>(CHAPTER_QUESTS[id], WORLD_RULES);
  r.start();
  if (open) r.handle({ event: QUEST_EVENTS.opened });
  return r.handle({ interact: 'npc_mara' });
}

function boardJobs(p: Profile, n: number): Profile {
  for (let i = 0; i < n; i++) {
    p = settleJob(p, { jobId: `job-${p.jobsCompleted}`, kind: 'plain', delivered: true, payout: 40, seconds: 30, condition: 100 }).profile;
  }
  return p;
}

describe('the first week, day by day', () => {
  it('plays every chapter on its day, ends each day with Mara, and stops after day 5', () => {
    let p = emptyProfile();
    const playedOn: Record<number, string[]> = {};
    for (let day = 1; day <= STORY_DAYS; day++) {
      expect(p.storyDay).toBe(day);
      if (day > 1) {
        const morning = MORNING_SCENES[day];
        expect(morning, `morning scene for day ${day}`).toBeDefined();
        expect(SCENES[morning!].lines.length).toBeGreaterThan(0);
      }
      // Today's story: Continue picks the next chapter, it is unlocked, Mara hands out its note.
      for (let id = storyChapterId(p, PLAYABLE_CHAPTERS); id; id = storyChapterId(p, PLAYABLE_CHAPTERS)) {
        const def = chapterById(id)!;
        if (!isOpenToday(p, def)) {
          // Tomorrow's chapter set up early: Mara talks about the day instead.
          expect(maraSays(def.id as ChapterId, false)).toEqual([{ call: 'day.end' }]);
          break;
        }
        expect(isChapterUnlocked(p, id, PLAYABLE_CHAPTERS)).toBe(true);
        expect(dayStatus(p, PLAYABLE_CHAPTERS)).toMatchObject({ canEnd: false });
        expect(maraSays(def.id as ChapterId, true)).toEqual([{ call: 'openNote' }]);
        (playedOn[day] ??= []).push(id);
        p = { ...p, completedChapterIds: [...p.completedChapterIds, id] };
      }
      if (day === STORY_DAYS) break;
      // The story is done for today; the board jobs still decide.
      expect(dayStatus(p, PLAYABLE_CHAPTERS)).toEqual({ canEnd: false, reason: 'needJobs', missing: JOBS_TO_END_DAY });
      p = boardJobs(p, JOBS_TO_END_DAY);
      expect(dayStatus(p, PLAYABLE_CHAPTERS)).toEqual({ canEnd: true });
      p = endDay(p, PLAYABLE_CHAPTERS);
      expect([p.dayJobs, p.dayEarnings]).toEqual([0, 0]);
    }
    expect(playedOn).toEqual({ 1: ['ch1', 'ch2', 'ch3'], 2: ['ch4'], 3: ['ch5'], 4: ['ch6'], 5: ['ch7'] });
    // The week is over: no next chapter, no next day, even with jobs done.
    expect(storyChapterId(p, PLAYABLE_CHAPTERS)).toBeNull();
    p = boardJobs(p, JOBS_TO_END_DAY);
    expect(dayStatus(p, PLAYABLE_CHAPTERS)).toEqual({ canEnd: false, reason: 'lastDay' });
    expect(endDay(p, PLAYABLE_CHAPTERS).storyDay).toBe(STORY_DAYS);
  });

  it('a day cannot end on board jobs alone while its chapter waits', () => {
    let p = { ...emptyProfile(), storyDay: 2, completedChapterIds: ['ch1', 'ch2', 'ch3'] };
    p = boardJobs(p, JOBS_TO_END_DAY + 3);
    expect(dayStatus(p, PLAYABLE_CHAPTERS)).toMatchObject({ canEnd: false, reason: 'needStory', chapterIds: ['ch4'] });
    expect(endDay(p, PLAYABLE_CHAPTERS)).toBe(p);
  });
});
