// Controller: keyboard state. Uses KeyboardEvent.code (physical key position),
// so WASD works on Turkish Q/F and other layouts.
import type { MoveInput } from '../player/movement';

const FORWARD = ['KeyW', 'ArrowUp'];
const BACK = ['KeyS', 'ArrowDown'];
const LEFT = ['KeyA', 'ArrowLeft'];
const RIGHT = ['KeyD', 'ArrowRight'];
const RUN = ['ShiftLeft', 'ShiftRight'];
/** One-shot action keys: E = interact, Tab = task panel, H = hint, M = sketch map, Esc = pause. */
export type ActionKey = 'KeyE' | 'Tab' | 'KeyH' | 'KeyM' | 'Escape';
const ACTION_KEYS = new Set<string>(['KeyE', 'Tab', 'KeyH', 'KeyM', 'Escape']);
const GAME_KEYS = new Set([...FORWARD, ...BACK, ...LEFT, ...RIGHT, ...RUN, ...ACTION_KEYS]);

export class InputController {
  private readonly down = new Set<string>();
  /** Action keys pressed since last consumed (holding a key does not repeat). */
  private readonly pressed = new Set<string>();

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    if (isTypingTarget(e.target)) return;
    // Inside an open dialog, let Tab/Enter/Space move focus and press buttons normally.
    if (isInsideDialog(e.target)) return;
    if (GAME_KEYS.has(e.code)) e.preventDefault(); // stop arrows scrolling / Tab leaving the canvas
    if (ACTION_KEYS.has(e.code) && !e.repeat) this.pressed.add(e.code);
    this.down.add(e.code);
  };
  private readonly onKeyUp = (e: KeyboardEvent): void => {
    this.down.delete(e.code);
  };
  /** Window lost focus / tab hidden: release everything so the player doesn't keep walking. */
  private readonly releaseAll = (): void => {
    this.down.clear();
    this.pressed.clear();
  };
  private readonly onVisibility = (): void => {
    if (document.hidden) this.releaseAll();
  };

  constructor() {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.releaseAll);
    document.addEventListener('visibilitychange', this.onVisibility);
  }

  moveInput(): MoveInput {
    const any = (codes: string[]): boolean => codes.some((c) => this.down.has(c));
    return {
      forward: (any(FORWARD) ? 1 : 0) - (any(BACK) ? 1 : 0),
      right: (any(RIGHT) ? 1 : 0) - (any(LEFT) ? 1 : 0),
      run: any(RUN),
    };
  }

  /** True once per physical press of an action key. */
  consumePress(key: ActionKey): boolean {
    return this.pressed.delete(key);
  }

  /** Drop pending presses (e.g. a dialog just closed — the E that closed it must not re-trigger). */
  clearPresses(): void {
    this.pressed.clear();
  }

  /** Release held movement keys (called when a dialog opens). */
  releaseMovement(): void {
    this.down.clear();
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.releaseAll);
    document.removeEventListener('visibilitychange', this.onVisibility);
  }
}

function isInsideDialog(t: EventTarget | null): boolean {
  return t instanceof Element && t.closest('[role="dialog"]') !== null;
}

function isTypingTarget(t: EventTarget | null): boolean {
  return t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement;
}
