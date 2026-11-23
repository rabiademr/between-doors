import { describe, expect, it } from 'vitest';
import { CHASE_TUNING, Thief, type Courier, type ThiefDef, type ThiefEvent } from './chase';

const DEF: ThiefDef = {
  id: 't',
  ambush: { x: 0, z: 0 },
  route: [
    { x: 0, z: -2 },
    { x: 0, z: -40 },
    { x: 30, z: -40 },
    { x: 30, z: -60 },
  ],
};
const DT = 1 / 60;

/** Step until `stop` (or the time runs out); returns every event seen. */
function run(thief: Thief, courier: () => Courier, seconds: number, stop?: (events: ThiefEvent[]) => boolean): ThiefEvent[] {
  const seen: ThiefEvent[] = [];
  for (let t = 0; t < seconds; t += DT) {
    const events = thief.update(DT, courier());
    seen.push(...events);
    if (stop?.(events)) break;
  }
  return seen;
}

function snatch(thief: Thief, courier: Courier): void {
  const seen = run(thief, () => courier, 5, (e) => e.includes('snatched'));
  expect(seen).toEqual(['snatched']);
  expect(thief.state).toBe('fleeing');
}

describe('Thief', () => {
  it('lurks until a carrying courier comes within the ambush radius', () => {
    const thief = new Thief(DEF);
    run(thief, () => ({ x: CHASE_TUNING.ambushRadius + 1, z: 0, carrying: true }), 2);
    expect(thief.state).toBe('lurking');
    expect([thief.x, thief.z, thief.moving]).toEqual([0, 0, false]);
    thief.update(DT, { x: CHASE_TUNING.ambushRadius - 1, z: 0, carrying: true });
    expect(thief.state).toBe('approaching');
  });

  it('never strikes a courier who is not carrying', () => {
    const thief = new Thief(DEF);
    const seen = run(thief, () => ({ x: 2, z: 0, carrying: false }), 5);
    expect(seen).toEqual([]);
    expect(thief.state).toBe('lurking');
  });

  it('gives up when the parcel is gone before it arrives, and strolls back', () => {
    const thief = new Thief(DEF);
    thief.update(DT, { x: 8, z: 0, carrying: true });
    run(thief, () => ({ x: 8, z: 0, carrying: true }), 0.3);
    expect(thief.state).toBe('approaching');
    expect(thief.x).toBeGreaterThan(1);
    const seen = run(thief, () => ({ x: 8, z: 0, carrying: false }), 6);
    expect(seen).toEqual([]);
    expect(thief.state).toBe('lurking');
    expect(Math.hypot(thief.x, thief.z)).toBeLessThan(1e-6);
  });

  it('happy path: snatch → chase → grab → the thief runs off and lurks again after the cooldown', () => {
    const thief = new Thief(DEF);
    const courier = { x: 0, z: 6, carrying: true };
    snatch(thief, courier);
    expect(thief.hasParcel).toBe(true);
    expect(Math.hypot(thief.x - courier.x, thief.z - courier.z)).toBeCloseTo(CHASE_TUNING.snatchReach, 3);

    // The courier no longer carries; the thief stumbles, then runs.
    courier.carrying = false;
    const at = { x: thief.x, z: thief.z };
    run(thief, () => courier, CHASE_TUNING.stumbleSeconds - 0.1);
    expect([thief.x, thief.z]).toEqual([at.x, at.z]);
    run(thief, () => courier, 2);
    expect(thief.moving).toBe(true);
    expect(thief.z).toBeLessThan(-2);

    // Too far: no grab. Close: grab.
    expect(thief.canGrab(courier)).toBe(false);
    courier.x = thief.x;
    courier.z = thief.z + 1.2;
    expect(thief.canGrab(courier)).toBe(true);
    expect(thief.grab()).toBe('recovered');
    expect(thief.state).toBe('beaten');
    expect(thief.hasParcel).toBe(false);
    expect(thief.grab()).toBeNull();

    // Empty-handed it never reports the den, never strikes during the cooldown (even with a parcel next to it).
    courier.carrying = true;
    const seen = run(thief, () => ({ x: thief.x, z: thief.z + 1, carrying: true }), CHASE_TUNING.cooldownSeconds - 1);
    expect(seen).toEqual([]);
    expect(thief.state).toBe('beaten');
    expect([thief.x, thief.z]).toEqual([30, -60]);
    run(thief, () => ({ x: 100, z: 100, carrying: true }), 2);
    expect(thief.state).toBe('lurking');
    expect([thief.x, thief.z]).toEqual([0, 0]);
  });

  it('den path: snatch → reaches the den → the parcel waits in the crate → taken back', () => {
    const thief = new Thief(DEF);
    const courier = { x: 3, z: 0, carrying: true };
    snatch(thief, courier);
    courier.carrying = false;
    expect(thief.takeFromCrate()).toBe(false);
    const seen = run(thief, () => courier, 60, (e) => e.includes('reachedDen'));
    expect(seen).toEqual(['reachedDen']);
    expect(thief.state).toBe('atDen');
    expect(thief.parcelInCrate).toBe(true);
    expect(thief.hasParcel).toBe(false);
    expect([thief.x, thief.z]).toEqual([30, -60]);
    expect(thief.canGrab({ x: 30, z: -60 })).toBe(false);
    expect(run(thief, () => courier, 5)).toEqual([]);

    expect(thief.takeFromCrate()).toBe(true);
    expect(thief.parcelInCrate).toBe(false);
    expect(thief.takeFromCrate()).toBe(false);
    run(thief, () => courier, CHASE_TUNING.cooldownSeconds + 1);
    expect(thief.state).toBe('lurking');
  });

  it('waits out the cooldown before striking again (also after a reset)', () => {
    expect(CHASE_TUNING.cooldownSeconds).toBeGreaterThanOrEqual(60);
    const thief = new Thief(DEF);
    const courier = { x: 0, z: 4, carrying: true };
    snatch(thief, courier);
    thief.reset(); // the stolen job ended
    expect(thief.state).toBe('lurking');
    expect([thief.x, thief.z]).toEqual([0, 0]);
    const early = run(thief, () => courier, CHASE_TUNING.cooldownSeconds - 1);
    expect(early).toEqual([]);
    expect(thief.state).toBe('lurking');
    const late = run(thief, () => courier, 5, (e) => e.includes('snatched'));
    expect(late).toEqual(['snatched']);
  });

  it('flee leg: one large dt equals many small ones', () => {
    const a = new Thief(DEF);
    const b = new Thief(DEF);
    const courier = { x: 0, z: 5, carrying: true };
    snatch(a, courier);
    snatch(b, courier);
    courier.carrying = false;
    const seconds = 9; // past the stumble and round the first corner
    a.update(seconds, courier);
    for (let i = 0; i < 900; i++) b.update(seconds / 900, courier);
    expect(a.x).toBeCloseTo(b.x, 4);
    expect(a.z).toBeCloseTo(b.z, 4);
    // 4 m back to the ambush side + 2 + 38 down the first two legs, the rest along the third.
    const ran = (seconds - CHASE_TUNING.stumbleSeconds) * CHASE_TUNING.fleeSpeed;
    expect(a.z).toBeCloseTo(-40, 6);
    expect(a.x).toBeCloseTo(ran - (4 + 2 + 38), 4);
  });

  it('is faster than a courier on foot but loses the stumble', () => {
    expect(CHASE_TUNING.fleeSpeed).toBeGreaterThan(6);
    expect(CHASE_TUNING.approachSpeed).toBeGreaterThan(CHASE_TUNING.fleeSpeed);
    expect(CHASE_TUNING.grabReach).toBeGreaterThan(CHASE_TUNING.snatchReach);
    // During the stumble the thief stands within reach of the courier it just robbed.
    const thief = new Thief(DEF);
    const courier = { x: 0, z: 6, carrying: true };
    snatch(thief, courier);
    expect(thief.canGrab(courier)).toBe(true);
  });
});

describe('story thief', () => {
  const STORY: ThiefDef = { ...DEF, id: 's', story: true };
  const near: Courier = { x: 0, z: 3, carrying: true };

  it('never strikes until the story arms it, then at once (no cooldown)', () => {
    const thief = new Thief(STORY);
    expect(run(thief, () => near, 5)).toEqual([]);
    expect(thief.state).toBe('lurking');
    thief.arm('snatch');
    snatch(thief, near);
  });

  it('snatch mode: caught like any thief, and strikes only once', () => {
    const thief = new Thief(STORY);
    thief.arm('snatch');
    snatch(thief, near);
    expect(thief.canGrab({ x: thief.x, z: thief.z })).toBe(true);
    expect(thief.grab()).toBe('recovered');
    expect(thief.mode).toBeNull();
    // Back at its post later: harmless.
    run(thief, () => ({ x: 100, z: 100, carrying: false }), CHASE_TUNING.cooldownSeconds + 30);
    expect(thief.state).toBe('lurking');
    expect(run(thief, () => near, 5)).toEqual([]);
  });

  it('lead mode: cannot be caught, waits for a courier who falls behind, and reaches the den with them', () => {
    const thief = new Thief(STORY);
    thief.arm('lead');
    snatch(thief, near);
    expect(thief.canGrab({ x: thief.x, z: thief.z })).toBe(false);
    expect(thief.grab()).toBeNull();
    // A courier standing still: the thief goes ahead, then waits about leadGap away.
    run(thief, () => ({ x: 0, z: 3, carrying: false }), 4);
    const waitedAt = { x: thief.x, z: thief.z };
    expect(Math.hypot(waitedAt.x, waitedAt.z - 3)).toBeGreaterThan(CHASE_TUNING.leadGap - 0.5);
    run(thief, () => ({ x: 0, z: 3, carrying: false }), 2);
    expect(thief.x).toBeCloseTo(waitedAt.x, 6);
    expect(thief.z).toBeCloseTo(waitedAt.z, 6);
    // A courier who keeps a few metres behind is led all the way.
    const seen = run(thief, () => ({ x: thief.x, z: thief.z + 4, carrying: false }), 60, (e) => e.includes('reachedDen'));
    expect(seen).toEqual(['reachedDen']);
    expect(thief.parcelInCrate).toBe(true);
  });

  it('lead mode: a courier out of sight for too long loses the thief (it resets, still armed)', () => {
    const thief = new Thief(STORY);
    thief.arm('lead');
    snatch(thief, near);
    const seen = run(thief, () => ({ x: 200, z: 200, carrying: false }), CHASE_TUNING.loseSeconds + 1, (e) => e.includes('lost'));
    expect(seen).toEqual(['lost']);
    expect(thief.state).toBe('lurking');
    expect(thief.mode).toBe('lead');
    // Back at its ambush it does not snatch again at once, even with the courier right there…
    expect(run(thief, () => near, CHASE_TUNING.relurkSeconds - 0.5)).toEqual([]);
    expect(thief.state).toBe('lurking');
    // …only after the short wait.
    expect(run(thief, () => near, 5, (e) => e.includes('snatched'))).toEqual(['snatched']);
  });

  it('disarm stands it down; gang thieves ignore arm', () => {
    const thief = new Thief(STORY);
    thief.arm('snatch');
    thief.disarm();
    expect(run(thief, () => near, 5)).toEqual([]);
    const gang = new Thief(DEF);
    gang.arm('lead');
    expect(gang.mode).toBeNull();
  });
});
