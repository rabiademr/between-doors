import { describe, expect, it } from 'vitest';
import { BELLWICK } from '../../content/world';
import { districtOnMap } from './discovery';

describe('district discovery', () => {
  it('keeps Postmark Mews off the map until chapter 3 is finished', () => {
    expect(districtOnMap(BELLWICK, 'postmark-mews', [])).toBe(false);
    expect(districtOnMap(BELLWICK, 'postmark-mews', ['ch1', 'ch2'])).toBe(false);
    expect(districtOnMap(BELLWICK, 'postmark-mews', ['ch1', 'ch2', 'ch3'])).toBe(true);
  });

  it('lets every other district be discovered by walking in', () => {
    for (const d of BELLWICK.districts) {
      if (d.id !== 'postmark-mews') expect(districtOnMap(BELLWICK, d.id, []), d.id).toBe(true);
    }
  });
});
