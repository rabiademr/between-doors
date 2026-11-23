import { describe, expect, it } from 'vitest';
import { ARTHURS_TUNE, HUM_BARS } from '../content/melody';
import { midiToHz, scheduleTune, tuneSeconds, varyTune, type Tune } from './melody';

const TINY: Tune = { bpm: 120, beatsPerBar: 3, melody: [[60, 1], [62, 2], [64, 3]], bass: [48, 43] };

describe('melody', () => {
  it('A4 is 440 Hz and an octave doubles the frequency', () => {
    expect(midiToHz(69)).toBe(440);
    expect(midiToHz(81)).toBeCloseTo(880);
    expect(midiToHz(60)).toBeCloseTo(261.63, 1);
  });

  it('schedules melody notes back to back and one bass note per bar', () => {
    const notes = scheduleTune(TINY);
    const melody = notes.filter((n) => n.part === 'melody');
    expect(melody.map((n) => [n.time, n.duration])).toEqual([[0, 0.5], [0.5, 1], [1.5, 1.5]]);
    const bass = notes.filter((n) => n.part === 'bass');
    expect(bass.map((n) => [n.time, n.duration, n.midi])).toEqual([[0, 1.5, 48], [1.5, 1.5, 43]]);
    expect(tuneSeconds(TINY)).toBe(3);
  });

  it('a bar limit cuts the tune at the bar line (no note runs past it)', () => {
    const notes = scheduleTune(TINY, 1);
    expect(notes.filter((n) => n.part === 'bass')).toHaveLength(1);
    const end = Math.max(...notes.map((n) => n.time + n.duration));
    expect(end).toBe(1.5);
    expect(tuneSeconds(TINY, 1)).toBe(1.5);
  });

  it("Arthur's tune: every bar is full and has a bass note", () => {
    const beats = ARTHURS_TUNE.melody.reduce((s, [, b]) => s + b, 0);
    expect(beats).toBe(ARTHURS_TUNE.bass.length * ARTHURS_TUNE.beatsPerBar);
    // Bar lines never fall inside a note (each bar adds up to beatsPerBar).
    let at = 0;
    for (const [, b] of ARTHURS_TUNE.melody) {
      const bar = Math.floor(at / ARTHURS_TUNE.beatsPerBar + 1e-9);
      at += b;
      expect(at).toBeLessThanOrEqual((bar + 1) * ARTHURS_TUNE.beatsPerBar + 1e-9);
    }
    expect(tuneSeconds(ARTHURS_TUNE, HUM_BARS)).toBeLessThan(tuneSeconds(ARTHURS_TUNE));
  });
});

describe('varyTune', () => {
  it('changes speed and key, keeps the rhythm, never touches the original', () => {
    const v = varyTune(ARTHURS_TUNE, { tempo: 0.5, transpose: -12 });
    expect(v.bpm).toBe(ARTHURS_TUNE.bpm / 2);
    expect(v.beatsPerBar).toBe(ARTHURS_TUNE.beatsPerBar);
    expect(v.melody.map(([m]) => m)).toEqual(ARTHURS_TUNE.melody.map(([m]) => m - 12));
    expect(v.melody.map(([, b]) => b)).toEqual(ARTHURS_TUNE.melody.map(([, b]) => b));
    expect(v.bass).toEqual(ARTHURS_TUNE.bass.map((m) => m - 12));
    expect(tuneSeconds(v)).toBeCloseTo(tuneSeconds(ARTHURS_TUNE) * 2, 9);
    expect(ARTHURS_TUNE.bpm).toBe(104);
  });

  it('no variation is the same tune', () => {
    expect(varyTune(ARTHURS_TUNE, {})).toEqual({ ...ARTHURS_TUNE, melody: [...ARTHURS_TUNE.melody], bass: [...ARTHURS_TUNE.bass] });
  });
});
