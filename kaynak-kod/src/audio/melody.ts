// Pure music math (no Web Audio): turns a tune into timed notes. Tested with Vitest.

/** A short tune: melody as [MIDI note, beats] pairs, plus one bass note per bar. */
export interface Tune {
  bpm: number;
  beatsPerBar: number;
  melody: readonly (readonly [number, number])[];
  bass: readonly number[];
}

export interface ScheduledNote {
  /** Seconds from the start of the tune. */
  time: number;
  /** Seconds. */
  duration: number;
  midi: number;
  part: 'melody' | 'bass';
}

/** Equal temperament, A4 (MIDI 69) = 440 Hz. */
export function midiToHz(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}

/**
 * Every note of the tune with its start time and length, in time order per part.
 * @param bars play only the first `bars` bars (default: the whole tune).
 */
export function scheduleTune(tune: Tune, bars = Infinity): ScheduledNote[] {
  const beat = 60 / tune.bpm;
  const endBeat = bars * tune.beatsPerBar;
  const out: ScheduledNote[] = [];
  let at = 0;
  for (const [midi, beats] of tune.melody) {
    if (at >= endBeat - 1e-9) break;
    out.push({ time: at * beat, duration: Math.min(beats, endBeat - at) * beat, midi, part: 'melody' });
    at += beats;
  }
  tune.bass.forEach((midi, bar) => {
    if (bar >= bars) return;
    out.push({ time: bar * tune.beatsPerBar * beat, duration: tune.beatsPerBar * beat, midi, part: 'bass' });
  });
  return out;
}

export interface TuneVariation {
  /** Speed factor (1 = as written; 0.85 = slower, sleepier). */
  tempo?: number;
  /** Semitones up (+) or down (−), melody and bass alike. */
  transpose?: number;
}

/** The same tune in another mood: faster or slower, higher or lower. Pure. */
export function varyTune(tune: Tune, v: TuneVariation): Tune {
  const t = v.transpose ?? 0;
  return {
    bpm: tune.bpm * (v.tempo ?? 1),
    beatsPerBar: tune.beatsPerBar,
    melody: tune.melody.map(([midi, beats]) => [midi + t, beats] as const),
    bass: tune.bass.map((midi) => midi + t),
  };
}

/** Length in seconds of the first `bars` bars (default: the whole tune). */
export function tuneSeconds(tune: Tune, bars = Infinity): number {
  const beats = tune.melody.reduce((sum, [, b]) => sum + b, 0);
  return (Math.min(beats, bars * tune.beatsPerBar) * 60) / tune.bpm;
}
