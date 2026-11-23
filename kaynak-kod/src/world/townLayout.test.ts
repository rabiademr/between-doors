import { describe, expect, it } from 'vitest';
import { BELLWICK, coreRect } from '../content/world';

const c = coreRect(BELLWICK);
/** The hand-built core as Bounds. */
const CORE = { minX: c.x0, maxX: c.x1, minZ: c.z0, maxZ: c.z1 };
const WALLS = BELLWICK.solids.filter((s) => s.kind === 'wall').map((s) => s.rect);
import { cityRows, coreOpenings, packRow, townPlacements } from './townLayout';

const W = { small: 5, mid: 7, big: 9 } as const;
type M = keyof typeof W;

describe('packRow', () => {
  it('fills the row without overlaps and ends flush', () => {
    const row = packRow<M>(50, ['big', 'small', 'mid'], W);
    expect(row.length).toBeGreaterThan(4);
    const first = row[0]!;
    const last = row[row.length - 1]!;
    expect(first.at - first.width / 2).toBeCloseTo(0);
    expect(last.at + last.width / 2).toBeCloseTo(50);
    for (let i = 1; i < row.length; i++) {
      const a = row[i - 1]!;
      const b = row[i]!;
      expect(b.at - b.width / 2).toBeGreaterThanOrEqual(a.at + a.width / 2 - 1e-9);
    }
  });
  it('leaves at most the narrowest width unused', () => {
    for (const len of [12, 23, 37.5, 61]) {
      const row = packRow<M>(len, ['big', 'mid', 'small'], W);
      const used = row.reduce((s, r) => s + r.width, 0);
      expect(len - used).toBeLessThan(W.small);
    }
  });
  it('follows the given order when everything fits', () => {
    expect(packRow<M>(21, ['big', 'small', 'mid'], W).map((r) => r.model)).toEqual(['big', 'small', 'mid']);
  });
  it('centres a single building and handles rows too short for anything', () => {
    expect(packRow<M>(6, ['big', 'small'], W)).toEqual([{ model: 'small', at: 3, width: 5 }]);
    expect(packRow<M>(3, ['small'], W)).toEqual([]);
    expect(packRow<M>(10, [], W)).toEqual([]);
  });
});

describe('cityRows', () => {
  const b = CORE;
  const openings = coreOpenings(b, WALLS);
  const rows = cityRows(b, openings);
  const overlap = (a: { x0: number; x1: number; z0: number; z1: number }, c: typeof a): boolean =>
    a.x0 < c.x1 - 1e-6 && c.x0 < a.x1 - 1e-6 && a.z0 < c.z1 - 1e-6 && c.z0 < a.z1 - 1e-6;

  it('lines three sides with buildings', () => {
    expect(rows.filter((r) => r.rotY === Math.PI).length).toBeGreaterThan(4); // north row faces south
    expect(rows.filter((r) => r.rotY === 0).length).toBeGreaterThan(4);
    expect(rows.filter((r) => r.rotY === -Math.PI / 2).length).toBeGreaterThan(6);
  });
  it('stays outside the play area and its walls', () => {
    const walled = { x0: b.minX - 0.5, x1: b.maxX + 0.5, z0: b.minZ - 0.5, z1: b.maxZ + 0.5 };
    for (const r of rows) expect(overlap(r.rect, walled), r.model).toBe(false);
  });
  it('never overlaps another building', () => {
    for (let i = 0; i < rows.length; i++) for (let j = i + 1; j < rows.length; j++) expect(overlap(rows[i]!.rect, rows[j]!.rect)).toBe(false);
  });
  it('finds the three wall openings and leaves the streets through them clear', () => {
    expect(openings).toEqual({ north: [[-3, 3]], south: [[-5, 5]], east: [[2, 6]] });
    const street = [
      { x0: -3, x1: 3, z0: 40, z1: 60 },
      { x0: -5, x1: 5, z0: -40, z1: -20 },
      { x0: 28, x1: 50, z0: 2, z1: 6 },
    ];
    for (const r of rows) for (const st of street) expect(overlap(r.rect, st), r.model).toBe(false);
  });
  it('keeps clear of Postmark Mews and the houses flanking it (west of the square)', () => {
    const mewsQuarter = { x0: -Infinity, x1: b.minX - 0.5, z0: 18, z1: 44.5 };
    for (const r of rows) expect(overlap(r.rect, mewsQuarter)).toBe(false);
  });
});

describe('townPlacements', () => {
  it("keeps Postmark Mews' neighbours as they were (chapter 3 photo and finale views)", () => {
    const b = CORE;
    const flanks = townPlacements(b, BELLWICK.bounds).filter((p) => p.model.startsWith('sub-') && p.x < b.minX && p.z > 20);
    expect(flanks.map((p) => [p.model.replace('sub-building-type-', ''), p.variant, p.x, p.z])).toEqual([
      ['s', 'a', b.minX - 5.5, 22],
      ['u', 'c', b.minX - 5.5, 40.5],
      ['a', 'a', b.minX - 13, 22],
      ['b', 'default', b.minX - 13, 40.5],
    ]);
  });
});
