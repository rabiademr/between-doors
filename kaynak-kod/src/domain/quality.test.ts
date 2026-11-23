import { describe, expect, it } from 'vitest';
import { FPS_PROBE, FpsProbe, isQualitySetting, levelOf } from './quality';

const feed = (probe: FpsProbe, fps: number, seconds: number) => {
  let last: ReturnType<FpsProbe['add']> = null;
  for (let t = 0; t < seconds; t += 1 / fps) last = probe.add(1 / fps) ?? last;
  return last;
};

describe('graphics quality', () => {
  it('auto draws high until it has decided', () => {
    expect(levelOf('auto')).toBe('high');
    expect(levelOf('high')).toBe('high');
    expect(levelOf('low')).toBe('low');
    expect(isQualitySetting('low')).toBe(true);
    expect(isQualitySetting('ultra')).toBe(false);
  });

  it('a smooth machine stays on high, a slow one goes low, after a few seconds of play', () => {
    expect(feed(new FpsProbe(), 60, FPS_PROBE.seconds - 0.5)).toBeNull();
    expect(feed(new FpsProbe(), 60, FPS_PROBE.seconds + 0.1)).toBe('high');
    expect(feed(new FpsProbe(), 25, FPS_PROBE.seconds + 0.1)).toBe('low');
  });

  it('a throttled or hidden tab (very long frames) never decides', () => {
    expect(feed(new FpsProbe(), 1, 60)).toBeNull();
  });
});
