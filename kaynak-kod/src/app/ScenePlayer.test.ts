import { describe, expect, it } from 'vitest';
import { SCENES, type SceneId } from '../content/scenes';
import type { DialogOptions } from '../ui/UIController';
import { playScene, type SceneHost } from './ScenePlayer';

/** A host that records what the scene asks for; `dialog` is the line on screen. */
function fakeHost() {
  const log: string[] = [];
  const host: SceneHost & { dialog: DialogOptions | null } = {
    dialog: null,
    openDialog: (opts) => {
      host.dialog = opts;
      log.push(`line:${String(opts.body[0])}`);
    },
    closeDialog: () => {
      host.dialog = null;
      log.push('close');
    },
    speak: (speaker) => log.push(`speak:${speaker ?? '-'}`),
    shot: (shot) => log.push(shot ? 'shot' : 'shot:-'),
    placePlayer: () => log.push('place'),
    music: () => log.push('music'),
  };
  return { host, log };
}

const ID: SceneId = 'morning_day2';
const LINES = SCENES[ID].lines.length;

function next(host: { dialog: DialogOptions | null }): void {
  host.dialog?.buttons[0]?.onClick();
}

describe('playScene', () => {
  it('shows one line per dialog and ends once, with the follow camera back', () => {
    expect(LINES).toBeGreaterThan(1);
    const { host, log } = fakeHost();
    let done = 0;
    const handle = playScene(ID, host, () => done++);
    for (let i = 0; i < LINES; i++) next(host);
    expect(done).toBe(1);
    expect(handle.finished).toBe(true);
    expect(host.dialog).toBeNull();
    expect(log.filter((l) => l.startsWith('line:'))).toHaveLength(LINES);
    expect(log.slice(-3)).toEqual(['speak:-', 'shot:-', 'close']);
    handle.resume(); // a finished scene stays finished
    expect(host.dialog).toBeNull();
  });

  it('Escape skips the rest; onDone still runs once', () => {
    const { host } = fakeHost();
    let done = 0;
    playScene(ID, host, () => done++);
    host.dialog?.onEscape?.();
    host.dialog?.onEscape?.();
    expect(done).toBe(1);
  });

  it('resume shows the current line again after another dialog replaced it', () => {
    const { host } = fakeHost();
    let done = 0;
    const handle = playScene(ID, host, () => done++);
    next(host); // on line 2
    const line2 = host.dialog?.body[0];
    host.dialog = null; // e.g. a warning took the screen, then was closed
    handle.resume();
    expect((host.dialog as DialogOptions | null)?.body[0]).toBe(line2); // resume() set it again
    for (let i = 1; i < LINES; i++) next(host);
    expect(done).toBe(1);
  });

  it('cancel stops without onDone and resets speaker and shot', () => {
    const { host, log } = fakeHost();
    let done = 0;
    const handle = playScene(ID, host, () => done++);
    handle.cancel();
    expect(handle.finished).toBe(true);
    expect(done).toBe(0);
    expect(log.slice(-2)).toEqual(['speak:-', 'shot:-']);
    handle.resume();
    expect(log.at(-1)).toBe('shot:-'); // nothing shown after a cancel
  });
});
