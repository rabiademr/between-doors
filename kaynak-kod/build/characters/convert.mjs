// Converts the Quaternius "Ultimate Animated Character Pack" (.blend, CC0) into the game's character kit:
//   src/assets/models/chars/<id>.glb   — one per cast entry, mesh + skeleton, no animations
//   src/assets/models/chars/anims.glb  — skeleton + the 17 shared actions (every UACP character has the same rig)
// Usage:  node build/characters/convert.mjs [--only id1,id2] [--out dir]
// Needs Blender (BLENDER env var, or the default Windows install path) and the pack unzipped at
// asset-inbox/UACP_Blends/Blends (asset-inbox is git-ignored; the GLB outputs are committed).
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const cast = JSON.parse(readFileSync(join(here, 'cast.json'), 'utf8'));
const argv = process.argv.slice(2);
const flag = (name) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
};
const only = flag('--only')?.split(',');
const outDir = resolve(root, flag('--out') ?? 'src/assets/models/chars');
const blendDir = resolve(root, cast.source);
const blender = process.env.BLENDER ?? 'C:/Program Files/Blender Foundation/Blender 5.3/blender.exe';
const script = join(here, 'blend2glb.py');

if (!existsSync(blender)) throw new Error(`Blender not found at ${blender} (set BLENDER)`);
if (!existsSync(blendDir)) throw new Error(`UACP .blend files not found at ${blendDir}`);
mkdirSync(outDir, { recursive: true });

const run = (blend, out, options) => {
  // --disable-autoexec: never run Python embedded in a downloaded .blend.
  const log = execFileSync(
    blender,
    ['-b', '--disable-autoexec', '--factory-startup', join(blendDir, blend), '--python', script, '--', out, JSON.stringify(options)],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  );
  for (const line of log.split('\n')) if (line.startsWith('WARN')) console.warn(`  ${blend}: ${line}`);
  if (!log.includes('DONE')) throw new Error(`Blender did not finish ${blend}`);
};

const skin = (entry) => cast.skinTones[entry.skin ?? cast.defaultSkin];
const entries = Object.entries(cast.characters).filter(([id]) => !only || only.includes(id));
for (const [id, entry] of entries) {
  const colors = {
    ...(entry.skinMaterial === false ? {} : { ...(cast.defaultColors ?? {}), Skin: skin(entry) }),
    ...(entry.colors ?? {}),
  };
  process.stdout.write(`${id} ← ${entry.blend} … `);
  run(entry.blend, join(outDir, `${id}.glb`), { animations: false, colors });
  console.log('ok');
}
if (!only || only.includes('anims')) {
  process.stdout.write(`anims ← ${cast.animations} … `);
  run(cast.animations, join(outDir, 'anims.glb'), { animations: true, skeletonOnly: true });
  console.log('ok');
}
