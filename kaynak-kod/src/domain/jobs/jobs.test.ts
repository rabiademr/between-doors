import { describe, expect, it } from 'vitest';
import { emptyProfile, SETTLED_JOBS_KEPT } from '../Profile';
import { generateJobs, JOB_KINDS, JOB_TUNING, JobController, jobCapacity, settleJob, type Address, type Job } from './jobs';

const ORIGIN = { x: -4, z: -11 };
const ADDRESSES: Address[] = [
  { id: 'a1', x: 10, z: 60, district: 'market-hill' },
  { id: 'a2', x: -20, z: 70, district: 'market-hill' },
  { id: 'a3', x: 70, z: 10, district: 'canal-side' },
  { id: 'a4', x: 100, z: -20, district: 'canal-side' },
  { id: 'a5', x: 8, z: -50, district: 'railway-yard' },
  { id: 'a6', x: -60, z: 90, district: 'hillside-park' },
];
const job = (over: Partial<Job> = {}): Job => ({ id: 'j', kind: 'plain', dropoffId: 'a1', distance: 100, payout: 40, ...over });

describe('job board', () => {
  it('offers the same jobs for the same day and batch, and different ones after a refresh', () => {
    const a = generateJobs(2, 5, ADDRESSES, ORIGIN);
    expect(generateJobs(2, 5, ADDRESSES, ORIGIN)).toEqual(a);
    expect(generateJobs(2, 6, ADDRESSES, ORIGIN)).not.toEqual(a);
    expect(a).toHaveLength(4);
  });

  it('mixes the kinds, sends every job to a different door and pays more for longer trips', () => {
    for (let batch = 0; batch < 20; batch++) {
      const jobs = generateJobs(1, batch, ADDRESSES, ORIGIN);
      expect(new Set(jobs.map((j) => j.kind)).size, `batch ${batch}`).toBe(4);
      expect(new Set(jobs.map((j) => j.dropoffId)).size).toBe(jobs.length);
      expect(new Set(jobs.map((j) => j.id)).size).toBe(jobs.length);
      for (const j of jobs) {
        expect(JOB_KINDS).toContain(j.kind);
        expect(j.payout % 5).toBe(0);
        expect(j.payout).toBeGreaterThanOrEqual(JOB_TUNING.basePay);
        expect(j.deadlineSeconds !== undefined).toBe(j.kind === 'timed');
        expect(j.redirectId !== undefined).toBe(j.kind === 'redirect');
        if (j.redirectId) expect(j.redirectId).not.toBe(j.dropoffId);
        // A deadline you can make at a brisk walk.
        if (j.deadlineSeconds) expect(j.deadlineSeconds).toBeGreaterThan(j.distance / 3.5);
      }
    }
    const near = generateJobs(1, 0, [ADDRESSES[0]!], ORIGIN, 1)[0]!;
    const far = generateJobs(1, 0, [{ ...ADDRESSES[0]!, x: 140, z: 110 }], ORIGIN, 1)[0]!;
    expect(far.payout).toBeGreaterThan(near.payout);
  });

  it('copes with too few doors', () => {
    expect(generateJobs(1, 0, [], ORIGIN)).toEqual([]);
    const one = generateJobs(1, 3, [ADDRESSES[0]!], ORIGIN);
    expect(one).toHaveLength(1);
    expect(one[0]!.redirectId).toBeUndefined(); // nowhere to redirect to
  });
});

describe('carrying a job', () => {
  it('delivers at the right door only, and pays in full', () => {
    const c = new JobController(job());
    expect(c.checkTarget('a2')).toEqual({ kind: 'wrong' });
    expect(c.checkTarget('a1')).toEqual({ kind: 'correct' });
    expect(c.phase).toBe('CARRYING'); // not yet: the courier confirms
    c.tick(12);
    const r = c.deliver();
    expect(r).toMatchObject({ delivered: true, payout: 40, seconds: 12, condition: 100 });
    expect(c.checkTarget('a1')).toEqual({ kind: 'over' });
    expect(c.deliver()).toEqual(r); // idempotent
  });

  it('fails a timed job when the clock runs out, and pays nothing', () => {
    const c = new JobController(job({ kind: 'timed', deadlineSeconds: 30 }));
    expect(c.tick(10)).toBe(false);
    expect(c.remainingSeconds).toBe(20);
    expect(c.tick(20)).toBe(true);
    expect(c.phase).toBe('FAILED');
    expect(c.tick(5)).toBe(false); // reported once
    expect(c.result()).toMatchObject({ delivered: false, failure: 'late', payout: 0 });
    expect(new JobController(job()).remainingSeconds).toBeNull();
  });

  it('pays less for a battered fragile parcel, but never below the floor; other kinds do not wear', () => {
    const c = new JobController(job({ kind: 'fragile', payout: 100 }));
    c.damage(30);
    expect(c.condition).toBe(70);
    expect(c.currentPayout).toBe(70);
    c.damage(500);
    expect(c.condition).toBe(0);
    expect(c.deliver().payout).toBe(100 * JOB_TUNING.fragileFloor);
    const plain = new JobController(job());
    plain.damage(50);
    expect(plain.condition).toBe(100);
  });

  it('sends the courier on from the wrong door of a redirect job', () => {
    const c = new JobController(job({ kind: 'redirect', redirectId: 'a2' }));
    expect(c.targetId).toBe('a1');
    expect(c.checkTarget('a2')).toEqual({ kind: 'wrong' }); // nobody told them yet
    expect(c.checkTarget('a1')).toEqual({ kind: 'redirected', toId: 'a2' });
    expect(c.targetId).toBe('a2');
    expect(c.checkTarget('a1')).toEqual({ kind: 'wrong' });
    expect(c.checkTarget('a2')).toEqual({ kind: 'correct' });
  });

  it('cannot be delivered while the Magpies have the parcel', () => {
    const c = new JobController(job({ kind: 'fragile' }));
    c.setStolen(true);
    expect(c.checkTarget('a1')).toEqual({ kind: 'no-parcel' });
    c.damage(40);
    expect(c.condition).toBe(100); // not in the courier's hands
    c.setStolen(false);
    expect(c.checkTarget('a1')).toEqual({ kind: 'correct' });
  });

  it('can be given up', () => {
    const c = new JobController(job());
    expect(c.abandon()).toMatchObject({ delivered: false, failure: 'abandoned', payout: 0 });
  });
});

describe('job pay', () => {
  it('pays a delivered job once and counts it', () => {
    const c = new JobController(job({ id: 'd1-b0-0', payout: 45 }));
    const result = c.deliver();
    const first = settleJob(emptyProfile(), result);
    expect(first).toMatchObject({ applied: true, creditsAwarded: 45 });
    expect(first.profile).toMatchObject({ credits: 45, jobsCompleted: 1, settledJobIds: ['d1-b0-0'] });
    const again = settleJob(first.profile, result);
    expect(again.applied).toBe(false);
    expect(again.profile).toBe(first.profile);
  });

  it('pays nothing for a failed job and keeps the history short', () => {
    const failed = new JobController(job()).abandon();
    expect(settleJob(emptyProfile(), failed).applied).toBe(false);
    let p = emptyProfile();
    for (let i = 0; i < SETTLED_JOBS_KEPT + 5; i++) p = settleJob(p, new JobController(job({ id: `j${i}` })).deliver()).profile;
    expect(p.settledJobIds).toHaveLength(SETTLED_JOBS_KEPT);
    expect(p.jobsCompleted).toBe(SETTLED_JOBS_KEPT + 5);
  });

  it('lets a courier with the Bag carry two', () => {
    expect([jobCapacity(false), jobCapacity(true)]).toEqual([1, 2]);
  });
});
