// Content: the people and animals of Bellwick who are not part of a delivery — who they are (model), and
// what they do all day (a looping routine for domain/npc/routine.ts). Views: world/NpcDirector, world/Animals.
//
// Routes are hand-made and stay inside the hand-built core: Indigo Row (street x −5..5), Dial Square
// (z 22..40, fountain at (0, 30)), the back lane (x 13..18) and Crossing Yard (x 13..28, z −8..12).
// content/npcs.test.ts proves that every stretch is on open ground, clear of furniture, and away from the
// story: Mara, the delivery doors, the yard gate, Finn's patrol and meeting spots, the Postmark Mews gate
// and the view of Sylvie's old photo. Change a coordinate → run the tests.
//
// Layout notes the routes rely on (see world/Dressing.ts and the .geo.json layers):
// - Pavements are x ±3..5 with lamp posts on the kerb (x ±3.35): people walk at x ±3.85 and stand against
//   the house fronts at x ±4.55. Where a delivery door or Mara is on the pavement, walkers use the road.
// - Square benches (seat 1.8 m wide, sitter faces south): (−4.5, 37.6), (4.5, 37.6), (−14, 24.2).
//   Yard bench (no back): (21.5, 5).
import type { LocalizedText } from '../i18n';
import type { RoutineDef, RoutineStep } from '../domain/npc/routine';
import type { Point2 } from '../domain/npc/waypoints';

export interface TownsfolkDef {
  id: string;
  /** Asset id of a townsfolk character (build/characters/cast.json). */
  model: string;
  routine: RoutineDef;
  /**
   * 0..1 start offset in the routine's loop. Set for people who share a routine (spread evenly) or act
   * together (same value); everyone else gets a stable offset from their id.
   */
  phase?: number;
}

export interface AnimalDef {
  id: string;
  species: 'cat' | 'dog';
  /** Coat colour (sRGB hex). */
  colour: string;
  routine: RoutineDef;
  phase?: number;
}

/** The one interaction spot shared by all townsfolk: it follows whoever is nearest to the player. */
export const TOWNSFOLK_SPOT_ID = 'npc_townsfolk';
/** How close (m) the player must be to say hello. */
export const TOWNSFOLK_GREET_RANGE = 2;

/** What a neighbour says when the courier says hello (one at random). Proper names stay English. */
export const TOWNSFOLK_GREETINGS: readonly LocalizedText[] = [
  { en: '“Morning! You must be the new courier.”', tr: '“Günaydın! Yeni kurye sen olmalısın.”' },
  { en: '“Lovely day for a delivery, isn’t it?”', tr: '“Teslimat için güzel bir gün, değil mi?”' },
  { en: '“Welcome to Bellwick. You’ll know every door soon enough.”', tr: '“Bellwick’e hoş geldin. Yakında bütün kapıları tanırsın.”' },
  { en: '“If you get lost, Dial Square is always north.”', tr: '“Kaybolursan unutma: Dial Square hep kuzeydedir.”' },
  { en: '“Say hello to Mara for me.”', tr: '“Mara’ya benden selam söyle.”' },
  { en: '“Ember Bakery still does the best bread in town.”', tr: '“Kasabanın en iyi ekmeği hâlâ Ember Bakery’de.”' },
  { en: '“Take your time. Nobody hurries in Bellwick.”', tr: '“Acele etme. Bellwick’te kimse koşturmaz.”' },
  { en: '“Good to see a new face on Indigo Row.”', tr: '“Indigo Row’da yeni bir yüz görmek ne güzel.”' },
  { en: '“Mind the cat — she thinks she owns the street.”', tr: '“Kediye dikkat et, sokağı kendisinin sanıyor.”' },
];

// ---------------------------------------------------------------- helpers

const p = (x: number, z: number): Point2 => ({ x, z });
const walk = (...path: Point2[]): RoutineStep => ({ kind: 'walk', path });
const wait = (seconds: number, face?: Point2): RoutineStep => ({ kind: 'wait', seconds, ...(face ? { face } : {}) });
const sit = (seat: Point2, heading: number, seconds: number): RoutineStep => ({ kind: 'sit', seat, heading, seconds });
const chat = (seconds: number, face: Point2, turn: number, of = 2): RoutineStep => ({ kind: 'chat', seconds, face, turn, of });
const model = (name: string): string => `models/chars/${name}.glb`;

const FOUNTAIN = p(0, 30);
const SOUTH = Math.PI; // a sitter on a square bench faces −Z
const NORTH = 0;

/** People standing together: each talks toward `face` in turn, then all look around for a moment. */
function group(members: readonly { id: string; model: string; at: Point2; look: Point2 }[], face: (i: number) => Point2, talk: number, pause: number): TownsfolkDef[] {
  return members.map((m, i) => ({
    id: m.id,
    model: model(m.model),
    phase: 0, // together
    routine: { start: m.at, speed: 0, steps: [chat(talk, face(i), i, members.length), wait(pause, m.look)] },
  }));
}

/** N people on one loop, spread evenly so they never catch each other up. */
function sharing(routine: RoutineDef, people: readonly [id: string, model: string][]): TownsfolkDef[] {
  return people.map(([id, name], i) => ({ id, model: model(name), routine, phase: i / people.length }));
}

// ---------------------------------------------------------------- shared loops

/**
 * Indigo Row, clockwise: down the east pavement, up the west one. Walkers step into the road past June's
 * door (and the yard gate), cross behind the parked sedan, and pass Mara on the road side.
 */
const INDIGO_LOOP: RoutineDef = {
  start: p(3.85, 19),
  heading: SOUTH,
  speed: 1.5,
  steps: [
    walk(p(3.85, 9.2), p(2.2, 8.2), p(2.2, 0.5), p(0.3, -1.5), p(0.3, -8), p(3.85, -10.8), p(3.85, -15)),
    wait(6, p(6, -15)), // a neighbour's window
    walk(p(3.85, -18.2), p(-1.8, -18.6), p(-1.8, -10.5), p(-3.85, -7.7), p(-3.85, 3.6)),
    wait(8, p(-6, 3.6)), // Ember Bakery's window
    walk(p(-3.85, 19), p(-2, 20.8), p(2, 20.8), p(3.85, 19)),
  ],
};

/** Around Dial Square, behind Finn's patrol line and behind the camera of Sylvie's photo. */
const SQUARE_LOOP: RoutineDef = {
  start: p(10.8, 24),
  heading: NORTH,
  speed: 1.4,
  steps: [
    walk(p(10.8, 29.5), p(7.2, 35), p(0, 36)),
    wait(7, FOUNTAIN),
    walk(p(-7.2, 35), p(-10.8, 29.5), p(-10.8, 24), p(-6, 23), p(6, 23), p(10.8, 24)),
  ],
};

/** Square → back lane → round Crossing Yard → back: east of Finn's way in, west of it on the way out. */
const YARD_LOOP: RoutineDef = {
  start: p(16.9, 25.2),
  heading: SOUTH,
  speed: 1.45,
  steps: [
    walk(p(16.9, 12.5), p(19, 10.3), p(24, 10.3), p(25.6, 6.8), p(25, 1)),
    wait(5, p(28, 4)), // a look out of the yard's east opening
    walk(p(23, -3.2), p(19.5, -4.6), p(14.4, -4.6), p(14.2, 11.5), p(14.1, 25.2), p(16.9, 25.2)),
  ],
};

// ---------------------------------------------------------------- townsfolk

/** The old neighbourhood: Indigo Row, Dial Square, Crossing Yard. */
export const CORE_TOWNSFOLK: readonly TownsfolkDef[] = [
  ...sharing(INDIGO_LOOP, [
    ['town_indigo_walker_1', 'casual_f'],
    ['town_indigo_walker_2', 'suit_m'],
    ['town_indigo_walker_3', 'casual3_m'],
    ['town_indigo_walker_4', 'casual2_f'],
  ]),
  ...sharing(SQUARE_LOOP, [
    ['town_square_walker_1', 'doctor_f_young'],
    ['town_square_walker_2', 'casual_bald'],
    ['town_square_walker_3', 'casual2_m'],
  ]),
  ...sharing(YARD_LOOP, [
    ['town_yard_walker_1', 'worker_m'],
    ['town_yard_walker_2', 'doctor_m_young'],
  ]),

  // Outside Ember Bakery: the baker on a break and a regular.
  ...group(
    [
      { id: 'town_baker', model: 'chef_m', at: p(-4.55, 8.4), look: p(0, 8.4) },
      { id: 'town_bakery_regular', model: 'doctor_m_old', at: p(-4.55, 9.8), look: p(0, 9.8) },
    ],
    (i) => (i === 0 ? p(-4.55, 9.8) : p(-4.55, 8.4)),
    17.5,
    9,
  ),
  // Two neighbours by the green door.
  ...group(
    [
      { id: 'town_neighbour_1', model: 'casual3_f', at: p(4.55, 13.2), look: p(0, 13.2) },
      { id: 'town_neighbour_2', model: 'oldclassy_m', at: p(4.55, 14.6), look: p(0, 14.6) },
    ],
    (i) => (i === 0 ? p(4.55, 14.6) : p(4.55, 13.2)),
    21,
    7,
  ),
  // By the fountain.
  ...group(
    [
      { id: 'town_fountain_1', model: 'chef_f', at: p(3.4, 33.7), look: FOUNTAIN },
      { id: 'town_fountain_2', model: 'casual_f', at: p(4.7, 33), look: FOUNTAIN },
    ],
    (i) => (i === 0 ? p(4.7, 33) : p(3.4, 33.7)),
    24.5,
    8,
  ),
  // Three friends on the east side of the square.
  ...group(
    [
      { id: 'town_friends_1', model: 'doctor_m_old', at: p(18.6, 30.4), look: FOUNTAIN },
      { id: 'town_friends_2', model: 'suit_m', at: p(20.4, 30.4), look: p(19.5, 36) },
      { id: 'town_friends_3', model: 'casual2_f', at: p(19.5, 31.9), look: p(12, 34) },
    ],
    () => p(19.5, 30.9),
    21,
    6,
  ),
  // Warehouse hands on a break at the south wall of Crossing Yard.
  ...group(
    [
      { id: 'town_warehouse_1', model: 'worker_f', at: p(19.4, -6.9), look: p(19.4, 0) },
      { id: 'town_warehouse_2', model: 'chef_m', at: p(20.8, -6.9), look: p(24, -2) },
    ],
    (i) => (i === 0 ? p(20.8, -6.9) : p(19.4, -6.9)),
    14,
    11,
  ),

  // The constable at the south end of Indigo Row.
  {
    id: 'town_constable',
    model: model('police_m'),
    routine: { start: p(-4.3, -18.9), heading: NORTH, speed: 0, steps: [wait(12, p(0, -10)), wait(9, p(4, -19)), wait(10, p(-2, -14))] },
  },
  // …and one keeping an eye on the yard's east opening.
  {
    id: 'town_yard_officer',
    model: model('police_f'),
    routine: { start: p(27, 1.2), heading: -Math.PI / 2, speed: 0, steps: [wait(14, p(20, 3)), wait(10, p(30, 4))] },
  },

  // North-west bench: reads for a while, then goes to look at the fountain.
  {
    id: 'town_reader',
    model: model('doctor_f_old'),
    routine: {
      start: p(-4.5, 36.9),
      heading: SOUTH,
      speed: 1.2,
      steps: [sit(p(-4.5, 37.5), SOUTH, 45), walk(p(-3.3, 33.4)), wait(10, FOUNTAIN), walk(p(-4.5, 36.9))],
    },
  },
  // North-east bench: two colleagues at lunch; one of them goes to see the flower bed.
  {
    id: 'town_lunch_1',
    model: model('suit_f'),
    routine: { start: p(4.05, 36.9), heading: SOUTH, speed: 1.2, steps: [sit(p(4.05, 37.5), SOUTH, 60), wait(6, FOUNTAIN)] },
  },
  {
    id: 'town_lunch_2',
    model: model('casual_m'),
    routine: {
      start: p(4.95, 36.9),
      heading: SOUTH,
      speed: 1.3,
      steps: [sit(p(4.95, 37.5), SOUTH, 35), walk(p(15, 33.9)), wait(9, p(16, 36)), walk(p(4.95, 36.9))],
    },
  },
  // South-west bench.
  {
    id: 'town_bench_lady',
    model: model('oldclassy_f'),
    routine: { start: p(-14, 23.5), heading: SOUTH, speed: 1.1, steps: [sit(p(-14, 24.1), SOUTH, 55), wait(7, p(-10, 23.5))] },
  },
  // Yard bench: sits facing the lane, then stretches the legs to the tree and back.
  {
    id: 'town_yard_sitter',
    model: model('oldclassy_m'),
    routine: {
      start: p(21.5, 6.1),
      heading: NORTH,
      speed: 1.1,
      steps: [sit(p(21.5, 5.1), NORTH, 40), walk(p(22.6, 8.6)), wait(8, p(24, 8)), walk(p(21.5, 6.1))],
    },
  },
  // Strolls between the east side of the square and its north edge.
  {
    id: 'town_stroller',
    model: model('casual3_m'),
    routine: {
      start: p(20, 27),
      heading: NORTH,
      speed: 1.25,
      steps: [walk(p(24, 32.5), p(21.5, 38), p(11.5, 38.2)), wait(8, FOUNTAIN), walk(p(21.5, 38), p(24, 32.5), p(20, 27)), wait(6, p(22, 24.5))],
    },
  },
];

// ---------------------------------------------------------------- the outer districts

/** A simple circuit: walk the corners in turn, pausing `pause` seconds at the first one. */
function circuit(speed: number, pause: number, look: Point2, corners: readonly Point2[]): RoutineDef {
  const [first, ...rest] = corners;
  const start = first ?? p(0, 0);
  return { start, speed, steps: [walk(...rest, start), wait(pause, look)] };
}
/** Up and down one line, with a pause at each end. */
function stroll(speed: number, a: Point2, b: Point2, lookA: Point2, lookB: Point2): RoutineDef {
  return { start: a, speed, steps: [walk(b), wait(9, lookB), walk(a), wait(7, lookA)] };
}
/** Someone who stays put and looks from one thing to another. */
function standing(id: string, name: string, at: Point2, ...looks: Point2[]): TownsfolkDef {
  return { id, model: model(name), routine: { start: at, speed: 0, steps: looks.map((l, i) => wait(9 + (i % 3) * 3, l)) } };
}

/** Market Hill: up and down the centre aisle between the stall rows. */
const MARKET_AISLE = circuit(1.2, 6, p(0, 80), [p(-2, 58), p(-2, 76), p(2, 76), p(2, 58)]);
/** Market Hill: round the benches west of the Market Cross. */
const MARKET_CROSS_WALK = circuit(1.1, 8, p(0, 80), [p(-20, 78.6), p(-8, 78.6), p(-8, 81.4), p(-20, 81.4)]);
/** Hillside Park: the promenade between the gate and the bandstand, and the far end beyond it. */
const PROMENADE_EAST = circuit(1.15, 7, p(-95, 80), [p(-46, 78.3), p(-84, 78.3), p(-84, 81.7), p(-46, 81.7)]);
const PROMENADE_WEST = circuit(1.1, 9, p(-140, 80), [p(-106, 78.3), p(-134, 78.3), p(-134, 81.7), p(-106, 81.7)]);
/** Railway Yard: Sidings Road, pavement to pavement. */
const SIDINGS_ROUND = circuit(1.3, 6, p(0, -45), [p(-30, -38.2), p(20, -38.2), p(20, -35.8), p(-30, -35.8)]);

/** People of the four outer districts (content/world/*.geo.json; positions checked in npcs.test.ts). */
export const OUTER_TOWNSFOLK: readonly TownsfolkDef[] = [
  // Market Hill: shoppers in the aisle and at the stalls (stall counters face north), neighbours by the cross.
  ...sharing(MARKET_AISLE, [
    ['market_aisle_1', 'casual2_f'],
    ['market_aisle_2', 'oldclassy_m'],
    ['market_aisle_3', 'casual3_m'],
  ]),
  ...sharing(MARKET_CROSS_WALK, [
    ['market_cross_1', 'suit_f'],
    ['market_cross_2', 'casual_bald'],
  ]),
  standing('market_shopper_1', 'casual_f', p(-10, 74.4), p(-10.2, 72.5), p(-6.2, 72.5)),
  standing('market_shopper_2', 'chef_m', p(12, 74.4), p(10.2, 72.5), p(14.2, 72.5)),
  standing('market_shopper_3', 'casual2_m', p(-14, 68.4), p(-14.2, 66.5), p(-18.2, 66.5)),
  standing('market_shopper_4', 'doctor_f_young', p(16, 89.4), p(15, 87), p(10.2, 87.5)),
  standing('market_shopper_5', 'worker_f', p(-8, 62.4), p(-6.2, 60.5), p(-10.2, 60.5)),
  ...group(
    [
      { id: 'market_chat_1', model: 'casual3_f', at: p(1, 86), look: p(0, 80) },
      { id: 'market_chat_2', model: 'suit_m', at: p(-0.6, 86.6), look: p(6.2, 87.5) },
    ],
    (i) => (i === 0 ? p(-0.6, 86.6) : p(1, 86)),
    12,
    9,
  ),

  // Canal Side: a stroll along the west quay, and two people watching the water from the east bank.
  { id: 'canal_stroller_1', model: model('oldclassy_f'), routine: stroll(1.0, p(81.7, -26), p(81.7, -3), p(90, -26), p(90, -3)) },
  { id: 'canal_stroller_2', model: model('casual_m'), routine: stroll(1.05, p(81.7, 10), p(81.7, 20), p(90, 10), p(90, 20)) },
  standing('canal_watcher_1', 'doctor_m_old', p(97.2, -10), p(90, -10), p(90, -20)),
  standing('canal_watcher_2', 'casual2_f', p(98.6, 14), p(90, 14), p(90, 25)),

  // Hillside Park: promenaders, and an audience of two at the bandstand.
  ...sharing(PROMENADE_EAST, [
    ['park_promenade_1', 'casual3_f'],
    ['park_promenade_2', 'doctor_m_young'],
  ]),
  { id: 'park_promenade_3', model: model('suit_f'), routine: PROMENADE_WEST },
  ...group(
    [
      { id: 'park_listener_1', model: 'casual_f', at: p(-88, 80), look: p(-95, 80) },
      { id: 'park_listener_2', model: 'casual_m', at: p(-89.2, 81.2), look: p(-95, 80) },
    ],
    (i) => (i === 0 ? p(-89.2, 81.2) : p(-88, 80)),
    10,
    14,
  ),

  // Railway Yard: yard hands by the road, one on a round along Sidings Road.
  { id: 'yard_round', model: model('worker_m'), routine: SIDINGS_ROUND },
  standing('yard_hand_1', 'worker_f', p(4.4, -50), p(0, -60), p(10, -50)),
  standing('yard_hand_2', 'worker_m', p(-4.4, -60), p(0, -85), p(-10, -60)),
  standing('yard_hand_3', 'casual_bald', p(6, -74), p(0, -85), p(0, -70)),
  standing('yard_constable', 'police_m', p(4.4, -30), p(0, -40), p(0, -22)),
];

/** Everyone the director looks after. */
export const TOWNSFOLK: readonly TownsfolkDef[] = [...CORE_TOWNSFOLK, ...OUTER_TOWNSFOLK];

// ---------------------------------------------------------------- animals

/** Wander: walk to each point in turn, pausing `pause[i]` seconds there, and come back the same way. */
function wander(speed: number, points: readonly Point2[], pause: readonly number[]): RoutineDef {
  const there = points.slice(1).flatMap((pt, i) => [walk(pt), wait(pause[i % pause.length] ?? 4)]);
  const back = points
    .slice(0, -1)
    .reverse()
    .flatMap((pt, i) => [walk(pt), wait(pause[(i + 1) % pause.length] ?? 4)]);
  return { start: points[0] ?? p(0, 0), speed, steps: [...there, ...back] };
}

export const CORE_ANIMALS: readonly AnimalDef[] = [
  // The yard cat: between the warehouse boxes and the dumpster.
  { id: 'cat_yard', species: 'cat', colour: '#4a4744', routine: wander(0.7, [p(16.8, -6.2), p(17.5, -2.5), p(23.8, -2), p(24.6, -6.3)], [9, 4, 12]) },
  // The street cat (the one who "owns the street"): round the parked hatchback.
  { id: 'cat_street', species: 'cat', colour: '#c9813f', routine: wander(0.65, [p(-0.45, 17.4), p(-0.45, 12.6), p(-2.8, 12.3)], [7, 14]) },
  // The white cat near the south-west bench.
  { id: 'cat_square', species: 'cat', colour: '#e9e4da', routine: wander(0.6, [p(-15.8, 22.6), p(-11.6, 22.4), p(-17.6, 21.4), p(-18.6, 23.6)], [11, 5, 8]) },
  // A dog nosing about the east side of the square.
  { id: 'dog_square', species: 'dog', colour: '#8a5a35', routine: wander(1.0, [p(22.5, 34.5), p(25, 30.5), p(23, 27.3), p(22.2, 31.2)], [5, 3, 7]) },
  // …and one at the south end of Indigo Row, near where the courier starts.
  { id: 'dog_street', species: 'dog', colour: '#d6b37a', routine: wander(0.95, [p(0.2, -11.5), p(1.6, -16.8), p(-0.6, -17.6), p(-0.4, -13)], [6, 4, 9]) },
];

export const OUTER_ANIMALS: readonly AnimalDef[] = [
  // The park dog, off the lead on the lawn north of the promenade.
  { id: 'dog_park', species: 'dog', colour: '#6b4a2e', routine: wander(1.0, [p(-50, 86), p(-54, 88)], [6, 4]) },
  // …and a cat in the flower beds south of it.
  { id: 'cat_park', species: 'cat', colour: '#3b3936', routine: wander(0.65, [p(-52, 72), p(-56, 70), p(-50, 68)], [10, 6]) },
];

export const ANIMALS: readonly AnimalDef[] = [...CORE_ANIMALS, ...OUTER_ANIMALS];
