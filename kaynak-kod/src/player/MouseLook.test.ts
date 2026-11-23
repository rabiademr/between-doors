// Pointer lock is granted asynchronously: a lock asked for when one dialog closes can land after the next one
// opened (scene lines follow each other at once). These fakes play the browser's part.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera';
import { MouseLook } from './MouseLook';

class FakeDocument extends EventTarget {
  pointerLockElement: unknown = null;
  exits = 0;
  exitPointerLock(): void {
    this.exits++;
    this.pointerLockElement = null;
    this.dispatchEvent(new Event('pointerlockchange'));
  }
}

class FakeCanvas extends EventTarget {
  requests = 0;
  private readonly doc: FakeDocument;
  constructor(doc: FakeDocument) {
    super();
    this.doc = doc;
  }
  requestPointerLock(): Promise<void> {
    this.requests++;
    return Promise.resolve(); // granted later, by grant()
  }
  /** The browser answers the pending request. */
  grant(): void {
    this.doc.pointerLockElement = this;
    this.doc.dispatchEvent(new Event('pointerlockchange'));
  }
}

let doc: FakeDocument;
let canvas: FakeCanvas;
let look: MouseLook;

beforeEach(() => {
  doc = new FakeDocument();
  vi.stubGlobal('document', doc);
  vi.stubGlobal('window', new EventTarget());
  canvas = new FakeCanvas(doc);
  const camera = { alpha: 0, beta: 1, inputs: { removeByType: () => {} } } as unknown as ArcRotateCamera;
  look = new MouseLook(camera, canvas as unknown as HTMLCanvasElement);
});
afterEach(() => vi.unstubAllGlobals());

describe('MouseLook pointer lock', () => {
  it('a requested lock counts as wanted before the browser grants it', () => {
    expect(look.wantsLock).toBe(false);
    look.lock();
    expect(look.isLocked).toBe(false);
    expect(look.wantsLock).toBe(true);
    canvas.grant();
    expect(look.isLocked).toBe(true);
    expect(look.wantsLock).toBe(true);
  });

  it('a lock that lands while disabled (a dialog is open) is released again: the cursor stays visible', () => {
    look.lock(); // button of scene line 1: close → ask to re-capture
    look.enabled = false; // line 2 opens at once
    look.unlock(); // nothing to release yet
    expect(doc.exits).toBe(0);
    canvas.grant(); // the browser answers late
    expect(doc.exits).toBe(1);
    expect(look.isLocked).toBe(false);
    expect(look.wantsLock).toBe(false);
  });

  it('a lock that lands while enabled stays, and listeners hear it', () => {
    const heard: boolean[] = [];
    look.onLockChange((l) => heard.push(l));
    look.lock();
    canvas.grant();
    expect(look.isLocked).toBe(true);
    expect(doc.exits).toBe(0);
    expect(heard).toEqual([true]);
  });

  it('a refused lock is no longer wanted', () => {
    look.lock();
    doc.dispatchEvent(new Event('pointerlockerror'));
    expect(look.wantsLock).toBe(false);
  });
});
