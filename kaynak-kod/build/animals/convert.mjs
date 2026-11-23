// Converts the cat and the dog of the Quaternius "Animal Pack Vol.2" (.blend, CC0) into the game's animals:
//   src/assets/models/animals/cat.glb, dog.glb — mesh + skeleton + their own two actions (Idle, Walking)
// Usage:  node build/animals/convert.mjs [--only cat,dog] [--out dir]
// Needs Blender (BLENDER env var, or the default Windows install path) and the pack unzipped under
// asset-inbox/ (git-ignored; the GLB outputs are committed).
//
// The pack has no textures: every material is a plain Diffuse BSDF colour, which the shared Blender script
// (build/characters/blend2glb.py) rebuilds as a matte Principled BSDF — so the GLBs are self-contained and
// load from file://. Coat colours are varied in game (world/Animals.ts), not here.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const SOURCE = 'asset-inbox/Animal_Pack_Vol.2_by__Quaternius/Animal Pack Vol.2 by @Quaternius/Blends';
/** Asset id → .blend in the pack. (Eagle, wolf and piranha are not used.) */
const ANIMALS = { cat: 'Cat.blend', dog: 'Dog.blend' };

const argv = process.argv.slice(2);
const flag = (name) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
};
const only = flag('--only')?.split(',');
const outDir = resolve(root, flag('--out') ?? 'src/assets/models/animals');
const blendDir = resolve(root, flag('--source') ?? SOURCE);
const blender = process.env.BLENDER ?? 'C:/Program Files/Blender Foundation/Blender 5.3/blender.exe';
const script = resolve(here, '../characters/blend2glb.py');

if (!existsSync(blender)) throw new Error(`Blender not found at ${blender} (set BLENDER)`);
if (!existsSync(blendDir)) throw new Error(`Animal pack .blend files not found at ${blendDir}`);
mkdirSync(outDir, { recursive: true });

for (const [id, blend] of Object.entries(ANIMALS).filter(([id]) => !only || only.includes(id))) {
  process.stdout.write(`${id} ← ${blend} … `);
  const out = join(outDir, `${id}.glb`);
  // --disable-autoexec: never run Python embedded in a downloaded .blend.
  const log = execFileSync(
    blender,
    ['-b', '--disable-autoexec', '--factory-startup', join(blendDir, blend), '--python', script, '--', out, JSON.stringify({ animations: true })],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  );
  for (const line of log.split('\n')) if (line.startsWith('WARN')) console.warn(`  ${blend}: ${line}`);
  if (!log.includes('DONE')) throw new Error(`Blender did not finish ${blend}`);
  console.log(`ok (${Math.round(statSync(out).size / 1024)} kB)`);
}
