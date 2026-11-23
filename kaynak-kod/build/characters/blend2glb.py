# Blender (background) script: one Quaternius UACP .blend → one self-contained GLB for Between Doors.
# Run by build/characters/convert.mjs:
#   blender -b --disable-autoexec --factory-startup <file.blend> --python blend2glb.py -- <out.glb> <options-json>
# options: {"animations": bool, "skeletonOnly": bool, "colors": {"<material name>": "#rrggbb"}}
#
# - UACP materials have two Material Output nodes (EEVEE + Cycles); glTF only reads a single Principled BSDF,
#   so each material is rebuilt as one matte Principled BSDF with the colour it shows (or an override).
# - skeletonOnly: delete the meshes and export just the armature + all actions (the shared animation file).
import json
import sys

import bpy

args = sys.argv[sys.argv.index('--') + 1:]
out = args[0]
opts = json.loads(args[1]) if len(args) > 1 else {}
overrides = {k: v for k, v in (opts.get('colors') or {}).items()}


def srgb_to_linear(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def hex_to_linear(h):
    h = h.lstrip('#')
    return tuple(srgb_to_linear(int(h[i:i + 2], 16) / 255) for i in (0, 2, 4)) + (1.0,)


def shown_colour(mat):
    nt = mat.node_tree
    outputs = [n for n in nt.nodes if n.type == 'OUTPUT_MATERIAL']
    active = next((n for n in outputs if n.is_active_output), outputs[0] if outputs else None)
    if active and active.inputs['Surface'].links:
        src = active.inputs['Surface'].links[0].from_node
        for key in ('Base Color', 'Color'):
            if key in src.inputs:
                return tuple(src.inputs[key].default_value)
    return tuple(mat.diffuse_color)


for m in bpy.data.materials:
    if not m.use_nodes or not m.node_tree:
        continue
    colour = hex_to_linear(overrides[m.name]) if m.name in overrides else shown_colour(m)
    nt = m.node_tree
    nt.nodes.clear()
    bsdf = nt.nodes.new('ShaderNodeBsdfPrincipled')
    bsdf.inputs['Base Color'].default_value = colour
    bsdf.inputs['Roughness'].default_value = 1.0
    bsdf.inputs['Metallic'].default_value = 0.0
    output = nt.nodes.new('ShaderNodeOutputMaterial')
    nt.links.new(bsdf.outputs['BSDF'], output.inputs['Surface'])

unknown = [k for k in overrides if k not in bpy.data.materials]
if unknown:
    print('WARN unknown materials', unknown, 'available', [m.name for m in bpy.data.materials])

if opts.get('skeletonOnly'):
    for o in [o for o in bpy.data.objects if o.type == 'MESH']:
        bpy.data.objects.remove(o, do_unlink=True)

bpy.ops.export_scene.gltf(
    filepath=out,
    export_format='GLB',
    export_animations=bool(opts.get('animations')),
    export_animation_mode='ACTIONS',
    export_apply=False,
    export_yup=True,
    export_image_format='NONE',
)
print('DONE', out)
