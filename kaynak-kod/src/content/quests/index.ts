// Content: chapters 1–3 as quests (data for domain/quest/QuestRunner). What happens when the player presses
// E on a spot — or a story event fires — in each step of each chapter. Plain effects (toast, say, flags,
// step changes) are data; bespoke story moments are named calls that GameApp runs (`call`).
import type { LocalizedText } from '../../i18n';
import type { Strings } from '../../i18n/en';
import type { QuestDef, Rule } from '../../domain/quest/QuestRunner';
import { CH1, CH2, CH3, CH4, CH4_LINES, CH5, CH6, CH7, STORY_LINES } from '../chapters';
import type { ChapterId } from '../catalog';
import { CLUES, type ClueId } from '../clues';
import type { SceneId } from '../scenes';
import { ACTOR_IDS, STORY_ACTORS, actorSpotId, type ActorId, type MarkId, type RouteId } from '../actors';
import type { StoryThiefId } from '../magpies';
import type { ThiefMode } from '../../domain/chase/chase';

/** UI strings that are plain text (not functions), usable as toasts from data. */
export type PlainStringKey = { [K in keyof Strings]: Strings[K] extends string ? K : never }[keyof Strings] & string;

/** Named game actions without a target (implemented in app/GameApp `runCall`). */
export type SimpleCall =
  | 'openNote' // the giver's pickup dialog (with Sylvie's photo when the chapter has one)
  | 'closeDialog'
  | 'meeting.start'
  | 'meeting.choose' // Finn's phone message with the two spots
  | 'finn.patrol'
  | 'finn.hold'
  | 'finn.release'
  | 'finn.afterHandover'
  | 'mews.enable'
  | 'arthur.atDoor'
  | 'arthur.hide'
  | 'vendor.open' // the market stall (F4): today's stock, buying
  | 'townsfolk.greet' // E near a townsperson: they turn, wave or nod, and say a line (world/NpcDirector)
  | 'jobs.open' // the Relay job board: today's side jobs (content/jobs.ts)
  | 'magpie.grab' // E on a fleeing Magpie: take the parcel back (content/magpies.ts)
  | 'magpie.crate' // E on the crate in the Magpies' den: a stolen parcel may be in it
  | 'vehicle.mount' // E on a parked vehicle you own: get on (content/vehicles.ts)
  | 'day.end' // Mara with no delivery waiting: clock off for the day, if enough board jobs are done (domain/day.ts)
  | CompletionCall;
/** Calls that need the settled delivery: only valid on the `delivered` event (tested). */
export type CompletionCall =
  | 'arthur.cameo' // chapter 1 epilogue, then the result
  | 'finale' // chapter 3 album → picture → map → result
  | 'showResult';
export const COMPLETION_CALLS: readonly CompletionCall[] = ['arthur.cameo', 'finale', 'showResult'];
/** Named game actions on a target id (a gate, a clue). */
/** `job.checkTarget`: E on an address — is this the door of a job in hand? */
export type TargetCall = 'openGate' | 'closeGate' | 'job.checkTarget';
export type CallName =
  | SimpleCall
  | TargetCall
  | 'clueFound'
  | 'scene.play'
  | 'actor.place'
  | 'actor.walk'
  | 'actor.hide'
  | 'magpie.arm'
  | 'magpie.disarm'
  | 'checkTarget';

export type GameEffect =
  | { toast: PlainStringKey; ms?: number }
  | { say: LocalizedText; ms?: number }
  | { call: SimpleCall }
  | { call: TargetCall; id: string }
  /** A clue that matters to the delivery was inspected: its text (content/clues.ts) + the task panel line. */
  | { call: 'clueFound'; id: ClueId }
  /**
   * A story scene (content/scenes.ts). When it ends the quest hears `scene:<id>`; `then` runs a completion
   * call afterwards (only on `delivered`, like every completion call — tested).
   */
  | { call: 'scene.play'; id: SceneId; then?: CompletionCall }
  /** Story actors (content/actors.ts): stand at a mark, walk a route, leave. */
  | { call: 'actor.place'; id: ActorId; at: MarkId }
  | { call: 'actor.walk'; id: ActorId; route: RouteId; hideAtEnd?: boolean }
  | { call: 'actor.hide'; id: ActorId }
  /** A story Magpie (content/magpies STORY_MAGPIES) lies in wait for the chapter's parcel: chase it, or follow it home. */
  | { call: 'magpie.arm'; id: StoryThiefId; mode: ThiefMode }
  | { call: 'magpie.disarm'; id: StoryThiefId }
  /** id = delivery candidate; wrong → penalty toast worded for a door or a key, right → handover dialog. */
  | { call: 'checkTarget'; id: string; variant: 'door' | 'key' };

export type GameQuest = QuestDef<GameEffect>;
export type GameRule = Rule<GameEffect>;

/** Events GameApp reports to the quest (besides E on a spot). */
export const QUEST_EVENTS = {
  /** The chapter's day has come (at setup, or when the courier clocks in the next morning): Mara has the note. */
  opened: 'opened',
  accepted: 'accepted',
  handover: 'handover',
  handoverCancelled: 'handoverCancelled',
  delivered: 'delivered',
  meeting: (pointId: string) => `meeting:${pointId}`,
  /** A story scene played to its end (or skipped). */
  scene: (id: SceneId) => `scene:${id}`,
  /** What an armed story Magpie did with the chapter's parcel. */
  magpie: (what: 'snatched' | 'recovered' | 'atDen' | 'lost') => `magpie:${what}`,
} as const;

const E = (spot: string) => ({ interact: spot });
const EV = (name: string) => ({ event: name });

/** World behaviour outside the chapter that uses a spot (open gates are handled before the quest). */
export const DEFAULT_RULES: readonly GameRule[] = [
  { on: E('gate_yard'), do: [{ toast: 'gateLocked' }] },
  { on: E('gate_postmark'), do: [{ toast: 'brassLocked' }] },
  { on: E('gate_east'), do: [{ toast: 'brassLocked' }] },
  ...Object.entries(CLUES).map(([id, clue]): GameRule => ({ on: E(id), do: [{ say: clue.read, ms: 4000 }] })),
  { on: E('npc_mara'), do: [{ call: 'day.end' }] },
  // The market stall in Market Hill is open in every chapter (spot `npc_vendor`, kind `vendor`).
  { on: E('npc_vendor'), do: [{ call: 'vendor.open' }] },
  // Saying hello to whichever townsperson is nearest (one shared spot that follows them, see content/npcs.ts).
  { on: E('npc_townsfolk'), do: [{ call: 'townsfolk.greet' }] },
  // A story actor the chapter has nothing for says their idle line.
  ...ACTOR_IDS.map((id): GameRule => ({ on: E(actorSpotId(id)), do: [{ say: STORY_ACTORS[id].idle, ms: 4000 }] })),
];

/**
 * Shared shape: pick up from Mara; the clock starts on accepting the note. Before the chapter's day has
 * come (`opened`), Mara talks about the day instead (clock off once today's story and jobs are done).
 * `onOpen`: what the chapter puts into the world once it is open (story actors, thieves…).
 */
const pickupStep = (extra: GameRule[] = [], onOpen: GameEffect[] = []) => ({
  id: 'pickup',
  rules: [
    { on: EV(QUEST_EVENTS.opened), do: [{ setFlag: 'opened' }, ...onOpen] },
    { on: E('npc_mara'), if: ['!opened'], do: [{ call: 'day.end' }] },
    { on: E('npc_mara'), do: [{ call: 'openNote' }] },
    ...extra,
  ] as GameRule[],
});
const acceptedPlain: GameRule = { on: EV(QUEST_EVENTS.accepted), do: [{ goto: 'deliver' }, { call: 'closeDialog' }, { toast: 'noteAccepted' }] };

export const CH1_QUEST: GameQuest = {
  id: 'ch1',
  steps: [
    pickupStep([
      { on: E('door_june'), do: [{ toast: 'noParcel' }] },
      { on: E('door_blue_other'), do: [{ toast: 'noParcel' }] },
      acceptedPlain,
    ]),
    {
      id: 'deliver',
      rules: [
        { on: E('npc_mara'), do: [{ say: CH1.giverBusy }] },
        { on: E('door_june'), do: [{ call: 'checkTarget', id: 'door_june', variant: 'door' }] },
        { on: E('door_blue_other'), do: [{ call: 'checkTarget', id: 'door_blue_other', variant: 'door' }] },
        { on: EV(QUEST_EVENTS.delivered), do: [{ goto: 'done' }, { call: 'arthur.cameo' }] },
      ],
    },
    { id: 'done', rules: [] },
  ],
};

export const CH2_QUEST: GameQuest = {
  id: 'ch2',
  onStart: [{ call: 'meeting.start' }, { call: 'finn.patrol' }],
  steps: [
    pickupStep([
      { on: E('npc_finn'), do: [{ toast: 'finnNoParcel' }] },
      { on: EV(QUEST_EVENTS.accepted), do: [{ goto: 'deliver' }, { call: 'meeting.choose' }] },
    ]),
    {
      id: 'deliver',
      rules: [
        { on: E('npc_mara'), do: [{ say: CH2.giverBusy }] },
        { on: EV(QUEST_EVENTS.meeting('mp_yard')), do: [{ setFlag: 'meeting_set' }, { setFlag: 'meet_yard' }] },
        { on: EV(QUEST_EVENTS.meeting('mp_fountain')), do: [{ setFlag: 'meeting_set' }] },
        { on: E('npc_finn'), if: ['!meeting_set'], do: [{ toast: 'finnAgreeFirst' }] },
        { on: E('npc_finn'), do: [{ call: 'checkTarget', id: 'npc_finn', variant: 'door' }] },
        // The yard gate opens for the meeting only when the yard was agreed.
        { on: E('gate_yard'), if: ['meet_yard'], do: [{ call: 'openGate', id: 'gate_yard' }, { toast: 'gateOpened' }] },
        { on: EV(QUEST_EVENTS.handover), do: [{ call: 'finn.hold' }] },
        { on: EV(QUEST_EVENTS.handoverCancelled), do: [{ call: 'finn.release' }] },
        { on: EV(QUEST_EVENTS.delivered), do: [{ goto: 'done' }, { call: 'finn.afterHandover' }, { call: 'showResult' }] },
      ],
    },
    { id: 'done', rules: [{ on: E('npc_finn'), do: [{ toast: 'finnThanks' }] }] },
  ],
};

export const CH3_QUEST: GameQuest = {
  id: 'ch3',
  // Postmark Mews is found again in every chapter 3 attempt (it stays open elsewhere after the finale).
  onStart: [{ call: 'closeGate', id: 'gate_postmark' }, { call: 'mews.enable' }],
  steps: [
    pickupStep([{ on: E('door_arthur'), do: [{ toast: 'noParcel' }] }, acceptedPlain]),
    {
      id: 'deliver',
      rules: [
        { on: E('npc_mara'), do: [{ say: CH3.giverBusy }] },
        // Matching the photo: the sign is the clue that lets the key be tried on the right gate.
        { on: E('old_post_sign'), do: [{ setFlag: 'clue_old_post_sign' }, { call: 'clueFound', id: 'old_post_sign' }] },
        { on: E('gate_postmark'), if: ['!clue_old_post_sign'], do: [{ toast: 'brassCheckFirst', ms: 5000 }] },
        { on: E('gate_postmark'), do: [{ call: 'openGate', id: 'gate_postmark' }, { toast: 'brassOpened', ms: 4000 }] },
        // The look-alike gate: trying the key there is a wrong target (−100 once).
        { on: E('gate_east'), do: [{ call: 'checkTarget', id: 'gate_east', variant: 'key' }] },
        { on: E('door_arthur'), do: [{ call: 'checkTarget', id: 'door_arthur', variant: 'door' }] },
        { on: EV(QUEST_EVENTS.handover), do: [{ call: 'arthur.atDoor' }] },
        { on: EV(QUEST_EVENTS.handoverCancelled), do: [{ call: 'arthur.hide' }] },
        { on: EV(QUEST_EVENTS.delivered), do: [{ goto: 'done' }, { call: 'finale' }] },
      ],
    },
    { id: 'done', rules: [] },
  ],
};

/**
 * Day 2: Swift Parcel. Mara's spices for the market stall; on Market Street a Magpie snatches them — catch
 * him, or fetch them from the den's crate — then the stallholder tells where stolen parcels turn up.
 */
export const CH4_QUEST: GameQuest = {
  id: 'ch4',
  steps: [
    pickupStep([
      {
        on: EV(QUEST_EVENTS.accepted),
        do: [{ goto: 'deliver' }, { call: 'closeDialog' }, { toast: 'noteAccepted' }, { call: 'magpie.arm', id: 'magpie_market', mode: 'snatch' }],
      },
    ]),
    {
      id: 'deliver',
      rules: [
        { on: E('npc_mara'), if: ['parcel_gone'], do: [{ say: CH4_LINES.maraStolen, ms: 5000 }] },
        { on: E('npc_mara'), do: [{ say: CH4.giverBusy }] },
        { on: EV(QUEST_EVENTS.magpie('snatched')), do: [{ setFlag: 'parcel_gone' }, { say: CH4_LINES.snatched, ms: 5000 }] },
        { on: EV(QUEST_EVENTS.magpie('recovered')), do: [{ clearFlag: 'parcel_gone' }, { say: CH4_LINES.recovered, ms: 4500 }] },
        { on: EV(QUEST_EVENTS.magpie('atDen')), do: [{ say: CH4_LINES.atDen, ms: 6500 }] },
        { on: E('npc_vendor'), if: ['parcel_gone'], do: [{ say: CH4_LINES.stallWaits, ms: 4500 }] },
        { on: E('npc_vendor'), do: [{ call: 'checkTarget', id: 'npc_vendor', variant: 'door' }] },
        { on: EV(QUEST_EVENTS.delivered), do: [{ goto: 'done' }, { call: 'magpie.disarm', id: 'magpie_market' }, { call: 'scene.play', id: 'ch4_stall', then: 'showResult' }] },
      ],
    },
    { id: 'done', rules: [] },
  ],
};

/** A clue that matters here: remember it (flag `clue_<id>`) and say what it reveals. */
const clue = (id: ClueId, extra: GameEffect[] = []): GameRule['do'] => [{ setFlag: `clue_${id}` }, { call: 'clueFound', id }, ...extra];

/** Day 3: Arthur's Round. Arthur waits on Lock Street with a forty-year-old letter; the plate names the door. */
export const CH5_QUEST: GameQuest = {
  id: 'ch5',
  steps: [
    pickupStep(
      [
        { on: E('door_lockkeeper'), do: [{ toast: 'noParcel' }] },
        { on: E('door_lock_south'), do: [{ toast: 'noParcel' }] },
        { on: EV(QUEST_EVENTS.accepted), do: [{ goto: 'meet' }, { call: 'closeDialog' }, { toast: 'noteAccepted' }] },
      ],
      [{ call: 'actor.place', id: 'arthur', at: 'arthur_lock_street' }],
    ),
    {
      id: 'meet',
      rules: [
        { on: E('npc_mara'), do: [{ say: CH5.giverBusy }] },
        { on: E(actorSpotId('arthur')), do: [{ call: 'scene.play', id: 'ch5_arthur' }] },
        { on: EV(QUEST_EVENTS.scene('ch5_arthur')), do: [{ goto: 'deliver' }] },
        { on: E('door_lockkeeper'), do: [{ say: STORY_LINES.arthurHasLetter }] },
        { on: E('door_lock_south'), do: [{ say: STORY_LINES.arthurHasLetter }] },
      ],
    },
    {
      id: 'deliver',
      rules: [
        { on: E('npc_mara'), do: [{ say: CH5.giverBusy }] },
        { on: E(actorSpotId('arthur')), do: [{ say: STORY_LINES.arthurHint, ms: 5000 }] },
        { on: E('old_nameplate'), do: clue('old_nameplate') },
        { on: E('door_lockkeeper'), if: ['!clue_old_nameplate'], do: [{ say: STORY_LINES.whichDoor, ms: 5000 }] },
        { on: E('door_lockkeeper'), do: [{ call: 'checkTarget', id: 'door_lockkeeper', variant: 'door' }] },
        { on: E('door_lock_south'), do: [{ call: 'checkTarget', id: 'door_lock_south', variant: 'door' }] },
        { on: EV(QUEST_EVENTS.delivered), do: [{ goto: 'done' }, { call: 'scene.play', id: 'ch5_door', then: 'showResult' }] },
      ],
    },
    { id: 'done', rules: [] },
  ],
};

/** Day 4: Stakeout. Finn's decoy; a Magpie leads the courier to the den; the proof goes to June. */
export const CH6_QUEST: GameQuest = {
  id: 'ch6',
  steps: [
    pickupStep(
      [{ on: EV(QUEST_EVENTS.accepted), do: [{ goto: 'plan' }, { call: 'closeDialog' }, { toast: 'noteAccepted' }] }],
      [
        { call: 'actor.place', id: 'finn', at: 'finn_yard_road' },
        { call: 'actor.place', id: 'june', at: 'june_door' },
      ],
    ),
    {
      id: 'plan',
      rules: [
        { on: E('npc_mara'), do: [{ say: CH6.giverBusy }] },
        { on: E(actorSpotId('finn')), do: [{ call: 'scene.play', id: 'ch6_finn' }] },
        {
          on: EV(QUEST_EVENTS.scene('ch6_finn')),
          do: [{ goto: 'decoy' }, { call: 'magpie.arm', id: 'magpie_decoy', mode: 'lead' }, { say: STORY_LINES.decoyGo, ms: 6000 }],
        },
        { on: E(actorSpotId('june')), do: [{ say: STORY_LINES.finnFirst }] },
      ],
    },
    {
      id: 'decoy',
      rules: [
        { on: E('npc_mara'), do: [{ say: CH6.giverBusy }] },
        { on: E(actorSpotId('finn')), do: [{ say: STORY_LINES.decoyGo, ms: 6000 }] },
        { on: E(actorSpotId('june')), do: [{ say: STORY_LINES.needProof }] },
        { on: EV(QUEST_EVENTS.magpie('snatched')), do: [{ say: STORY_LINES.decoyTaken, ms: 5000 }] },
        { on: EV(QUEST_EVENTS.magpie('lost')), do: [{ say: STORY_LINES.decoyLost, ms: 6000 }] },
        {
          on: EV(QUEST_EVENTS.magpie('atDen')),
          do: [{ goto: 'den' }, { call: 'magpie.disarm', id: 'magpie_decoy' }, { say: STORY_LINES.inDen, ms: 6000 }],
        },
      ],
    },
    {
      id: 'den',
      rules: [
        { on: E('npc_mara'), do: [{ say: CH6.giverBusy }] },
        { on: E('den_returns_sign'), if: ['clue_den_labels'], do: clue('den_returns_sign', [{ say: STORY_LINES.proofEnough, ms: 5000 }]) },
        { on: E('den_returns_sign'), do: clue('den_returns_sign') },
        { on: E('den_labels'), if: ['clue_den_returns_sign'], do: clue('den_labels', [{ say: STORY_LINES.proofEnough, ms: 5000 }]) },
        { on: E('den_labels'), do: clue('den_labels') },
        { on: E(actorSpotId('june')), if: ['!clue_den_returns_sign'], do: [{ say: STORY_LINES.needProof }] },
        { on: E(actorSpotId('june')), if: ['!clue_den_labels'], do: [{ say: STORY_LINES.needProof }] },
        { on: E(actorSpotId('june')), do: [{ call: 'checkTarget', id: actorSpotId('june'), variant: 'door' }] },
        { on: EV(QUEST_EVENTS.delivered), do: [{ goto: 'done' }, { call: 'scene.play', id: 'ch6_june', then: 'showResult' }] },
      ],
    },
    { id: 'done', rules: [] },
  ],
};

/** Day 5: The Neighbourhood Did. June's photographs to Arthur at the Market Cross; Mr Crane leaves town. */
export const CH7_QUEST: GameQuest = {
  id: 'ch7',
  steps: [
    pickupStep(
      [acceptedPlain],
      [
        { call: 'actor.place', id: 'arthur', at: 'arthur_cross' },
        { call: 'actor.place', id: 'june', at: 'june_cross' },
        { call: 'actor.place', id: 'finn', at: 'finn_cross' },
        { call: 'actor.place', id: 'swift_manager', at: 'crane_cross' },
      ],
    ),
    {
      id: 'deliver',
      rules: [
        { on: E('npc_mara'), do: [{ say: CH7.giverBusy }] },
        { on: E(actorSpotId('arthur')), do: [{ call: 'checkTarget', id: actorSpotId('arthur'), variant: 'door' }] },
        { on: EV(QUEST_EVENTS.delivered), do: [{ goto: 'done' }, { call: 'scene.play', id: 'ch7_final', then: 'showResult' }] },
      ],
    },
    // Mr Crane walks off down Market Street while the result is on screen.
    { id: 'done', rules: [{ on: EV(QUEST_EVENTS.scene('ch7_final')), do: [{ call: 'actor.walk', id: 'swift_manager', route: 'crane_leaves', hideAtEnd: true }] }] },
  ],
};

export const CHAPTER_QUESTS: Record<ChapterId, GameQuest> = {
  ch1: CH1_QUEST,
  ch2: CH2_QUEST,
  ch3: CH3_QUEST,
  ch4: CH4_QUEST,
  ch5: CH5_QUEST,
  ch6: CH6_QUEST,
  ch7: CH7_QUEST,
};
