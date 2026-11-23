import { describe, expect, it } from 'vitest';
import { validateScene } from '../domain/scene/scene';
import { STORY_DAYS } from '../domain/Profile';
import { BELLWICK } from './world';
import { MORNING_SCENES, SCENES, SHOTS, SPEAKERS } from './scenes';

const KNOWN = { speakers: Object.keys(SPEAKERS), gestures: ['wave', 'nod'], shots: Object.keys(SHOTS) };

describe('story scenes', () => {
  it('are valid: known speakers, gestures and shots; ids match their keys', () => {
    for (const [id, scene] of Object.entries(SCENES)) {
      expect(scene.id).toBe(id);
      expect(validateScene(scene, KNOWN)).toEqual([]);
    }
  });

  it('every line is written in both languages', () => {
    for (const scene of Object.values(SCENES)) {
      for (const l of scene.lines) {
        expect(l.text.en.length).toBeGreaterThan(0);
        expect(l.text.tr.length).toBeGreaterThan(0);
      }
    }
  });

  it('morning scenes belong to days 2..5 (day 1 opens with its first chapter)', () => {
    for (const day of Object.keys(MORNING_SCENES).map(Number)) {
      expect(day).toBeGreaterThanOrEqual(2);
      expect(day).toBeLessThanOrEqual(STORY_DAYS);
    }
  });

  it('a speaker who stands somewhere stands on the map', () => {
    for (const s of Object.values(SPEAKERS)) {
      if ('npc' in s) expect(BELLWICK.npcs.map((n) => n.id)).toContain(s.npc);
    }
  });

  it('shots look at something from a sensible height', () => {
    for (const s of Object.values(SHOTS)) {
      expect(s.from.y).toBeGreaterThan(0.5);
      expect(Math.hypot(s.from.x - s.to.x, s.from.z - s.to.z)).toBeGreaterThan(1);
    }
  });
});
