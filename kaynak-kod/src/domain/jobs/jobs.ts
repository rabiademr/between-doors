// Model: side jobs from the Relay board — which jobs are on offer, what happens while one is carried,
// and how it is paid. Pure: no Babylon, no DOM, no text (wording lives in content/jobs.ts and i18n).
//
// A job is a parcel taken at the board and carried to an address. Kinds:
//   plain    — no rush.
//   timed    — a countdown; late = failed, no pay.
//   fragile  — bumps and running wear the parcel down; a battered parcel pays less.
//   redirect — the first address is wrong: a note on the door sends the courier on to a second one.
import { SETTLED_JOBS_KEPT, type Profile } from '../Profile';

export type JobKind = 'plain' | 'timed' | 'fragile' | 'redirect';
export const JOB_KINDS: readonly JobKind[] = ['plain', 'timed', 'fragile', 'redirect'];

/** A door a parcel can go to (a `spot` of kind `address` in the map data). */
export interface Address {
  id: string;
  x: number;
  z: number;
  /** District id the door is in. */
  district: string;
}

export interface Job {
  id: string;
  kind: JobKind;
  /** Where the note says to go. For `redirect` this is the wrong door. */
  dropoffId: string;
  /** `redirect` only: where the parcel really belongs. */
  redirectId?: string;
  /** Walking distance estimate, metres (board → door, plus door → door for a redirect). */
  distance: number;
  payout: number;
  /** `timed` only. */
  deadlineSeconds?: number;
}

/** First values; balanced in F6. */
export const JOB_TUNING = {
  basePay: 20,
  payPerMetre: 0.22,
  kindBonus: { plain: 1, timed: 1.3, fragile: 1.4, redirect: 1.25 } as Record<JobKind, number>,
  /** Deadline: a head start plus the trip at a brisk walk (running or riding beats it comfortably). */
  deadlineBase: 25,
  deadlineSpeed: 3.2,
  /** A fragile parcel starts at 100; pay scales with its condition but never below this share. */
  fragileFloor: 0.4,
  /** Condition lost per hard bump, and per second of running on foot. */
  bumpDamage: 12,
  runDamagePerSecond: 2.5,
} as const;

/** Deterministic PRNG (mulberry32): the same day and batch always offer the same jobs. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const round5 = (n: number): number => Math.max(5, Math.round(n / 5) * 5);
/** Streets are a grid: the walk is closer to the Manhattan distance than to a straight line. */
const walk = (a: { x: number; z: number }, b: { x: number; z: number }): number => Math.abs(a.x - b.x) + Math.abs(a.z - b.z);

/**
 * The board's offers. `batch` changes whenever the board should refresh (jobs done so far), `day` is the
 * courier's story day. Every offer goes to a different door, and the kinds are mixed.
 * @param origin where the board hangs
 */
export function generateJobs(day: number, batch: number, addresses: readonly Address[], origin: { x: number; z: number }, count = 4): Job[] {
  if (addresses.length === 0) return [];
  const rnd = seededRandom(day * 7919 + batch * 104729 + 17);
  const pick = <T>(list: readonly T[]): T => list[Math.floor(rnd() * list.length)]!;
  const pool = [...addresses];
  const kinds = [...JOB_KINDS].sort(() => rnd() - 0.5);
  const jobs: Job[] = [];
  for (let i = 0; i < count && pool.length > 0; i++) {
    const kind = kinds[i % kinds.length]!;
    const [door] = pool.splice(Math.floor(rnd() * pool.length), 1) as [Address];
    let distance = walk(origin, door);
    const job: Job = { id: `d${day}-b${batch}-${i}`, kind, dropoffId: door.id, distance: 0, payout: 0 };
    if (kind === 'redirect') {
      // The right door is another one in the same district when there is one (a neighbour misread the label).
      const near = pool.filter((a) => a.district === door.district);
      const second = pick(near.length > 0 ? near : pool.length > 0 ? pool : [door]);
      if (second.id === door.id) job.kind = 'plain';
      else {
        job.redirectId = second.id;
        distance += walk(door, second);
      }
    }
    job.distance = Math.round(distance);
    job.payout = round5((JOB_TUNING.basePay + distance * JOB_TUNING.payPerMetre) * JOB_TUNING.kindBonus[job.kind]);
    if (job.kind === 'timed') job.deadlineSeconds = Math.round(JOB_TUNING.deadlineBase + distance / JOB_TUNING.deadlineSpeed);
    jobs.push(job);
  }
  return jobs;
}

export type JobPhase = 'CARRYING' | 'DELIVERED' | 'FAILED';
export type JobCheck =
  | { kind: 'correct' }
  /** The wrong door of a redirect job: the note sends the courier on. */
  | { kind: 'redirected'; toId: string }
  | { kind: 'wrong' }
  /** The Magpies have the parcel. */
  | { kind: 'no-parcel' }
  | { kind: 'over' };

export interface JobResult {
  jobId: string;
  kind: JobKind;
  delivered: boolean;
  /** Why it failed (undefined when delivered). */
  failure?: 'late' | 'abandoned';
  payout: number;
  seconds: number;
  /** 0–100; always 100 unless fragile. */
  condition: number;
}

/** One job in the courier's hands, from taking it at the board to the door (or the deadline). */
export class JobController {
  readonly job: Job;
  private _phase: JobPhase = 'CARRYING';
  private elapsed = 0;
  private _condition = 100;
  private redirected = false;
  private stolen = false;
  private failure: 'late' | 'abandoned' | undefined;

  constructor(job: Job) {
    this.job = job;
  }

  get phase(): JobPhase {
    return this._phase;
  }
  get seconds(): number {
    return this.elapsed;
  }
  get condition(): number {
    return this._condition;
  }
  /** The door the courier should be heading for right now (as far as they know). */
  get targetId(): string {
    return this.redirected && this.job.redirectId ? this.job.redirectId : this.job.dropoffId;
  }
  /** True once the note on the first door has been read. */
  get isRedirected(): boolean {
    return this.redirected;
  }
  get parcelStolen(): boolean {
    return this.stolen;
  }
  /** Seconds left on a timed job (null = no deadline). */
  get remainingSeconds(): number | null {
    return this.job.deadlineSeconds === undefined ? null : Math.max(0, this.job.deadlineSeconds - this.elapsed);
  }
  /** What the job pays if it were handed over now. */
  get currentPayout(): number {
    if (this.job.kind !== 'fragile') return this.job.payout;
    return round5(this.job.payout * Math.max(JOB_TUNING.fragileFloor, this._condition / 100));
  }

  /** @returns true if the deadline passed on this tick (the job has just failed). */
  tick(dt: number): boolean {
    if (this._phase !== 'CARRYING') return false;
    this.elapsed += Math.max(0, dt);
    if (this.job.deadlineSeconds !== undefined && this.elapsed >= this.job.deadlineSeconds) {
      this._phase = 'FAILED';
      this.failure = 'late';
      return true;
    }
    return false;
  }

  /** Wear on a fragile parcel (ignored for other kinds, and while the Magpies have it). */
  damage(amount: number): void {
    if (this._phase !== 'CARRYING' || this.job.kind !== 'fragile' || this.stolen) return;
    this._condition = Math.max(0, this._condition - Math.max(0, amount));
  }

  setStolen(stolen: boolean): void {
    if (this._phase === 'CARRYING') this.stolen = stolen;
  }

  /** E on an address. A `correct` answer does not deliver yet: call `deliver()` when the courier confirms. */
  checkTarget(id: string): JobCheck {
    if (this._phase !== 'CARRYING') return { kind: 'over' };
    if (this.stolen) return { kind: 'no-parcel' };
    if (this.job.redirectId && !this.redirected) {
      if (id !== this.job.dropoffId) return { kind: 'wrong' };
      this.redirected = true;
      return { kind: 'redirected', toId: this.job.redirectId };
    }
    return id === this.targetId ? { kind: 'correct' } : { kind: 'wrong' };
  }

  deliver(): JobResult {
    if (this._phase === 'CARRYING') this._phase = 'DELIVERED';
    return this.result();
  }

  /** The courier gives the job up (back at the board, or a story delivery starts). */
  abandon(): JobResult {
    if (this._phase === 'CARRYING') {
      this._phase = 'FAILED';
      this.failure = 'abandoned';
    }
    return this.result();
  }

  result(): JobResult {
    const delivered = this._phase === 'DELIVERED';
    return {
      jobId: this.job.id,
      kind: this.job.kind,
      delivered,
      ...(this.failure ? { failure: this.failure } : {}),
      payout: delivered ? this.currentPayout : 0,
      seconds: this.elapsed,
      condition: this._condition,
    };
  }
}

export interface JobSettlement {
  profile: Profile;
  /** false if this job was already paid, or nothing was delivered (nothing changed). */
  applied: boolean;
  creditsAwarded: number;
}

/** Pays a delivered job once. Returns a NEW profile (the input is never mutated). */
export function settleJob(profile: Profile, result: JobResult): JobSettlement {
  if (!result.delivered || profile.settledJobIds.includes(result.jobId)) return { profile, applied: false, creditsAwarded: 0 };
  const creditsAwarded = Math.max(0, Math.round(result.payout));
  return {
    profile: {
      ...profile,
      credits: profile.credits + creditsAwarded,
      jobsCompleted: profile.jobsCompleted + 1,
      dayJobs: profile.dayJobs + 1,
      dayEarnings: profile.dayEarnings + creditsAwarded,
      settledJobIds: [...profile.settledJobIds, result.jobId].slice(-SETTLED_JOBS_KEPT),
    },
    applied: true,
    creditsAwarded,
  };
}

/** How many jobs the courier can carry at once (the Bag skill doubles it). */
export const jobCapacity = (hasBag: boolean): number => (hasBag ? 2 : 1);
