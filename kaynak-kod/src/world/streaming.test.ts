import { describe, expect, it } from 'vitest';
import { STREAM_BAND, streamVisible } from './streaming';

describe('scene streaming rule', () => {
  const R = 150;
  it('shows what is within the radius and hides what is well beyond it', () => {
    expect(streamVisible(-3, false, R)).toBe(true); // standing inside it
    expect(streamVisible(R, false, R)).toBe(true);
    expect(streamVisible(R + STREAM_BAND + 0.1, true, R)).toBe(false);
  });

  it('keeps the current state inside the band (no flicker when pacing at the edge)', () => {
    expect(streamVisible(R + 1, true, R)).toBe(true);
    expect(streamVisible(R + 1, false, R)).toBe(false);
    expect(streamVisible(R + STREAM_BAND, true, R)).toBe(true);
  });
});
