import { describe, expect, it } from 'vitest';
import { EN } from './en';
import { STRINGS, currentLanguage, detectLanguage, localized, nextLanguage, setLanguage } from './index';
import { TR } from './tr';

/** Walk both packs: same keys, same kind of value, no empty text, same function arity. */
function compare(a: unknown, b: unknown, path: string, problems: string[]): void {
  if (typeof a === 'function') {
    if (typeof b !== 'function' || a.length !== b.length) problems.push(`${path}: function mismatch`);
    return;
  }
  if (typeof a === 'string') {
    if (typeof b !== 'string' || b.trim() === '') problems.push(`${path}: missing/empty`);
    return;
  }
  if (a && typeof a === 'object') {
    for (const k of Object.keys(a)) compare((a as Record<string, unknown>)[k], (b as Record<string, unknown>)?.[k], `${path}.${k}`, problems);
  }
}

describe('language packs', () => {
  it('TR has every EN key with non-empty text', () => {
    const problems: string[] = [];
    compare(EN, TR, 'TR', problems);
    expect(problems).toEqual([]);
  });

  it('setLanguage switches the live STRINGS binding', () => {
    setLanguage('tr');
    expect(currentLanguage).toBe('tr');
    expect(STRINGS.deliverButton).toBe('Paketi Teslim Et');
    expect(localized({ en: 'Hello', tr: 'Merhaba' })).toBe('Merhaba');
    setLanguage('en');
    expect(STRINGS.deliverButton).toBe('Deliver Parcel');
  });

  it('detects from browser preferences, falls back to English', () => {
    expect(detectLanguage(['tr-TR', 'en-US'])).toBe('tr');
    expect(detectLanguage(['de-DE', 'en-GB'])).toBe('en');
    expect(detectLanguage(['fr'])).toBe('en');
    expect(detectLanguage([])).toBe('en');
  });

  it('cycles languages', () => {
    expect(nextLanguage('en')).toBe('tr');
    expect(nextLanguage('tr')).toBe('en');
  });
});
