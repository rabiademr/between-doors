// Runtime-switchable language packs. `STRINGS` is an ES-module live binding: after setLanguage(),
// every module that imported STRINGS sees the new pack on its next read — no re-import needed.
// Adding a language = add a pack typed as `Strings` + register it in PACKS (TypeScript enforces every key).
import { EN, type Strings } from './en';
import { TR } from './tr';

export const LANGUAGES = ['en', 'tr'] as const;
export type Language = (typeof LANGUAGES)[number];
/** Text that must exist in every language (used by content files: notes, descriptions). */
export type LocalizedText = Record<Language, string>;

const PACKS: Record<Language, Strings> = { en: EN, tr: TR };

export let STRINGS: Strings = EN;
export let currentLanguage: Language = 'en';

const listeners = new Set<(lang: Language) => void>();

export function isLanguage(v: unknown): v is Language {
  return typeof v === 'string' && (LANGUAGES as readonly string[]).includes(v);
}

export function setLanguage(lang: Language): void {
  STRINGS = PACKS[lang];
  currentLanguage = lang;
  if (typeof document !== 'undefined') document.documentElement.lang = lang;
  for (const fn of listeners) fn(lang);
}

export function onLanguageChange(fn: (lang: Language) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** First supported language from the browser's preference list (e.g. navigator.languages); English otherwise. */
export function detectLanguage(preferred: readonly string[]): Language {
  for (const tag of preferred) {
    const base = tag.toLowerCase().split('-')[0];
    if (isLanguage(base)) return base;
  }
  return 'en';
}

export function nextLanguage(lang: Language): Language {
  return LANGUAGES[(LANGUAGES.indexOf(lang) + 1) % LANGUAGES.length] ?? 'en';
}

/** Pick the current language's version of a content text. */
export function localized(text: LocalizedText): string {
  return text[currentLanguage];
}

export function formatTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
