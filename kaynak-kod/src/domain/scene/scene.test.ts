import { describe, expect, it } from 'vitest';
import { SceneCursor, validateScene, type SceneDef, type SceneLine } from './scene';

const SCENE: SceneDef<SceneLine<string>> = {
  id: 'morning',
  lines: [
    { speaker: 'mara', text: 'Morning!', gesture: 'wave', shot: 'relay' },
    { text: 'The street is quiet.' },
    { speaker: 'mara', text: 'Off you go.' },
  ],
};
const KNOWN = { speakers: ['mara'], gestures: ['wave', 'nod'], shots: ['relay'] };

describe('scene cursor', () => {
  it('walks the lines in order and ends after the last', () => {
    const c = new SceneCursor(SCENE);
    expect(c.line?.text).toBe('Morning!');
    expect(c.isLast).toBe(false);
    expect(c.next()).toBe(true);
    expect(c.line?.text).toBe('The street is quiet.');
    expect(c.next()).toBe(true);
    expect(c.isLast).toBe(true);
    expect(c.next()).toBe(false);
    expect(c.done).toBe(true);
    expect(c.line).toBeNull();
    expect(c.next()).toBe(false);
  });

  it('skip ends at once; an empty scene is over from the start', () => {
    const c = new SceneCursor(SCENE);
    c.skip();
    expect(c.done).toBe(true);
    expect(c.line).toBeNull();
    expect(new SceneCursor({ id: 'x', lines: [] }).done).toBe(true);
  });
});

describe('validateScene', () => {
  it('accepts known speakers, gestures and shots', () => {
    expect(validateScene(SCENE, KNOWN)).toEqual([]);
  });

  it('reports unknown names, gestures without a speaker and empty scenes', () => {
    const bad: SceneDef<SceneLine<string>> = {
      id: 'bad',
      lines: [{ speaker: 'zed', text: '?' }, { text: '!', gesture: 'wave' }, { speaker: 'mara', text: '.', shot: 'moon', gesture: 'dance' }],
    };
    expect(validateScene(bad, KNOWN)).toEqual([
      'bad[0]: unknown speaker zed',
      'bad[1]: a gesture needs a speaker',
      'bad[2]: unknown gesture dance',
      'bad[2]: unknown shot moon',
    ]);
    expect(validateScene({ id: 'e', lines: [] }, KNOWN)).toEqual(['e: no lines']);
  });
});
