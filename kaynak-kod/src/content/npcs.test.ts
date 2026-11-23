// Townsfolk and animal routes are hand-made: these checks prove they stay on open ground inside the core,
// clear of furniture, and out of the story's way (quest spots, Finn, the Postmark Mews gate, Sylvie's photo).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { QuestRunner } from '../domain/quest/QuestRunner';
import { Routine, routineLayout, validateRoutine, type RoutineDef } from '../domain/npc/routine';
import { distanceToRect, distanceToSegment, inViewWedge, isWalkable, samplesAlong, type Circle, type Obstacles } from '../domain/npc/walkable';
import type { Point2 } from '../domain/npc/waypoints';
import { districtAt, type Rect } from '../domain/world/worldData';
import { CITY_SCALE, PROP_KIT } from '../world/cityKit';
import { ANIMALS, CORE_ANIMALS, CORE_TOWNSFOLK, OUTER_ANIMALS, OUTER_TOWNSFOLK, TOWNSFOLK, TOWNSFOLK_GREETINGS, TOWNSFOLK_SPOT_ID } from './npcs';
import { CHAPTER_IDS } from './catalog';
import { CHAPTER_QUESTS, DEFAULT_RULES, QUEST_EVENTS, type GameEffect } from './quests';
import { FINN_PATROL, FINN_ROUTES, MEETING_SPOTS } from './waypointRoutes';
import { BELLWICK, coreRect } from './world';

/** Body radius used for the checks (the collider is 0.3 m; a little air on top). */
const PERSON = 0.35;
const ANIMAL = 0.2;

const box = (x: number, z: number, w: number, d: number): Rect => ({ x0: x - w / 2, x1: x + w / 2, z0: z - d / 2, z1: z + d / 2 });

// Solid set dressing that is built in code, not in the map layers (world/Dressing.ts, world/WorldBuilder.ts).
// Keep in step with those files: a prop added there without a line here is not protected by these tests.
const LAMPS: Circle[] = [
  ...[-17, -6, 9, 18].map((z) => ({ x: -3.35, z, r: 0.1 })),
  ...[-9, 10.5, 18].map((z) => ({ x: 3.35, z, r: 0.1 })),
  ...[[-9, 37], [9, 37], [-9, 31], [9, 31]].map(([x, z]) => ({ x: x!, z: z!, r: 0.1 })),
];
const DRESSING_TREES: Circle[] = [[-17, 25], [-6, 38.2], [6, 38.2], [22, 24.5], [26, -5], [-18.6, 35.2]].map(([x, z]) => ({ x: x!, z: z!, r: 0.3 }));
/** Square benches (seat 1.8 × 0.5). */
const SQUARE_BENCHES: Rect[] = [box(-4.5, 37.6, 1.8, 0.5), box(4.5, 37.6, 1.8, 0.5), box(-14, 24.2, 1.8, 0.5)];
const FLOWER_BEDS: Rect[] = [box(-12.5, 38.4, 5, 2.2), box(16, 36, 5, 2.4)];
const GATE_PILLARS: Rect[] = [box(-20.25, 29.8, 0.6, 0.5), box(-20.25, 33.2, 0.6, 0.5), box(27.9, 25.9, 0.5, 0.5), box(27.9, 29.1, 0.5, 0.5)];

/** Sylvie's old photo (WorldBuilder `mews.oldPhotoView`, rendered 640 × 400 at fov 0.85 by MewsCast.captureView). */
const PHOTO = { from: { x: -12.6, z: 30.6 }, to: { x: -20, z: 31.6 }, halfAngle: Math.atan((640 / 400) * Math.tan(0.85 / 2)) };
/** Postmark Mews lane (dial-square.geo.json `mewsPaving`). */
const MEWS_LANE: Rect = { x0: -34, x1: -20, z0: 27.5, z1: 35.5 };

const core = coreRect(BELLWICK);
const yardBenches = BELLWICK.pois.filter((q) => q.kind === 'bench').map((q) => box(q.x, q.z, 1.8, 0.6));
const BENCHES = [...SQUARE_BENCHES, ...yardBenches];

/** A prop's footprint as a box (quarter turns swap its sides; any other angle gets its bounding square). */
function propBox(prop: (typeof BELLWICK.props)[number]): Rect | null {
  const kit = PROP_KIT[prop.model];
  if (!kit.collider) return null; // low enough to step over
  const w = kit.w * CITY_SCALE;
  const d = kit.d * CITY_SCALE;
  const turn = ((prop.rotate % 180) + 180) % 180;
  if (turn === 0) return box(prop.x, prop.z, w, d);
  if (turn === 90) return box(prop.x, prop.z, d, w);
  const side = Math.hypot(w, d);
  return box(prop.x, prop.z, side, side);
}

const OBSTACLES: Obstacles = {
  bounds: core,
  rects: [
    ...BELLWICK.buildings.map((b) => b.rect),
    ...BELLWICK.solids.map((s) => s.rect),
    ...BELLWICK.props.flatMap((q) => propBox(q) ?? []),
    ...BENCHES,
    ...FLOWER_BEDS,
    ...GATE_PILLARS,
  ],
  circles: [
    ...BELLWICK.pois.flatMap((q) => (q.kind === 'bench' ? [] : [{ x: q.x, z: q.z, r: q.radius ?? 0.3 }])),
    ...BELLWICK.npcs.map((n) => ({ x: n.x, z: n.z, r: 0.35 })), // Mara
    ...LAMPS,
    ...DRESSING_TREES,
  ],
};

interface Walker {
  id: string;
  routine: RoutineDef;
  radius: number;
}
/** The old neighbourhood's people and animals: checked against the core's furniture and story. */
const WALKERS: Walker[] = [
  ...CORE_TOWNSFOLK.map((t) => ({ id: t.id, routine: t.routine, radius: PERSON })),
  ...CORE_ANIMALS.map((a) => ({ id: a.id, routine: a.routine, radius: ANIMAL })),
];
/** The outer districts': checked against the map layers (everything solid out there is in the data). */
const OUTER_WALKERS: Walker[] = [
  ...OUTER_TOWNSFOLK.map((t) => ({ id: t.id, routine: t.routine, radius: PERSON })),
  ...OUTER_ANIMALS.map((a) => ({ id: a.id, routine: a.routine, radius: ANIMAL })),
];
const OUTER_OBSTACLES: Obstacles = {
  bounds: { x0: BELLWICK.bounds.minX, x1: BELLWICK.bounds.maxX, z0: BELLWICK.bounds.minZ, z1: BELLWICK.bounds.maxZ },
  rects: [
    ...BELLWICK.buildings.map((b) => b.rect),
    ...BELLWICK.solids.map((s) => s.rect),
    ...BELLWICK.areas.filter((a) => a.surface === 'water').map((a) => a.rect),
    ...BELLWICK.props.flatMap((q) => propBox(q) ?? []),
    ...BELLWICK.pois.flatMap((q) => (q.kind === 'bench' ? [box(q.x, q.z, 1.8, 0.6)] : q.kind === 'stall' ? [box(q.x, q.z, 2.8, 1.7)] : [])),
  ],
  circles: BELLWICK.pois.flatMap((q) => (q.kind === 'bench' || q.kind === 'stall' ? [] : [{ x: q.x, z: q.z, r: q.radius ?? 0.5 }])),
};

/** Every point a walker's body centre can be at, except on a seat: path samples and standing points. */
function groundPoints(routine: RoutineDef): Point2[] {
  const l = routineLayout(routine);
  return [routine.start, ...l.stops, ...l.segments.flatMap((s) => samplesAlong(s.a, s.b))];
}

const fmt = (q: Point2): string => `(${q.x.toFixed(2)}, ${q.z.toFixed(2)})`;

describe('townsfolk', () => {
  it('are at least 25, with unique ids and townsfolk models that exist', () => {
    expect(TOWNSFOLK.length).toBeGreaterThanOrEqual(25);
    const ids = [...TOWNSFOLK, ...ANIMALS].map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).not.toContain(TOWNSFOLK_SPOT_ID);
    const storyCast = ['courier', 'mara', 'finn', 'june', 'arthur'];
    for (const t of TOWNSFOLK) {
      expect(t.model, t.id).toMatch(/^models\/chars\/[a-z0-9_]+\.glb$/);
      expect(storyCast.some((name) => t.model.endsWith(`/${name}.glb`)), `${t.id} uses a story character`).toBe(false);
      expect(readFileSync(`src/assets/${t.model}`).byteLength, t.model).toBeGreaterThan(1000);
    }
    for (const species of new Set(ANIMALS.map((a) => a.species))) {
      expect(readFileSync(`src/assets/models/animals/${species}.glb`).byteLength, species).toBeGreaterThan(1000);
    }
  });

  it('have valid routines', () => {
    for (const w of WALKERS) expect(validateRoutine(w.routine), w.id).toEqual([]);
    for (const t of [...TOWNSFOLK, ...ANIMALS]) {
      if (t.phase !== undefined) expect(t.phase >= 0 && t.phase < 1, t.id).toBe(true);
    }
  });

  it('have cats and dogs', () => {
    expect(ANIMALS.filter((a) => a.species === 'cat').length).toBeGreaterThanOrEqual(2);
    expect(ANIMALS.filter((a) => a.species === 'dog').length).toBeGreaterThanOrEqual(2);
  });

  it('walk and stand only on open ground inside the core (no building, wall, prop, lamp, tree or bench)', () => {
    for (const w of WALKERS) {
      for (const q of groundPoints(w.routine)) {
        expect(isWalkable(q, OBSTACLES, w.radius), `${w.id} at ${fmt(q)}`).toBe(true);
      }
    }
  });

  it('of the outer districts stand on open ground there: no building, water, stall, prop or tree, and not at the vendor', () => {
    expect(OUTER_TOWNSFOLK.length).toBeGreaterThanOrEqual(15);
    const seen = new Set<string>();
    for (const w of OUTER_WALKERS) {
      for (const q of groundPoints(w.routine)) {
        expect(isWalkable(q, OUTER_OBSTACLES, w.radius + 0.15), `${w.id} at ${fmt(q)}`).toBe(true);
        const district = districtAt(BELLWICK.districts, q.x, q.z)?.id;
        expect(['market-hill', 'canal-side', 'railway-yard', 'hillside-park'], `${w.id} at ${fmt(q)}`).toContain(district);
        if (district) seen.add(district);
        for (const s of BELLWICK.spots) expect(Math.hypot(q.x - s.x, q.z - s.z), `${w.id} at ${fmt(q)} near ${s.id}`).toBeGreaterThanOrEqual(1.5);
      }
    }
    expect(seen.size).toBe(4);
  });

  it('sit only on benches, right next to where they stood', () => {
    let seats = 0;
    for (const w of WALKERS) {
      for (const step of w.routine.steps) {
        if (step.kind !== 'sit') continue;
        seats++;
        expect(BENCHES.some((b) => distanceToRect(step.seat, b) <= 0.3), `${w.id} seat ${fmt(step.seat)}`).toBe(true);
      }
      const l = routineLayout(w.routine);
      for (const seat of l.seats) expect(Math.min(...l.stops.map((s) => Math.hypot(s.x - seat.x, s.z - seat.z))), w.id).toBeLessThan(1.2);
    }
    expect(seats).toBeGreaterThanOrEqual(4);
  });

  it('stay out of Postmark Mews and out of the view of Sylvie’s old photo', () => {
    for (const w of WALKERS) {
      for (const q of [...groundPoints(w.routine), ...routineLayout(w.routine).seats]) {
        expect(distanceToRect(q, MEWS_LANE), `${w.id} at ${fmt(q)} near the mews lane`).toBeGreaterThan(1);
        expect(inViewWedge(q, PHOTO.from, PHOTO.to, PHOTO.halfAngle, 1), `${w.id} at ${fmt(q)} is in the old photo`).toBe(false);
      }
    }
  });

  it('keep clear of quest spots (Mara, the doors, the gates, the sign) and of Finn', () => {
    const patrol = [FINN_PATROL[0]!, FINN_PATROL[FINN_PATROL.length - 1]!] as const;
    const meetings = Object.values(MEETING_SPOTS);
    const finnLegs = Object.values(FINN_ROUTES).flatMap((route) => route.slice(1).map((b, i) => ({ a: route[i]!, b })));
    for (const w of WALKERS) {
      const l = routineLayout(w.routine);
      for (const q of groundPoints(w.routine)) {
        for (const s of BELLWICK.spots) expect(Math.hypot(q.x - s.x, q.z - s.z), `${w.id} at ${fmt(q)} near ${s.id}`).toBeGreaterThanOrEqual(1.5);
        for (const m of meetings) expect(Math.hypot(q.x - m.x, q.z - m.z), `${w.id} at ${fmt(q)} near a meeting spot`).toBeGreaterThanOrEqual(1.5);
        expect(distanceToSegment(q, patrol[0], patrol[1]), `${w.id} at ${fmt(q)} on Finn's patrol`).toBeGreaterThanOrEqual(1);
      }
      // Nobody stands or sits on the way Finn walks to a meeting (crossing it is fine).
      for (const q of [w.routine.start, ...l.stops, ...l.seats]) {
        for (const leg of finnLegs) expect(distanceToSegment(q, leg.a, leg.b), `${w.id} stands at ${fmt(q)} on Finn's route`).toBeGreaterThanOrEqual(1.2);
      }
    }
  });

  it('do not stand inside one another', () => {
    const spots = TOWNSFOLK.flatMap((t) => {
      const l = routineLayout(t.routine);
      return [...l.stops, ...l.seats].map((q) => ({ id: t.id, routine: t.routine, q }));
    });
    for (const a of spots) {
      for (const b of spots) {
        if (a.routine === b.routine) continue; // people sharing a loop use its stops at different times
        expect(Math.hypot(a.q.x - b.q.x, a.q.z - b.q.z), `${a.id} ${fmt(a.q)} / ${b.id} ${fmt(b.q)}`).toBeGreaterThanOrEqual(0.8);
      }
    }
  });

  it('who share a loop stay apart at all times', () => {
    const byRoutine = new Map<RoutineDef, { id: string; r: Routine }[]>();
    for (const t of TOWNSFOLK) {
      if (t.phase === undefined) continue;
      const list = byRoutine.get(t.routine) ?? [];
      list.push({ id: t.id, r: new Routine(t.routine, t.phase) });
      byRoutine.set(t.routine, list);
    }
    for (const list of byRoutine.values()) {
      if (list.length < 2) continue;
      const cycle = list[0]!.r.cycleSeconds;
      for (let t = 0; t < cycle * 2; t += 0.5) {
        for (const m of list) m.r.update(0.5);
        for (const a of list) {
          for (const b of list) {
            if (a === b) continue;
            expect(Math.hypot(a.r.x - b.r.x, a.r.z - b.r.z), `${a.id} / ${b.id} at ${t}s`).toBeGreaterThan(1.5);
          }
        }
      }
    }
  });
});

describe('saying hello', () => {
  it('has 6–10 short lines in both languages', () => {
    expect(TOWNSFOLK_GREETINGS.length).toBeGreaterThanOrEqual(6);
    expect(TOWNSFOLK_GREETINGS.length).toBeLessThanOrEqual(10);
    for (const line of TOWNSFOLK_GREETINGS) {
      for (const text of [line.en, line.tr]) {
        expect(text.trim().length).toBeGreaterThan(5);
        expect(text.length).toBeLessThanOrEqual(80);
      }
    }
    // Proper names stay English in every language.
    for (const name of ['Bellwick', 'Dial Square', 'Mara', 'Ember Bakery', 'Indigo Row']) {
      for (const line of TOWNSFOLK_GREETINGS) expect(line.en.includes(name)).toBe(line.tr.includes(name));
    }
  });

  it('E on a townsperson greets in every chapter and step, and changes nothing in the quest', () => {
    for (const id of CHAPTER_IDS) {
      const r = new QuestRunner<GameEffect>(CHAPTER_QUESTS[id], DEFAULT_RULES);
      r.start();
      for (const event of [null, QUEST_EVENTS.accepted, QUEST_EVENTS.delivered]) {
        if (event) r.handle({ event });
        const step = r.stepId;
        expect(r.handle({ interact: TOWNSFOLK_SPOT_ID })).toEqual([{ call: 'townsfolk.greet' }]);
        expect(r.stepId).toBe(step);
      }
    }
  });
});
