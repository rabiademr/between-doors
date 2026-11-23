// Controller: plays a story scene (content/scenes.ts) one line per dialogue — the speaker's name as the
// title, a gesture, a fixed camera shot — then hands back. Escape skips the rest. The game side (dialogs,
// who talks, the camera) comes in through SceneHost, so this file stays free of GameApp.
import { SceneCursor } from '../domain/scene/scene';
import { STRINGS, localized } from '../i18n';
import type { CameraShot } from '../player/CameraRig';
import type { DialogOptions } from '../ui/UIController';
import { SCENES, SHOTS, SPEAKERS, type SceneGesture, type SceneId, type SpeakerId, type StoryLine, type StoryScene } from '../content/scenes';

export interface SceneHost {
  /** Show one line as a modal dialog. */
  openDialog(opts: DialogOptions): void;
  closeDialog(): void;
  /** Who is talking now (null: nobody); a gesture for them, if any. */
  speak(speaker: SpeakerId | null, gesture?: SceneGesture): void;
  /** A fixed camera shot, or null for the follow camera. */
  shot(shot: CameraShot | null): void;
  /** Put the courier where the scene wants them. */
  placePlayer(at: { x: number; z: number; heading: number }): void;
  /** Start the scene's music. */
  music(m: NonNullable<StoryScene['music']>): void;
}

/** A playing scene, for a host whose other dialogs can take the screen over in the middle of it. */
export interface SceneHandle {
  /** Show the current line again (another dialog had replaced it). */
  resume(): void;
  /** Stop without `onDone` (the world was reset under it); the host's dialog is left alone. */
  cancel(): void;
  readonly finished: boolean;
}

/** Play `id`; `onDone` runs once when the scene ends (last line, or skipped with Escape). */
export function playScene(id: SceneId, host: SceneHost, onDone: () => void): SceneHandle {
  const scene = SCENES[id];
  const cursor = new SceneCursor<StoryLine>(scene);
  if (scene.playerAt) host.placePlayer(scene.playerAt);
  if (scene.music) host.music(scene.music);
  let finished = false;
  const finish = (): void => {
    if (finished) return;
    finished = true;
    cursor.skip();
    host.speak(null);
    host.shot(null);
    host.closeDialog();
    onDone();
  };
  const show = (): void => {
    const line = cursor.line;
    if (!line) return finish();
    host.speak(line.speaker ?? null, line.gesture);
    host.shot(line.shot ? SHOTS[line.shot] : null);
    host.openDialog({
      placement: 'subtitle',
      title: line.speaker ? localized(SPEAKERS[line.speaker].name) : '',
      body: [localized(line.text)],
      buttons: [
        {
          label: cursor.isLast ? STRINGS.continue : STRINGS.next,
          primary: true,
          onClick: () => (cursor.next() ? show() : finish()),
        },
      ],
      onEscape: finish,
    });
  };
  show();
  return {
    resume: () => {
      if (!finished) show();
    },
    cancel: () => {
      if (finished) return;
      finished = true;
      cursor.skip();
      host.speak(null);
      host.shot(null);
    },
    get finished() {
      return finished;
    },
  };
}
