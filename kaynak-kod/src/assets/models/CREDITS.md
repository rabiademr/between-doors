# Asset credits

## Characters (`chars/`, since v2)

| Files | Source | Author | License |
|---|---|---|---|
| `chars/*.glb` (27 characters: story cast `courier, mara, finn, june, arthur` + townsfolk) | Ultimate Animated Character Pack, `.blend` files (https://quaternius.com/packs/ultimatedanimatedcharacter.html) | Quaternius | CC0 1.0 |
| `chars/anims.glb` | same pack: the shared rig + its 17 actions (exported from `Casual_Male.blend`, meshes removed) | Quaternius | CC0 1.0 |

Converted with Blender 5.3 by `build/characters/convert.mjs` (cast in `build/characters/cast.json`): materials rebuilt as
matte colours, skin tones and some clothing colours changed, eyes darkened; geometry and rig unchanged.
CC0 allows commercial use (Steam); credit is voluntary.

v1 used Kenney Mini Characters 2.0 (CC0) for the cast; replaced in v2.

## Town models (`town/`) and textures (`../textures/`)

| Files | Source | Author | License |
|---|---|---|---|
| `town/sub-*.glb` (houses `building-type-a, b, c, d, e, h, k, n, o, s, u`) | City Kit (Suburban) 2.0 (https://kenney.nl/assets/city-kit-suburban) | Kenney (www.kenney.nl) | CC0 1.0 |
| `../textures/suburban-variation-a.png`, `suburban-variation-c.png` | same pack, `Models/Textures/variation-*.png` (alternate colour schemes) | Kenney | CC0 1.0 |
| `town/com-*.glb` (`low-detail-building-*`, `detail-parasol-a/b`) | City Kit (Commercial) 2.1 (https://kenney.nl/assets/city-kit-commercial) | Kenney (www.kenney.nl) | CC0 1.0 |

GLB files converted with `gltf-transform copy` (embedded `colormap.png`); geometry unchanged.

## City kit (`city/`, since v2 F2.4)

| Files | Source | Author | License |
|---|---|---|---|
| `city/building-a … h.glb` (the `building_*_withoutBase` variants), `bench, bush, box-a, box-b, dumpster, firehydrant, trash-a, trash-b, watertower`, `car-hatchback, car-sedan, car-stationwagon, car-taxi` | KayKit City Builder Bits 1.0 (https://kaylousberg.itch.io/city-builder-bits) | Kay Lousberg (www.kaylousberg.com) | CC0 1.0 |

Converted with `build/city/convert.mjs` (`gltf-transform copy`, shared `citybits_texture.png` embedded); geometry unchanged.
In game the materials are made matte (roughness 0.9, `world/palette.ts`). CC0 allows commercial use (Steam); credit is voluntary.

## Animals (`animals/`, since v2 F3)

| Files | Source | Author | License |
|---|---|---|---|
| `animals/cat.glb`, `animals/dog.glb` (mesh, rig and the pack's own `Idle` / `Walking` actions) | Animal Pack Vol.2, `.blend` files (https://quaternius.com) | Quaternius | CC0 1.0 |

Converted with Blender 5.3 by `build/animals/convert.mjs` (same Blender script as the characters): the plain-colour
materials are rebuilt as matte colours, no textures; geometry and rig unchanged. Coat colours are changed in game
(`world/Animals.ts`). CC0 allows commercial use (Steam); credit is voluntary.
