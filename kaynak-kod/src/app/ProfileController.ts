// Controller: owns the in-memory profile and decides WHEN to write it.
// Writes happen only at mission end, purchases and explicit resets (never every frame).
import type { QualitySetting } from '../domain/quality';
import { settleJob, type JobResult, type JobSettlement } from '../domain/jobs/jobs';
import { STEADY_PACE_MULTIPLIER } from '../content/catalog';
import { PLAYABLE_CHAPTERS } from '../content/chapters';
import type { Language } from '../i18n';
import { purchaseItem, purchaseVehicle, type PurchaseResult } from '../domain/Economy';
import { endDay } from '../domain/day';
import { STORY_DAYS, emptyProfile, ownsItem, type Profile } from '../domain/Profile';
import { settleAttempt, type CompletedAttempt, type SettleOutcome } from '../domain/ProgressService';
import { SAVE_KEY, SaveRepository, type LoadResult } from '../persistence/SaveRepository';

export type SaveStatus =
  | 'ok'
  /** No storage, or the player chose not to overwrite a damaged save → progress lives only in this session. */
  | 'temporary'
  /** A damaged save exists; nothing is written until the player decides. */
  | 'blocked-corrupt'
  /** Another tab changed the save; this tab must reload. */
  | 'blocked-other-tab';

export class ProfileController {
  profile: Profile;
  status: SaveStatus;
  readonly loadResult: LoadResult;
  /** False after a failed write; the next save attempt retries with the whole current snapshot. */
  lastWriteOk = true;
  private readonly repo: SaveRepository;
  private readonly onOtherTab: () => void;

  constructor(repo: SaveRepository, onOtherTab: () => void = () => {}) {
    this.repo = repo;
    this.onOtherTab = onOtherTab;
    this.loadResult = repo.load();
    this.profile = this.loadResult.profile;
    this.status = this.loadResult.status === 'corrupt' ? 'blocked-corrupt' : repo.available ? 'ok' : 'temporary';

    // Two tabs on one save is unsupported (design doc p.20): stop and ask for reload.
    window.addEventListener('storage', (e) => {
      if (e.key !== SAVE_KEY && e.key !== null) return; // null = storage cleared
      this.status = 'blocked-other-tab';
      this.onOtherTab();
    });
  }

  /** Vendor items owned right now (recorded as an attempt's equipment). */
  get ownedItemIds(): string[] {
    return [...this.profile.ownedItemIds];
  }

  owns(itemId: string): boolean {
    return ownsItem(this.profile, itemId);
  }

  get runMultiplier(): number {
    return this.owns('steady_pace') ? STEADY_PACE_MULTIPLIER : 1;
  }

  settle(attempt: CompletedAttempt): SettleOutcome {
    const outcome = settleAttempt(this.profile, attempt, new Date().toISOString());
    if (outcome.applied) {
      this.profile = outcome.profile;
      this.persist();
    }
    return outcome;
  }

  /** Buy at the market stall; stock is what the vendor has on the profile's current story day. */
  buy(itemId: string): PurchaseResult {
    const r = purchaseItem(this.profile, itemId, this.profile.storyDay);
    if (r.ok) {
      this.profile = r.profile;
      this.persist();
    }
    return r;
  }

  /** Buy a vehicle at the market stall (delivered to the rack outside Relay). */
  buyVehicle(vehicleId: string): PurchaseResult {
    const r = purchaseVehicle(this.profile, vehicleId, this.profile.storyDay);
    if (r.ok) {
      this.profile = r.profile;
      this.persist();
    }
    return r;
  }

  /** Pays a delivered board job once (domain/jobs) and saves. */
  settleJob(result: JobResult): JobSettlement {
    const outcome = settleJob(this.profile, result);
    if (outcome.applied) {
      this.profile = outcome.profile;
      this.persist();
    }
    return outcome;
  }

  /** Records a district as visited (drawn on the map from now on). @returns true if it was new. */
  discoverDistrict(id: string): boolean {
    if (this.profile.discoveredDistrictIds.includes(id)) return false;
    this.profile = { ...this.profile, discoveredDistrictIds: [...this.profile.discoveredDistrictIds, id] };
    this.persist();
    return true;
  }

  /** The courier took a parcel back out of a Magpie's hands. */
  recoverParcel(): void {
    this.profile = { ...this.profile, parcelsRecovered: this.profile.parcelsRecovered + 1 };
    this.persist();
  }

  /** Clock off with Mara (domain/day): the next day begins. @returns false if the day cannot end yet. */
  endDay(): boolean {
    const next = endDay(this.profile, PLAYABLE_CHAPTERS);
    if (next === this.profile) return false;
    this.profile = next;
    this.persist();
    return true;
  }

  /** Dev/test helper: jump to a day of the week (clamped) and save. */
  setStoryDay(day: number): void {
    const storyDay = Number.isInteger(day) ? Math.min(STORY_DAYS, Math.max(1, day)) : this.profile.storyDay;
    this.profile = { ...this.profile, storyDay };
    this.persist();
  }

  /** Settings change → saved immediately (design doc: written on settings changes). */
  setLanguage(language: Language): void {
    this.profile = { ...this.profile, settings: { ...this.profile.settings, language } };
    this.persist();
  }

  /** Mouse-look sensitivity (settings screen); same bounds as the save validation. */
  setSensitivity(value: number): void {
    const sensitivity = Math.min(4, Math.max(0.25, value));
    this.profile = { ...this.profile, settings: { ...this.profile.settings, sensitivity } };
    this.persist();
  }

  /** Music volume 0..1 (0 = off); same bounds as the save validation. */
  /** Graphics quality (Settings, or what 'auto' measured). */
  setQuality(quality: QualitySetting): void {
    this.profile = { ...this.profile, settings: { ...this.profile.settings, quality } };
    this.persist();
  }

  setMusicVolume(value: number): void {
    const musicVolume = Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
    this.profile = { ...this.profile, settings: { ...this.profile.settings, musicVolume } };
    this.persist();
  }

  /**
   * Player confirmed "Reset Progress": removes ONLY this game's save key and starts over.
   * Preferences (language, sensitivity, music volume) are kept — they are not progress.
   */
  resetProgress(): boolean {
    if (this.status === 'blocked-other-tab') return false;
    const settings = this.profile.settings;
    const removed = this.repo.reset();
    this.profile = { ...emptyProfile(), settings };
    if (this.status === 'ok') this.persist();
    return removed;
  }

  /** Player confirmed: discard the unreadable save and start a fresh profile. */
  startNewProfile(): void {
    this.profile = emptyProfile();
    this.status = this.repo.available ? 'ok' : 'temporary';
    this.persist();
  }

  /** Player chose to play on without touching the damaged save. */
  continueWithoutSaving(): void {
    this.status = 'temporary';
  }

  /** @returns false when the snapshot could not be written (session-only progress). */
  private persist(): boolean {
    if (this.status !== 'ok') return false;
    this.lastWriteOk = this.repo.save(this.profile);
    return this.lastWriteOk;
  }
}
