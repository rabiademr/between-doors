import { describe, expect, it } from 'vitest';
import { kitOf, packFileName } from './packKit';

describe('asset packs', () => {
  it('files directly under models/ or textures/ are in the core kit', () => {
    expect(kitOf('models/courier.glb')).toBe('core');
    expect(kitOf('textures/suburban-variation-a.png')).toBe('core');
  });

  it('a sub-folder is its own kit', () => {
    expect(kitOf('models/town/sub-building-type-a.glb')).toBe('town');
    expect(kitOf('models/chars/body/male.glb')).toBe('chars');
  });

  it('kit names are always safe file names', () => {
    expect(kitOf('models/City Kit!/x.glb')).toBe('city_kit_');
    expect(packFileName('town')).toBe('packs/town.js');
  });
});
