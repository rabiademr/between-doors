// Model: active mission time. Time only runs while the pause-reason set is empty.
// Overlapping reasons (e.g. story + hidden tab) are never subtracted twice — it's a set.

export type PauseReason = 'menu' | 'story' | 'hidden_tab' | 'meeting_wait';

/**
 * A single frame longer than this is clamped, so one lag spike can't add seconds.
 * 0.25 s keeps slow machines (down to 4 fps) counting real time; hidden tabs use the 'hidden_tab' reason.
 */
export const MAX_TICK_SECONDS = 0.25;

export class TimerService {
  private elapsed = 0;
  private running = false;
  private readonly reasons = new Set<PauseReason>();

  start(): void {
    this.running = true;
  }

  stop(): void {
    this.running = false;
  }

  pause(reason: PauseReason): void {
    this.reasons.add(reason);
  }

  resume(reason: PauseReason): void {
    this.reasons.delete(reason);
  }

  get isTicking(): boolean {
    return this.running && this.reasons.size === 0;
  }

  tick(dtSeconds: number): void {
    if (!this.isTicking) return;
    this.elapsed += Math.min(Math.max(dtSeconds, 0), MAX_TICK_SECONDS);
  }

  get seconds(): number {
    return this.elapsed;
  }
}
