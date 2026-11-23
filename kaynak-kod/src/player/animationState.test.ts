import { describe, expect, it } from 'vitest';
import { LOCOMOTION_CLIPS, clipForSpeed, oneShotWeight, playbackRate, stepWeights, weightsFor, type Weights } from './animationState';
import { gestureDuration, gestureOffsets } from './gestures';
import { RUN_SPEED, WALK_SPEED } from './movement';

const sum = (w: Weights) => LOCOMOTION_CLIPS.reduce((a, c) => a + w[c], 0);

describe('animationState', () => {
  it('chooses clip from actual speed', () => {
    expect(clipForSpeed(0)).toBe('idle');
    expect(clipForSpeed(0.1)).toBe('idle'); // blocked by a wall → idle, not walking in place
    expect(clipForSpeed(WALK_SPEED)).toBe('walk');
    expect(clipForSpeed(RUN_SPEED)).toBe('sprint');
    expect(clipForSpeed(RUN_SPEED * 1.1)).toBe('sprint'); // Steady Pace upgrade
  });

  it('uses the carry variants with a parcel in hand (standing still is plain idle)', () => {
    expect(clipForSpeed(0, true)).toBe('idle');
    expect(clipForSpeed(WALK_SPEED, true)).toBe('walk_carry');
    expect(clipForSpeed(RUN_SPEED, true)).toBe('sprint_carry');
  });

  it('cross-fades smoothly and finishes at exactly 1/0', () => {
    let w = weightsFor('idle');
    w = stepWeights(w, 'walk', 0.075, 0.15); // half way
    expect(w.idle).toBeCloseTo(0.5);
    expect(w.walk).toBeCloseTo(0.5);
    expect(sum(w)).toBeCloseTo(1);
    w = stepWeights(w, 'walk', 1, 0.15);
    expect(w).toEqual(weightsFor('walk'));
    w = stepWeights(w, 'walk_carry', 0.075, 0.15);
    expect(sum(w)).toBeCloseTo(1);
  });

  it('playback rate follows speed but stays in a sane range', () => {
    expect(playbackRate('walk', WALK_SPEED)).toBeCloseTo(1);
    expect(playbackRate('walk_carry', WALK_SPEED)).toBeCloseTo(1);
    expect(playbackRate('sprint', RUN_SPEED * 1.1)).toBeCloseTo(1.1);
    expect(playbackRate('walk', 0.5)).toBe(0.6);
    expect(playbackRate('idle', 0)).toBe(1);
  });

  it('one-shots fade in, hold and fade out, and are 0 outside their play time', () => {
    expect(oneShotWeight(-0.1, 1)).toBe(0);
    expect(oneShotWeight(0.06, 1, 0.12)).toBeCloseTo(0.5);
    expect(oneShotWeight(0.5, 1, 0.12)).toBe(1);
    expect(oneShotWeight(0.94, 1, 0.12)).toBeCloseTo(0.5);
    expect(oneShotWeight(1, 1)).toBe(0);
    expect(oneShotWeight(0.05, 0.1, 0.12)).toBeCloseTo(1); // very short clip: fades shrink to fit
  });
});

describe('gestures', () => {
  it('finite gestures start and end at rest', () => {
    for (const kind of ['wave', 'nod'] as const) {
      const d = gestureDuration(kind)!;
      expect(gestureOffsets(kind, 0)).toEqual([]);
      expect(gestureOffsets(kind, d)).toEqual([]);
      const mid = gestureOffsets(kind, d / 2);
      expect(mid.length).toBeGreaterThan(0);
    }
  });

  it('a wave lifts the right arm high; talking loops and eases in', () => {
    const wave = gestureOffsets('wave', 1.2);
    expect(wave.find((o) => o.bone === 'UpperArm.R')?.x).toBeGreaterThan(2);
    expect(gestureDuration('talk')).toBeNull();
    const start = gestureOffsets('talk', 0).find((o) => o.bone === 'UpperArm.R');
    expect(start?.x).toBe(0);
    expect(gestureOffsets('talk', 30).length).toBe(3);
  });

  it('keeps offsets small enough to look natural (no limb flips)', () => {
    for (const kind of ['talk', 'wave', 'nod'] as const) {
      for (let t = 0; t < 5; t += 0.05) {
        for (const o of gestureOffsets(kind, t)) {
          for (const v of [o.x, o.y, o.z]) expect(Math.abs(v)).toBeLessThanOrEqual(2.6);
          if (o.bone === 'Head') expect(Math.abs(o.x) + Math.abs(o.y) + Math.abs(o.z)).toBeLessThan(0.6);
        }
      }
    }
  });
});
