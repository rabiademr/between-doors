import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { emptyProfile } from '../domain/Profile';
import { SAVE_KEY, SaveRepository } from '../persistence/SaveRepository';
import { ProfileController } from './ProfileController';

class MemoryStorage implements Storage {
  private map = new Map<string, string>();
  get length(): number {
    return this.map.size;
  }
  clear(): void {
    this.map.clear();
  }
  getItem(k: string): string | null {
    return this.map.get(k) ?? null;
  }
  key(i: number): string | null {
    return [...this.map.keys()][i] ?? null;
  }
  removeItem(k: string): void {
    this.map.delete(k);
  }
  setItem(k: string, v: string): void {
    this.map.set(k, v);
  }
}

// ProfileController listens for other tabs on `window` (node test environment has none).
beforeAll(() => vi.stubGlobal('window', { addEventListener: () => {} }));
afterAll(() => vi.unstubAllGlobals());

const withSave = (mutate: (p: ReturnType<typeof emptyProfile>) => void): MemoryStorage => {
  const storage = new MemoryStorage();
  const p = emptyProfile();
  mutate(p);
  storage.setItem(SAVE_KEY, JSON.stringify(p));
  storage.setItem('someOtherSite', 'keep me');
  return storage;
};

describe('ProfileController settings and reset', () => {
  it('sensitivity is clamped to the save-validation range and saved', () => {
    const storage = new MemoryStorage();
    const pc = new ProfileController(new SaveRepository(storage));
    pc.setSensitivity(10);
    expect(pc.profile.settings.sensitivity).toBe(4);
    pc.setSensitivity(0.01);
    expect(pc.profile.settings.sensitivity).toBe(0.25);
    expect(JSON.parse(storage.getItem(SAVE_KEY) ?? '{}').settings.sensitivity).toBe(0.25);
  });

  it('music volume is clamped to 0..1 and saved', () => {
    const storage = new MemoryStorage();
    const pc = new ProfileController(new SaveRepository(storage));
    pc.setMusicVolume(2);
    expect(pc.profile.settings.musicVolume).toBe(1);
    pc.setMusicVolume(Number.NaN);
    expect(pc.profile.settings.musicVolume).toBe(0);
    pc.setMusicVolume(0.3);
    expect(JSON.parse(storage.getItem(SAVE_KEY) ?? '{}').settings.musicVolume).toBe(0.3);
  });

  it('Reset Progress clears progress, keeps preferences and touches only this game’s key', () => {
    const storage = withSave((p) => {
      p.credits = 200;
      p.completedChapterIds = ['ch1', 'ch2'];
      p.currentChapterId = 'ch3';
      p.settings.language = 'tr';
      p.settings.sensitivity = 1.5;
    });
    const pc = new ProfileController(new SaveRepository(storage));
    expect(pc.resetProgress()).toBe(true);
    expect(pc.profile.credits).toBe(0);
    expect(pc.profile.completedChapterIds).toEqual([]);
    expect(pc.profile.currentChapterId).toBe('ch1');
    expect(pc.profile.settings).toMatchObject({ language: 'tr', sensitivity: 1.5 });
    expect(storage.getItem('someOtherSite')).toBe('keep me');
    expect(JSON.parse(storage.getItem(SAVE_KEY) ?? '{}').credits).toBe(0);
  });

  it('in a temporary session the reset does not write a new save', () => {
    const storage = new MemoryStorage();
    storage.setItem(SAVE_KEY, '{not json');
    const pc = new ProfileController(new SaveRepository(storage));
    expect(pc.status).toBe('blocked-corrupt');
    pc.continueWithoutSaving();
    pc.resetProgress();
    expect(pc.status).toBe('temporary');
    expect(storage.getItem(SAVE_KEY)).toBeNull(); // removed after explicit confirmation, nothing new written
  });

  it('buys from the stall with the profile’s day, saves, and survives a reload', () => {
    const storage = withSave((p) => {
      p.credits = 300;
      p.completedChapterIds = ['ch1'];
    });
    const pc = new ProfileController(new SaveRepository(storage));
    expect(pc.buy('gps')).toEqual({ ok: false, reason: 'not-in-stock' }); // day 1
    pc.setStoryDay(2);
    expect(pc.buy('gps').ok).toBe(true);
    expect(pc.owns('gps')).toBe(true);
    const reloaded = new ProfileController(new SaveRepository(storage));
    expect(reloaded.profile.credits).toBe(150);
    expect(reloaded.profile.ownedItemIds).toEqual(['gps']);
    expect(reloaded.profile.storyDay).toBe(2);
    pc.setStoryDay(42);
    expect(pc.profile.storyDay).toBe(5);
  });

  it('refuses to reset while another tab owns the save', () => {
    const storage = withSave((p) => {
      p.credits = 100;
    });
    const pc = new ProfileController(new SaveRepository(storage));
    pc.status = 'blocked-other-tab';
    expect(pc.resetProgress()).toBe(false);
    expect(JSON.parse(storage.getItem(SAVE_KEY) ?? '{}').credits).toBe(100);
  });
});
