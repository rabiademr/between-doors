// Pure placement math (no Babylon) for ModelLibrary.

/**
 * Where to put a model's origin so the centre of its footprint lands on (x, z), given the footprint centre in
 * model units, the scale and the yaw (Babylon rotation.y: model +X → (cos, −sin), model +Z → (sin, cos)).
 */
export function footprintOrigin(
  x: number,
  z: number,
  centre: { x: number; z: number },
  scale: { x: number; z: number },
  rotY: number,
): { x: number; z: number } {
  const ox = centre.x * scale.x;
  const oz = centre.z * scale.z;
  const cos = Math.cos(rotY);
  const sin = Math.sin(rotY);
  return { x: x - (cos * ox + sin * oz), z: z - (-sin * ox + cos * oz) };
}
