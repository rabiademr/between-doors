// View layer (3D): mood of the scene — sky dome, fog, sun shadows and the camera post-process.
// Purely visual; nothing here affects collisions, interaction or rules.
import type { Camera } from '@babylonjs/core/Cameras/camera';
import type { DirectionalLight } from '@babylonjs/core/Lights/directionalLight';
import { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator'; // also registers the scene component
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture';
import { ImageProcessingConfiguration } from '@babylonjs/core/Materials/imageProcessingConfiguration';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Texture } from '@babylonjs/core/Materials/Textures/texture';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import { CreateSphere } from '@babylonjs/core/Meshes/Builders/sphereBuilder';
import { DefaultRenderingPipeline } from '@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/defaultRenderingPipeline';
import { Scene } from '@babylonjs/core/scene';
import { PALETTE } from './palette';

const FOG = Color3.FromHexString(PALETTE.fog.colour);

/** Casters smaller than this (m, bounding-sphere radius) never cast: shoes, a single cup — invisible at this map size. */
const MIN_CASTER_RADIUS = 0.2;
/** Slack around the shadow square (m): a caster this far outside still gets picked. */
const SHADOW_REACH = 2;
/** Re-pick the casters when the camera moved this far (m), or this often (ms) for walking people. */
const RECULL_DISTANCE = 4;
const RECULL_MS = 500;

/** Meshes whose name matches never cast shadows (flat ground layers, invisible helpers, the sky). */
const NO_CAST = /^(ground|road|squarePaving|yardGravel|sidewalk|curb|roadLine|sky|.*_collider$|player$|hint.*)/;

export interface Atmosphere {
  shadows: ShadowGenerator;
}

export function setupAtmosphere(scene: Scene, sun: DirectionalLight): Atmosphere {
  scene.clearColor = Color4.FromColor3(FOG, 1);
  scene.fogMode = Scene.FOGMODE_LINEAR;
  scene.fogColor = FOG;
  scene.fogStart = PALETTE.fog.start;
  scene.fogEnd = PALETTE.fog.end;

  buildSkyDome(scene);

  // The shadow map covers a fixed square around the camera and moves with it (snapped to whole metres so
  // shadow edges don't shimmer), instead of stretching over the whole map.
  sun.autoUpdateExtends = false;
  sun.shadowFrustumSize = PALETTE.shadowArea;
  sun.shadowMinZ = 1;
  sun.shadowMaxZ = 160;
  const follow = (): void => {
    const cam = scene.activeCamera;
    const x = Math.round(cam?.position.x ?? 0);
    const z = Math.round(cam?.position.z ?? 0);
    sun.position.set(x - sun.direction.x * 80, -sun.direction.y * 80, z - sun.direction.z * 80);
  };
  follow();
  scene.onBeforeRenderObservable.add(follow);
  const shadows = new ShadowGenerator(2048, sun);
  shadows.usePercentageCloserFiltering = true;
  shadows.filteringQuality = ShadowGenerator.QUALITY_MEDIUM;
  // Bias is relative to the light's depth range (~150 m here), so it must stay tiny or thin casters
  // (characters, lamp posts) lose their shadows.
  shadows.bias = 0.002;
  shadows.normalBias = 0.03;
  shadows.setDarkness(PALETTE.sun.shadowDarkness);

  // Every possible caster is kept here; the shadow map draws only those near its square. Babylon does not
  // cull a shadow map's render list, so without this the shadow pass drew every enabled caster within the
  // streaming radius (≈1400 meshes in Indigo Row, 2.5× the main pass).
  const casters = new Set<AbstractMesh>();
  const register = (mesh: AbstractMesh): void => {
    if (mesh.name.startsWith('sky') || mesh.isDisposed()) return;
    mesh.receiveShadows = true;
    if (NO_CAST.test(mesh.name)) return;
    casters.add(mesh);
    mesh.onDisposeObservable.addOnce(() => casters.delete(mesh));
  };
  for (const mesh of scene.meshes) register(mesh);
  // Characters and NPCs load asynchronously: pick them up as they arrive.
  scene.onNewMeshAddedObservable.add(register);

  const initialMap = shadows.getShadowMap();
  if (initialMap) initialMap.renderList = [];
  // The shadow square lies across the sun's rays (an orthographic light looking along `sun.direction`, up = +Y):
  // a caster is in it when its offset from the square's centre, projected on the square's two axes, is within
  // half the square. On the ground that reaches further along the sun's direction (≈ ±83 m at this low sun).
  const along = sun.direction.normalizeToNew();
  const across = Vector3.Cross(Vector3.Up(), along).normalize();
  const upward = Vector3.Cross(along, across).normalize();
  const offset = new Vector3();
  let culledAt = { x: Infinity, z: Infinity };
  let sinceCull = Infinity;
  const recull = (): void => {
    const cam = scene.activeCamera;
    const x = cam?.position.x ?? 0;
    const z = cam?.position.z ?? 0;
    sinceCull += scene.getEngine().getDeltaTime();
    if (Math.hypot(x - culledAt.x, z - culledAt.z) < RECULL_DISTANCE && sinceCull < RECULL_MS) return;
    culledAt = { x, z };
    sinceCull = 0;
    const half = PALETTE.shadowArea / 2 + SHADOW_REACH;
    // The square's centre: where the light's axis meets the ground (see `follow`).
    const cx = Math.round(x);
    const cz = Math.round(z);
    const next: AbstractMesh[] = [];
    for (const m of casters) {
      // Enabled/visible is checked by Babylon every frame, so streaming in a district needs no re-pick here.
      const sphere = m.getBoundingInfo().boundingSphere;
      if (sphere.radiusWorld < MIN_CASTER_RADIUS) continue;
      const c = sphere.centerWorld;
      offset.set(c.x - cx, c.y, c.z - cz);
      const reach = half + sphere.radiusWorld;
      if (Math.abs(Vector3.Dot(offset, across)) > reach || Math.abs(Vector3.Dot(offset, upward)) > reach) continue;
      next.push(m);
    }
    // A new array, not the old one refilled: Babylon watches the list, and emptying it then filling it again
    // would mark every material in the scene for a rebuild (a hitch twice a second). The map is asked for each
    // time: a new map size (graphics quality) makes Babylon replace it.
    const shadowMap = shadows.getShadowMap();
    if (shadowMap) shadowMap.renderList = next;
  };
  scene.onBeforeRenderObservable.add(recull);

  return { shadows };
}

/**
 * Camera post-process: anti-aliasing, gentle tone mapping/contrast, a hint of bloom on bright signs, vignette.
 * Created per camera (the player camera exists only after the world is built).
 */
export function setupPostProcess(scene: Scene, camera: Camera): DefaultRenderingPipeline {
  const pipeline = new DefaultRenderingPipeline('look', false, scene, [camera]);
  pipeline.samples = 4; // MSAA on the pipeline's render target
  pipeline.fxaaEnabled = true;

  pipeline.imageProcessingEnabled = true;
  const ip = pipeline.imageProcessing;
  ip.toneMappingEnabled = true;
  ip.toneMappingType = ImageProcessingConfiguration.TONEMAPPING_KHR_PBR_NEUTRAL; // keeps the toy-like colours
  ip.exposure = PALETTE.look.exposure;
  ip.contrast = PALETTE.look.contrast;
  ip.vignetteEnabled = true;
  ip.vignetteWeight = PALETTE.look.vignetteWeight;
  ip.vignetteColor = Color4.FromColor3(Color3.FromHexString(PALETTE.look.vignette), 0);

  pipeline.bloomEnabled = true;
  pipeline.bloomThreshold = PALETTE.look.bloomThreshold;
  pipeline.bloomWeight = PALETTE.look.bloomWeight;
  pipeline.bloomKernel = 48;
  return pipeline;
}

/** Large inverted sphere with a vertical gradient; ignores fog and light so it always reads as sky. */
function buildSkyDome(scene: Scene): void {
  const sky = CreateSphere('sky', { diameter: PALETTE.view.skyRadius * 2, segments: 16, sideOrientation: 1 /* BACKSIDE */ }, scene);
  sky.isPickable = false;
  sky.infiniteDistance = true;
  sky.applyFog = false;

  const tex = new DynamicTexture('skyGradient', { width: 4, height: 256 }, scene, false);
  const ctx = tex.getContext();
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, PALETTE.sky.top);
  g.addColorStop(0.42, PALETTE.sky.middle);
  g.addColorStop(0.5, PALETTE.sky.horizon);
  g.addColorStop(1, PALETTE.sky.horizon);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 4, 256);
  tex.update(false);
  tex.wrapV = Texture.CLAMP_ADDRESSMODE;

  const m = new StandardMaterial('skyMat', scene);
  m.emissiveTexture = tex;
  m.diffuseColor = Color3.Black();
  m.specularColor = Color3.Black();
  m.disableLighting = true;
  m.backFaceCulling = false;
  m.fogEnabled = false;
  sky.material = m;
}
