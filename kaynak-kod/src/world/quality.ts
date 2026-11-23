// View (3D): what each graphics level means for the renderer. The setting and the frame-rate probe are in
// domain/quality; this file only turns a level into engine, post-process, shadow and fog settings.
import type { Engine } from '@babylonjs/core/Engines/engine';
import { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator';
import type { DefaultRenderingPipeline } from '@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/defaultRenderingPipeline';
import type { Scene } from '@babylonjs/core/scene';
import type { QualityLevel } from '../domain/quality';
import { PALETTE } from './palette';

export interface QualityPreset {
  /** Render at 1 / this of the canvas resolution (1 = full). */
  hardwareScaling: number;
  /** MSAA samples of the post-process (1 = off; FXAA still smooths edges). */
  msaaSamples: number;
  bloom: boolean;
  shadowMapSize: number;
  shadowFilter: number;
  fogStart: number;
  fogEnd: number;
}

export const QUALITY_PRESETS: Record<QualityLevel, QualityPreset> = {
  high: {
    hardwareScaling: 1,
    msaaSamples: 4,
    bloom: true,
    shadowMapSize: 2048,
    shadowFilter: ShadowGenerator.QUALITY_MEDIUM,
    fogStart: PALETTE.fog.start,
    fogEnd: PALETTE.fog.end,
  },
  // A weak laptop: a fifth fewer pixels, no multisampling or bloom, a smaller shadow map, and the fog closes in
  // sooner so the outer districts are hidden earlier (the streamer follows the fog).
  low: {
    hardwareScaling: 1.25,
    msaaSamples: 1,
    bloom: false,
    shadowMapSize: 1024,
    shadowFilter: ShadowGenerator.QUALITY_LOW,
    fogStart: 30,
    fogEnd: 95,
  },
};

export interface QualityTargets {
  engine: Engine;
  scene: Scene;
  pipeline: DefaultRenderingPipeline;
  /** View distance: everything beyond is hidden (the fog end plus a margin). */
  setViewDistance(metres: number): void;
  /** People and animals: hidden sooner on low. */
  setLowCrowd(low: boolean): void;
}

/** Margin past full fog before a district is switched off. */
const STREAM_MARGIN = 10;

export function applyQuality(level: QualityLevel, t: QualityTargets): void {
  const p = QUALITY_PRESETS[level];
  t.engine.setHardwareScalingLevel(p.hardwareScaling);
  t.pipeline.samples = p.msaaSamples;
  t.pipeline.bloomEnabled = p.bloom;
  const sun = t.scene.getLightByName('sun');
  const shadows = sun?.getShadowGenerator() as ShadowGenerator | null | undefined;
  if (shadows) {
    if (shadows.mapSize !== p.shadowMapSize) shadows.mapSize = p.shadowMapSize; // Babylon rebuilds the map
    shadows.filteringQuality = p.shadowFilter;
  }
  t.scene.fogStart = p.fogStart;
  t.scene.fogEnd = p.fogEnd;
  t.setViewDistance(p.fogEnd + STREAM_MARGIN);
  t.setLowCrowd(level === 'low');
}
