import { describe, expect, it } from 'vitest';
import { BELLWICK, WORLD_SOURCES } from '../../content/world';
import { districtAt, facadeEdge, facingSide, parseWorld, WorldDataError } from './worldData';

const rect = (x0: number, x1: number, z0: number, z1: number) => ({
  type: 'Polygon',
  coordinates: [[[x0, z0], [x1, z0], [x1, z1], [x0, z1], [x0, z0]]],
});
const point = (x: number, z: number) => ({ type: 'Point', coordinates: [x, z] });
const feature = (geometry: unknown, properties: Record<string, unknown>) => ({ type: 'Feature', geometry, properties });
const minimal = (extra: unknown[] = []) => ({
  type: 'FeatureCollection',
  name: 'test',
  features: [
    feature(rect(0, 10, 0, 10), { layer: 'district', id: 'd', name: 'D', status: 'active' }),
    feature(point(1, 1), { layer: 'spawn' }),
    ...extra,
  ],
});
const problemsOf = (fc: unknown): readonly string[] => {
  try {
    parseWorld([fc]);
    return [];
  } catch (e) {
    if (e instanceof WorldDataError) return e.problems;
    throw e;
  }
};

describe('Bellwick world data (content/world)', () => {
  it('validates', () => {
    expect(() => parseWorld(WORLD_SOURCES)).not.toThrow();
  });

  it('spans the six districts around the v1 core; spawn unchanged', () => {
    expect(BELLWICK.bounds).toEqual({ minX: -150, maxX: 150, minZ: -150, maxZ: 120 });
    expect(BELLWICK.spawn).toEqual({ x: 0, z: -15 });
  });

  it('keeps every v1 interaction spot in place (regression)', () => {
    // Later spots: the stall, the board, addresses, the den's crate and the week's story (F5: ch5 doors, clues).
    const later = (s: { kind: string; id: string; chapters?: readonly string[] }): boolean =>
      ['vendor', 'board', 'address'].includes(s.kind) ||
      ['magpie_crate', 'old_nameplate', 'den_returns_sign', 'den_labels'].includes(s.id) ||
      (s.chapters ?? []).some((c) => !['ch1', 'ch2', 'ch3'].includes(c));
    expect(BELLWICK.spots.filter((s) => !later(s)).map((s) => [s.id, s.kind, s.x, s.z, s.range, s.chapters ?? null])).toEqual([
      ['npc_mara', 'giver', -3.4, -13, 2.2, null],
      ['door_blue_other', 'door', 4, -3, 2, ['ch1']],
      ['door_june', 'door', 4, 6, 2, ['ch1']],
      ['gate_yard', 'gate', 5, 1.5, 2, null],
      ['npc_finn', 'npc', 0, 25.5, 2.2, ['ch2']],
      ['old_post_sign', 'clue', -18.9, 28.3, 2, null],
      ['gate_postmark', 'gate', -18.9, 31.5, 2, null],
      ['gate_east', 'gate', 26.9, 27.5, 2, null],
      ['door_arthur', 'door', -33, 31.5, 2, ['ch3']],
    ]);
  });

  it('has the core (Indigo Row, Dial Square), Postmark Mews and four outer districts, all active', () => {
    expect(BELLWICK.districts.map((d) => [d.id, d.status])).toEqual([
      ['indigo-row', 'active'],
      ['dial-square', 'active'],
      ['postmark-mews', 'active'],
      ['market-hill', 'active'],
      ['canal-side', 'active'],
      ['railway-yard', 'active'],
      ['hillside-park', 'active'],
    ]);
  });

  it('opens the core walls towards the new districts (street south, square north, yard east)', () => {
    const blocked = (x: number, z: number): boolean =>
      BELLWICK.solids.some((w) => w.kind === 'wall' && x >= w.rect.x0 && x <= w.rect.x1 && z >= w.rect.z0 && z <= w.rect.z1);
    expect(blocked(0, -20.25)).toBe(false);
    expect(blocked(0, 40.25)).toBe(false);
    expect(blocked(28.25, 4)).toBe(false);
    expect(blocked(-10, -20.25)).toBe(true);
    expect(blocked(28.25, 27.5)).toBe(true); // the decoy gate's wall in Dial Square stays
  });

  it('keeps the blocks that TownModels skins by mesh name', () => {
    const ids = BELLWICK.solids.map((s) => s.id);
    for (const id of ['backWest', 'warehouse', 'yardNorthBlock']) expect(ids).toContain(id);
    expect(BELLWICK.areas.map((a) => a.id)).toContain('squarePaving'); // Dressing paints cobbles on it
  });

  it('places every door on the facade of a building facing the same way', () => {
    for (const door of BELLWICK.doors) {
      const host = BELLWICK.buildings.find((b) => {
        if (b.facing !== door.facing) return false;
        const e = facadeEdge(b);
        return e.nx !== 0 ? e.x0 === door.x && door.z > e.z0 && door.z < e.z1 : e.z0 === door.z && door.x > e.x0 && door.x < e.x1;
      });
      expect(host, door.id).toBeDefined();
    }
  });

  it('puts Postmark Mews on the map only after chapter 3', () => {
    expect(BELLWICK.buildings.find((b) => b.id === 'arthurHouse')?.reveal).toBe('ch3');
    expect(BELLWICK.labels.find((l) => l.text === 'Postmark Mews')?.reveal).toBe('ch3');
  });
});

describe('parseWorld validation', () => {
  it('accepts a minimal world', () => {
    expect(problemsOf(minimal())).toEqual([]);
  });

  it('rejects something that is not a FeatureCollection', () => {
    expect(problemsOf({ type: 'Feature' })[0]).toMatch(/not a GeoJSON FeatureCollection/);
  });

  it('rejects unknown layers and missing layer', () => {
    const p = problemsOf(minimal([feature(point(0, 0), { layer: 'dragon', id: 'x' }), feature(point(0, 0), { id: 'y' })]));
    expect(p.some((s) => s.includes('unknown layer "dragon"'))).toBe(true);
    expect(p.some((s) => s.includes('missing "layer"'))).toBe(true);
  });

  it('rejects non-rectangular and unclosed polygons', () => {
    const tri = { type: 'Polygon', coordinates: [[[0, 0], [4, 0], [2, 3], [1, 1], [0, 0]]] };
    const open = { type: 'Polygon', coordinates: [[[0, 0], [4, 0], [4, 4], [0, 4], [0, 1]]] };
    const p = problemsOf(
      minimal([
        feature(tri, { layer: 'block', id: 'a', height: 2, colour: '#123456' }),
        feature(open, { layer: 'block', id: 'b', height: 2, colour: '#123456' }),
      ]),
    );
    expect(p.some((s) => s.includes('(a)') && s.includes('axis-aligned rectangle'))).toBe(true);
    expect(p.some((s) => s.includes('(b)') && s.includes('not closed'))).toBe(true);
  });

  it('rejects bad property values with the feature id in the message', () => {
    const p = problemsOf(
      minimal([
        feature(rect(0, 1, 0, 1), { layer: 'building', id: 'h', height: -1, colour: 'red', style: 'castle', facing: 'up' }),
        feature(point(0, 0), { layer: 'spot', id: 's', kind: 'door', range: 2, chapters: [] }),
      ]),
    );
    expect(p).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/\(h\).*"height" must be > 0/),
        expect.stringMatching(/\(h\).*"colour" must be a #rrggbb colour/),
        expect.stringMatching(/\(h\).*"style" must be one of/),
        expect.stringMatching(/\(h\).*"facing" must be one of/),
        expect.stringMatching(/\(s\).*"chapters" must be a non-empty list/),
      ]),
    );
  });

  it('rejects duplicate ids within a layer but allows the same id across layers', () => {
    const p = problemsOf(
      minimal([
        feature(point(0, 0), { layer: 'door', id: 'd1', facing: 'east', colour: '#000000' }),
        feature(point(1, 0), { layer: 'door', id: 'd1', facing: 'east', colour: '#000000' }),
        feature(point(1, 0), { layer: 'spot', id: 'd1', kind: 'door', range: 2 }),
      ]),
    );
    expect(p).toEqual([expect.stringMatching(/duplicate door id "d1"/)]);
  });

  it('needs exactly one spawn and at least one active district', () => {
    const none = { type: 'FeatureCollection', features: [] };
    const p = problemsOf(none);
    expect(p).toEqual(expect.arrayContaining(['no active district', 'expected exactly one spawn point, found 0']));
  });

  it('maps facing to the facade side', () => {
    expect(facingSide('east')).toBe(-1);
    expect(facingSide('west')).toBe(1);
  });
});

describe('prop layer', () => {
  it('reads street props with model and rotation', () => {
    const w = parseWorld([minimal([feature(point(2, 3), { layer: 'prop', id: 'h1', model: 'firehydrant', rotate: 90 })])]);
    expect(w.props).toEqual([{ id: 'h1', model: 'firehydrant', x: 2, z: 3, rotate: 90 }]);
  });
  it('defaults rotation to 0', () => {
    const w = parseWorld([minimal([feature(point(2, 3), { layer: 'prop', id: 'b1', model: 'bush' })])]);
    expect(w.props[0]?.rotate).toBe(0);
  });
  it('rejects unknown models and duplicate ids', () => {
    expect(problemsOf(minimal([feature(point(0, 0), { layer: 'prop', id: 'x', model: 'spaceship' })])).join()).toMatch(/model/);
    const dup = minimal([
      feature(point(0, 0), { layer: 'prop', id: 'x', model: 'bush' }),
      feature(point(1, 0), { layer: 'prop', id: 'x', model: 'bush' }),
    ]);
    expect(problemsOf(dup).join()).toMatch(/duplicate prop id/);
  });
});

describe('marker and route layers', () => {
  const line = (...pts: [number, number][]) => ({ type: 'LineString', coordinates: pts });
  it('reads markers (heading defaults to 0) and routes', () => {
    const w = parseWorld([
      minimal([
        feature(point(2, 3), { layer: 'marker', id: 'm1', heading: 1.5 }),
        feature(point(4, 5), { layer: 'marker', id: 'm2' }),
        feature(line([1, 1], [5, 1], [5, 8]), { layer: 'route', id: 'r1' }),
      ]),
    ]);
    expect(w.markers).toEqual([
      { id: 'm1', x: 2, z: 3, heading: 1.5 },
      { id: 'm2', x: 4, z: 5, heading: 0 },
    ]);
    expect(w.routes).toEqual([{ id: 'r1', points: [{ x: 1, z: 1 }, { x: 5, z: 1 }, { x: 5, z: 8 }] }]);
  });
  it('rejects a one-point route, a non-numeric vertex and a vertex off the map', () => {
    expect(problemsOf(minimal([feature(line([1, 1]), { layer: 'route', id: 'r' })])).join()).toMatch(/LineString/);
    expect(problemsOf(minimal([feature({ type: 'LineString', coordinates: [[1, 1], ['a', 2]] }, { layer: 'route', id: 'r' })])).join()).toMatch(/LineString/);
    expect(problemsOf(minimal([feature(line([1, 1], [5, 1], [50, 1]), { layer: 'route', id: 'r' })])).join()).toMatch(/vertex 2: lies outside every district/);
  });
});

describe('districts', () => {
  const district = (id: string, x0: number, x1: number, z0: number, z1: number) =>
    feature(rect(x0, x1, z0, z1), { layer: 'district', id, name: id, status: 'active' });
  const spawn = feature(point(1, 1), { layer: 'spawn' });

  it('rejects overlapping districts and features outside every district', () => {
    const bad = { type: 'FeatureCollection', features: [district('a', 0, 10, 0, 10), district('b', 5, 15, 0, 10), spawn, feature(point(50, 50), { layer: 'label', text: 'x' })] };
    const text = problemsOf(bad).join('\n');
    expect(text).toMatch(/"a" and "b" overlap/);
    expect(text).toMatch(/outside every district/);
  });

  it('walls the outer edge only, leaving shared edges open', () => {
    const w = parseWorld([{ type: 'FeatureCollection', features: [district('a', 0, 10, 0, 10), district('b', 10, 20, 0, 4), spawn] }]);
    const walls = w.solids.filter((s) => s.id.startsWith('boundary_'));
    const blocked = (x: number, z: number): boolean => walls.some((s) => x >= s.rect.x0 && x <= s.rect.x1 && z >= s.rect.z0 && z <= s.rect.z1);
    expect(blocked(10, 2)).toBe(false); // shared edge a|b
    expect(blocked(10.2, 7)).toBe(true); // a's east edge above b
    expect(blocked(5, -0.2)).toBe(true);
    expect(blocked(15, 4.2)).toBe(true);
    expect(blocked(20.2, 2)).toBe(true);
    expect(blocked(-0.2, -0.2)).toBe(true); // corners close
  });

  it('accepts grass, water and bridges, north/south facades, stalls and a district ground colour', () => {
    const w = parseWorld([{
      type: 'FeatureCollection',
      features: [
        feature(rect(0, 40, 0, 40), { layer: 'district', id: 'd', name: 'D', status: 'active', ground: '#88aa66' }),
        spawn,
        feature(rect(0, 40, 10, 14), { layer: 'area', id: 'lawn', surface: 'grass', colour: '#88aa66' }),
        feature(rect(0, 18, 20, 24), { layer: 'area', id: 'canalW', surface: 'water', colour: '#4f9ccc' }),
        feature(rect(18, 22, 20, 24), { layer: 'area', id: 'bridge', surface: 'bridge', colour: '#b9a98c' }),
        feature(rect(22, 40, 20, 24), { layer: 'area', id: 'canalE', surface: 'water', colour: '#4f9ccc' }),
        feature(rect(4, 12, 30, 36), { layer: 'building', id: 'shed', height: 4, colour: '#aa8866', style: 'house', facing: 'south' }),
        feature(point(8, 30), { layer: 'door', id: 'shedDoor', facing: 'south', colour: '#223344' }),
        feature(point(30, 5), { layer: 'poi', id: 'stall1', kind: 'stall' }),
      ],
    }]);
    expect(w.districts[0]?.ground).toBe('#88aa66');
    expect(w.areas.map((a) => a.surface)).toEqual(['grass', 'water', 'bridge', 'water']);
    expect(facadeEdge(w.buildings[0]!)).toEqual({ x0: 4, x1: 12, z0: 30, z1: 30, nx: 0, nz: -1 });
    expect(w.pois[0]?.kind).toBe('stall');
  });

  it('rejects water that covers a road, paving or bridge', () => {
    const bad = {
      type: 'FeatureCollection',
      features: [
        district('d', 0, 40, 0, 40),
        spawn,
        feature(rect(0, 40, 20, 24), { layer: 'area', id: 'canal', surface: 'water', colour: '#4f9ccc' }),
        feature(rect(18, 22, 0, 40), { layer: 'area', id: 'road', surface: 'road', colour: '#888888' }),
      ],
    };
    expect(problemsOf(bad).join('\n')).toMatch(/water "canal" overlaps road "road"/);
  });

  it('finds the district at a point', () => {
    expect(districtAt(BELLWICK.districts, 0, 30)?.id).toBe('dial-square');
    expect(districtAt(BELLWICK.districts, -27, 31.5)?.id).toBe('postmark-mews');
    expect(districtAt(BELLWICK.districts, 100, 100)).toBeUndefined();
  });
});
