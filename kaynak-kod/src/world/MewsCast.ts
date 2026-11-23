// View layer (3D): the people of chapter 3's finale in Postmark Mews — Mara, Finn and June waiting at the
// table (seated on the chairs WorldBuilder puts there), and Arthur, who appears at his door for the handover
// and then sits down with them for the final picture.
// Plus `captureView`, which renders a fixed camera view to an image (Sylvie's old photo, the final picture).
import { TargetCamera } from '@babylonjs/core/Cameras/targetCamera';
import { CreateScreenshotUsingRenderTargetAsync } from '@babylonjs/core/Misc/screenshotTools';
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import type { Scene } from '@babylonjs/core/scene';
import { Quaternion } from '@babylonjs/core/Maths/math.vector';
import { fitModel, loadCharacter, type CharacterModel } from '../player/CharacterModel';
import { SEATED_ARMS } from '../player/gestures';
import { NPC_HEIGHT } from './Npc';
import type { ColliderMeta } from './SceneColliders';
import type { CameraView, MewsLayout, NpcPlacement } from './WorldBuilder';

export class MewsCast {
  private readonly scene: Scene;
  private readonly layout: MewsLayout;
  private readonly guests: TransformNode[] = [];
  private readonly arthur: TransformNode;
  private readonly modelUrls: Record<string, string>;
  private modelsRequested = false;
  private enabled = false;
  private arthurModel: CharacterModel | null = null;
  private arthurSeated = false;
  /** Seated models and their arm bones (SEATED_ARMS is re-applied after the clips every frame). */
  private readonly seated = new Map<CharacterModel, { bone: TransformNode; rotation: Quaternion }[]>();
  private readonly savedBones: { bone: TransformNode; rotation: Quaternion }[] = [];

  /** @param modelUrls GLB url per placement id (npc_mara, npc_finn, npc_june, npc_arthur). */
  constructor(scene: Scene, layout: MewsLayout, modelUrls: Record<string, string>) {
    this.scene = scene;
    this.layout = layout;
    this.modelUrls = modelUrls;
    for (const g of layout.guests) this.guests.push(this.spawn(g, true));
    this.arthur = this.spawn(layout.arthurDoorstep, false);
    this.setEnabled(false);
    scene.onBeforeAnimationsObservable.add(() => this.restoreArms());
    scene.onAfterAnimationsObservable.add(() => this.restArms());
  }

  /** Neighbours are only in the mews during chapter 3. Arthur stays indoors until the handover. */
  setEnabled(on: boolean): void {
    if (on) this.loadModels(); // only sessions that reach chapter 3 pay for these models
    this.enabled = on;
    for (const g of this.guests) g.setEnabled(on);
    this.arthur.setEnabled(false);
    if (on) this.standArthurAtDoor();
  }

  /** Arthur opens his door. */
  showArthurAtDoor(): void {
    if (!this.enabled) return;
    this.standArthurAtDoor();
    this.arthur.setEnabled(true);
  }

  hideArthur(): void {
    this.arthur.setEnabled(false);
  }

  /** Arthur joins the neighbours at the table (final picture). */
  moveArthurToTable(): void {
    this.place(this.arthur, this.layout.arthurSeat);
    this.arthurSeated = true;
    if (this.arthurModel) this.pose(this.arthurModel, true);
    this.arthur.setEnabled(true);
  }

  private standArthurAtDoor(): void {
    this.place(this.arthur, this.layout.arthurDoorstep);
    this.arthurSeated = false;
    if (this.arthurModel) this.pose(this.arthurModel, false);
  }

  /** Seated: the last frame of 'sit-down' held still, arms brought down into the lap; standing: idle loop. */
  private pose(model: CharacterModel, seated: boolean): void {
    const idle = model.clips.get('idle');
    const sit = model.clips.get('sit-down');
    if (seated && sit) {
      idle?.stop();
      sit.start(false, 1, sit.to, sit.to);
      sit.weight = 1;
      const bones = model.root.getChildTransformNodes(false);
      this.seated.set(
        model,
        SEATED_ARMS.flatMap((o) => {
          const bone = bones.find((b) => b.name === o.bone);
          return bone ? [{ bone, rotation: Quaternion.RotationYawPitchRoll(o.y, o.x, o.z) }] : [];
        }),
      );
    } else {
      sit?.stop();
      this.seated.delete(model);
      idle?.start(true);
    }
  }

  private restArms(): void {
    for (const arms of this.seated.values()) {
      for (const { bone, rotation } of arms) {
        if (!bone.rotationQuaternion || !bone.isEnabled()) continue;
        this.savedBones.push({ bone, rotation: bone.rotationQuaternion });
        bone.rotationQuaternion = bone.rotationQuaternion.multiply(rotation);
      }
    }
  }

  /** Undo last frame's offsets before the clips run again (a held clip does not rewrite the bones). */
  private restoreArms(): void {
    for (const { bone, rotation } of this.savedBones) bone.rotationQuaternion = rotation;
    this.savedBones.length = 0;
  }

  private place(node: TransformNode, p: NpcPlacement): void {
    node.position.copyFrom(p.position);
    node.rotation.y = p.heading;
  }

  private loadModels(): void {
    if (this.modelsRequested) return;
    this.modelsRequested = true;
    const nodes: [NpcPlacement, TransformNode][] = [
      ...this.layout.guests.map((g, i): [NpcPlacement, TransformNode] => [g, this.guests[i] ?? this.arthur]),
      [this.layout.arthurDoorstep, this.arthur],
    ];
    for (const [p, node] of nodes) {
      const url = this.modelUrls[p.id];
      if (!url) continue;
      loadCharacter(this.scene, url)
        .then((model) => {
          fitModel(model, node, NPC_HEIGHT);
          const isArthur = node === this.arthur;
          if (isArthur) this.arthurModel = model;
          this.pose(model, isArthur ? this.arthurSeated : true);
        })
        .catch((err: unknown) => console.warn(`Mews character ${p.id} failed to load.`, err));
    }
  }

  private spawn(p: NpcPlacement, solid: boolean): TransformNode {
    const node = new TransformNode(`mews_${p.id}`, this.scene);
    this.place(node, p);
    if (solid) {
      // Invisible collider so the player can't walk through the guests.
      const c = CreateBox(`${p.id}_mews_collider`, { width: 0.7, height: 1.8, depth: 0.7 }, this.scene);
      c.parent = node;
      c.position.y = 0.9;
      c.isVisible = false;
      c.isPickable = false;
      c.checkCollisions = true;
      c.metadata = { collider: 'circle', dynamicCollider: true } satisfies ColliderMeta; // the cast is moved between scenes
    }
    return node;
  }
}

/** Render a fixed camera view to a PNG data URL (no post-process; the UI adds the photo look). */
export async function captureView(scene: Scene, view: CameraView, width = 640, height = 400, fov = 0.85): Promise<string> {
  const cam = new TargetCamera('snapshotCam', view.from.clone(), scene, false);
  cam.setTarget(view.to.clone());
  cam.fov = fov;
  cam.minZ = 0.1;
  try {
    return await CreateScreenshotUsingRenderTargetAsync(scene.getEngine(), cam, { width, height }, 'image/png', 4, true);
  } finally {
    cam.dispose();
  }
}
