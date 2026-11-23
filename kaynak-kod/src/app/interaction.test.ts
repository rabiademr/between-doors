import { describe, expect, it } from 'vitest';
import { selectTarget, type InteractionSpot } from './interaction';

const door = (id: string, x: number, z: number): InteractionSpot => ({ id, x, z, range: 2 });

describe('selectTarget', () => {
  it('picks a close target in front of the player', () => {
    expect(selectTarget(0, 0, 0, [door('a', 0, 1.5)])).toBe('a');
  });

  it('ignores far targets (FR-07)', () => {
    expect(selectTarget(0, 0, 0, [door('a', 0, 2.5)])).toBeNull();
  });

  it('ignores targets behind the player', () => {
    expect(selectTarget(0, 0, 0, [door('a', 0, -1.5)])).toBeNull();
  });

  it('when standing on the spot, facing does not matter', () => {
    expect(selectTarget(0, 0, Math.PI, [door('a', 0, 0.3)])).toBe('a');
  });

  it('chooses exactly one: the one straight ahead beats a slightly closer one at the side', () => {
    const spots = [door('ahead', 0, 1.6), door('side', 1.0, 0.9)];
    expect(selectTarget(0, 0, 0, spots)).toBe('ahead');
  });

  describe('anyDirection (riding past a door side-on)', () => {
    it('a door beside or behind the vehicle counts', () => {
      expect(selectTarget(0, 0, 0, [door('a', 1.5, 0)], { anyDirection: true })).toBe('a');
      expect(selectTarget(0, 0, 0, [door('a', 0, -1.5)], { anyDirection: true })).toBe('a');
    });
    it('but never out of range', () => {
      expect(selectTarget(0, 0, 0, [door('a', 2.5, 0)], { anyDirection: true })).toBeNull();
    });
    it('the closest wins', () => {
      const spots = [door('ahead', 0, 1.6), door('side', 1.0, 0.9)];
      expect(selectTarget(0, 0, 0, spots, { anyDirection: true })).toBe('side');
    });
  });
});
