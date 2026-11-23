// Bellwick's light and colour palette in one place: the fixed late-afternoon look (no day/night).
// Plain data (hex strings, numbers); Atmosphere.ts and WorldBuilder.ts turn it into lights and materials.

export const PALETTE = {
  sky: { top: '#7fa6c9', middle: '#c9c3b6', horizon: '#f6c99a' },
  fog: { colour: '#edccad', start: 45, end: 140 },
  /** Camera far plane (just past full fog) and the sky dome radius inside it. */
  view: { far: 190, skyRadius: 170 },
  /** Shadows cover a square this wide around the camera (the map is far bigger than one shadow map). */
  shadowArea: 100,
  /** Low western sun so facades on the east side of the street glow and shadows stretch across the road. */
  sun: { direction: [0.75, -0.62, 0.35] as const, intensity: 1.1, colour: '#ffdbad', specular: '#998066', shadowDarkness: 0.45 },
  /** Cool sky fill from above, warm bounce from the paving below. */
  ambient: { intensity: 0.9, sky: '#e0ebff', ground: '#6b574d' },
  /** Camera post-process. */
  look: { exposure: 1.08, contrast: 1.12, vignetteWeight: 1.4, vignette: '#401f0d', bloomWeight: 0.18, bloomThreshold: 0.85 },
  ground: '#b9b2a6',
  wall: '#8c7f73',
  wood: '#6b4a2f',
  /** Stand-in block for a street prop whose model is still loading (or failed). */
  placeholder: '#9a9086',
  /** Model kits (Kenney, KayKit): glTF surfaces are made matte like our flat-coloured blocks. */
  kitRoughness: 0.9,
} as const;
