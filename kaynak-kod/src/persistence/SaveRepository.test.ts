import { describe, expect, it } from 'vitest';
import { CH4, PLAYABLE_CHAPTERS, storyChapter } from '../content/chapters';
import { emptyProfile } from '../domain/Profile';
import { isChapterUnlocked } from '../domain/story';
import { settleAttempt } from '../domain/ProgressService';
import { scoreBreakdown } from '../domain/ScoreService';
import { SAVE_KEY, SAVE_KEY_V1, SAVE_KEY_V2, SAVE_KEY_V3, SAVE_KEY_V4, SAVE_KEY_V5, SaveRepository, parseProfile } from './SaveRepository';
import { migrateV1toV2, migrateV2toV3, migrateV5toV6, type ProfileV1, type ProfileV2, type ProfileV5 } from './migrations';

class MemoryStorage implements Storage {
  private map = new Map<string, string>();
  failWrites = false;
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
    if (this.failWrites) throw new Error('QuotaExceededError');
    this.map.set(k, v);
  }
}

const NOW = '2026-11-12T18:00:00.000Z';
const settled = () =>
  settleAttempt(
    emptyProfile(),
    {
      attemptId: 'a1',
      chapterId: 'ch1',
      timeSeconds: 42.4,
      wrongTargetIds: [],
      hintIds: [],
      equipmentIds: [],
      score: scoreBreakdown({ wrongTargets: 0, hintsUsed: 0, timeSeconds: 42.4, referenceSeconds: 60 }),
    },
    NOW,
  ).profile;

describe('SaveRepository', () => {
  it('no save → new empty profile', () => {
    expect(new SaveRepository(new MemoryStorage()).load().status).toBe('new');
  });

  it('round-trips a settled profile', () => {
    const storage = new MemoryStorage();
    const repo = new SaveRepository(storage);
    const p = settled();
    expect(repo.save(p)).toBe(true);
    const loaded = repo.load();
    expect(loaded.status).toBe('ok');
    expect(loaded.profile).toEqual(p);
  });

  it('a save from before the week of chapters (ch3 done, Continue stuck on ch3, day 3) goes on with ch4', () => {
    const storage = new MemoryStorage();
    const old = { ...emptyProfile(), storyDay: 3, completedChapterIds: ['ch1', 'ch2', 'ch3'], rewardClaimedChapterIds: ['ch1', 'ch2', 'ch3'], credits: 300, currentChapterId: 'ch3' };
    const records = { ...old.chapterRecords } as Record<string, unknown>;
    delete records.ch4; // that save never knew chapter 4
    storage.setItem(SAVE_KEY, JSON.stringify({ ...old, chapterRecords: records }));
    const loaded = new SaveRepository(storage).load();
    expect(loaded.status).toBe('ok');
    expect(loaded.profile.chapterRecords.ch4).toEqual({ bestResult: null, bestTimeResult: null });
    expect(storyChapter(loaded.profile)).toBe(CH4);
    expect(isChapterUnlocked(loaded.profile, 'ch4', PLAYABLE_CHAPTERS)).toBe(true);
  });

  it('corrupt JSON is reported, not deleted', () => {
    const storage = new MemoryStorage();
    storage.setItem(SAVE_KEY, '{not json');
    const r = new SaveRepository(storage).load();
    expect(r.status).toBe('corrupt');
    if (r.status === 'corrupt') expect(r.raw).toBe('{not json');
    expect(storage.getItem(SAVE_KEY)).toBe('{not json'); // still there
  });

  it('rejects negative/fractional credits, unsupported versions and credit without completion', () => {
    const bad = (mut: (o: Record<string, unknown>) => void) => {
      const s = new MemoryStorage();
      const o = JSON.parse(JSON.stringify(settled())) as Record<string, unknown>;
      mut(o);
      s.setItem(SAVE_KEY, JSON.stringify(o));
      return new SaveRepository(s).load().status;
    };
    expect(bad((o) => (o.credits = -5))).toBe('corrupt');
    expect(bad((o) => (o.credits = 10.5))).toBe('corrupt');
    expect(bad((o) => (o.schemaVersion = 7))).toBe('corrupt'); // newer than this build
    expect(bad((o) => (o.completedChapterIds = []))).toBe('corrupt');
    expect(bad((o) => delete o.ownedItemIds)).toBe('corrupt'); // a v3 save always has its item list
    expect(bad((o) => (o.ownedItemIds = ['compass', 7]))).toBe('corrupt');
  });

  it('drops unknown catalogue ids and duplicate items', () => {
    const s = new MemoryStorage();
    const o = JSON.parse(JSON.stringify(settled())) as Record<string, unknown>;
    o.ownedItemIds = ['compass', 'compass', 'jetpack', 'gps'];
    o.achievementUnlocks = { first_delivery: NOW, hacked: NOW };
    s.setItem(SAVE_KEY, JSON.stringify(o));
    const r = new SaveRepository(s).load();
    expect(r.status).toBe('ok');
    expect(r.profile.ownedItemIds).toEqual(['compass', 'gps']);
    expect(Object.keys(r.profile.achievementUnlocks)).toEqual(['first_delivery']);
  });

  it('write failure returns false instead of throwing; no storage → unavailable', () => {
    const s = new MemoryStorage();
    s.failWrites = true;
    expect(new SaveRepository(s).save(emptyProfile())).toBe(false);
    const none = new SaveRepository(null);
    expect(none.available).toBe(false);
    expect(none.save(emptyProfile())).toBe(false);
    expect(none.load().status).toBe('new');
  });

  it('reset removes only this game key', () => {
    const s = new MemoryStorage();
    s.setItem(SAVE_KEY, '{}');
    s.setItem('otherGame', 'keep');
    new SaveRepository(s).reset();
    expect(s.getItem(SAVE_KEY)).toBeNull();
    expect(s.getItem('otherGame')).toBe('keep');
  });
});

const UPGRADES_V2 = [
  { upgradeId: 'steady_pace', purchasedAt: NOW },
  { upgradeId: 'jetpack', purchasedAt: NOW }, // never sold: dropped by v3
  { upgradeId: 'compass', purchasedAt: NOW },
  { upgradeId: 'steady_pace', purchasedAt: NOW }, // duplicate: dropped
];

/** A v2 save as the 2026-11-13 build wrote it (`ownedUpgrades`, no `ownedItemIds`). */
const v2Save = (): ProfileV2 => {
  const { ownedItemIds: _o, ...rest } = settled();
  return { ...rest, schemaVersion: 2, storyDay: 3, credits: 180, ownedUpgrades: structuredClone(UPGRADES_V2) };
};

/** A v1 save as Between Doors 1.0 wrote it (no v2 fields). */
const v1Save = (): ProfileV1 => {
  const { discoveredDistrictIds: _d, ownedVehicleIds: _v, storyDay: _s, ownedItemIds: _o, ...rest } = settled();
  return {
    ...rest,
    schemaVersion: 1,
    credits: 250,
    ownedUpgrades: structuredClone(UPGRADES_V2),
    settings: { musicVolume: 0.2, sensitivity: 1.5, language: 'tr' },
  };
};

describe('save v3 migration (vendor items)', () => {
  it('migrateV2toV3 turns upgrades into item ids (catalogue order of purchase, unknown/duplicates dropped)', () => {
    const v2 = v2Save();
    const v3 = migrateV2toV3(v2);
    expect(v3.schemaVersion).toBe(3);
    expect(v3.ownedItemIds).toEqual(['steady_pace', 'compass']);
    expect('ownedUpgrades' in v3).toBe(false);
    expect(v3.credits).toBe(180);
    expect(v3.storyDay).toBe(3);
    expect(v3.chapterRecords).toEqual(v2.chapterRecords);
    v3.chapterRecords.ch1!.bestResult = null; // a copy, not shared with the v2 object
    expect(v2.chapterRecords.ch1?.bestResult).not.toBeNull();
  });

  it('parseProfile chains v1 → v2 → v3', () => {
    const p = parseProfile(JSON.parse(JSON.stringify(v1Save())));
    expect(p.schemaVersion).toBe(6);
    expect(p.credits).toBe(250);
    expect(p.ownedItemIds).toEqual(['steady_pace', 'compass']);
    expect(p.storyDay).toBe(1);
    expect(p.discoveredDistrictIds).toEqual(['indigo-row', 'dial-square']);
    expect(p.settings).toEqual({ musicVolume: 0.2, sensitivity: 1.5, language: 'tr', quality: 'auto' });
  });

  it('loads a v2 save once: migrates it, writes v3, leaves v2 untouched', () => {
    const s = new MemoryStorage();
    const raw = JSON.stringify(v2Save());
    s.setItem(SAVE_KEY_V2, raw);
    const first = new SaveRepository(s).load();
    expect(first.status === 'ok' && first.migratedFrom).toBe(2);
    expect(first.profile.ownedItemIds).toEqual(['steady_pace', 'compass']);
    expect(JSON.parse(s.getItem(SAVE_KEY) ?? '{}').schemaVersion).toBe(6);
    expect(s.getItem(SAVE_KEY_V2)).toBe(raw);
    const second = new SaveRepository(s).load();
    expect(second.status === 'ok' && second.migratedFrom).toBeFalsy(); // read from v3 now
    expect(second.profile).toEqual(first.profile);
  });

  it('round-trips a v3 profile with items', () => {
    const s = new MemoryStorage();
    const repo = new SaveRepository(s);
    const p = { ...settled(), ownedItemIds: ['gps', 'compass'], storyDay: 2 };
    expect(repo.save(p)).toBe(true);
    expect(repo.load().profile).toEqual(p);
  });

  it('prefers v3 over v2 over v1', () => {
    const s = new MemoryStorage();
    s.setItem(SAVE_KEY_V1, JSON.stringify(v1Save()));
    s.setItem(SAVE_KEY_V2, JSON.stringify(v2Save()));
    expect(new SaveRepository(s).load().profile.credits).toBe(180); // v2 wins over v1 (and is written as v3)
    s.setItem(SAVE_KEY, JSON.stringify({ ...settled(), credits: 7 }));
    expect(new SaveRepository(s).load().profile.credits).toBe(7);
  });

  it('reports a damaged v2 save (bad upgrade list) without deleting it or writing v3', () => {
    const s = new MemoryStorage();
    const raw = JSON.stringify({ ...v2Save(), ownedUpgrades: 'compass' });
    s.setItem(SAVE_KEY_V2, raw);
    s.setItem(SAVE_KEY_V1, JSON.stringify(v1Save())); // an older save does not hide the damaged newer one
    expect(new SaveRepository(s).load().status).toBe('corrupt');
    expect(s.getItem(SAVE_KEY_V2)).toBe(raw);
    expect(s.getItem(SAVE_KEY)).toBeNull();
  });

  it('reset removes v3, v2 and v1 (or older progress would come back)', () => {
    const s = new MemoryStorage();
    s.setItem(SAVE_KEY_V1, JSON.stringify(v1Save()));
    s.setItem(SAVE_KEY_V2, JSON.stringify(v2Save()));
    const repo = new SaveRepository(s);
    repo.load();
    expect(s.getItem(SAVE_KEY)).not.toBeNull();
    expect(repo.reset()).toBe(true);
    expect(s.getItem(SAVE_KEY)).toBeNull();
    expect(s.getItem(SAVE_KEY_V2)).toBeNull();
    expect(s.getItem(SAVE_KEY_V1)).toBeNull();
    expect(new SaveRepository(s).load().status).toBe('new');
  });
});

describe('save v2 migration', () => {
  it('migrateV1toV2 keeps everything earned and adds the v2 fields', () => {
    const v1 = v1Save();
    const v2 = migrateV1toV2(v1);
    expect(v2.schemaVersion).toBe(2);
    expect(v2.credits).toBe(250);
    expect(v2.completedChapterIds).toEqual(v1.completedChapterIds);
    expect(v2.chapterRecords).toEqual(v1.chapterRecords);
    expect(v2.achievementUnlocks).toEqual(v1.achievementUnlocks);
    expect(v2.settledAttemptIds).toEqual(v1.settledAttemptIds);
    expect(v2.settings).toEqual({ musicVolume: 0.2, sensitivity: 1.5, language: 'tr' });
    expect(v2.discoveredDistrictIds).toEqual(['indigo-row', 'dial-square']);
    expect(v2.ownedVehicleIds).toEqual([]);
    expect(v2.storyDay).toBe(1);
    v2.chapterRecords.ch1!.bestResult = null; // a copy, not shared with the v1 object
    expect(v1.chapterRecords.ch1?.bestResult).not.toBeNull();
  });

  it('loads a v1 save once: migrates it, writes v3, leaves v1 untouched', () => {
    const s = new MemoryStorage();
    const raw = JSON.stringify(v1Save());
    s.setItem(SAVE_KEY_V1, raw);
    const first = new SaveRepository(s).load();
    expect(first.status).toBe('ok');
    if (first.status === 'ok') expect(first.migratedFrom).toBe(1);
    expect(first.profile.credits).toBe(250);
    expect(JSON.parse(s.getItem(SAVE_KEY) ?? '{}').schemaVersion).toBe(6);
    expect(s.getItem(SAVE_KEY_V1)).toBe(raw);
    expect(s.getItem(SAVE_KEY_V2)).toBeNull(); // v2 is never written any more
    const second = new SaveRepository(s).load();
    expect(second.status === 'ok' && second.migratedFrom).toBeFalsy(); // read from v3 now
    expect(second.profile).toEqual(first.profile);
  });

  it('reports a damaged v1 save without deleting it or writing a new save', () => {
    const s = new MemoryStorage();
    s.setItem(SAVE_KEY_V1, '{broken');
    const r = new SaveRepository(s).load();
    expect(r.status).toBe('corrupt');
    if (r.status === 'corrupt') expect(r.raw).toBe('{broken');
    expect(s.getItem(SAVE_KEY_V1)).toBe('{broken');
    expect(s.getItem(SAVE_KEY)).toBeNull();
  });

  it('validates the v2 fields (day clamped, bad lists rejected)', () => {
    const s = new MemoryStorage();
    s.setItem(SAVE_KEY, JSON.stringify({ ...settled(), storyDay: 99 }));
    expect(new SaveRepository(s).load().profile.storyDay).toBe(5);
    s.setItem(SAVE_KEY, JSON.stringify({ ...settled(), ownedVehicleIds: [1, 2] }));
    expect(new SaveRepository(s).load().status).toBe('corrupt');
  });
});

describe('save v4 migration (side jobs)', () => {
  const v3Save = (): Record<string, unknown> => {
    const { jobsCompleted: _j, parcelsRecovered: _p, settledJobIds: _s, ...rest } = settled();
    return { ...rest, schemaVersion: 3, credits: 240, ownedItemIds: ['compass'], ownedVehicleIds: ['bike', 'hovercraft'] };
  };

  it('parseProfile takes a v3 save to v4: everything kept, counters at zero, unknown vehicles dropped', () => {
    const p = parseProfile(v3Save());
    expect(p.schemaVersion).toBe(6);
    expect(p.credits).toBe(240);
    expect(p.completedChapterIds).toEqual(['ch1']);
    expect(p.ownedItemIds).toEqual(['compass']);
    expect(p.ownedVehicleIds).toEqual(['bike']);
    expect([p.jobsCompleted, p.parcelsRecovered, p.settledJobIds]).toEqual([0, 0, []]);
  });

  it('loads a v3 save once: migrates it, writes v4, leaves v3 untouched', () => {
    const s = new MemoryStorage();
    const raw = JSON.stringify(v3Save());
    s.setItem(SAVE_KEY_V3, raw);
    const first = new SaveRepository(s).load();
    expect(first.status === 'ok' && first.migratedFrom).toBe(3);
    expect(JSON.parse(s.getItem(SAVE_KEY) ?? '{}').schemaVersion).toBe(6);
    expect(s.getItem(SAVE_KEY_V3)).toBe(raw);
    const second = new SaveRepository(s).load();
    expect(second.status === 'ok' && second.migratedFrom).toBeFalsy();
  });

  it('round-trips the job counters and rejects a v4 save without them', () => {
    const s = new MemoryStorage();
    const repo = new SaveRepository(s);
    const p = { ...settled(), jobsCompleted: 3, parcelsRecovered: 1, settledJobIds: ['d1-0', 'd1-2'], ownedVehicleIds: ['scooter'] };
    expect(repo.save(p)).toBe(true);
    expect(repo.load().profile).toEqual(p);
    const { jobsCompleted: _j, ...missing } = p;
    s.setItem(SAVE_KEY, JSON.stringify(missing));
    expect(repo.load().status).toBe('corrupt');
  });

  it('reset removes the v3 key too', () => {
    const s = new MemoryStorage();
    s.setItem(SAVE_KEY_V3, JSON.stringify(v3Save()));
    const repo = new SaveRepository(s);
    repo.load();
    repo.reset();
    expect(s.getItem(SAVE_KEY)).toBeNull();
    expect(s.getItem(SAVE_KEY_V3)).toBeNull();
  });
});

describe('save v5 migration (the working day)', () => {
  const v4Save = (): Record<string, unknown> => {
    const { dayJobs: _d, dayEarnings: _e, ...rest } = settled();
    return { ...rest, schemaVersion: 4, credits: 310, storyDay: 2, jobsCompleted: 7, settledJobIds: ['d1-0'], ownedVehicleIds: ['bike'] };
  };

  it('parseProfile takes a v4 save to v5: everything kept, the day counters start at zero', () => {
    const p = parseProfile(v4Save());
    expect(p.schemaVersion).toBe(6);
    expect([p.credits, p.storyDay, p.jobsCompleted]).toEqual([310, 2, 7]);
    expect(p.settledJobIds).toEqual(['d1-0']);
    expect(p.ownedVehicleIds).toEqual(['bike']);
    expect([p.dayJobs, p.dayEarnings]).toEqual([0, 0]); // jobs done before the update do not count toward today
  });

  it('loads a v4 save once: migrates it, writes v5, leaves v4 untouched', () => {
    const s = new MemoryStorage();
    const raw = JSON.stringify(v4Save());
    s.setItem(SAVE_KEY_V4, raw);
    const first = new SaveRepository(s).load();
    expect(first.status === 'ok' && first.migratedFrom).toBe(4);
    expect(JSON.parse(s.getItem(SAVE_KEY) ?? '{}').schemaVersion).toBe(6);
    expect(s.getItem(SAVE_KEY_V4)).toBe(raw);
    const second = new SaveRepository(s).load();
    expect(second.status === 'ok' && second.migratedFrom).toBeFalsy();
  });

  it('round-trips the day counters and rejects a v5 save without them', () => {
    const s = new MemoryStorage();
    const repo = new SaveRepository(s);
    const p = { ...settled(), dayJobs: 2, dayEarnings: 85 };
    expect(repo.save(p)).toBe(true);
    expect(repo.load().profile).toEqual(p);
    const { dayJobs: _d, ...missing } = p;
    s.setItem(SAVE_KEY, JSON.stringify(missing));
    expect(repo.load().status).toBe('corrupt');
  });

  it('a confirmed reset removes the v4 save too', () => {
    const s = new MemoryStorage();
    s.setItem(SAVE_KEY_V4, JSON.stringify(v4Save()));
    const repo = new SaveRepository(s);
    repo.load();
    repo.reset();
    expect(s.getItem(SAVE_KEY)).toBeNull();
    expect(s.getItem(SAVE_KEY_V4)).toBeNull();
    expect(repo.load().status).toBe('new');
  });
});

describe('save v6 migration (graphics quality)', () => {
  const v5Save = (): Record<string, unknown> => {
    const p = settled();
    const { quality: _q, ...settings } = p.settings;
    return { ...p, schemaVersion: 5, credits: 420, storyDay: 4, dayJobs: 1, dayEarnings: 40, settings: { ...settings, musicVolume: 0.3 } };
  };

  it('migrateV5toV6 keeps everything and starts graphics on auto', () => {
    const v5 = v5Save() as unknown as ProfileV5;
    const v6 = migrateV5toV6(v5);
    expect(v6.schemaVersion).toBe(6);
    expect(v6.settings).toEqual({ ...v5.settings, quality: 'auto' });
    expect([v6.credits, v6.storyDay, v6.dayJobs, v6.dayEarnings]).toEqual([420, 4, 1, 40]);
    expect(v5.schemaVersion).toBe(5); // input untouched
  });

  it('loads a v5 save once: migrates it, writes v6, leaves v5 untouched', () => {
    const s = new MemoryStorage();
    const raw = JSON.stringify(v5Save());
    s.setItem(SAVE_KEY_V5, raw);
    const first = new SaveRepository(s).load();
    expect(first.status === 'ok' && first.migratedFrom).toBe(5);
    expect(first.profile.settings.quality).toBe('auto');
    expect(first.profile.settings.musicVolume).toBe(0.3);
    expect(JSON.parse(s.getItem(SAVE_KEY) ?? '{}').schemaVersion).toBe(6);
    expect(s.getItem(SAVE_KEY_V5)).toBe(raw);
  });

  it('round-trips the setting; an unknown value falls back to auto', () => {
    const s = new MemoryStorage();
    const repo = new SaveRepository(s);
    const p = { ...settled(), settings: { ...settled().settings, quality: 'low' as const } };
    expect(repo.save(p)).toBe(true);
    expect(repo.load().profile.settings.quality).toBe('low');
    s.setItem(SAVE_KEY, JSON.stringify({ ...p, settings: { ...p.settings, quality: 'ultra' } }));
    expect(repo.load().profile.settings.quality).toBe('auto');
  });

  it('a confirmed reset removes the v5 save too', () => {
    const s = new MemoryStorage();
    s.setItem(SAVE_KEY_V5, JSON.stringify(v5Save()));
    const repo = new SaveRepository(s);
    repo.load();
    repo.reset();
    expect(s.getItem(SAVE_KEY_V5)).toBeNull();
    expect(repo.load().status).toBe('new');
  });
});
