import { describe, expect, it } from 'vitest';
import { isWalkable, samplesAlong, type Obstacles } from '../domain/npc/walkable';
import type { Point2 } from '../domain/npc/waypoints';
import { districtAt } from '../domain/world/worldData';
import { ACTOR_IDS, MARKS, ROUTES, STORY_ACTORS, actorSpotId } from './actors';
import { BELLWICK } from './world';

/** Everything solid on the map layers (outer districts have no hand-made furniture). */
const box = (x: number, z: number, w: number, d: number) => ({ x0: x - w / 2, x1: x + w / 2, z0: z - d / 2, z1: z + d / 2 });
const SOLID: Obstacles = {
  bounds: { x0: BELLWICK.bounds.minX, x1: BELLWICK.bounds.maxX, z0: BELLWICK.bounds.minZ, z1: BELLWICK.bounds.maxZ },
  rects: [
    ...BELLWICK.buildings.map((b) => b.rect),
    ...BELLWICK.solids.map((s) => s.rect),
    ...BELLWICK.areas.filter((a) => a.surface === 'water').map((a) => a.rect),
    ...BELLWICK.pois.flatMap((q) => (q.kind === 'bench' ? [box(q.x, q.z, 1.8, 0.6)] : q.kind === 'stall' ? [box(q.x, q.z, 2.8, 1.7)] : [])),
  ],
  circles: BELLWICK.pois.flatMap((q) => (q.kind === 'bench' || q.kind === 'stall' ? [] : [{ x: q.x, z: q.z, r: q.radius ?? 0.5 }])),
};
const PERSON = 0.35;
const fmt = (q: Point2): string => `(${q.x.toFixed(1)}, ${q.z.toFixed(1)})`;

describe('story actors', () => {
  it('have names in both languages and talk spots that no map spot uses', () => {
    for (const id of ACTOR_IDS) {
      const a = STORY_ACTORS[id];
      expect(a.name.en && a.name.tr && a.idle.en && a.idle.tr).toBeTruthy();
      expect(BELLWICK.spots.some((s) => s.id === actorSpotId(id))).toBe(false);
    }
  });

  it('stand and walk on open ground inside the town', () => {
    const points: Array<[string, Point2]> = [
      ...Object.entries(MARKS).map(([id, m]): [string, Point2] => [id, m]),
      ...Object.entries(ROUTES).flatMap(([id, r]) => {
        const pts: Point2[] = [];
        for (let i = 1; i < r.length; i++) pts.push(...samplesAlong(r[i - 1]!, r[i]!));
        return pts.map((p): [string, Point2] => [id, p]);
      }),
    ];
    for (const [id, p] of points) {
      expect(districtAt(BELLWICK.districts, p.x, p.z), `${id} at ${fmt(p)}`).toBeDefined();
      expect(isWalkable(p, SOLID, PERSON), `${id} at ${fmt(p)}`).toBe(true);
    }
  });
});
