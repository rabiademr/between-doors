// Pure: which asset pack ("kit") an asset belongs to. Shared by the runtime (packs source) and the
// build (vite.config.ts writes one packs/<kit>.js per kit), so both always agree.
//
// Asset ids are paths under src/assets with forward slashes, e.g.
//   'models/courier.glb'         → 'core'   (files directly in models/ or textures/)
//   'models/town/sub-a.glb'      → 'town'   (first sub-folder of models/ or textures/)

/** Kit of an asset id. Only letters, digits, '-' and '_' survive, so a kit is always a safe file name. */
export function kitOf(id: string): string {
  const parts = id.split('/');
  // ['models', 'courier.glb'] → core; ['models', 'town', 'x.glb'] → town
  const folder = parts.length > 2 ? parts[1] : 'core';
  return (folder ?? 'core').toLowerCase().replace(/[^a-z0-9_-]/g, '_') || 'core';
}

/** File name of a kit's pack, relative to index.html. */
export function packFileName(kit: string): string {
  return `packs/${kit}.js`;
}

/** Global function each pack calls to hand over its assets: __BD_PACK__(kit, { id: base64 }). */
export const PACK_CALLBACK = '__BD_PACK__';
