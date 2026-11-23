// View data: KayKit City Builder Bits (CC0) as used in Bellwick — file per model, footprint and how it
// collides. Sizes are in model units (from the GLB bounding boxes) and scaled by CITY_SCALE.
// Models face +Z at yaw 0 (front/door/bonnet toward +Z). Placed by footprint centre, lowest point on the ground.
import type { PropModel } from '../domain/world/worldData';

/** Model units → metres: a KayKit car (0.94) becomes ≈ 4.2 m long next to our 1.7 m characters. */
export const CITY_SCALE = 4.5;

export interface KitModel {
  /** Asset id under models/. */
  asset: string;
  /** Footprint (model units): width along X, depth along Z, height. */
  w: number;
  d: number;
  h: number;
  /** Collider shape; omitted = walk-through (lower than SceneColliders' 0.2 m step, e.g. a litter bag). */
  collider?: 'box' | 'circle';
}

export const PROP_KIT: Record<PropModel, KitModel> = {
  bench: { asset: 'models/city/bench.glb', w: 0.4, d: 0.15, h: 0.1, collider: 'box' },
  bush: { asset: 'models/city/bush.glb', w: 0.19, d: 0.2, h: 0.38, collider: 'circle' },
  'box-a': { asset: 'models/city/box-a.glb', w: 0.2, d: 0.2, h: 0.18, collider: 'box' },
  'box-b': { asset: 'models/city/box-b.glb', w: 0.15, d: 0.15, h: 0.17, collider: 'box' },
  dumpster: { asset: 'models/city/dumpster.glb', w: 0.57, d: 0.35, h: 0.32, collider: 'box' },
  firehydrant: { asset: 'models/city/firehydrant.glb', w: 0.14, d: 0.13, h: 0.22, collider: 'circle' },
  'trash-a': { asset: 'models/city/trash-a.glb', w: 0.13, d: 0.13, h: 0.05, collider: 'circle' },
  'trash-b': { asset: 'models/city/trash-b.glb', w: 0.07, d: 0.07, h: 0.04 },
  'car-hatchback': { asset: 'models/city/car-hatchback.glb', w: 0.42, d: 0.81, h: 0.37, collider: 'box' },
  'car-sedan': { asset: 'models/city/car-sedan.glb', w: 0.42, d: 0.94, h: 0.37, collider: 'box' },
  'car-stationwagon': { asset: 'models/city/car-stationwagon.glb', w: 0.42, d: 0.94, h: 0.37, collider: 'box' },
  'car-taxi': { asset: 'models/city/car-taxi.glb', w: 0.42, d: 0.94, h: 0.43, collider: 'box' },
};

/** Scene name of a prop's collider (WorldBuilder makes it; TownModels hides it once the model is in). */
export const propColliderName = (id: string): string => `${id}_collider`;

/** Terraced city buildings (no pavement slab). Widths 1.2 / 1.6 / 2.0, 2–4 storeys. Placed by their origin
 * (the body's centre) and grounded (ModelLibrary anchor 'ground'), so the fronts of a row line up. */
export const BUILDINGS = {
  'building-a': { asset: 'models/city/building-a.glb', w: 1.2, h: 1.55 },
  'building-b': { asset: 'models/city/building-b.glb', w: 1.6, h: 1.55 },
  'building-c': { asset: 'models/city/building-c.glb', w: 1.2, h: 2.25 },
  'building-d': { asset: 'models/city/building-d.glb', w: 1.6, h: 2.25 },
  'building-e': { asset: 'models/city/building-e.glb', w: 2.0, h: 2.25 },
  'building-f': { asset: 'models/city/building-f.glb', w: 2.0, h: 2.25 },
  'building-g': { asset: 'models/city/building-g.glb', w: 2.0, h: 2.25 },
  'building-h': { asset: 'models/city/building-h.glb', w: 2.0, h: 2.95 },
} as const;
export type BuildingModel = keyof typeof BUILDINGS;
/** Depth of every building body (model units, z −0.65..0.65 around the origin). */
export const BUILDING_DEPTH = 1.3;
/** Steps and awnings stick out up to this much at the front (+Z) of some buildings (model units). */
export const BUILDING_OVERHANG = 0.15;
