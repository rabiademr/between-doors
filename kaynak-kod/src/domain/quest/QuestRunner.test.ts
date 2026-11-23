import { describe, expect, it } from 'vitest';
import { QuestRunner, validateQuest, type QuestDef, type Rule } from './QuestRunner';

type Fx = { say: string };
const quest: QuestDef<Fx> = {
  id: 'q',
  onStart: [{ say: 'start' }],
  steps: [
    {
      id: 'pickup',
      rules: [{ on: { interact: 'giver' }, do: [{ say: 'take it' }, { goto: 'deliver' }] }],
    },
    {
      id: 'deliver',
      rules: [
        { on: { interact: 'gate' }, if: ['!clue'], do: [{ say: 'look around first' }] },
        { on: { interact: 'gate' }, if: ['clue'], do: [{ say: 'opens' }] },
        { on: { interact: 'sign' }, do: [{ setFlag: 'clue' }, { say: 'a sign' }] },
        { on: { event: 'delivered' }, do: [{ goto: 'done' }] },
      ],
    },
    { id: 'done', rules: [] },
  ],
  rules: [{ on: { interact: 'giver' }, do: [{ say: 'busy' }] }],
};
const fallback: Rule<Fx>[] = [
  { on: { interact: 'gate' }, do: [{ say: 'locked' }] },
  { on: { interact: 'giver' }, do: [{ say: 'never reached' }] },
];
const says = (fx: unknown[]) => fx.flatMap((e) => (typeof e === 'object' && e && 'say' in e ? [(e as Fx).say] : []));

describe('QuestRunner', () => {
  it('runs onStart and begins at the first step', () => {
    const r = new QuestRunner(quest, fallback);
    expect(says(r.start())).toEqual(['start']);
    expect(r.stepId).toBe('pickup');
  });

  it('step rules win over quest rules, quest rules over the defaults', () => {
    const r = new QuestRunner(quest, fallback);
    expect(says(r.handle({ interact: 'giver' }))).toEqual(['take it']);
    expect(r.stepId).toBe('deliver');
    expect(says(r.handle({ interact: 'giver' }))).toEqual(['busy']); // quest-wide rule
  });

  it('falls back to the shared default rules outside the step that handles a spot', () => {
    const r = new QuestRunner(quest, fallback);
    expect(says(r.handle({ interact: 'gate' }))).toEqual(['locked']);
  });

  it('checks flags, including negated ones', () => {
    const r = new QuestRunner(quest, fallback);
    r.handle({ interact: 'giver' });
    expect(says(r.handle({ interact: 'gate' }))).toEqual(['look around first']);
    expect(says(r.handle({ interact: 'sign' }))).toEqual(['a sign']);
    expect(r.hasFlag('clue')).toBe(true);
    expect(says(r.handle({ interact: 'gate' }))).toEqual(['opens']);
  });

  it('matches named events and returns core effects too', () => {
    const r = new QuestRunner(quest, fallback);
    r.handle({ interact: 'giver' });
    expect(r.handle({ event: 'delivered' })).toEqual([{ goto: 'done' }]);
    expect(r.stepId).toBe('done');
    expect(r.handle({ event: 'nothing' })).toEqual([]);
  });

  it('rejects a goto to a missing step', () => {
    const bad: QuestDef<Fx> = { id: 'bad', steps: [{ id: 'a', rules: [{ on: { event: 'x' }, do: [{ goto: 'nowhere' }] }] }] };
    expect(validateQuest(bad)).toEqual(['bad: goto unknown step "nowhere"']);
    expect(() => new QuestRunner(bad).handle({ event: 'x' })).toThrow(/unknown step/);
    expect(validateQuest(quest)).toEqual([]);
  });

  it('flags a condition on a flag that nothing sets (typo guard)', () => {
    const typo: QuestDef<Fx> = {
      id: 'typo',
      steps: [
        {
          id: 'a',
          rules: [
            { on: { event: 'x' }, do: [{ setFlag: 'meeting_set' }] },
            { on: { interact: 'finn' }, if: ['!meeting_sett'], do: [{ say: 'agree first' }] },
          ],
        },
      ],
    };
    expect(validateQuest(typo)).toEqual(['typo: condition on flag "meeting_sett" that is never set']);
  });
});
