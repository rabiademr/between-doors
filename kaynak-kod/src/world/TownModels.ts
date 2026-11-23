// View layer (3D): model kits around and inside the play area — KayKit city terraces beyond the north,
// south and east boundary walls, suburban houses on the west side around Postmark Mews, a skyline of
// low-detail towers behind them, a house over the yard's north block, café parasols on Dial Square and the
// street props from the map data. Purely visual and loaded after the world is playable; colliders come
// from WorldBuilder (gameplay blocks, prop collider boxes), so a late or failed model changes nothing.
// Models: Kenney City Kit Suburban 2.0 + City Kit Commercial 2.1, KayKit City Builder Bits 1.0 (all CC0,
// textures embedded; see CREDITS.md).
import type { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import { Texture } from '@babylonjs/core/Materials/Textures/texture';
import type { Material } from '@babylonjs/core/Materials/material';
import type { Scene } from '@babylonjs/core/scene';
import { assetUrl } from '@asset-source';
import type { Prop } from '../domain/world/worldData';
import { BUILDINGS, CITY_SCALE, PROP_KIT, propColliderName } from './cityKit';
import { dressDistricts } from './districtDressing';
import { ModelLibrary, type Placement } from './modelLibrary';
import { PALETTE } from './palette';
import { cityRows, coreOpenings, townPlacements, type Bounds, type KenneyPlacement, type Variant } from './townLayout';

const VARIANT_TEXTURES: Record<Exclude<Variant, 'default'>, string> = {
  a: 'textures/suburban-variation-a.png',
  c: 'textures/suburban-variation-c.png',
};

const FACE_NORTH = 0;

/** Fixed pieces inside the play area. */
const INNER: KenneyPlacement[] = [
  // Café terrace on the east side of Dial Square (clear of Finn's patrol and the back lane).
  { model: 'com-detail-parasol-a', x: 21, z: 32, rotY: 0, scale: 6 },
  { model: 'com-detail-parasol-b', x: 25, z: 32, rotY: 0, scale: 6 },
  { model: 'com-detail-parasol-a', x: 23, z: 36.5, rotY: 0, scale: 6 },
];

/** A house drawn over the gameplay block `blockName` (footprint x0..x1, z0..z1); the block becomes invisible. */
interface BlockSkin {
  blockName: string;
  model: string;
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  rotY: number;
  variant: Variant;
}
const SKINS: BlockSkin[] = [
  { blockName: 'yardNorthBlock', model: 'sub-building-type-n', x0: 18, x1: 28, z0: 12, z1: 21, rotY: FACE_NORTH, variant: 'a' },
];

/** Glossy kit surfaces (glTF roughness 0.4) made matte so they sit with our flat-coloured blocks. */
function matteMaterials(): (m: Material) => Material {
  const done = new Set<Material>();
  return (m) => {
    if (!done.has(m) && 'roughness' in m) {
      const pbr = m as PBRMaterial;
      pbr.roughness = PALETTE.kitRoughness;
      pbr.metallic = 0;
      done.add(m);
    }
    return m;
  };
}

/**
 * @param core the hand-built core (Indigo Row + Dial Square) and its walls; @param outer all active districts.
 * @param props street props from the map data (their colliders are already in the scene).
 * @param onProgress called as placements finish (done, total) — drives the loading indicator.
 */
export async function loadTown(
  scene: Scene,
  core: Bounds,
  outer: Bounds,
  coreWalls: readonly { x0: number; x1: number; z0: number; z1: number }[],
  props: readonly Prop[],
  onProgress?: (done: number, total: number) => void,
): Promise<void> {
  const lib = new ModelLibrary(scene);
  const matte = matteMaterials();

  // Variant texture URLs (blob: URLs in the zip build) before any Kenney placement, so materialFor can stay
  // synchronous. Only Kenney jobs wait for them: a failure there never holds back the city kit or the props.
  let variantUrls: Record<Exclude<Variant, 'default'>, string> = { a: '', c: '' };
  const urlsReady = Promise.all([assetUrl(VARIANT_TEXTURES.a), assetUrl(VARIANT_TEXTURES.c)]).then(([a, c]) => {
    variantUrls = { a, c };
  });
  const variantTextures = new Map<Variant, Texture>();
  const variantMaterials = new Map<string, Material>();
  const materialFor = (base: Material, variant: Variant): Material => {
    if (variant === 'default') return matte(base);
    const key = `${base.uniqueId}|${variant}`;
    let m = variantMaterials.get(key);
    if (!m) {
      let tex = variantTextures.get(variant);
      if (!tex) {
        tex = new Texture(variantUrls[variant], scene, { invertY: false, samplingMode: Texture.NEAREST_SAMPLINGMODE });
        variantTextures.set(variant, tex);
      }
      const clone = base.clone(`${base.name}_${variant}`) as PBRMaterial;
      clone.albedoTexture = tex;
      m = matte(clone);
      variantMaterials.set(key, m);
    }
    return m;
  };
  const kenney = (p: KenneyPlacement, extra?: Partial<Placement>): Placement => ({
    asset: `models/town/${p.model}.glb`,
    x: p.x,
    z: p.z,
    rotY: p.rotY,
    scale: p.scale,
    material: (m) => materialFor(m, p.variant ?? 'default'),
    ...extra,
  });
  const kayKit = (asset: string, x: number, z: number, rotY: number, anchor: Placement['anchor'], name?: string): Placement => ({
    asset,
    x,
    z,
    rotY,
    scale: CITY_SCALE,
    anchor,
    material: matte,
    ...(name ? { name } : {}),
  });

  const jobs: Promise<unknown>[] = [];
  for (const p of [...townPlacements(core, outer), ...INNER]) jobs.push(urlsReady.then(() => lib.place(kenney(p))));
  for (const r of cityRows(core, coreOpenings(core, coreWalls))) jobs.push(lib.place(kayKit(BUILDINGS[r.model].asset, r.x, r.z, r.rotY, 'ground')));
  // Street props: yaw in degrees, clockwise from above (Babylon's +rotation.y turns +Z towards +X).
  for (const p of props) {
    jobs.push(
      lib.place(kayKit(PROP_KIT[p.model].asset, p.x, p.z, (p.rotate * Math.PI) / 180, 'footprint', p.id)).then(() => {
        const stand = scene.getMeshByName(propColliderName(p.id));
        if (stand) stand.isVisible = false; // the model is in: the block stays as the collider only
      }),
    );
  }
  for (const s of SKINS) {
    jobs.push(
      (async () => {
        await urlsReady;
        // Measure the model's footprint so it covers the block exactly (no invisible walls sticking out).
        const asset = `models/town/${s.model}.glb`;
        const box = await lib.bounds(asset);
        const turned = Math.abs(Math.sin(s.rotY)) > 0.5;
        const w = turned ? box.maxZ - box.minZ : box.maxX - box.minX;
        const d = turned ? box.maxX - box.minX : box.maxZ - box.minZ;
        const sx = (s.x1 - s.x0) / w;
        const sz = (s.z1 - s.z0) / d;
        const scale = Math.min(sx, sz);
        await lib.place(
          kenney(
            { model: s.model, x: (s.x0 + s.x1) / 2, z: (s.z0 + s.z1) / 2, rotY: s.rotY, scale, variant: s.variant },
            { stretch: { x: (turned ? sz : sx) / scale, z: (turned ? sx : sz) / scale, y: 1 }, anchor: 'footprint' },
          ),
        );
        const block = scene.getMeshByName(s.blockName);
        if (block) {
          block.isVisible = false; // still collides; still stops the camera
          block.metadata = { ...(block.metadata ?? {}), cameraBlocker: true };
        }
      })(),
    );
  }
  // The outer districts: baked dressing now, terrace models and the like as further jobs.
  jobs.push(...dressDistricts(scene, lib, { core, walls: coreWalls, material: matte }));
  let finished = 0;
  const report = (): void => onProgress?.(++finished, jobs.length);
  for (const job of jobs) void job.then(report, report);
  const results = await Promise.allSettled(jobs);
  const failed = results.filter((r) => r.status === 'rejected');
  if (failed.length) console.warn(`Town: ${failed.length} model placements failed.`, failed[0]);
}
