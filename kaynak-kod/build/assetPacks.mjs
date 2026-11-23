// Build-only (Node): Vite plugin that writes packs/<kit>.js for the zip build — every model/texture under
// src/assets as base64, grouped by kit (see src/assets/packKit.ts). Plain JS so the app's tsconfig needs
// no Node types; typed by assetPacks.d.mts.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PACK_CALLBACK, kitOf, packFileName } from '../src/assets/packKit.ts';

const ASSETS = fileURLToPath(new URL('../src/assets', import.meta.url));

/** @returns {import('vite').Plugin} */
export function assetPacks() {
  return {
    name: 'bd-asset-packs',
    apply: 'build',
    generateBundle() {
      /** @type {Map<string, Record<string, string>>} */
      const kits = new Map();
      for (const file of walk(ASSETS)) {
        if (!/\.(glb|png|jpe?g|webp)$/i.test(file)) continue;
        const id = relative(ASSETS, file).split(sep).join('/');
        const kit = kitOf(id);
        const pack = kits.get(kit) ?? {};
        pack[id] = readFileSync(file).toString('base64');
        kits.set(kit, pack);
      }
      for (const [kit, pack] of kits) {
        this.emitFile({ type: 'asset', fileName: packFileName(kit), source: `${PACK_CALLBACK}(${JSON.stringify(kit)},${JSON.stringify(pack)});\n` });
      }
    },
  };
}

/** @param {string} dir @returns {string[]} */
function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}
