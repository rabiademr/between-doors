// The chapters as quests must behave exactly like the v1 hand-written flow (GameApp before F1.4).
import { describe, expect, it } from 'vitest';
import { QuestRunner, validateQuest } from '../../domain/quest/QuestRunner';
import { CHAPTER_IDS, type ChapterId } from '../catalog';
import { CH4_LINES, PLAYABLE_CHAPTERS, STORY_LINES } from '../chapters';
import { CLUES } from '../clues';
import { BELLWICK } from '../world';
import { WORLD_RULES } from '../worldRules';
import { CHAPTER_QUESTS, COMPLETION_CALLS, DEFAULT_RULES, QUEST_EVENTS, type GameEffect, type GameRule } from '.';

/** What GameApp builds; `open`: the chapter's day has come (GameApp then reports `opened`). */
const run = (id: ChapterId, open = true) => {
  const r = new QuestRunner<GameEffect>(CHAPTER_QUESTS[id], WORLD_RULES);
  const start = r.start();
  const e = (spot: string) => r.handle({ interact: spot });
  const ev = (name: string) => r.handle({ event: name });
  if (open) ev(QUEST_EVENTS.opened);
  return { r, start, e, ev };
};

describe('the week of chapters', () => {
  it('has a quest per chapter, in the catalogue order, and days never go back', () => {
    expect(PLAYABLE_CHAPTERS.map((c) => c.id)).toEqual([...CHAPTER_IDS]);
    expect(Object.keys(CHAPTER_QUESTS).sort()).toEqual([...CHAPTER_IDS].sort());
    const days = PLAYABLE_CHAPTERS.map((c) => c.day);
    expect(days).toEqual([...days].sort((a, b) => a - b));
    expect(days[0]).toBe(1);
  });

  it('every clue is a `clue` spot on the map, and every clue a quest finds or a chapter needs exists', () => {
    for (const id of Object.keys(CLUES)) expect(BELLWICK.spots.find((s) => s.id === id)?.kind).toBe('clue');
    const found = Object.values(CHAPTER_QUESTS)
      .flatMap((q) => [...q.steps.flatMap((s) => s.rules), ...(q.rules ?? [])])
      .flatMap((r) => r.do)
      .flatMap((e) => ('call' in e && e.call === 'clueFound' ? [e.id] : []));
    const needed = PLAYABLE_CHAPTERS.flatMap((c) => c.requiredClueIds ?? []);
    for (const id of [...found, ...needed]) expect(Object.keys(CLUES)).toContain(id);
  });
});

describe('chapter quests', () => {
  it('are valid (every goto names a step, every condition flag is set somewhere)', () => {
    for (const q of Object.values(CHAPTER_QUESTS)) expect(validateQuest(q)).toEqual([]);
  });

  it('run the after-delivery calls (cameo, finale, result) only on the delivered event, exactly once', () => {
    // A completion call, directly or as the `then` of a scene.
    const isCompletion = (e: unknown): boolean =>
      typeof e === 'object' &&
      e !== null &&
      'call' in e &&
      [(e as { call: string }).call, (e as { then?: string }).then].some((c) => c !== undefined && (COMPLETION_CALLS as readonly string[]).includes(c));
    for (const q of Object.values(CHAPTER_QUESTS)) {
      const rules = [...q.steps.flatMap((s) => s.rules), ...(q.rules ?? [])];
      for (const r of rules) if (r.do.some(isCompletion)) expect(r.on).toEqual({ event: QUEST_EVENTS.delivered });
      expect((q.onStart ?? []).some(isCompletion)).toBe(false);
      expect(rules.flatMap((r) => r.do.filter(isCompletion))).toHaveLength(1);
    }
    for (const r of DEFAULT_RULES) expect(r.do.some(isCompletion)).toBe(false);
  });

  it('side jobs, Magpies and vehicles never answer a spot the story uses, and never end a chapter', () => {
    const spotOf = (r: GameRule): string | undefined => ('interact' in r.on ? r.on.interact : undefined);
    const storySpots = new Set(
      [...Object.values(CHAPTER_QUESTS).flatMap((q) => [...q.steps.flatMap((s) => s.rules), ...(q.rules ?? [])]), ...DEFAULT_RULES]
        .map(spotOf)
        .filter((id): id is string => id !== undefined),
    );
    const extra = WORLD_RULES.filter((r) => !DEFAULT_RULES.includes(r));
    expect(extra.length).toBeGreaterThan(0);
    for (const r of extra) {
      expect(r.on).toHaveProperty('interact');
      expect(storySpots.has(spotOf(r)!)).toBe(false);
      for (const e of r.do) expect((COMPLETION_CALLS as readonly string[]).includes((e as { call?: string }).call ?? '')).toBe(false);
    }
    const ids = WORLD_RULES.map(spotOf);
    expect(new Set(ids).size).toBe(ids.length); // one answer per spot
  });

  it('the market stall opens in every chapter and step (unless it is the delivery itself)', () => {
    for (const def of PLAYABLE_CHAPTERS) {
      const { e, ev } = run(def.id);
      expect(e('npc_vendor')).toEqual([{ call: 'vendor.open' }]);
      ev(QUEST_EVENTS.accepted);
      if (def.targetId !== 'npc_vendor') expect(e('npc_vendor')).toEqual([{ call: 'vendor.open' }]);
    }
  });

  it('before its day has come, Mara talks about the day instead of handing out the chapter', () => {
    for (const def of PLAYABLE_CHAPTERS) {
      const { r, e, ev } = run(def.id, false);
      expect(e('npc_mara')).toEqual([{ call: 'day.end' }]);
      expect(ev(QUEST_EVENTS.opened)[0]).toEqual({ setFlag: 'opened' });
      expect(r.hasFlag('opened')).toBe(true);
      expect(e('npc_mara')).toEqual([{ call: 'openNote' }]);
    }
  });

  it('every chapter starts by picking up from Mara, who is busy, then done', () => {
    for (const def of PLAYABLE_CHAPTERS) {
      const { r, e, ev } = run(def.id);
      expect(e('npc_mara')).toEqual([{ call: 'openNote' }]);
      ev(QUEST_EVENTS.accepted);
      expect(r.stepId).not.toBe('pickup'); // 'deliver', or a first errand (meet Arthur, Finn's plan)
      expect(e('npc_mara')).toEqual([{ say: def.giverBusy }]);
      if (r.stepId !== 'deliver') continue; // the rest is in the chapter's own tests (ch5, ch6)
      expect(e('npc_mara')).toEqual([{ say: def.giverBusy }]);
      ev(QUEST_EVENTS.delivered);
      expect(r.stepId).toBe('done');
      expect(e('npc_mara')).toEqual([{ call: 'day.end' }]);
    }
  });

  describe('ch5 Arthur’s Round', () => {
    it('Arthur waits on Lock Street once the day has come; his scene hands over the letter', () => {
      const { e, ev, r } = run('ch5', false);
      expect(ev(QUEST_EVENTS.opened)).toContainEqual({ call: 'actor.place', id: 'arthur', at: 'arthur_lock_street' });
      ev(QUEST_EVENTS.accepted);
      expect(r.stepId).toBe('meet');
      expect(e('door_lockkeeper')).toEqual([{ say: STORY_LINES.arthurHasLetter }]);
      expect(e('actor_arthur')).toEqual([{ call: 'scene.play', id: 'ch5_arthur' }]);
      ev(QUEST_EVENTS.scene('ch5_arthur'));
      expect(r.stepId).toBe('deliver');
    });

    it('the plate is the clue; the two blue doors are the candidates; Edith’s scene, then the result', () => {
      const { e, ev, r } = run('ch5');
      ev(QUEST_EVENTS.accepted);
      ev(QUEST_EVENTS.scene('ch5_arthur'));
      expect(e('door_lockkeeper')).toEqual([{ say: STORY_LINES.whichDoor, ms: 5000 }]); // no guessing past the plate
      expect(e('old_nameplate')).toEqual([{ setFlag: 'clue_old_nameplate' }, { call: 'clueFound', id: 'old_nameplate' }]);
      expect(r.hasFlag('clue_old_nameplate')).toBe(true);
      expect(e('door_lock_south')).toEqual([{ call: 'checkTarget', id: 'door_lock_south', variant: 'door' }]);
      expect(e('door_lockkeeper')).toEqual([{ call: 'checkTarget', id: 'door_lockkeeper', variant: 'door' }]);
      expect(ev(QUEST_EVENTS.delivered)).toEqual([{ goto: 'done' }, { call: 'scene.play', id: 'ch5_door', then: 'showResult' }]);
      expect(e('npc_mara')).toEqual([{ call: 'day.end' }]);
    });
  });

  describe('ch6 Stakeout', () => {
    it('Finn’s plan sends out the decoy Magpie to be followed; the den needs both clues before June', () => {
      const { e, ev, r } = run('ch6');
      ev(QUEST_EVENTS.accepted);
      expect(e('actor_june')).toEqual([{ say: STORY_LINES.finnFirst }]);
      expect(e('actor_finn')).toEqual([{ call: 'scene.play', id: 'ch6_finn' }]);
      expect(ev(QUEST_EVENTS.scene('ch6_finn'))).toContainEqual({ call: 'magpie.arm', id: 'magpie_decoy', mode: 'lead' });
      expect(ev(QUEST_EVENTS.magpie('lost'))).toEqual([{ say: STORY_LINES.decoyLost, ms: 6000 }]);
      expect(r.stepId).toBe('decoy');
      expect(ev(QUEST_EVENTS.magpie('atDen'))).toContainEqual({ call: 'magpie.disarm', id: 'magpie_decoy' });
      expect(r.stepId).toBe('den');
      expect(e('actor_june')).toEqual([{ say: STORY_LINES.needProof }]);
      e('den_labels');
      expect(e('actor_june')).toEqual([{ say: STORY_LINES.needProof }]);
      expect(e('den_returns_sign')).toContainEqual({ say: STORY_LINES.proofEnough, ms: 5000 });
      expect(e('actor_june')).toEqual([{ call: 'checkTarget', id: 'actor_june', variant: 'door' }]);
      expect(ev(QUEST_EVENTS.delivered)).toEqual([{ goto: 'done' }, { call: 'scene.play', id: 'ch6_june', then: 'showResult' }]);
      expect(e('npc_mara')).toEqual([{ call: 'day.end' }]);
    });
  });

  describe('ch7 The Neighbourhood Did', () => {
    it('the street gathers at the cross; Arthur takes the photographs; Mr Crane leaves after the scene', () => {
      const { e, ev } = run('ch7', false);
      const placed = ev(QUEST_EVENTS.opened).filter((x) => 'call' in x && x.call === 'actor.place');
      expect(placed).toHaveLength(4);
      ev(QUEST_EVENTS.accepted);
      expect(e('actor_arthur')).toEqual([{ call: 'checkTarget', id: 'actor_arthur', variant: 'door' }]);
      expect(ev(QUEST_EVENTS.delivered)).toEqual([{ goto: 'done' }, { call: 'scene.play', id: 'ch7_final', then: 'showResult' }]);
      expect(ev(QUEST_EVENTS.scene('ch7_final'))).toEqual([{ call: 'actor.walk', id: 'swift_manager', route: 'crane_leaves', hideAtEnd: true }]);
    });
  });

  describe('ch4 Swift Parcel', () => {
    it('taking the note sends the Market Street Magpie out', () => {
      const { ev } = run('ch4');
      expect(ev(QUEST_EVENTS.accepted)).toContainEqual({ call: 'magpie.arm', id: 'magpie_market', mode: 'snatch' });
    });

    it('a snatched parcel cannot be delivered until it is back (grabbed or from the crate)', () => {
      const { r, e, ev } = run('ch4');
      ev(QUEST_EVENTS.accepted);
      ev(QUEST_EVENTS.magpie('snatched'));
      expect(r.hasFlag('parcel_gone')).toBe(true);
      expect(e('npc_vendor')).toEqual([{ say: CH4_LINES.stallWaits, ms: 4500 }]);
      expect(e('npc_mara')).toEqual([{ say: CH4_LINES.maraStolen, ms: 5000 }]);
      expect(ev(QUEST_EVENTS.magpie('atDen'))).toEqual([{ say: CH4_LINES.atDen, ms: 6500 }]);
      ev(QUEST_EVENTS.magpie('recovered'));
      expect(r.hasFlag('parcel_gone')).toBe(false);
      expect(e('npc_vendor')).toEqual([{ call: 'checkTarget', id: 'npc_vendor', variant: 'door' }]);
    });

    it('after the handover the stallholder talks, then the result; the stall opens again', () => {
      const { e, ev } = run('ch4');
      ev(QUEST_EVENTS.accepted);
      expect(ev(QUEST_EVENTS.delivered)).toEqual([
        { goto: 'done' },
        { call: 'magpie.disarm', id: 'magpie_market' },
        { call: 'scene.play', id: 'ch4_stall', then: 'showResult' },
      ]);
      expect(e('npc_vendor')).toEqual([{ call: 'vendor.open' }]);
    });
  });

  describe('ch1 First Impressions', () => {
    it('doors say "no parcel" before pickup, check the target after, nothing once delivered', () => {
      const { e, ev } = run('ch1');
      expect(e('door_june')).toEqual([{ toast: 'noParcel' }]);
      expect(ev(QUEST_EVENTS.accepted)).toEqual([{ goto: 'deliver' }, { call: 'closeDialog' }, { toast: 'noteAccepted' }]);
      expect(e('door_blue_other')).toEqual([{ call: 'checkTarget', id: 'door_blue_other', variant: 'door' }]);
      expect(e('door_june')).toEqual([{ call: 'checkTarget', id: 'door_june', variant: 'door' }]);
      expect(ev(QUEST_EVENTS.delivered)).toEqual([{ goto: 'done' }, { call: 'arthur.cameo' }]);
      expect(e('door_june')).toEqual([]);
    });

    it('other gates stay locked (default rules)', () => {
      const { e } = run('ch1');
      expect(e('gate_yard')).toEqual([{ toast: 'gateLocked' }]);
      expect(e('gate_postmark')).toEqual([{ toast: 'brassLocked' }]);
      expect(e('old_post_sign')).toEqual([{ say: CLUES.old_post_sign.read, ms: 4000 }]);
    });
  });

  describe('ch2 Crossing Paths', () => {
    it('starts the meeting and Finn’s patrol; accepting opens the phone choice', () => {
      const { start, e, ev } = run('ch2');
      expect(start).toEqual([{ call: 'meeting.start' }, { call: 'finn.patrol' }]);
      expect(e('npc_finn')).toEqual([{ toast: 'finnNoParcel' }]);
      expect(ev(QUEST_EVENTS.accepted)).toEqual([{ goto: 'deliver' }, { call: 'meeting.choose' }]);
    });

    it('Finn wants a spot agreed first; the yard gate opens only for the yard', () => {
      const { e, ev } = run('ch2');
      ev(QUEST_EVENTS.accepted);
      expect(e('npc_finn')).toEqual([{ toast: 'finnAgreeFirst' }]);
      expect(e('gate_yard')).toEqual([{ toast: 'gateLocked' }]);
      ev(QUEST_EVENTS.meeting('mp_yard'));
      expect(e('gate_yard')).toEqual([{ call: 'openGate', id: 'gate_yard' }, { toast: 'gateOpened' }]);
      expect(e('npc_finn')).toEqual([{ call: 'checkTarget', id: 'npc_finn', variant: 'door' }]);
    });

    it('meeting at the fountain keeps the yard gate locked', () => {
      const { e, ev } = run('ch2');
      ev(QUEST_EVENTS.accepted);
      ev(QUEST_EVENTS.meeting('mp_fountain'));
      expect(e('gate_yard')).toEqual([{ toast: 'gateLocked' }]);
      expect(e('npc_finn')).toEqual([{ call: 'checkTarget', id: 'npc_finn', variant: 'door' }]);
    });

    it('holds Finn during the handover and shows the shortcut + result after', () => {
      const { e, ev } = run('ch2');
      ev(QUEST_EVENTS.accepted);
      expect(ev(QUEST_EVENTS.handover)).toEqual([{ call: 'finn.hold' }]);
      expect(ev(QUEST_EVENTS.handoverCancelled)).toEqual([{ call: 'finn.release' }]);
      expect(ev(QUEST_EVENTS.delivered)).toEqual([{ goto: 'done' }, { call: 'finn.afterHandover' }, { call: 'showResult' }]);
      expect(e('npc_finn')).toEqual([{ toast: 'finnThanks' }]);
    });
  });

  describe('ch3 Between Doors', () => {
    it('closes the Postmark gate and brings the cast on start', () => {
      expect(run('ch3').start).toEqual([{ call: 'closeGate', id: 'gate_postmark' }, { call: 'mews.enable' }]);
    });

    it('the key only turns after the photo is matched at the sign', () => {
      const { r, e, ev } = run('ch3');
      expect(e('gate_postmark')).toEqual([{ toast: 'brassLocked' }]); // no key yet
      ev(QUEST_EVENTS.accepted);
      expect(e('gate_postmark')).toEqual([{ toast: 'brassCheckFirst', ms: 5000 }]);
      expect(e('old_post_sign')).toEqual([{ setFlag: 'clue_old_post_sign' }, { call: 'clueFound', id: 'old_post_sign' }]);
      expect(r.hasFlag('clue_old_post_sign')).toBe(true);
      expect(e('gate_postmark')).toEqual([{ call: 'openGate', id: 'gate_postmark' }, { toast: 'brassOpened', ms: 4000 }]);
    });

    it('the decoy gate is a wrong target with the key wording', () => {
      const { e, ev } = run('ch3');
      ev(QUEST_EVENTS.accepted);
      expect(e('gate_east')).toEqual([{ call: 'checkTarget', id: 'gate_east', variant: 'key' }]);
    });

    it('Arthur appears for the handover and the finale follows delivery', () => {
      const { e, ev } = run('ch3');
      expect(e('door_arthur')).toEqual([{ toast: 'noParcel' }]);
      ev(QUEST_EVENTS.accepted);
      expect(e('door_arthur')).toEqual([{ call: 'checkTarget', id: 'door_arthur', variant: 'door' }]);
      expect(ev(QUEST_EVENTS.handover)).toEqual([{ call: 'arthur.atDoor' }]);
      expect(ev(QUEST_EVENTS.handoverCancelled)).toEqual([{ call: 'arthur.hide' }]);
      expect(ev(QUEST_EVENTS.delivered)).toEqual([{ goto: 'done' }, { call: 'finale' }]);
    });

    it('the sign outside the chapter step just reads as a sign', () => {
      const { e } = run('ch3');
      expect(e('old_post_sign')).toEqual([{ say: CLUES.old_post_sign.read, ms: 4000 }]);
    });
  });
});
