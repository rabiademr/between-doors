import { describe, expect, it } from 'vitest';
import { JobsController } from '../app/JobsController';
import { generateJobs } from '../domain/jobs/jobs';
import { JOB_ADDRESSES, JOB_BOARD_AT, JOB_BOARD_ID, JOB_RULES, addressDistrict, addressName } from './jobs';
import { BELLWICK } from './world';

describe('job board content', () => {
  it('has a board at Relay and named doors in every outer district', () => {
    expect(BELLWICK.spots.some((s) => s.id === JOB_BOARD_ID && s.kind === 'board')).toBe(true);
    expect(Math.hypot(JOB_BOARD_AT.x + 4.35, JOB_BOARD_AT.z + 10.6)).toBeLessThan(3);
    expect(JOB_ADDRESSES.length).toBeGreaterThanOrEqual(20);
    for (const district of ['market-hill', 'canal-side', 'railway-yard', 'hillside-park']) {
      expect(JOB_ADDRESSES.filter((a) => a.district === district).length, district).toBeGreaterThanOrEqual(3);
    }
    const names = JOB_ADDRESSES.map((a) => addressName(a.id));
    expect(new Set(names).size).toBe(names.length);
    for (const a of JOB_ADDRESSES) {
      expect(addressName(a.id), a.id).not.toBe(a.id); // every door has a name for the note
      expect(addressDistrict(a.id), a.id).not.toBe('');
    }
  });

  it('routes E on the board and on every door to the job calls', () => {
    expect(JOB_RULES[0]).toEqual({ on: { interact: JOB_BOARD_ID }, do: [{ call: 'jobs.open' }] });
    for (const a of JOB_ADDRESSES) {
      expect(JOB_RULES.some((r) => 'interact' in r.on && r.on.interact === a.id && r.do.some((e) => 'call' in e && e.call === 'job.checkTarget'))).toBe(true);
    }
  });
});

describe('JobsController', () => {
  const make = () => new JobsController(JOB_ADDRESSES, JOB_BOARD_AT);
  const offers = generateJobs(1, 0, JOB_ADDRESSES, JOB_BOARD_AT);

  it('offers four jobs, hides the ones taken or already paid, and refreshes after a delivery', () => {
    const jobs = make();
    expect(jobs.offers(1, 0, [])).toHaveLength(4);
    const c = jobs.take(offers[0]!, 1);
    expect(c).not.toBeNull();
    expect(jobs.offers(1, 0, []).map((j) => j.id)).not.toContain(offers[0]!.id);
    expect(jobs.offers(1, 0, [offers[1]!.id]).map((j) => j.id)).not.toContain(offers[1]!.id);
    expect(jobs.offers(1, 1, [])).not.toEqual(offers);
  });

  it('carries one job, or two with the Bag, and only opens the doors of jobs in hand', () => {
    const jobs = make();
    expect(jobs.targetIds).toEqual([]);
    const first = jobs.take(offers[0]!, 1)!;
    expect(jobs.take(offers[1]!, 1)).toBeNull();
    expect(jobs.take(offers[1]!, 2)).not.toBeNull();
    expect(jobs.take(offers[1]!, 2)).toBeNull(); // not twice
    expect(jobs.targetIds).toEqual([offers[0]!.dropoffId, offers[1]!.dropoffId]);
    expect(jobs.forDoor(offers[0]!.dropoffId)).toBe(first);
    jobs.deliver(first);
    expect(jobs.active).toHaveLength(1);
    expect(jobs.holdingParcel).toBe(true);
  });

  it('at a door two jobs share, the parcel still in hand answers before a stolen one', () => {
    const jobs = make();
    const stolen = jobs.take(offers[0]!, 2)!;
    const inHand = jobs.take({ ...offers[1]!, dropoffId: offers[0]!.dropoffId, redirectId: undefined }, 2)!;
    stolen.setStolen(true);
    expect(jobs.forDoor(offers[0]!.dropoffId)).toBe(inHand);
    inHand.setStolen(true);
    expect(jobs.forDoor(offers[0]!.dropoffId)).toBe(stolen); // nothing in hand: the door still says so
  });

  it('clear() empties the hands without a paid result', () => {
    const jobs = make();
    const c = jobs.take(offers[0]!, 1)!;
    jobs.clear();
    expect(jobs.active).toHaveLength(0);
    expect(c.phase).not.toBe('CARRYING');
    expect(jobs.offers(1, 0, []).some((j) => j.id === offers[0]!.id)).toBe(true);
  });

  it('drops a timed job when its clock runs out and reports it once', () => {
    const jobs = make();
    const timed = offers.find((j) => j.kind === 'timed')!;
    jobs.take(timed, 1);
    expect(jobs.soonestRemaining).toBe(timed.deadlineSeconds);
    expect(jobs.tick(timed.deadlineSeconds! - 1)).toEqual([]);
    const late = jobs.tick(2);
    expect(late).toHaveLength(1);
    expect(late[0]).toMatchObject({ delivered: false, failure: 'late' });
    expect(jobs.active).toHaveLength(0);
    expect(jobs.soonestRemaining).toBeNull();
  });

  it('wears a fragile parcel when the courier runs or bumps, not when walking', () => {
    const jobs = make();
    const c = jobs.take(offers.find((j) => j.kind === 'fragile')!, 1)!;
    jobs.shake(2, false, false);
    expect(c.condition).toBe(100);
    jobs.shake(2, true, false);
    expect(c.condition).toBeLessThan(100);
    const before = c.condition;
    jobs.shake(0.016, false, true);
    expect(c.condition).toBeLessThan(before - 5);
  });
});
