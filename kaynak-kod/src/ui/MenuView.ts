// View: main-menu building blocks (chapter list, settings controls). Pure DOM building; the controller
// decides what each choice does and when the menu opens.
import { QUALITY_SETTINGS, isQualitySetting, type QualitySetting } from '../domain/quality';
import { STRINGS } from '../i18n';

export interface ChapterItemView {
  id: string;
  title: string;
  unlocked: boolean;
  /** e.g. "Best 1200 · fastest 0:48", or "Not delivered yet". */
  detail: string;
}

/** Vertical list of large menu buttons. */
export function buildMenuButtons(items: readonly { label: string; primary?: boolean; onClick: () => void }[]): HTMLElement {
  const list = document.createElement('div');
  list.className = 'menu-list';
  for (const item of items) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = item.label;
    if (item.primary) btn.className = 'primary';
    btn.addEventListener('click', item.onClick, { once: true });
    list.append(btn);
  }
  return list;
}

export function buildChapterList(items: readonly ChapterItemView[], onPlay: (id: string) => void): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'shop chapter-list';
  items.forEach((item, i) => {
    const card = document.createElement('div');
    card.className = item.unlocked ? 'card' : 'card locked';
    const h = document.createElement('h3');
    h.textContent = `${i + 1}. ${item.title}`;
    h.setAttribute('translate', 'no');
    const p = document.createElement('p');
    p.textContent = item.unlocked ? item.detail : STRINGS.chapterLocked;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = STRINGS.play;
    btn.disabled = !item.unlocked;
    btn.setAttribute('aria-label', `${item.title}: ${item.unlocked ? STRINGS.play : STRINGS.chapterLocked}`);
    btn.addEventListener('click', () => onPlay(item.id), { once: true });
    card.append(h, p, btn);
    wrap.append(card);
  });
  return wrap;
}

export interface SettingsView {
  languageButton: string;
  sensitivity: number;
  /** 0..1, 0 = off. */
  musicVolume: number;
  onLanguage: () => void;
  onSensitivity: (value: number) => void;
  onMusicVolume: (value: number) => void;
  /** Graphics: auto / high / low. */
  quality: QualitySetting;
  onQuality: (value: QualitySetting) => void;
  onReset: () => void;
}

export function buildSettings(v: SettingsView): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'settings';

  const langRow = row(STRINGS.languageLabel);
  const lang = document.createElement('button');
  lang.type = 'button';
  lang.textContent = v.languageButton;
  lang.addEventListener('click', v.onLanguage, { once: true });
  langRow.append(lang);

  const sensRow = row(STRINGS.sensitivityLabel);
  const id = 'sensitivity-range';
  sensRow.querySelector('label')?.setAttribute('for', id);
  const range = document.createElement('input');
  range.type = 'range';
  range.id = id;
  range.min = '0.25';
  range.max = '3';
  range.step = '0.05';
  range.value = String(v.sensitivity);
  const out = document.createElement('output');
  out.htmlFor.add(id);
  out.textContent = `${v.sensitivity.toFixed(2)}×`;
  range.addEventListener('input', () => {
    out.textContent = `${Number(range.value).toFixed(2)}×`;
  });
  range.addEventListener('change', () => v.onSensitivity(Number(range.value))); // saved on release, not per pixel
  sensRow.append(range, out);

  const musicRow = row(STRINGS.musicLabel);
  const musicId = 'music-range';
  musicRow.querySelector('label')?.setAttribute('for', musicId);
  const music = document.createElement('input');
  music.type = 'range';
  music.id = musicId;
  music.min = '0';
  music.max = '1';
  music.step = '0.05';
  music.value = String(v.musicVolume);
  const musicOut = document.createElement('output');
  musicOut.htmlFor.add(musicId);
  const showVolume = (x: number): string => (x <= 0 ? STRINGS.musicOff : `${Math.round(x * 100)}%`);
  musicOut.textContent = showVolume(v.musicVolume);
  music.addEventListener('input', () => {
    musicOut.textContent = showVolume(Number(music.value));
  });
  music.addEventListener('change', () => v.onMusicVolume(Number(music.value))); // saved (and previewed) on release
  musicRow.append(music, musicOut);

  const qualityRow = row(STRINGS.qualityLabel);
  qualityRow.classList.add('settings-pair');
  const qualityId = 'quality-select';
  qualityRow.querySelector('label')?.setAttribute('for', qualityId);
  const quality = document.createElement('select');
  quality.id = qualityId;
  for (const q of QUALITY_SETTINGS) {
    const option = document.createElement('option');
    option.value = q;
    option.textContent = STRINGS.qualityOption[q];
    option.selected = q === v.quality;
    quality.append(option);
  }
  quality.addEventListener('change', () => {
    if (isQualitySetting(quality.value)) v.onQuality(quality.value);
  });
  qualityRow.append(quality);

  const reset = document.createElement('div');
  reset.className = 'settings-reset';
  const hint = document.createElement('p');
  hint.className = 'muted';
  hint.textContent = STRINGS.resetHint;
  const resetBtn = document.createElement('button');
  resetBtn.type = 'button';
  resetBtn.className = 'danger';
  resetBtn.textContent = STRINGS.resetProgress;
  resetBtn.addEventListener('click', v.onReset, { once: true });
  reset.append(resetBtn, hint);

  wrap.append(langRow, sensRow, musicRow, qualityRow, reset);
  return wrap;
}

function row(labelText: string): HTMLElement {
  const r = document.createElement('div');
  r.className = 'settings-row';
  const label = document.createElement('label');
  label.textContent = labelText;
  r.append(label);
  return r;
}
