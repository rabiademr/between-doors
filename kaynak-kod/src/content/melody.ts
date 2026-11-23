// Model data: "Arthur's tune" — an original little waltz written for this game (no external recording).
// Arthur hums its first phrase after chapter 1; the finale plays it in full as a music box.
import { varyTune, type Tune } from '../audio/melody';

// MIDI note numbers: C3 = 48, C4 = 60, A4 = 69 (440 Hz), C5 = 72.
const C3 = 48, F2 = 41, G2 = 43;
const E4 = 64, F4 = 65, G4 = 67, A4 = 69, B4 = 71, C5 = 72, D5 = 74, E5 = 76, F5 = 77;

export const ARTHURS_TUNE: Tune = {
  bpm: 104,
  beatsPerBar: 3,
  // [note, beats]
  melody: [
    [E4, 1], [G4, 1], [C5, 1],
    [B4, 2], [A4, 1],
    [G4, 1], [E4, 1], [F4, 1],
    [G4, 3],
    [A4, 1], [C5, 1], [F5, 1],
    [E5, 2], [D5, 1],
    [C5, 1], [A4, 1], [B4, 1],
    [C5, 3],
    // second phrase
    [E5, 1], [D5, 1], [C5, 1],
    [D5, 2], [G4, 1],
    [C5, 1], [B4, 1], [A4, 1],
    [G4, 3],
    [F4, 1], [A4, 1], [C5, 1],
    [E5, 1.5], [D5, 0.5], [C5, 1],
    [D5, 1], [G4, 1], [B4, 1],
    [C5, 3],
  ],
  // One bass note at the start of each bar.
  bass: [C3, G2, C3, G2, F2, C3, F2, C3, C3, G2, F2, C3, F2, C3, G2, C3],
};

/**
 * The week in one tune: each morning has its own colour of Arthur's waltz, and the finale plays it brighter.
 * Story scenes pick one by id (content/scenes.ts `music`).
 */
export const TUNES = {
  arthur: ARTHURS_TUNE,
  morning_day2: varyTune(ARTHURS_TUNE, { tempo: 1.12, transpose: 2 }), // a brisk new day, a rival in town
  morning_day3: varyTune(ARTHURS_TUNE, { tempo: 0.88, transpose: -3 }), // Arthur's day: slow, a little wistful
  morning_day4: varyTune(ARTHURS_TUNE, { tempo: 1.18, transpose: -5 }), // the stakeout: low and quick
  morning_day5: varyTune(ARTHURS_TUNE, { tempo: 1.0, transpose: 5 }), // the last day: up a fourth
  finale_week: varyTune(ARTHURS_TUNE, { tempo: 1.05, transpose: 7 }), // the market gathering
} satisfies Record<string, Tune>;
export type TuneId = keyof typeof TUNES;

/** Bars Arthur hums on his way to Dial Square (the first phrase). */
export const HUM_BARS = 8;
/** Bars of the settings preview chime. */
export const PREVIEW_BARS = 1;
