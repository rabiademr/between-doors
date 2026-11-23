// KayKit City Builder Bits 1.0 (CC0) → src/assets/models/city/*.glb with the shared texture embedded
// (file:// builds cannot read a separate .bin/.png). Geometry and materials unchanged.
// Usage: node build/city/convert.mjs   (needs the pack unzipped in asset-inbox/, see CREDITS.md)
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const SRC = 'asset-inbox/KayKit_City_Builder_Bits_1.0_FREE/KayKit_City_Builder_Bits_1.0_FREE/Assets/gltf';
const OUT = 'src/assets/models/city';

/** Source name → output name (kebab-case, like the rest of models/). */
const MODELS = {
  // Buildings without their pavement slab: our ground and sidewalks come from the map data.
  ...Object.fromEntries('ABCDEFGH'.split('').map((k) => [`building_${k}_withoutBase`, `building-${k.toLowerCase()}`])),
  bench: 'bench',
  bush: 'bush',
  box_A: 'box-a',
  box_B: 'box-b',
  dumpster: 'dumpster',
  firehydrant: 'firehydrant',
  trash_A: 'trash-a',
  trash_B: 'trash-b',
  watertower: 'watertower',
  car_hatchback: 'car-hatchback',
  car_sedan: 'car-sedan',
  car_stationwagon: 'car-stationwagon',
  car_taxi: 'car-taxi',
};

if (!existsSync(SRC)) {
  console.error(`Missing ${SRC} — unzip KayKit_City_Builder_Bits_1.0_FREE.zip into asset-inbox/ first.`);
  process.exit(1);
}
mkdirSync(OUT, { recursive: true });
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
for (const [src, out] of Object.entries(MODELS)) {
  execFileSync(npx, ['--yes', '@gltf-transform/cli@4.5.1', 'copy', join(SRC, `${src}.gltf`), join(OUT, `${out}.glb`)], {
    stdio: ['ignore', 'ignore', 'inherit'],
    shell: process.platform === 'win32',
  });
  console.log(`${src} → ${out}.glb`);
}
