import { describe, expect, it } from 'vitest';
import {
  CHAT_TURN_SECONDS,
  MIN_SIT_SECONDS,
  Routine,
  SIT_MOVE_SECONDS,
  phaseFor,
  routineLayout,
  validateRoutine,
  type RoutineDef,
} from './routine';

/** A 10 × 10 m square walked at 2 m/s (20 s), a 5 s wait at the first corner: 25 s per loop. */
const SQUARE: RoutineDef = {
  start: { x: 0, z: 0 },
  speed: 2,
  steps: [
    { kind: 'walk', path: [{ x: 0, z: 10 }] },
    { kind: 'wait', seconds: 5, face: { x: 5, z: 10 } },
    {
      kind: 'walk',
      path: [
        { x: 10, z: 10 },
        { x: 10, z: 0 },
        { x: 0, z: 0 },
      ],
    },
  ],
};

const BENCH: RoutineDef = {
  start: { x: 0, z: 0 },
  speed: 1,
  steps: [
    { kind: 'walk', path: [{ x: 0, z: 4 }] },
    { kind: 'sit', seat: { x: 0, z: 4.6 }, heading: Math.PI, seconds: 10 },
    { kind: 'walk', path: [{ x: 0, z: 0 }] },
    { kind: 'chat', seconds: 14, face: { x: 1, z: 0 }, turn: 1 },
  ],
};

const snapshot = (r: Routine) => ({ x: r.x, z: r.z, heading: r.heading, anim: r.anim, step: r.step, talking: r.talking });

describe('Routine', () => {
  it('walks at exact speed, facing where it goes', () => {
    const r = new Routine(SQUARE);
    r.update(2.5);
    expect(r.x).toBeCloseTo(0);
    expect(r.z).toBeCloseTo(5);
    expect(r.heading).toBeCloseTo(0); // +Z
    expect(r.anim).toBe('walk');
    expect(r.moving).toBe(true);
  });

  it('waits where the walk ended, turned toward what it looks at', () => {
    const r = new Routine(SQUARE);
    r.update(6); // 5 s walk + 1 s of the wait
    expect([r.x, r.z]).toEqual([0, 10]);
    expect(r.anim).toBe('idle');
    expect(r.heading).toBeCloseTo(Math.PI / 2); // facing +X
    expect(r.step).toBe(1);
  });

  it('carries leftover time across steps and corners', () => {
    const r = new Routine(SQUARE);
    r.update(5 + 5 + 7); // walk, wait, then 14 m of the second walk: 10 east + 4 south
    expect(r.x).toBeCloseTo(10);
    expect(r.z).toBeCloseTo(6);
    expect(r.heading).toBeCloseTo(Math.PI); // −Z
  });

  it('loops: after one cycle it is back at the start, doing the same thing', () => {
    const r = new Routine(SQUARE);
    expect(r.cycleSeconds).toBeCloseTo(25);
    r.update(1.5);
    const first = snapshot(r);
    r.update(r.cycleSeconds);
    const again = snapshot(r);
    expect(again.x).toBeCloseTo(first.x);
    expect(again.z).toBeCloseTo(first.z);
    expect(again.step).toBe(first.step);
    expect(again.anim).toBe(first.anim);
  });

  it('is deterministic: one coarse update equals many fine ones', () => {
    for (const def of [SQUARE, BENCH]) {
      const coarse = new Routine(def, 0.3);
      const fine = new Routine(def, 0.3);
      coarse.update(17.3);
      for (let i = 0; i < 1730; i++) fine.update(0.01);
      expect(fine.x).toBeCloseTo(coarse.x, 4);
      expect(fine.z).toBeCloseTo(coarse.z, 4);
      expect(fine.step).toBe(coarse.step);
      expect(fine.anim).toBe(coarse.anim);
    }
  });

  it('starts part-way through its loop with a phase, so two NPCs on one routine are apart', () => {
    const a = new Routine(SQUARE, 0);
    const b = new Routine(SQUARE, 0.5); // 12.5 s in: 2.5 s into the second walk
    expect([a.x, a.z]).toEqual([0, 0]);
    expect(b.x).toBeCloseTo(5);
    expect(b.z).toBeCloseTo(10);
    // …and they stay the same time apart.
    a.update(12.5);
    expect(a.x).toBeCloseTo(5);
    expect(a.z).toBeCloseTo(10);
  });

  it('does not advance while held, and shows idle instead of walking on the spot', () => {
    const r = new Routine(SQUARE);
    r.update(1);
    const before = snapshot(r);
    r.update(30, true);
    expect(r.z).toBe(before.z);
    expect(r.step).toBe(before.step);
    expect(r.anim).toBe('idle');
    expect(r.moving).toBe(false);
    r.update(1);
    expect(r.anim).toBe('walk');
    expect(r.z).toBeCloseTo(4);
  });

  it('sits: slides onto the seat, sits facing the seat heading, then stands back where it came from', () => {
    const r = new Routine(BENCH);
    r.update(4 + SIT_MOVE_SECONDS / 2);
    expect(r.anim).toBe('sit');
    expect(r.z).toBeCloseTo(4.3); // half-way onto the seat
    expect(r.onSeat).toBeCloseTo(0.5); // …and half-way up onto it
    expect(r.heading).toBe(Math.PI);
    r.update(5);
    expect(r.z).toBeCloseTo(4.6);
    expect(r.onSeat).toBe(1);
    expect(r.anim).toBe('sit');
    r.update(5 - SIT_MOVE_SECONDS / 2 - 0.01); // just before the step ends
    expect(r.anim).toBe('idle'); // already getting up
    expect(r.z).toBeCloseTo(4, 1);
    r.update(0.5);
    expect(r.anim).toBe('walk');
    expect(r.onSeat).toBe(0); // back on the ground before walking off
    expect(r.z).toBeLessThan(4);
  });

  it('chats facing the partner; the two sides take turns talking', () => {
    const mine = new Routine(BENCH);
    mine.update(4 + 10 + 4 + 0.1); // into the chat
    expect(mine.anim).toBe('chat');
    expect(mine.heading).toBeCloseTo(Math.PI / 2);
    expect(mine.talking).toBe(false); // turn 1 listens first
    mine.update(CHAT_TURN_SECONDS);
    expect(mine.talking).toBe(true);
    const partner: RoutineDef = { start: { x: 1, z: 0 }, speed: 1, steps: [{ kind: 'chat', seconds: 14, face: { x: 0, z: 0 }, turn: 0 }] };
    const other = new Routine(partner);
    other.update(0.1);
    expect(other.talking).toBe(true);
    other.update(CHAT_TURN_SECONDS);
    expect(other.talking).toBe(false);
  });

  it('survives degenerate content (zero-length paths, a huge dt) without hanging', () => {
    const odd: RoutineDef = { start: { x: 1, z: 1 }, speed: 1, steps: [{ kind: 'walk', path: [{ x: 1, z: 1 }] }] };
    const r = new Routine(odd);
    r.update(1e9);
    expect([r.x, r.z]).toEqual([1, 1]);
    const still = new Routine({ start: { x: 0, z: 0 }, speed: 0, steps: [] });
    still.update(5);
    expect(still.anim).toBe('idle');
    new Routine(SQUARE).update(1e9);
  });
});

describe('routineLayout / validateRoutine', () => {
  it('lists the walked stretches (with the closing one), the stops and the seats', () => {
    const l = routineLayout(BENCH);
    expect(l.segments).toEqual([
      { a: { x: 0, z: 0 }, b: { x: 0, z: 4 } },
      { a: { x: 0, z: 4 }, b: { x: 0, z: 0 } },
    ]);
    expect(l.stops).toEqual([
      { x: 0, z: 4 },
      { x: 0, z: 0 },
    ]);
    expect(l.seats).toEqual([{ x: 0, z: 4.6 }]);
    expect(l.cycleSeconds).toBeCloseTo(4 + 10 + 4 + 14);
  });

  it('includes the stretch that closes a loop not ending at its start', () => {
    const open: RoutineDef = { start: { x: 0, z: 0 }, speed: 1, steps: [{ kind: 'walk', path: [{ x: 3, z: 0 }, { x: 3, z: 4 }] }] };
    const l = routineLayout(open);
    expect(l.segments[0]).toEqual({ a: { x: 3, z: 4 }, b: { x: 3, z: 0 } }); // from the loop's end to the first point
    expect(l.cycleSeconds).toBeCloseTo(8);
  });

  it('reports content mistakes', () => {
    expect(validateRoutine(SQUARE)).toEqual([]);
    expect(validateRoutine(BENCH)).toEqual([]);
    expect(validateRoutine({ start: { x: 0, z: 0 }, speed: 1, steps: [] })).not.toEqual([]);
    expect(validateRoutine({ start: { x: 0, z: 0 }, speed: 0, steps: [{ kind: 'walk', path: [{ x: 1, z: 0 }] }] })).not.toEqual([]);
    expect(validateRoutine({ start: { x: 0, z: 0 }, speed: 1, steps: [{ kind: 'wait', seconds: 0 }] })).not.toEqual([]);
    expect(
      validateRoutine({ start: { x: 0, z: 0 }, speed: 1, steps: [{ kind: 'sit', seat: { x: 0, z: 1 }, heading: 0, seconds: MIN_SIT_SECONDS - 0.5 }] }),
    ).not.toEqual([]);
  });
});

describe('phaseFor', () => {
  it('is stable, in 0..1, and differs between ids', () => {
    const ids = ['town_baker', 'town_postman', 'town_florist', 'cat_ginger', 'dog_brown'];
    const phases = ids.map(phaseFor);
    expect(phases).toEqual(ids.map(phaseFor));
    for (const p of phases) {
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThan(1);
    }
    expect(new Set(phases).size).toBe(ids.length);
  });
});
