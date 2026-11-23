// Controller: the courier's side jobs — what the Relay board offers and what is being carried right now.
// Pure (no Babylon/DOM): GameApp turns its answers into dialogs, toasts and the HUD.
import { generateJobs, JobController, JOB_TUNING, type Address, type Job, type JobResult } from '../domain/jobs/jobs';

export class JobsController {
  private readonly addresses: readonly Address[];
  private readonly origin: { x: number; z: number };
  private carried: JobController[] = [];

  constructor(addresses: readonly Address[], origin: { x: number; z: number }) {
    this.addresses = addresses;
    this.origin = origin;
  }

  /** Jobs in the courier's hands, oldest first. */
  get active(): readonly JobController[] {
    return this.carried;
  }

  /** Doors the courier may knock on right now. */
  get targetIds(): string[] {
    return this.carried.map((c) => c.targetId);
  }

  /** Least time left among the timed jobs in hand (null = none is timed). */
  get soonestRemaining(): number | null {
    const left = this.carried.map((c) => c.remainingSeconds).filter((s): s is number => s !== null);
    return left.length > 0 ? Math.min(...left) : null;
  }

  /** True while at least one parcel is really in the courier's hands (not with the Magpies). */
  get holdingParcel(): boolean {
    return this.carried.some((c) => !c.parcelStolen);
  }

  /**
   * Today's offers. The board refreshes whenever a job has been paid (`batch` = jobs completed so far);
   * jobs already taken or already paid are not offered again.
   */
  offers(day: number, batch: number, settledJobIds: readonly string[]): Job[] {
    const taken = new Set([...this.carried.map((c) => c.job.id), ...settledJobIds]);
    return generateJobs(day, batch, this.addresses, this.origin).filter((j) => !taken.has(j.id));
  }

  /** @returns the new job in hand, or null when the courier's hands are full. */
  take(job: Job, capacity: number): JobController | null {
    if (this.carried.length >= capacity || this.carried.some((c) => c.job.id === job.id)) return null;
    const c = new JobController(job);
    this.carried.push(c);
    return c;
  }

  /**
   * The job in hand that this door belongs to (its current target). Two jobs can share a door (a redirect's
   * second address, a new batch): the one whose parcel is really in hand answers before one the Magpies took.
   */
  forDoor(spotId: string): JobController | undefined {
    const here = this.carried.filter((c) => c.targetId === spotId);
    return here.find((c) => !c.parcelStolen) ?? here[0];
  }

  /** Advance the clocks. @returns jobs that ran out of time on this tick (already removed). */
  tick(dt: number): JobResult[] {
    const late: JobResult[] = [];
    for (const c of this.carried) if (c.tick(dt)) late.push(c.result());
    if (late.length > 0) this.carried = this.carried.filter((c) => c.phase === 'CARRYING');
    return late;
  }

  /** Wear on fragile parcels: running on foot, and hard bumps on two wheels. */
  shake(dt: number, runningOnFoot: boolean, bumped: boolean): void {
    const amount = (runningOnFoot ? JOB_TUNING.runDamagePerSecond * dt : 0) + (bumped ? JOB_TUNING.bumpDamage : 0);
    if (amount > 0) for (const c of this.carried) c.damage(amount);
  }

  deliver(c: JobController): JobResult {
    const result = c.deliver();
    this.carried = this.carried.filter((x) => x !== c);
    return result;
  }

  /** Drop everything in hand without pay (the profile was reset). */
  clear(): void {
    for (const c of this.carried) c.abandon();
    this.carried = [];
  }

  abandon(c: JobController): JobResult {
    const result = c.abandon();
    this.carried = this.carried.filter((x) => x !== c);
    return result;
  }
}
