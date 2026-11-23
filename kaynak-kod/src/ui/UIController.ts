// View layer (2D): HTML/CSS overlay on top of the 3D canvas. No game rules here —
// the controller tells it what to show and passes callbacks for buttons.
import { STRINGS } from '../i18n';
import { Compass } from './Compass';
import { Minimap } from './Minimap';

export interface DialogButton {
  label: string;
  primary?: boolean;
  onClick: () => void;
}

export interface DialogOptions {
  title: string;
  body: (string | HTMLElement)[];
  buttons: DialogButton[];
  /** Called on Escape; omit to make the dialog require a button. */
  onEscape?: () => void;
  /** 'subtitle': a story line at the bottom of the screen, the scene left clear above it. */
  placement?: 'center' | 'subtitle';
}

export class UIController {
  private readonly root: HTMLElement;
  private readonly promptEl: HTMLElement;
  private readonly timerEl: HTMLElement;
  private readonly toastEl: HTMLElement;
  private readonly taskEl: HTMLElement;
  private readonly mapEl: HTMLElement;
  private mapClose: (() => void) | undefined;
  private readonly loadingEl: HTMLElement;
  private readonly statusEl: HTMLElement;
  private readonly creditsEl: HTMLElement;
  private readonly compass = new Compass();
  private readonly minimap = new Minimap();
  private readonly titleEl: HTMLElement;
  private readonly controlsEl: HTMLElement;
  private readonly langButton: HTMLButtonElement;
  private readonly lookHintEl: HTMLElement;
  private lookHintVisible: boolean | null = null;
  private dialogEl: HTMLElement | null = null;
  private dialogKeyHandler: ((e: KeyboardEvent) => void) | null = null;
  private toastTimer = 0;
  private readonly toastQueue: { message: string; ms: number }[] = [];
  /** undefined = unknown (forces a re-render). */
  private lastPrompt: string | null | undefined = undefined;
  private lastTimer = '';

  constructor(root: HTMLElement) {
    this.root = root;
    const hud = el('div', 'hud');
    this.titleEl = el('h1', '', STRINGS.title);
    this.titleEl.setAttribute('translate', 'no');
    this.controlsEl = el('p', 'hud-help', STRINGS.controls);
    this.langButton = el('button', 'lang') as HTMLButtonElement;
    this.langButton.type = 'button';
    hud.append(this.titleEl, this.controlsEl, this.langButton);

    // Top-right status column: mission timer, credits, compass (if owned), minimap (GPS).
    this.statusEl = el('div', 'status');
    this.creditsEl = el('div', 'chip credits');
    this.timerEl = el('div', 'chip timer');
    this.timerEl.setAttribute('role', 'timer');
    this.timerEl.hidden = true;

    this.promptEl = el('div', 'prompt');
    this.promptEl.setAttribute('aria-live', 'polite');
    this.promptEl.hidden = true;

    this.lookHintEl = el('div', 'look-hint');
    this.lookHintEl.hidden = true;

    this.toastEl = el('div', 'toast');
    this.toastEl.setAttribute('role', 'status');
    this.toastEl.setAttribute('aria-live', 'polite');
    this.toastEl.hidden = true;

    // Task panel is NOT modal: it never takes focus, so Tab keeps toggling it.
    this.taskEl = el('aside', 'panel task-panel');
    this.taskEl.setAttribute('aria-label', STRINGS.taskPanelTitle);
    this.taskEl.hidden = true;

    // Sketch map (M): like the task panel, not modal.
    this.mapEl = el('aside', 'panel map-panel');
    this.mapEl.hidden = true;

    this.loadingEl = el('div', 'loading');
    this.loadingEl.setAttribute('role', 'status');
    this.loadingEl.setAttribute('aria-live', 'polite');
    this.loadingEl.hidden = true;

    this.statusEl.append(this.timerEl, this.creditsEl, this.compass.element, this.minimap.element);
    root.append(hud, this.statusEl, this.promptEl, this.lookHintEl, this.toastEl, this.taskEl, this.mapEl, this.loadingEl);
    this.refreshLanguage();
  }

  /** Called with the language-button handler by the controller. */
  onLanguageButton(handler: () => void): void {
    this.langButton.addEventListener('click', () => {
      handler();
      document.getElementById('renderCanvas')?.focus(); // keyboard goes back to the game
    });
  }

  /** Re-render every persistent text after a language switch (open dialogs are rebuilt by the controller). */
  refreshLanguage(): void {
    this.titleEl.textContent = STRINGS.title;
    this.controlsEl.textContent = STRINGS.controls;
    this.langButton.textContent = STRINGS.switchLanguage;
    this.lookHintEl.textContent = STRINGS.lookHint;
    this.langButton.setAttribute('aria-label', STRINGS.switchLanguageAria);
    this.timerEl.setAttribute('aria-label', STRINGS.missionTime);
    this.lastPrompt = undefined; // force prompt re-render on next frame
    this.compass.refreshLanguage();
    this.minimap.refreshLanguage();
  }

  /** Show "E <action>" for the current interaction target, or hide it. */
  setPrompt(action: string | null): void {
    if (action === this.lastPrompt) return; // avoid DOM churn every frame
    this.lastPrompt = action;
    this.promptEl.hidden = action === null;
    if (action !== null) {
      this.promptEl.replaceChildren(el('kbd', '', 'E'), document.createTextNode(` ${action}`));
    }
  }

  setTimer(text: string | null): void {
    if (text === null) {
      this.timerEl.hidden = true;
      this.lastTimer = '';
      return;
    }
    this.timerEl.hidden = false;
    if (text !== this.lastTimer) {
      this.lastTimer = text;
      this.timerEl.textContent = text;
    }
  }

  /** "Click to look around" hint, shown while the mouse is not captured. */
  setLookHint(visible: boolean): void {
    if (visible === this.lookHintVisible) return;
    this.lookHintVisible = visible;
    this.lookHintEl.hidden = !visible;
  }

  setCredits(credits: number): void {
    this.creditsEl.textContent = STRINGS.credits(credits);
  }

  /** Compass upgrade: bearing the view faces (degrees, 0 = north), or null to hide when not owned. */
  setCompass(bearing: number | null): void {
    this.compass.set(bearing);
  }

  /**
   * Minimap (GPS): live position and facing bearing, or null to hide. `completedChapterIds` decides
   * which revealed places are drawn (redrawn only when it changes).
   */
  setMinimap(you: { x: number; z: number; bearing: number } | null, completedChapterIds: readonly string[], goal: { x: number; z: number } | null = null): void {
    if (you) this.minimap.setCompleted(completedChapterIds);
    this.minimap.update(you, goal);
  }

  /**
   * Short message at the top. Messages queue up instead of replacing each other, so e.g. "save failed"
   * is not wiped out by an achievement shown in the same moment. Duplicates are dropped.
   */
  toast(message: string, ms = 2600): void {
    if (this.toastEl.textContent === message && !this.toastEl.hidden) return;
    if (this.toastQueue.some((t) => t.message === message)) return;
    this.toastQueue.push({ message, ms });
    if (this.toastQueue.length > MAX_QUEUED_TOASTS) this.toastQueue.shift(); // keep the newest few
    if (this.toastEl.hidden) this.showNextToast();
  }

  private showNextToast(): void {
    const next = this.toastQueue.shift();
    if (!next) {
      this.toastEl.hidden = true;
      return;
    }
    this.toastEl.textContent = next.message;
    this.toastEl.hidden = false;
    window.clearTimeout(this.toastTimer);
    // Shorter while more messages are waiting, so the queue never lags far behind the game.
    const ms = this.toastQueue.length > 0 ? Math.min(next.ms, 2600) : next.ms;
    this.toastTimer = window.setTimeout(() => this.showNextToast(), ms);
  }

  get isTaskPanelOpen(): boolean {
    return !this.taskEl.hidden;
  }

  /**
   * @param extra optional extra lines (agreed meeting point, found clue, hint text, hint key).
   * @param media optional element under the note (e.g. Sylvie's photo).
   */
  setTaskPanel(open: boolean, note?: string, extra?: string | readonly string[], media?: HTMLElement): void {
    if (open && note !== undefined) {
      const parts = [el('h2', '', STRINGS.taskPanelTitle), el('p', 'note', `“${note}”`)];
      if (media) parts.push(media);
      for (const line of typeof extra === 'string' ? [extra] : (extra ?? [])) parts.push(el('p', 'task-extra', line));
      parts.push(el('p', 'muted', STRINGS.taskPanelHint));
      this.taskEl.replaceChildren(...parts);
    }
    this.taskEl.hidden = !open;
  }

  get isMapOpen(): boolean {
    return !this.mapEl.hidden;
  }

  /**
   * Sketch map: `map` is the drawing (rebuilt by the controller when it opens).
   * @param live the map shows "you are here" (GPS) — changes the hint line.
   */
  setMap(open: boolean, map?: HTMLElement, live = false, onClose?: () => void): void {
    // The previous map's listeners (zoom keys, wheel) go with it.
    this.mapClose?.();
    this.mapClose = undefined;
    if (open && map) {
      this.mapEl.replaceChildren(el('h2', '', STRINGS.mapTitle), map, el('p', 'muted', live ? STRINGS.mapHintGps : STRINGS.mapHint));
      this.mapClose = onClose;
    }
    this.mapEl.hidden = !open;
  }

  /**
   * Loading indicator while models stream in. `text` null hides it; `onRetry` adds a retry button
   * (shown when something failed to load).
   */
  setLoading(text: string | null, onRetry?: () => void): void {
    this.loadingEl.hidden = text === null;
    if (text === null) return;
    const parts: Node[] = [document.createTextNode(text)];
    if (onRetry) {
      const btn = el('button', '', STRINGS.retry) as HTMLButtonElement;
      btn.type = 'button';
      btn.addEventListener('click', onRetry, { once: true });
      parts.push(btn);
    }
    this.loadingEl.replaceChildren(...parts);
  }

  get isDialogOpen(): boolean {
    return this.dialogEl !== null;
  }

  /** Modal dialog. Every button works only once (protects against double clicks). */
  showDialog(opts: DialogOptions): void {
    this.closeDialog();
    const dialog = el('div', 'panel dialog');
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    if (opts.title) {
      const titleId = `dlg-title-${Date.now()}`;
      dialog.setAttribute('aria-labelledby', titleId);
      const h = el('h2', '', opts.title);
      h.id = titleId;
      dialog.append(h);
    } else if (typeof opts.body[0] === 'string') {
      dialog.setAttribute('aria-label', opts.body[0]); // a narrated story line: the line itself names the dialog
    }
    for (const part of opts.body) dialog.append(typeof part === 'string' ? el('p', '', part) : part);

    const row = el('div', 'buttons');
    let used = false;
    const buttons = opts.buttons.map((b) => {
      const btn = el('button', b.primary ? 'primary' : '', b.label) as HTMLButtonElement;
      btn.type = 'button';
      btn.addEventListener('click', () => {
        if (used) return;
        used = true;
        for (const other of buttons) other.disabled = true;
        b.onClick();
      });
      row.append(btn);
      return btn;
    });
    dialog.append(row);

    const primary = buttons.find((_, i) => opts.buttons[i]?.primary) ?? buttons[0];
    // Listen on the document, not the dialog: keys must work even if focus slipped to <body>.
    this.dialogKeyHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && opts.onEscape && !used) {
        e.preventDefault();
        used = true;
        opts.onEscape();
      } else if (e.key === 'Tab') {
        // Include buttons inside the body too (e.g. shop cards), skipping disabled ones.
        trapFocus(e, [...dialog.querySelectorAll<HTMLButtonElement>('button')].filter((b) => !b.disabled));
      }
    };
    document.addEventListener('keydown', this.dialogKeyHandler);

    const backdrop = el('div', opts.placement === 'subtitle' ? 'backdrop subtitle' : 'backdrop');
    // Clicking outside the panel must not steal focus from the dialog.
    backdrop.addEventListener('mousedown', (e) => {
      if (e.target === backdrop) {
        e.preventDefault();
        primary?.focus();
      }
    });
    backdrop.append(dialog);
    this.root.append(backdrop);
    this.dialogEl = backdrop;
    primary?.focus();
  }

  /** Focus the first enabled button of the open dialog (menus whose buttons live in the body). */
  focusFirstButton(): void {
    this.dialogEl?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
  }

  closeDialog(): void {
    if (!this.dialogEl) return;
    if (this.dialogKeyHandler) document.removeEventListener('keydown', this.dialogKeyHandler);
    this.dialogKeyHandler = null;
    this.dialogEl.remove();
    this.dialogEl = null;
    // Give keyboard focus back to the game (the focused button no longer exists).
    document.getElementById('renderCanvas')?.focus();
  }
}

const MAX_QUEUED_TOASTS = 4;

function el(tag: string, className = '', text?: string): HTMLElement {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** Keep keyboard focus inside the dialog's buttons. */
function trapFocus(e: KeyboardEvent, buttons: HTMLButtonElement[]): void {
  if (buttons.length === 0) return;
  const i = buttons.indexOf(document.activeElement as HTMLButtonElement);
  const next = e.shiftKey ? (i <= 0 ? buttons.length - 1 : i - 1) : i === buttons.length - 1 ? 0 : i + 1;
  e.preventDefault();
  buttons[next]?.focus();
}
