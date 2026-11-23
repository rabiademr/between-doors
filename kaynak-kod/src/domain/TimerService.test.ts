import { describe, expect, it } from 'vitest';
import { MAX_TICK_SECONDS, TimerService } from './TimerService';

describe('TimerService', () => {
  it('rejects negative frame times (T-02)', () => {
    const t = new TimerService();
    t.start();
    t.tick(0.1);
    t.tick(-5);
    expect(t.seconds).toBeCloseTo(0.1);
  });

  it('does not count before start', () => {
    const t = new TimerService();
    t.tick(0.05);
    expect(t.seconds).toBe(0);
  });

  it('counts only while no pause reason is active; overlapping reasons are not double-subtracted', () => {
    const t = new TimerService();
    t.start();
    t.tick(0.05);
    t.pause('story');
    t.pause('hidden_tab');
    t.tick(0.05);
    t.resume('story');
    t.tick(0.05); // still hidden
    t.resume('hidden_tab');
    t.tick(0.05);
    expect(t.seconds).toBeCloseTo(0.1);
  });

  it('counts slow frames fully (no under-counting on low-fps machines)', () => {
    const t = new TimerService();
    t.start();
    for (let i = 0; i < 5; i++) t.tick(0.2); // 5 fps
    expect(t.seconds).toBeCloseTo(1);
  });

  it('clamps huge frames and stops after stop()', () => {
    const t = new TimerService();
    t.start();
    t.tick(30);
    expect(t.seconds).toBeCloseTo(MAX_TICK_SECONDS);
    t.stop();
    t.tick(0.05);
    expect(t.seconds).toBeCloseTo(MAX_TICK_SECONDS);
  });
});
