// Controller layer: wires input, rules (domain + ChapterController/MeetingController) and views (world + ui).
// Flow per frame: read input → move player/NPCs → tick mission clock → pick interaction target → update UI.
import { Engine } from '@babylonjs/core/Engines/engine';
import { MusicPlayer } from '../audio/MusicPlayer';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { ACHIEVEMENTS, findAchievement, findItem } from '../content/catalog';
import { CLUES, isClueId, type ClueId } from '../content/clues';
import { MORNING_SCENES, SPEAKERS, type SceneId } from '../content/scenes';
import { playScene, type SceneHandle } from './ScenePlayer';
import { StoryCast } from '../world/StoryCast';
import { ARTHUR_CAMEO, CH1, FINALE, PLAYABLE_CHAPTERS, chapterById, storyChapter, type ChapterDefinition } from '../content/chapters';
import { ARTHURS_TUNE, HUM_BARS, PREVIEW_BARS, TUNES } from '../content/melody';
import { FINN_PATROL, FINN_ROUTES, FINN_SPEED, MEETING_SPOTS } from '../content/waypointRoutes';
import { MeetingController, type MeetingPointId } from '../domain/MeetingController';
import { hasProgress, type SettleOutcome } from '../domain/ProgressService';
import { isChapterUnlocked, isOpenToday, storyChapterId } from '../domain/story';
import type { PauseReason } from '../domain/TimerService';
import { STRINGS, currentLanguage, detectLanguage, formatTime, localized, nextLanguage, onLanguageChange, setLanguage, type LocalizedText } from '../i18n';
import { SaveRepository } from '../persistence/SaveRepository';
import { loadCharacter } from '../player/CharacterModel';
import { cameraHeadingDeg, facingBearingDeg } from '../player/cameraMath';
import { PlayerController } from '../player/PlayerController';
import { buildMap, openSketchMap, type MapPosition } from '../ui/MapView';
import { BELLWICK } from '../content/world';
import { districtOnMap } from '../domain/world/discovery';
import { districtAt } from '../domain/world/worldData';
import { buildChapterList, buildMenuButtons, buildSettings } from '../ui/MenuView';
import { buildVendor, type VendorItemView } from '../ui/VendorView';
import { JOBS_TO_END_DAY, dayStatus } from '../domain/day';
import { stallCard, vehicleStock, vendorStock, type Shelf } from '../domain/Economy';
import { findVehicle } from '../content/vehicles';
import { UIController } from '../ui/UIController';
import { spawnNpc, type StaticNpc } from '../world/Npc';
import type { DefaultRenderingPipeline } from '@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/defaultRenderingPipeline';
import { setupPostProcess } from '../world/Atmosphere';
import { applyQuality } from '../world/quality';
import { FpsProbe, levelOf, type QualitySetting } from '../domain/quality';
import { HintMarker } from '../world/HintMarker';
import { MewsCast, captureView } from '../world/MewsCast';
import { SceneColliders } from '../world/SceneColliders';
import { SceneStreamer } from '../world/SceneStreamer';
import { buildTownSolids } from '../world/TownSolids';
import { PALETTE } from '../world/palette';
import { loadTown } from '../world/TownModels';
import { WalkingNpc } from '../world/WalkingNpc';
import { buildBellwick, type World, type WorldSpot, type YardGate } from '../world/WorldBuilder';
import { QuestRunner, type CoreEffect, type QuestEvent } from '../domain/quest/QuestRunner';
import { CHAPTER_QUESTS, QUEST_EVENTS, type GameEffect } from '../content/quests';
import { JOB_ADDRESSES, JOB_BOARD_AT, addressAt, addressDistrict, addressName } from '../content/jobs';
import { WORLD_RULES } from '../content/worldRules';
import { jobCapacity, type Job, type JobController } from '../domain/jobs/jobs';
import { WALK_SPEED } from '../player/movement';
import { buildJobBoard, type JobCardView } from '../ui/JobBoardView';
import { JobsController } from './JobsController';
import { ChapterController, type AttemptResult } from './ChapterController';
import { InputController } from './InputController';
import { ProfileController } from './ProfileController';
import { selectTarget } from './interaction';
import { TOWNSFOLK_GREETINGS, TOWNSFOLK_GREET_RANGE, TOWNSFOLK_SPOT_ID } from '../content/npcs';
import { Animals } from '../world/Animals';
import { NpcDirector } from '../world/NpcDirector';
import { MAGPIES_FROM_DAY, MAGPIE_THIEF_SPOT_ID, STORY_MAGPIES, type StoryThiefId } from '../content/magpies';
import { CHASE_TUNING, type Thief } from '../domain/chase/chase';
import { Magpies } from '../world/Magpie';
import { VEHICLE_MOUNT_RANGE, VEHICLE_PARKED_SPOT_ID, rackPose } from '../content/vehicles';
import { ParkedState, dismountSpot, mountCheck, parkedFootprint, pathClear } from '../domain/vehicles/parking';
import { VEHICLES } from '../player/movers/vehicles';
import { ParkedVehicles, isVehicleKind } from '../world/ParkedVehicles';

// Character models (asset ids, see src/assets).
const arthurUrl = 'models/chars/arthur.glb';
const courierUrl = 'models/chars/courier.glb';
const finnUrl = 'models/chars/finn.glb';
const juneUrl = 'models/chars/june.glb';
const maraUrl = 'models/chars/mara.glb';
/** The market vendor stands behind the stall on Market Hill (npc point `npc_vendor` in the map data). */
const vendorUrl = 'models/chars/oldclassy_f.glb';
const STATIC_NPC_MODELS: Record<string, string> = { npc_mara: maraUrl, npc_vendor: vendorUrl };
/** Below this height the player has fallen out of the world → back to the spawn point. */
const FALL_LIMIT_Y = -10;
/** Longest step the side-job clocks and the thieves take in one frame (the chapter clock clamps the same way). */
const MAX_AMBIENT_STEP = 0.25;
/** Sylvie's photo waits this long for the town at most, then renders with whatever is loaded. */
const PHOTO_TOWN_WAIT_MS = 4000;
/** A snapshot render that takes longer is abandoned (photo/picture shown without the image). */
const CAPTURE_TIMEOUT_MS = 8000;
/** A model load that hasn't finished by then counts as failed (the game goes on with placeholders). */
const LOAD_TIMEOUT_MS = 25_000;

interface TrackedLoad {
  what: string;
  settled: boolean;
  ok: boolean;
  /** 0..1 progress (only the town reports partial progress). */
  fraction: number;
  done: Promise<boolean>;
}

/** Minimum distance (m) between the player and Arthur when he opens his door. */
const ARTHUR_ROOM = 1.1;

/** A settled delivery, handed to the quest's after-delivery calls (cameo, finale, result). */
interface Completion {
  result: AttemptResult;
  outcome: SettleOutcome;
}
/** Chapter 1 epilogue: Arthur's walking pace (m/s, an unhurried old postman). */
const ARTHUR_WALK_SPEED = 1.1;

export class GameApp {
  private readonly engine: Engine;
  readonly input = new InputController();
  readonly ui: UIController;
  readonly world: World;
  readonly player: PlayerController;
  /** What is solid for movers: measured from the scene's collider meshes. */
  private readonly colliders: SceneColliders;
  /** Hides scenery beyond the fog (the outer districts); the core and Postmark Mews always stay. */
  readonly streamer: SceneStreamer;
  readonly profiles: ProfileController;
  readonly finn: WalkingNpc;
  /** NPCs standing at fixed spots (Mara), by id, once their model has loaded. */
  private readonly staticNpcs = new Map<string, StaticNpc>();
  /** The fixed-spot NPC whose conversation is open (talks with her hands until the dialog closes). */
  private talkingNpcId: string | null = null;
  /** The current chapter as a quest: decides what E and story events do (set in setupChapter). */
  private quest!: QuestRunner<GameEffect>;
  chapter: ChapterController;
  /** Only for 'meeting' chapters (ch2). */
  meeting: MeetingController | null = null;
  /** Clock pause held by the open dialog; released whenever that dialog closes, by any path. */
  private dialogPause: PauseReason | null = null;
  /** The mouse was captured when the dialog opened → capture it again on close. */
  private relockAfterDialog = false;
  /** Current interaction target (for tests/debug). */
  currentTarget: WorldSpot | null = null;
  /** Chapter 3: the neighbours in Postmark Mews and Arthur. */
  readonly mewsCast: MewsCast;
  /** Arthur on the street after chapter 1 (the Postmark Mews Arthur lives in mewsCast). */
  readonly streetArthur: WalkingNpc;
  /** The week's story actors (content/actors.ts), placed by the chapters' quests. */
  readonly cast: StoryCast;
  /** The story Magpie holding the chapter's parcel (in its hands or in the den's crate), if any. */
  private storyThief: Thief | null = null;
  private streetArthurActive = false;
  /**
   * GPS skill: live position on the minimap and the sketch map. On while the profile owns the `gps`
   * vendor item (applyProfile); dev builds can force it with `__game.setGps(true/false)`.
   */
  private gpsActive = false;
  /** Side jobs from the Relay board (they run beside the story chapter). */
  readonly jobs = new JobsController(JOB_ADDRESSES, JOB_BOARD_AT);
  private readonly jobMarker: HintMarker;
  private lastSpeed = 0;
  private wasRiding = false;
  private jobSecondShown: number | null = null;
  /** District the player was in last frame (map discovery). */
  private districtId: string | null = null;
  /** Dev override from `setGps`; null = follow the profile. */
  private gpsOverride: boolean | null = null;
  /** Arthur's tune (Web Audio synth); volume from the profile settings. */
  readonly music: MusicPlayer;
  /** Help 2: the search-area ring. */
  readonly hintMarker: HintMarker;
  /** Sylvie's old photo, rendered once from the real entrance (so photo and street always match). */
  private oldPhoto: Promise<string | null> | null = null;
  /** Resolves once the Kenney town is in the scene (so the old photo has its background). */
  private readonly townReady: Promise<void>;
  /** Bumped whenever the task panel is opened/closed/hidden; a late async render only applies if still current. */
  private taskPanelRequest = 0;
  /** Bumped by every openDialog: a late async step only replaces the dialog it was started from. */
  private dialogSeq = 0;
  /** The pointer was captured when the map opened: capture it again when the map closes. */
  private mapRelock = false;
  private pipeline!: DefaultRenderingPipeline;
  /** Graphics on 'auto': measures the first seconds of play, then picks high or low (domain/quality). */
  private qualityProbe: FpsProbe | null = null;
  /** Every model has arrived (the frame rate while they stream in says nothing about the machine). */
  private modelsReady = false;
  /** The story scene on screen; `suspended` while another dialog (e.g. a warning) has replaced its line. */
  private scene: { handle: SceneHandle | null; suspended: boolean } | null = null;
  /** True only while a scene opens its own line (any other dialog suspends the scene). */
  private openingSceneLine = false;
  /** Ambient life: townsfolk on their routines, cats and dogs (content/npcs.ts). Not part of any quest. */
  readonly townsfolk: NpcDirector;
  readonly animals: Animals;
  /** The one spot for saying hello: moved every frame to the nearest townsperson (story spots always win). */
  private readonly townsfolkSpot: WorldSpot = { id: TOWNSFOLK_SPOT_ID, kind: 'townsfolk', x: 0, z: 0, range: TOWNSFOLK_GREET_RANGE };
  private lastGreeting = -1;
  /** Owned vehicles: where each one stands, or that it is being ridden (not saved: a session starts at the rack). */
  private readonly parked = new ParkedState(rackPose, (id) => (isVehicleKind(id) ? parkedFootprint(VEHICLES[id].body).spine : 0));
  private readonly parkedView: ParkedVehicles;
  /** The one spot for getting on: moved every frame to the nearest parked vehicle (story and job spots win). */
  private readonly vehicleSpot: WorldSpot = { id: VEHICLE_PARKED_SPOT_ID, kind: 'vehicle', x: 0, z: 0, range: VEHICLE_MOUNT_RANGE };
  /** Set by the pause menu: townsfolk and animals stand still until play resumes. */
  private ambientPaused = false;
  /** The week is over and the courier just works the board: the last chapter is set up but never opened. */
  private freeRoam = false;
  /** The Magpies: parcel thieves (content/magpies.ts). About from day 2; `__game.setMagpies(true)` forces them. */
  readonly magpies: Magpies;
  private magpiesForced = false;
  /** Whose parcel each thief took (until it is grabbed back, taken out of the crate, or the job ends). */
  private readonly stolenBy = new Map<Thief, JobController>();
  /** The one spot for grabbing a parcel back: placed on the fleeing thief in reach (story spots always win). */
  private readonly magpieSpot: WorldSpot = { id: MAGPIE_THIEF_SPOT_ID, kind: 'magpie', x: 0, z: 0, range: CHASE_TUNING.grabReach };

  constructor(root: HTMLElement) {
    const canvas = document.createElement('canvas');
    canvas.id = 'renderCanvas';
    canvas.tabIndex = 0; // focusable, so keyboard input goes to the game after a click
    root.append(canvas);
    this.profiles = new ProfileController(new SaveRepository(), () => this.showOtherTabDialog());
    // Language: saved choice wins; otherwise the browser's preferred languages.
    setLanguage(this.profiles.profile.settings.language ?? detectLanguage(navigator.languages ?? [navigator.language]));
    this.ui = new UIController(root);
    this.ui.onLanguageButton(() => this.switchLanguage());
    onLanguageChange(() => {
      this.ui.refreshLanguage();
      if (this.ui.isTaskPanelOpen) this.renderTaskPanel(true); // content text in the new language
      if (this.ui.isMapOpen) this.openMap();
      this.cast?.relabel(); // "Talk to …" names
    });

    this.engine = new Engine(canvas, true);
    this.world = buildBellwick(this.engine);
    const { scene, spawn } = this.world;
    this.colliders = new SceneColliders(scene);
    this.streamer = new SceneStreamer(scene, {
      radius: PALETTE.fog.end + 10,
      keep: [this.world.core, ...BELLWICK.districts.filter((d) => d.id === 'postmark-mews').map((d) => d.rect)],
    });
    this.player = new PlayerController(scene, { spawn, canvas, collisions: this.colliders.world });
    if (import.meta.env.DEV) {
      // Dev only: B cycles foot → bike → scooter → motorcycle → van → foot (placeholder vehicles).
      // Real vehicles (E on a parked one, ownership) come with F4.
      window.addEventListener('keydown', (e) => {
        if (e.code === 'KeyB' && !e.repeat && !this.ui.isDialogOpen) this.player.cycleVehicle();
      });
    }
    // Owned vehicles stand parked in the world (seeded from the profile in applyProfile).
    this.parkedView = new ParkedVehicles(scene);
    if (import.meta.env.DEV) {
      // Dev B (above) swaps vehicles without E: keep the parked registry in step with what is ridden.
      window.addEventListener('keydown', (e) => {
        if (e.code === 'KeyB' && !e.repeat && !this.ui.isDialogOpen) this.reconcileRiddenVehicle();
      });
    }
    this.pipeline = setupPostProcess(scene, this.player.camera);
    this.finn = new WalkingNpc(scene, 'npc_finn', FINN_PATROL[0] ?? { x: 0, z: 25 }, FINN_SPEED);
    this.hintMarker = new HintMarker(scene);
    this.jobMarker = new HintMarker(scene);
    this.music = new MusicPlayer(this.profiles.profile.settings.musicVolume);
    this.streetArthur = new WalkingNpc(scene, 'npc_arthur_street', { x: 0, z: -30 }, ARTHUR_WALK_SPEED);
    this.streetArthur.setEnabled(false);
    this.mewsCast = new MewsCast(scene, this.world.mews, { npc_mara: maraUrl, npc_finn: finnUrl, npc_june: juneUrl, npc_arthur: arthurUrl });

    // Placeholders are playable immediately; models replace them once loaded.
    const loads: TrackedLoad[] = [];
    const track = (p: Promise<unknown>, what: string): Promise<boolean> => {
      const load: TrackedLoad = { what, settled: false, ok: false, fraction: 0, done: Promise.resolve(false) };
      // A load that never settles must not leave the game "loading" forever: time out → treated as failed.
      const timeout = new Promise<null>((resolve) => window.setTimeout(() => resolve(null), LOAD_TIMEOUT_MS));
      const result = p.then(
        () => true,
        (err: unknown) => {
          console.warn(`${what} failed to load.`, err);
          return false;
        },
      );
      load.done = Promise.race([result, timeout]).then((outcome) => {
        if (outcome === null) console.warn(`${what} is still loading after ${LOAD_TIMEOUT_MS / 1000}s — continuing without it.`);
        load.settled = true;
        load.ok = outcome === true;
        load.fraction = 1;
        return load.ok;
      });
      loads.push(load);
      return load.done;
    };
    let townLoad: TrackedLoad | undefined;
    const { core, bounds } = this.world;
    buildTownSolids(scene, { minX: core.x0, maxX: core.x1, minZ: core.z0, maxZ: core.z1 }, bounds);
        const town = loadTown(scene, { minX: core.x0, maxX: core.x1, minZ: core.z0, maxZ: core.z1 }, bounds, this.world.walls, this.world.props, (done, total) => {
      if (townLoad && !townLoad.settled) townLoad.fraction = done / total;
      this.renderLoading(loads);
    });
    this.townReady = track(town, 'Town models').then(() => undefined);
    townLoad = loads[loads.length - 1];
    // Townsfolk and animals are ambience: they arrive after the town, outside the loading indicator.
    this.townsfolk = new NpcDirector(scene);
    this.animals = new Animals(scene);
    void this.townReady.then(() => Promise.all([this.townsfolk.load(), this.animals.load()]));
    this.magpies = new Magpies(scene);
    void this.townReady.then(() => this.magpies.load()).catch((error: unknown) => console.warn('Magpies failed to load', error));
    // The week's story actors: hidden until a chapter places them; models arrive after the town.
    this.cast = new StoryCast(scene);
    void this.townReady.then(() => Promise.all(this.cast.load())).catch((error: unknown) => console.warn('Story actors failed to load', error));
    track(loadCharacter(scene, courierUrl).then((model) => this.player.attachModel(model)), 'Courier model');
    track(loadCharacter(scene, finnUrl).then((model) => this.finn.attachModel(model)), 'Finn model');
    track(loadCharacter(scene, arthurUrl).then((model) => this.streetArthur.attachModel(model)), 'Arthur model');
    for (const npc of this.world.npcs) {
      const url = STATIC_NPC_MODELS[npc.id];
      if (url) track(spawnNpc(scene, url, npc).then((n) => void this.staticNpcs.set(npc.id, n)), `NPC ${npc.id}`);
    }
    for (const l of loads) void l.done.then(() => this.renderLoading(loads));
    this.renderLoading(loads);

    // "Continue": the story's next chapter (FR-01; domain/story).
    this.chapter = new ChapterController(storyChapter(this.profiles.profile), this.profiles.ownedItemIds);
    this.setupChapter(this.chapter.definition, false);
    this.applyProfile();

    // Hidden tab: the mission clock must not run (FR-15).
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.chapter.timer.pause('hidden_tab');
      else this.chapter.timer.resume('hidden_tab');
    });

    this.engine.runRenderLoop(() => {
      this.frame(this.engine.getDeltaTime() / 1000);
      scene.render();
    });
    window.addEventListener('resize', () => this.engine.resize());
    canvas.focus();

    if (this.profiles.status === 'blocked-corrupt') {
      this.showCorruptSaveDialog(); // → main menu once the player has decided
    } else {
      this.showMainMenu();
      if (this.profiles.status === 'temporary') this.ui.toast(STRINGS.saveTemporary, 7000);
    }
  }

  // ---------------------------------------------------------------- main menu (FR-01)

  /** Title screen: Continue / Start Shift / Chapters / Settings. The town stays visible behind it. */
  showMainMenu(): void {
    this.ambientPaused = false; // the town is alive behind the title screen
    const profile = this.profiles.profile;
    const resume = storyChapter(profile);
    const progress = hasProgress(profile);
    const weekDone = storyChapterId(profile, PLAYABLE_CHAPTERS) === null;
    const items = [
      // With progress, "Start Shift" would only be a replay of chapter 1 (that's in Chapters); after the
      // week, "Continue" is free roam (replays stay in Chapters).
      weekDone
        ? { label: STRINGS.freeRoam, primary: true, onClick: () => this.startFreeRoam() }
        : progress
          ? { label: STRINGS.continueShift(resume.title), primary: true, onClick: () => this.continueFromMenu(resume) }
          : { label: STRINGS.startShift, primary: true, onClick: () => this.startChapter(CH1) },
      { label: STRINGS.chaptersButton, onClick: () => this.showChapters() },
      { label: STRINGS.settingsButton, onClick: () => this.showSettings(() => this.showMainMenu()) },
    ];
    const tagline = document.createElement('p');
    tagline.className = 'menu-tagline';
    tagline.textContent = STRINGS.menuTagline;
    this.openDialog({ title: STRINGS.title, body: [tagline, buildMenuButtons(items)], buttons: [] }, 'menu');
    this.ui.focusFirstButton();
  }

  private showChapters(): void {
    const profile = this.profiles.profile;
    const items = PLAYABLE_CHAPTERS.map((c) => {
      const rec = profile.chapterRecords[c.id];
      const best = rec?.bestResult;
      const fastest = rec?.bestTimeResult;
      return {
        id: c.id,
        title: c.title,
        unlocked: isChapterUnlocked(profile, c.id, PLAYABLE_CHAPTERS),
        detail:
          best && fastest
            ? STRINGS.chapterBest(best.score, formatTime(fastest.activeMs / 1000), equipmentText(best.equipmentIds))
            : STRINGS.chapterNew,
      };
    });
    const play = (id: string): void => {
      const def = PLAYABLE_CHAPTERS.find((c) => c.id === id);
      if (def && isChapterUnlocked(this.profiles.profile, id, PLAYABLE_CHAPTERS)) this.startChapter(def);
    };
    this.openDialog(
      {
        title: STRINGS.chaptersTitle,
        body: [buildChapterList(items, play)],
        buttons: [{ label: STRINGS.back, onClick: () => this.showMainMenu() }],
        onEscape: () => this.showMainMenu(),
      },
      'menu',
    );
  }

  /** @param back where "Back" goes (main menu or pause menu). */
  private showSettings(back: () => void): void {
    const settings = buildSettings({
      languageButton: STRINGS.switchLanguage,
      sensitivity: this.profiles.profile.settings.sensitivity,
      onLanguage: () => {
        this.switchLanguage();
        this.showSettings(back); // re-render in the new language
      },
      onSensitivity: (v) => {
        this.profiles.setSensitivity(v);
        this.applyProfile();
      },
      musicVolume: this.profiles.profile.settings.musicVolume,
      quality: this.profiles.profile.settings.quality,
      onQuality: (q) => this.setGraphics(q),
      onMusicVolume: (v) => {
        this.profiles.setMusicVolume(v);
        this.music.setVolume(this.profiles.profile.settings.musicVolume);
        this.music.play(ARTHURS_TUNE, 'musicbox', PREVIEW_BARS); // a short preview at the new level
      },
      onReset: () => this.confirmReset(back),
    });
    this.openDialog(
      {
        title: STRINGS.settingsTitle,
        body: [settings],
        buttons: [{ label: STRINGS.back, primary: true, onClick: back }],
        onEscape: back,
      },
      'menu',
    );
  }

  /** Reset Progress needs an explicit second confirmation; only this game's save key is removed. */
  private confirmReset(back: () => void): void {
    this.openDialog(
      {
        title: STRINGS.resetConfirmTitle,
        body: [STRINGS.resetConfirmBody, ...(this.profiles.loadResult.status === 'corrupt' ? [STRINGS.resetAlsoDamaged] : [])],
        buttons: [
          { label: STRINGS.keepProgress, primary: true, onClick: () => this.showSettings(back) },
          { label: STRINGS.resetConfirmButton, onClick: () => this.resetProgress() },
        ],
        onEscape: () => this.showSettings(back),
      },
      'menu',
    );
  }

  private resetProgress(): void {
    const removed = this.profiles.resetProgress();
    this.jobs.clear(); // parcels in hand belong to the profile that is gone (their thieves go back to lurking)
    this.applyProfile();
    // Back to a fresh first chapter behind the menu.
    this.chapter = new ChapterController(CH1, this.profiles.ownedItemIds);
    this.setupChapter(CH1, false);
    this.showMainMenu();
    this.ui.toast(removed ? STRINGS.resetDone : STRINGS.resetFailed, 5000);
  }

  // ---------------------------------------------------------------- chapters

  /** Start a fresh attempt of `def` (also used for "Play Again"); `freeRoam`: set it up but keep it closed. */
  startChapter(def: ChapterDefinition, freeRoam = false): void {
    this.music.stop();
    this.closeDialog();
    this.ui.setTaskPanel(false);
    this.chapter = new ChapterController(def, this.profiles.ownedItemIds);
    if (document.hidden) this.chapter.timer.pause('hidden_tab');
    this.setupChapter(def, !freeRoam, freeRoam);
  }

  /**
   * After the week (CEO, 2026-11-16): roam Bellwick and work the board. The last chapter is set up but never
   * opened, so Mara has no parcel (her E is the day's line: the board is always open) and the town is quiet.
   */
  private startFreeRoam(): void {
    const last = PLAYABLE_CHAPTERS[PLAYABLE_CHAPTERS.length - 1] ?? CH1;
    this.startChapter(last, true);
    this.ui.toast(STRINGS.freeRoamStarted, 5000);
  }

  /** Put the world into the chapter's starting state (`freeRoam`: the chapter stays closed, see startFreeRoam). */
  private setupChapter(def: ChapterDefinition, announce: boolean, freeRoam = false): void {
    this.freeRoam = freeRoam;
    this.townsfolk.setVisible(true); // hidden during the chapter 1 cameo
    // Neutral world first; the chapter's quest (onStart) then brings in what it needs.
    this.meeting = null;
    this.finn.talking = false; // a finished handover must not freeze Finn in the next attempt
    this.finn.setEnabled(false);
    this.hideStreetArthur(); // he only appears after a chapter 1 handover
    this.mewsCast.setEnabled(false);
    this.cast.hideAll(); // the chapter's quest places whom it needs once its day has come
    this.cancelScene(); // a scene from the previous attempt must not resume over this one
    this.player.rig.setShot(null); // nor leave the camera on a fixed shot
    for (const id of Object.keys(STORY_MAGPIES) as StoryThiefId[]) this.magpies.storyThief(id)?.disarm();
    this.storyThief = null;
    // Shortcuts found in finished chapters stay open (design doc: the yard after ch2, the mews after ch3).
    const done = this.profiles.profile.completedChapterIds;
    this.world.gate.setOpen(done.includes('ch2'), false);
    this.world.postmarkGate.setOpen(done.includes('ch3'), false);
    this.hintMarker.hide(); // hints belong to one attempt
    // The player goes back to the spawn on foot: a vehicle they were on returns to the rack; parked ones stay put.
    if (this.player.vehicle) this.parked.resetToRack([this.player.vehicle]);
    this.parkedView.sync(this.parked.entries());
    this.player.setRiding(false);
    this.player.teleport(this.world.spawn);
    this.quest = new QuestRunner<GameEffect>(CHAPTER_QUESTS[def.id], WORLD_RULES);
    this.runEffects(this.quest.start());
    // Before its day the chapter waits: Mara talks about the day until the courier clocks in tomorrow.
    if (!freeRoam && isOpenToday(this.profiles.profile, def)) {
      this.openChapter();
      if (announce) this.ui.toast(STRINGS.chapterStart(def.title), 3500);
    }
  }

  /** The chapter's day has come: Mara has its note and the chapter puts what it needs into the world. */
  private openChapter(): void {
    if (this.chapter.phase !== 'READY' || this.quest.hasFlag('opened')) return;
    this.emit({ event: QUEST_EVENTS.opened });
  }

  /** "Continue" in the main menu: the story's chapter (its day may not have come yet — then the day goes on). */
  private continueFromMenu(def: ChapterDefinition): void {
    this.startChapter(def);
    if (!isOpenToday(this.profiles.profile, def)) this.toastStoryDone();
  }

  /** Tell the chapter's quest what happened and run what it answers. */
  private emit(event: QuestEvent, completion?: Completion): void {
    this.runEffects(this.quest.handle(event), completion);
  }

  private runEffects(effects: readonly (GameEffect | CoreEffect)[], completion?: Completion): void {
    for (const e of effects) {
      if ('toast' in e) this.ui.toast(STRINGS[e.toast], e.ms);
      else if ('say' in e) this.ui.toast(localized(e.say), e.ms);
      else if ('call' in e) this.runCall(e, completion);
      // setFlag / clearFlag / goto were applied by the QuestRunner.
    }
  }

  /** Named quest actions: the bespoke parts of each chapter (dialogs, NPCs, cut-scenes). */
  private runCall(e: Extract<GameEffect, { call: string }>, completion?: Completion): void {
    switch (e.call) {
      case 'openNote':
        return this.openNote();
      case 'closeDialog':
        return this.closeDialog();
      case 'checkTarget':
        return this.checkTarget(e.id, e.variant);
      case 'openGate':
      case 'closeGate':
        return this.gateById(e.id)?.setOpen(e.call === 'openGate', e.call === 'openGate');
      case 'clueFound':
        return this.clueFound(e.id);
      case 'jobs.open':
        return this.openJobBoard();
      case 'job.checkTarget':
        return this.checkJobDoor(e.id);
      case 'magpie.grab':
        return this.grabFromMagpie();
      case 'magpie.crate':
        return this.searchMagpieCrate();
      case 'meeting.start':
        this.meeting = new MeetingController();
        return;
      case 'meeting.choose':
        return this.showMeetingChoice();
      case 'finn.patrol':
        this.finn.setEnabled(true);
        this.finn.place(FINN_PATROL[0] ?? { x: 0, z: 25 });
        this.finn.walk(FINN_PATROL, true); // strolls across Dial Square until a spot is agreed
        return;
      case 'finn.hold':
        this.finn.talking = true; // Finn never walks during the handover
        return;
      case 'finn.release':
        this.finn.talking = false;
        return;
      case 'finn.afterHandover':
        this.finn.place(this.finn.position, this.finn.node.rotation.y); // stays put after the handover
        if (!this.world.gate.isOpen) {
          // Chose the fountain: Finn shows the yard shortcut, so ch3 starts with it open either way.
          this.world.gate.setOpen(true);
          this.ui.toast(STRINGS.finnShortcut, 6000);
        }
        return;
      case 'mews.enable':
        this.mewsCast.setEnabled(true);
        return;
      case 'arthur.atDoor':
        return this.arthurAtDoor();
      case 'arthur.hide':
        if (this.chapter.phase !== 'COMPLETED') this.mewsCast.hideArthur();
        return;
      case 'vendor.open':
        return this.openVendor();
      case 'townsfolk.greet':
        return this.greetTownsfolk();
      case 'vehicle.mount':
        return this.mountNearestVehicle();
      case 'day.end':
        return this.openDayEnd();
      case 'actor.place':
        return this.cast.place(e.id, e.at);
      case 'actor.walk': {
        const id = e.id;
        return this.cast.walk(id, e.route, e.hideAtEnd ? () => this.cast.hide(id) : undefined);
      }
      case 'actor.hide':
        return this.cast.hide(e.id);
      case 'magpie.arm':
        return this.magpies.storyThief(e.id)?.arm(e.mode);
      case 'magpie.disarm': {
        const thief = this.magpies.storyThief(e.id);
        if (thief && this.storyThief === thief) this.storyThief = null; // whatever it held is the courier's again
        return thief?.disarm();
      }
      case 'scene.play': {
        const then = e.then;
        return this.playScene(e.id, () => {
          this.emit({ event: QUEST_EVENTS.scene(e.id) });
          if (then) this.runCall({ call: then }, completion);
        });
      }
      case 'arthur.cameo':
      case 'finale':
      case 'showResult': {
        // Only meaningful right after a delivery (content tests keep these on the delivered event).
        if (!completion) return console.error(`Quest call "${e.call}" needs a settled delivery; ignored.`);
        const { result, outcome } = completion;
        if (e.call === 'arthur.cameo') return this.showArthurCameo(result, outcome);
        if (e.call === 'finale') return this.runFinale(result, outcome);
        return this.showResult(result, outcome);
      }
    }
  }

  /** A story scene (content/scenes.ts): one dialogue per line, the speaker talking, fixed shots; then `onDone`. */
  private playScene(id: SceneId, onDone: () => void): void {
    this.cancelScene();
    const run: { handle: SceneHandle | null; suspended: boolean } = { handle: null, suspended: false };
    this.scene = run;
    run.handle = playScene(
      id,
      {
        openDialog: (opts) => {
          run.suspended = false;
          this.openingSceneLine = true;
          try {
            this.openDialog(opts, 'story');
          } finally {
            this.openingSceneLine = false;
          }
        },
        closeDialog: () => this.closeDialog(),
        speak: (speaker, gesture) => {
          const def = speaker ? SPEAKERS[speaker] : null;
          const npcId = def?.npc ?? null;
          this.talkingNpcId = npcId;
          if (npcId && gesture) this.staticNpcs.get(npcId)?.animator.setGesture(gesture);
          this.cast.setTalking(def?.actor ?? null, gesture);
        },
        shot: (shot) => this.player.rig.setShot(shot),
        placePlayer: (at) => {
          if (this.player.isRiding) this.leaveVehicleForStory();
          this.player.teleport(new Vector3(at.x, 0, at.z));
          this.player.body.rotation.y = at.heading;
        },
        music: (m) => this.music.play(TUNES[m.tune], m.voice, m.bars),
      },
      () => {
        if (this.scene === run) this.scene = null;
        onDone();
      },
    );
    if (run.handle.finished && this.scene === run) this.scene = null; // an empty scene ends at once
  }

  /** Drop a scene the world is being reset under (its `onDone` no longer applies). */
  private cancelScene(): void {
    this.scene?.handle?.cancel();
    this.scene = null;
  }

  /** The shared townsfolk spot, placed on the nearest townsperson, if the player is close and facing them. */
  private townsfolkTarget(px: number, pz: number): WorldSpot | null {
    const near = this.townsfolk.nearest({ x: px, z: pz }, TOWNSFOLK_GREET_RANGE);
    if (!near) return null;
    this.townsfolkSpot.x = near.x;
    this.townsfolkSpot.z = near.z;
    return selectTarget(px, pz, this.player.body.rotation.y, [this.townsfolkSpot]) ? this.townsfolkSpot : null;
  }

  /** A neighbour turns, waves or nods, and says one of the greeting lines (never the same twice in a row). */
  private greetTownsfolk(): void {
    const p = this.player.position;
    if (!this.townsfolk.greet({ x: p.x, z: p.z }, TOWNSFOLK_GREET_RANGE)) return;
    let i = Math.floor(Math.random() * TOWNSFOLK_GREETINGS.length);
    if (i === this.lastGreeting) i = (i + 1) % TOWNSFOLK_GREETINGS.length;
    this.lastGreeting = i;
    const line = TOWNSFOLK_GREETINGS[i];
    if (line) this.ui.toast(localized(line), 3500);
  }

  // ---------------------------------------------------------------- parked vehicles

  /** The registry follows what the profile owns (new purchases appear at the rack), and the view follows it. */
  private syncOwnedVehicles(): void {
    this.parked.setOwned(this.profiles.profile.ownedVehicleIds);
    this.parkedView.sync(this.parked.entries());
  }

  /** The shared vehicle spot, placed on the nearest parked vehicle, if the player is close and facing it. */
  private vehicleTarget(px: number, pz: number): WorldSpot | null {
    const near = this.parked.nearest({ x: px, z: pz }, VEHICLE_MOUNT_RANGE);
    if (!near) return null;
    this.vehicleSpot.x = near.x;
    this.vehicleSpot.z = near.z;
    return selectTarget(px, pz, this.player.body.rotation.y, [this.vehicleSpot]) ? this.vehicleSpot : null;
  }

  /** E on a parked vehicle: the player takes its place and heading, and it stops being a parked obstacle. */
  private mountNearestVehicle(): void {
    if (this.player.isRiding) return;
    // Story deliveries are walked (CEO, 2026-11-14): their time and score are measured on foot.
    if (this.chapter.phase === 'ACTIVE') return this.ui.toast(STRINGS.vehicles.storyOnFoot, 4000);
    const p = this.player.position;
    const near = this.parked.nearest({ x: p.x, z: p.z }, VEHICLE_MOUNT_RANGE);
    if (!near || !isVehicleKind(near.id)) return;
    this.parked.ride(near.id);
    this.parkedView.sync(this.parked.entries());
    this.colliders.sync(); // its parked collider must be gone before the riding body takes its place
    // Not through a fence, and not onto a spot something has moved into since it was parked.
    const check = mountCheck(this.colliders.world, { x: p.x, z: p.z }, near.pose, VEHICLES[near.id].body);
    if (check !== 'ok') {
      this.parked.park(near.id, near.pose);
      this.parkedView.sync(this.parked.entries());
      this.colliders.sync();
      return this.ui.toast(check === 'unreachable' ? STRINGS.vehicles.cantReach : STRINGS.vehicles.inTheWay);
    }
    const body = this.player.body;
    body.position.x = near.pose.x;
    body.position.z = near.pose.z;
    body.rotation.y = near.pose.heading;
    this.player.setVehicle(near.id);
  }

  /** A story scene begins: whatever the courier rode is left parked right here (no search for a free spot). */
  private leaveVehicleForStory(): void {
    const kind = this.player.vehicle;
    if (!kind) return;
    const body = this.player.body;
    const pose = { x: body.position.x, z: body.position.z, heading: body.rotation.y };
    const spec = VEHICLES[kind].body;
    // Step off beside it when there is room, so the courier does not end up inside the parked vehicle.
    const spot = this.stepOffSpot(pose, spec);
    this.player.setVehicle(null);
    if (spot) {
      this.player.teleport(new Vector3(spot.x, this.world.spawn.y, spot.z));
      body.rotation.y = pose.heading;
    }
    this.parked.park(kind, pose);
    this.parkedView.sync(this.parked.entries());
  }

  /** E while riding with nothing to interact with: step off beside the vehicle and leave it right there. */
  private dismountVehicle(): void {
    const kind = this.player.vehicle;
    if (!kind) return;
    const body = this.player.body;
    const pose = { x: body.position.x, z: body.position.z, heading: body.rotation.y };
    const spec = VEHICLES[kind].body;
    const spot = this.stepOffSpot(pose, spec);
    if (!spot) return this.ui.toast(STRINGS.vehicles.noRoom);
    this.player.setVehicle(null);
    this.player.teleport(new Vector3(spot.x, this.world.spawn.y, spot.z));
    body.rotation.y = pose.heading; // keep looking the way they rode
    this.parked.park(kind, pose); // a vehicle that is not owned (dev B) is simply gone
    this.parkedView.sync(this.parked.entries());
  }

  /** A free spot beside the ridden vehicle that can be walked to from it (never through a fence or gate). */
  private stepOffSpot(
    pose: { x: number; z: number; heading: number },
    spec: { radius: number; halfLength: number },
  ): { x: number; z: number } | null {
    const world = this.colliders.world;
    return dismountSpot(pose, spec.radius, (x, z, r) => !world.overlaps(x, z, r), {
      halfLength: parkedFootprint(spec).halfLength,
      reaches: (x, z) => pathClear(world, pose, { x, z }),
    });
  }

  /** Dev B changed what is ridden without E: nothing may be both ridden and parked, or ridden twice. */
  private reconcileRiddenVehicle(): void {
    const now = this.player.vehicle;
    this.parked.resetToRack(this.parked.riddenIds().filter((id) => id !== now));
    if (now) this.parked.ride(now);
    this.parkedView.sync(this.parked.entries());
  }

  private gateById(id: string | undefined): YardGate | null {
    if (id === 'gate_yard') return this.world.gate;
    if (id === 'gate_postmark') return this.world.postmarkGate;
    return null;
  }

  private get activeSpots(): WorldSpot[] {
    const id = this.chapter.definition.id;
    // A door only answers while a job in hand is addressed to it.
    const doors = this.jobs.targetIds;
    const map = this.world.spots.filter((s) => (s.kind === 'address' ? doors.includes(s.id) : !s.chapters || s.chapters.includes(id)));
    return [...map, ...this.cast.spots];
  }

  // ---------------------------------------------------------------- frame

  private frame(dt: number): void {
    const dialog = this.ui.isDialogOpen;
    if (this.qualityProbe && this.modelsReady && !dialog && !document.hidden) {
      const level = this.qualityProbe.add(dt);
      if (level) this.settleAutoQuality(level);
    }
    // Panels stop movement (FR-05); the clock keeps running for the task panel, not for story dialogs.
    this.player.movementEnabled = !dialog && !this.ui.isTaskPanelOpen && !this.ui.isMapOpen;
    this.colliders.sync(); // gates and NPCs moved last frame
    // Parcel in hand: carry walk/run (not while a story Magpie has the chapter's parcel).
    this.player.carrying = (this.chapter.phase === 'ACTIVE' && !this.storyThief) || this.jobs.holdingParcel;
    this.player.update(this.input.moveInput(), dt);
    this.streamer.update(dt, this.player.position.x, this.player.position.z);
    if (!dialog) {
      this.talkingNpcId = null;
      this.cast.setTalking(null);
    }
    for (const [id, npc] of this.staticNpcs) {
      // Talking: hands move — after any wave or nod they started with (those end by themselves).
      if (id === this.talkingNpcId) {
        if (npc.animator.gestureKind === null) npc.animator.setGesture('talk');
      } else if (npc.animator.gestureKind === 'talk') npc.animator.setGesture(null);
      npc.animator.update(dt, 0);
    }
    const p = this.player.position;
    // Safety net: never leave the player falling forever if they slip through a gap in the floor.
    if (p.y < FALL_LIMIT_Y) this.player.teleport(this.world.spawn);

    this.world.gate.update(dt);
    this.world.postmarkGate.update(dt);
    this.hintMarker.update(dt);
    this.updateFinn(dt, { x: p.x, z: p.z });
    if (this.streetArthurActive) this.streetArthur.update(dt, { x: p.x, z: p.z });
    this.cast.update(dt, { x: p.x, z: p.z });
    if (!dialog) this.ambientPaused = false;
    this.townsfolk.update(dt, { x: p.x, z: p.z }, this.ambientPaused);
    this.animals.update(dt, { x: p.x, z: p.z }, this.ambientPaused);
    this.chapter.tick(dt);
    this.updateJobs(dt, dialog);
    this.updateMagpies(dt, dialog, p.x, p.z);

    const spots = this.activeSpots;
    // From the saddle any direction counts: a door is passed side-on, and E must deliver rather than get off.
    const id = dialog ? null : selectTarget(p.x, p.z, this.player.body.rotation.y, spots, { anyDirection: this.player.isRiding });
    this.currentTarget = spots.find((s) => s.id === id) ?? null;
    // A fleeing Magpie in reach comes before a hello.
    if (!this.currentTarget && !dialog) this.currentTarget = this.magpieTarget(p.x, p.z);
    // Nothing of the story or a job in reach, and on foot: a parked vehicle of the player's can be mounted.
    if (!this.currentTarget && !dialog && !this.player.isRiding) this.currentTarget = this.vehicleTarget(p.x, p.z);
    // Nothing of the story in reach: the nearest townsperson can be greeted (on foot: from the saddle E gets off).
    if (!this.currentTarget && !dialog && !this.player.isRiding) this.currentTarget = this.townsfolkTarget(p.x, p.z);
    const panelOpen = this.ui.isTaskPanelOpen || this.ui.isMapOpen;
    const t = this.currentTarget;
    const prompt = t && t.kind === 'npc' && t.name ? STRINGS.promptTalkTo(t.name) : t ? STRINGS.prompt[t.kind] : null;
    this.ui.setPrompt(prompt && !panelOpen ? prompt : null);

    if (dialog) {
      this.input.clearPresses();
    } else {
      if (this.input.consumePress('Escape')) this.showPauseMenu();
      if (this.input.consumePress('Tab')) {
        this.ui.setMap(false);
        this.toggleTaskPanel();
      }
      if (this.input.consumePress('KeyM')) this.toggleMap();
      if (this.input.consumePress('KeyH')) this.offerHint();
      // World rule (every chapter): E while riding with nothing to interact with gets off the vehicle.
      if (this.player.isRiding && !this.currentTarget && !panelOpen && this.input.consumePress('KeyE')) this.dismountVehicle();
      if (this.input.consumePress('KeyE') && this.currentTarget && !panelOpen) this.interact(this.currentTarget);
    }

    const jobTime = this.jobs.soonestRemaining;
    this.ui.setTimer(
      this.chapter.phase === 'ACTIVE' ? formatTime(this.chapter.timer.seconds) : jobTime !== null ? STRINGS.jobs.timeLeft(formatTime(jobTime)) : null,
    );
    this.ui.setLookHint(!dialog && !this.ui.isMapOpen && !this.player.mouseLook.isLocked);
    this.ui.setCompass(this.profiles.owns('compass') ? cameraHeadingDeg(this.player.camera.alpha) : null);
    this.ui.setMinimap(this.gpsPosition(), this.profiles.profile.completedChapterIds, this.jobGoal());
    this.trackDistrict();
  }

  /** Walking into a district for the first time puts it on the map (M). */
  private trackDistrict(): void {
    const p = this.player.position;
    const id = districtAt(BELLWICK.districts, p.x, p.z)?.id;
    if (id === undefined || id === this.districtId) return;
    this.districtId = id;
    // A place the story has not revealed yet (Postmark Mews) is not announced by wandering over its ground.
    if (!districtOnMap(BELLWICK, id, this.profiles.profile.completedChapterIds)) return;
    if (this.profiles.discoverDistrict(id)) {
      const name = BELLWICK.districts.find((d) => d.id === id)?.name ?? id;
      this.ui.toast(STRINGS.districtDiscovered(name));
    }
  }

  /** Where the player is, for the GPS map views; null without GPS. */
  private gpsPosition(): MapPosition | null {
    if (!this.gpsActive) return null;
    const p = this.player.position;
    return { x: p.x, z: p.z, bearing: facingBearingDeg(this.player.body.rotation.y) };
  }

  /** Dev/test helper: force GPS on/off regardless of the profile (until the next page load). */
  setGps(on: boolean): void {
    this.gpsOverride = on;
    this.gpsActive = on;
    if (this.ui.isMapOpen) this.openMap();
  }

  /** Dev/test helper (`__game.openVendor()`): the market stall without walking to it. */
  openVendor(): void {
    const profile = this.profiles.profile;
    const credits = profile.credits;
    type Offer = { id: string; name: string; price: number; description: LocalizedText; isNewToday: boolean };
    const card = (o: Offer, kind: VendorItemView['kind'], shelf: Shelf): VendorItemView => ({
      id: o.id,
      kind,
      name: o.name,
      description: localized(o.description),
      isNew: o.isNewToday,
      ...stallCard(profile, o, shelf),
    });
    const items: VendorItemView[] = [
      ...vendorStock(profile.storyDay).map((i) => card(i, i.kind, 'ownedItemIds')),
      ...vehicleStock(profile.storyDay).map((v) => card(v, 'vehicle', 'ownedVehicleIds')),
    ];
    this.openDialog(
      {
        title: STRINGS.vendorTitle,
        body: [buildVendor(credits, items, (id) => this.buyFromVendor(id))],
        buttons: [{ label: STRINGS.close, primary: true, onClick: () => this.closeDialog() }],
        onEscape: () => this.closeDialog(),
      },
      'menu',
    );
  }

  private buyFromVendor(itemId: string): void {
    const vehicle = findVehicle(itemId);
    const r = vehicle ? this.profiles.buyVehicle(itemId) : this.profiles.buy(itemId);
    if (r.ok) {
      this.applyProfile(); // effect only after the purchase succeeded
      this.ui.toast(vehicle ? STRINGS.vehicleDelivered(vehicle.name) : STRINGS.bought(findItem(itemId)?.name ?? itemId));
      if (!this.profiles.lastWriteOk) this.ui.toast(STRINGS.saveFailed, 6000);
    }
    this.openVendor(); // re-render cards with the new balance / owned state
  }

  // ---------------------------------------------------------------- side jobs (Relay board)

  /** Clocks, parcel wear and the ring at the door, once per frame. Dialogs (and the pause menu) stop the clock. */
  private updateJobs(dt: number, dialog: boolean): void {
    this.jobMarker.update(dt);
    dt = Math.min(dt, MAX_AMBIENT_STEP); // a tab that was away must not eat a job's whole deadline in one frame
    const speed = Math.abs(this.player.speed);
    if (!dialog && this.jobs.active.length > 0) {
      for (const late of this.jobs.tick(dt)) {
        void late;
        this.ui.toast(STRINGS.jobs.late, 5000);
        if (this.ui.isTaskPanelOpen) this.renderTaskPanel(this.jobs.active.length > 0 || this.chapter.phase === 'ACTIVE');
      }
      const riding = this.player.isRiding;
      // The van carries a parcel gently; on two wheels a sudden stop from speed is a bump.
      // Getting on or off is not a bump: only a sudden stop while already riding counts.
      const bumped = riding && this.wasRiding && this.player.vehicle !== 'van' && this.lastSpeed > 6 && speed < this.lastSpeed * 0.35;
      this.jobs.shake(dt, !riding && speed > WALK_SPEED + 0.5, bumped);
    }
    this.lastSpeed = speed;
    this.wasRiding = this.player.isRiding;
    // The job note shows a countdown: keep it current while the panel is open (once per second).
    const left = this.jobs.soonestRemaining;
    const shown = left === null ? null : Math.ceil(left);
    if (shown !== this.jobSecondShown) {
      this.jobSecondShown = shown;
      if (shown !== null && this.ui.isTaskPanelOpen && this.chapter.phase !== 'ACTIVE') this.renderTaskPanel(true);
    }
    const next = this.jobs.active.find((c) => !c.parcelStolen);
    const at = next ? addressAt(next.targetId) : undefined;
    if (at) this.jobMarker.show(at.x, at.z, 1.3);
    else if (this.jobMarker.visible) this.jobMarker.hide();
  }

  /** Where the first parcel in hand is going (GPS map views); null with empty hands or a stolen parcel. */
  private jobGoal(): { x: number; z: number } | null {
    const next = this.jobs.active.find((c) => !c.parcelStolen);
    return (next && addressAt(next.targetId)) ?? null;
  }

  private jobCard(job: Job, targetId = job.dropoffId): JobCardView {
    const time = job.deadlineSeconds !== undefined ? formatTime(job.deadlineSeconds) : '';
    return {
      id: job.id,
      name: addressName(targetId),
      district: addressDistrict(targetId),
      // A wrong address looks like any other parcel on the board: finding out is the job.
      tag: job.kind === 'timed' ? STRINGS.jobs.tag.express : job.kind === 'fragile' ? STRINGS.jobs.tag.fragile : STRINGS.jobs.tag.parcel,
      hint: job.kind === 'timed' ? STRINGS.jobs.hintTimed(time) : job.kind === 'fragile' ? STRINGS.jobs.hintFragile : STRINGS.jobs.hintPlain,
      distance: Math.round(job.distance / 10) * 10,
      payout: job.payout,
    };
  }

  /** Task panel lines for one job in hand: where to, then what to watch. */
  private jobNoteLines(c: JobController): string[] {
    const lines = [STRINGS.jobs.note(addressName(c.targetId), addressDistrict(c.targetId))];
    if (c.parcelStolen) lines.push(STRINGS.jobs.noteStolen);
    const left = c.remainingSeconds;
    if (left !== null) lines.push(STRINGS.jobs.noteTimed(formatTime(left)));
    if (c.job.kind === 'fragile') lines.push(STRINGS.jobs.noteFragile(Math.round(c.condition)));
    return lines;
  }

  /** What the board offers right now (also the dev/test helper `__game.jobOffers()`). */
  jobOffers(): Job[] {
    const p = this.profiles.profile;
    return this.jobs.offers(p.storyDay, p.jobsCompleted, p.settledJobIds);
  }

  /** E on the board (and `__game.openJobBoard()`): offers, what is in hand, take / give up. */
  openJobBoard(): void {
    if (this.chapter.phase === 'ACTIVE') return this.ui.toast(STRINGS.jobs.boardBusy);
    const offers = this.jobOffers();
    const capacity = jobCapacity(this.profiles.owns('bag'));
    const board = buildJobBoard({
      offers: offers.map((j) => this.jobCard(j)),
      carried: this.jobs.active.map((c) => this.jobCard(c.job, c.targetId)),
      canTake: this.jobs.active.length < capacity,
      onTake: (id) => {
        const job = offers.find((j) => j.id === id);
        if (job) this.takeJob(job);
      },
      onGiveUp: (id) => {
        const c = this.jobs.active.find((x) => x.job.id === id);
        if (c) this.jobs.abandon(c);
        this.ui.toast(STRINGS.jobs.gaveUp);
        this.openJobBoard();
      },
    });
    this.openDialog(
      {
        title: STRINGS.jobs.boardTitle,
        body: [board],
        buttons: [{ label: STRINGS.close, primary: true, onClick: () => this.closeDialog() }],
        onEscape: () => this.closeDialog(),
      },
      'menu',
    );
  }

  /** Take a job off the board (also the dev/test helper `__game.takeJob(job)`). */
  takeJob(job: Job): boolean {
    const c = this.jobs.take(job, jobCapacity(this.profiles.owns('bag')));
    if (!c) {
      this.ui.toast(STRINGS.jobs.handsFull);
      return false;
    }
    this.closeDialog();
    this.player.animator?.playOnce('pick-up'); // takes the parcel off the shelf
    this.ui.toast(STRINGS.jobs.taken(addressName(c.targetId), addressDistrict(c.targetId)), 4500);
    return true;
  }

  /** E on an address: the wrong house sends you on, the right one takes the parcel. */
  private checkJobDoor(spotId: string): void {
    const c = this.jobs.forDoor(spotId);
    if (!c) return;
    const r = c.checkTarget(spotId);
    switch (r.kind) {
      case 'over':
        return;
      case 'no-parcel':
        return this.ui.toast(STRINGS.jobs.noParcel);
      case 'wrong':
        return this.ui.toast(STRINGS.jobs.wrongDoor);
      case 'redirected':
        return this.openDialog(
          {
            title: STRINGS.jobs.redirectTitle,
            body: [STRINGS.jobs.redirectBody(addressName(r.toId), addressDistrict(r.toId))],
            buttons: [{ label: STRINGS.next, primary: true, onClick: () => this.closeDialog() }],
            onEscape: () => this.closeDialog(),
          },
          'menu',
        );
      case 'correct':
        return this.openDialog(
          {
            title: addressName(spotId),
            body: [STRINGS.jobs.handoverBody],
            buttons: [
              { label: STRINGS.cancel, onClick: () => this.closeDialog() },
              { label: STRINGS.jobs.deliver, primary: true, onClick: () => this.deliverJob(c) },
            ],
            onEscape: () => this.closeDialog(),
          },
          'menu',
        );
    }
  }

  private deliverJob(c: JobController): void {
    this.closeDialog();
    const result = this.jobs.deliver(c);
    const paid = this.profiles.settleJob(result);
    if (!paid.applied) return;
    this.player.animator?.playOnce('victory'); // parcel delivered
    this.applyProfile();
    const text = result.kind === 'fragile' ? STRINGS.jobs.paidFragile(paid.creditsAwarded, Math.round(result.condition)) : STRINGS.jobs.paid(paid.creditsAwarded);
    this.ui.toast(text, 4500);
    if (!this.profiles.lastWriteOk) this.ui.toast(STRINGS.saveFailed, 6000);
    if (this.ui.isTaskPanelOpen) this.renderTaskPanel(this.jobs.active.length > 0);
  }

  /** Dev/test helper (`__game.setDay(n)`): jump to a day of the courier's week (1..5) and save it. */
  setDay(day: number): void {
    this.profiles.setStoryDay(day);
  }

  // ---------------------------------------------------------------- the Magpies (parcel thieves)

  /** Dev/test helper (`__game.setMagpies(true)`): the gang is about whatever the day. */
  setMagpies(on: boolean): void {
    this.magpiesForced = on;
  }

  /** Thieves lurk, snatch and run, once per frame. Dialogs (and the pause menu) stop them. */
  private updateMagpies(dt: number, dialog: boolean, px: number, pz: number): void {
    // A job that ended while its parcel was away (too late, given up): the thief simply goes back to lurking.
    for (const [thief, job] of this.stolenBy) {
      if (job.phase === 'CARRYING' && job.parcelStolen) continue;
      thief.reset();
      this.stolenBy.delete(thief);
    }
    if (dialog) return;
    dt = Math.min(dt, MAX_AMBIENT_STEP); // a thief must not cover its whole run in the first frame after a hidden tab
    const out = this.magpiesForced || this.profiles.profile.storyDay >= MAGPIES_FROM_DAY;
    const storyCarrying = this.chapter.phase === 'ACTIVE' && !this.storyThief;
    for (const { thief, event } of this.magpies.update(dt, { x: px, z: pz }, out && this.jobs.holdingParcel, out, storyCarrying)) {
      if (thief.isStory) {
        // The chapter's parcel: what happens next is the chapter's (its quest hears it).
        if (event === 'snatched') this.storyThief = thief;
        if (event === 'lost') this.storyThief = null;
        this.emit({ event: QUEST_EVENTS.magpie(event === 'reachedDen' ? 'atDen' : event) });
        if (this.ui.isTaskPanelOpen) this.renderTaskPanel(true);
        continue;
      }
      if (event === 'lost') continue; // only story thieves lead the way
      if (event === 'reachedDen') {
        this.ui.toast(STRINGS.magpies.gotAway, 6000);
        continue;
      }
      const job = this.jobs.active.find((c) => !c.parcelStolen);
      if (!job) {
        thief.reset(); // another thief was quicker on this very frame
        continue;
      }
      job.setStolen(true);
      this.stolenBy.set(thief, job);
      this.ui.toast(STRINGS.magpies.snatched, 4500);
      if (this.ui.isTaskPanelOpen) this.renderTaskPanel(true);
    }
  }

  /** The shared grab spot, placed on the fleeing thief the courier can reach. */
  private magpieTarget(px: number, pz: number): WorldSpot | null {
    const thief = this.magpies.grabbable({ x: px, z: pz });
    if (!thief) return null;
    this.magpieSpot.x = thief.x;
    this.magpieSpot.z = thief.z;
    return this.magpieSpot;
  }

  /** E on a fleeing thief in reach: the parcel is back in the courier's hands. */
  private grabFromMagpie(): void {
    const p = this.player.position;
    const thief = this.magpies.grabbable({ x: p.x, z: p.z });
    if (!thief || thief.grab() !== 'recovered') return;
    this.returnParcel(thief);
    this.profiles.recoverParcel();
    if (thief.isStory) this.emit({ event: QUEST_EVENTS.magpie('recovered') }); // the chapter says what it means
    else this.ui.toast(STRINGS.magpies.recovered, 4000);
    if (!this.profiles.lastWriteOk) this.ui.toast(STRINGS.saveFailed, 6000);
  }

  /** E on the crate in the den: every stolen parcel that made it there comes back. */
  private searchMagpieCrate(): void {
    let found = false;
    let story = false;
    for (const thief of this.magpies.thieves) {
      if (!thief.takeFromCrate()) continue;
      this.returnParcel(thief);
      found = true;
      story ||= thief.isStory;
    }
    this.ui.toast(found ? STRINGS.magpies.crateFound : STRINGS.magpies.crateEmpty, 4000);
    if (story) this.emit({ event: QUEST_EVENTS.magpie('recovered') });
  }

  private returnParcel(thief: Thief): void {
    if (this.storyThief === thief) this.storyThief = null;
    this.stolenBy.get(thief)?.setStolen(false);
    this.stolenBy.delete(thief);
    if (this.ui.isTaskPanelOpen) this.renderTaskPanel(true);
  }

  private updateFinn(dt: number, player: { x: number; z: number }): void {
    if (!this.finn.node.isEnabled()) return; // Finn takes part only when the chapter's quest started his patrol
    this.finn.update(dt, player);
    const spot = this.world.spots.find((s) => s.id === 'npc_finn');
    if (spot) {
      const f = this.finn.position;
      spot.x = f.x;
      spot.z = f.z;
    }
    // Waiting early at the agreed spot is not active time; leaving the area counts again (FR-15).
    const m = this.meeting;
    if (!m) return;
    const point = m.acceptedPointId ? MEETING_SPOTS[m.acceptedPointId] : null;
    const dist = point ? Math.hypot(player.x - point.x, player.z - point.z) : null;
    if (m.isWaitExempt(dist)) this.chapter.timer.pause('meeting_wait');
    else this.chapter.timer.resume('meeting_wait');
  }

  // ---------------------------------------------------------------- task panel

  private toggleTaskPanel(): void {
    // Re-opening the note is free (FR-07); only meaningful once the parcel is taken.
    if (this.chapter.phase !== 'ACTIVE' && this.jobs.active.length === 0) {
      this.ui.setTaskPanel(false);
      return;
    }
    this.renderTaskPanel(!this.ui.isTaskPanelOpen);
  }

  /** Which day of the week it is and how far today's board jobs are (the task panel's last line). */
  private dayLine(): string {
    if (this.freeRoam) return STRINGS.day.freeRoam;
    const p = this.profiles.profile;
    return STRINGS.day.panel(p.storyDay, Math.min(p.dayJobs, JOBS_TO_END_DAY), JOBS_TO_END_DAY);
  }

  private renderTaskPanel(open: boolean): void {
    if (this.chapter.phase !== 'ACTIVE' && this.jobs.active.length > 0) {
      const [first, ...rest] = this.jobs.active.map((c) => this.jobNoteLines(c));
      this.ui.setTaskPanel(open, first?.[0] ?? '', [...(first?.slice(1) ?? []), ...rest.flat(), this.dayLine()]);
      return;
    }
    const def = this.chapter.definition;
    const point = this.meeting?.acceptedPointId;
    const extra: string[] = [];
    if (point) extra.push(STRINGS.meetingLine(STRINGS.pointNames[point]));
    for (const id of this.chapter.clueIds) if (isClueId(id)) extra.push(localized(CLUES[id].panelLine));
    if (this.chapter.hintIds.includes('hint_text')) extra.push(STRINGS.hintLine(localized(def.hintText)));
    const next = this.chapter.nextHint;
    extra.push(next ? STRINGS.hintKey(next.cost) : STRINGS.hintKeyFree);
    if (this.chapter.phase !== 'ACTIVE') extra.push(this.dayLine());
    const request = ++this.taskPanelRequest;
    if (!def.photoCaption || !open) {
      this.ui.setTaskPanel(open, localized(def.note), extra);
      return;
    }
    const attempt = this.chapter;
    void this.oldPhotoUrl().then((url) => {
      // Only if nothing changed meanwhile: same attempt, panel still wanted (not closed / replaced), no dialog.
      if (this.chapter !== attempt || request !== this.taskPanelRequest || this.ui.isDialogOpen) return;
      this.ui.setTaskPanel(true, localized(def.note), extra, photoFigure(url, def.photoCaption ? localized(def.photoCaption) : ''));
    });
  }

  /** Rendered once per session after the town has loaded; a failed render is retried next time. */
  private oldPhotoUrl(): Promise<string | null> {
    // Wait for the town (for the background), but never longer than PHOTO_TOWN_WAIT_MS.
    this.oldPhoto ??= Promise.race([this.townReady, delay(PHOTO_TOWN_WAIT_MS)])
      .then(() => withTimeout(captureView(this.world.scene, this.world.mews.oldPhotoView), CAPTURE_TIMEOUT_MS))
      .catch((err: unknown) => {
        console.warn('Old photo could not be rendered.', err);
        this.oldPhoto = null;
        return null;
      });
    return this.oldPhoto;
  }

  // ---------------------------------------------------------------- pause (Esc), sketch map (M), loading

  /**
   * Esc: pause menu. While the mouse is captured the browser uses the first Esc to release it,
   * so the pause menu opens on the next press.
   */
  showPauseMenu(): void {
    this.ambientPaused = true;
    this.ui.setTaskPanel(false);
    this.ui.setMap(false);
    const body: string[] = [STRINGS.pauseBody];
    if (this.chapter.phase === 'ACTIVE') body.push(STRINGS.pauseLeaveWarning);
    const items = [
      { label: STRINGS.resume, primary: true, onClick: () => this.closeDialog() },
      // In free roam there is no delivery to restart.
      ...(this.freeRoam ? [] : [{ label: STRINGS.restartDelivery, onClick: () => this.startChapter(this.chapter.definition) }]),
      { label: STRINGS.settingsButton, onClick: () => this.showSettings(() => this.showPauseMenu()) },
      { label: STRINGS.mainMenu, onClick: () => this.showMainMenu() },
    ];
    this.openDialog(
      { title: STRINGS.pauseTitle, body: [...body, buildMenuButtons(items)], buttons: [], onEscape: () => this.closeDialog() },
      'menu',
    );
    this.ui.focusFirstButton();
  }

  /** M: the sketch map (Postmark Mews is drawn once the finale has been reached; "you are here" only with GPS). */
  private toggleMap(): void {
    if (this.ui.isMapOpen) {
      this.ui.setMap(false);
      return;
    }
    this.ui.setTaskPanel(false);
    this.openMap();
  }

  private openMap(): void {
    // The map is moved with the mouse: free the pointer while it is open (re-captured when it closes).
    if (!this.ui.isMapOpen) this.mapRelock = this.player.mouseLook.isLocked;
    const you = this.gpsPosition() ?? undefined;
    const p = this.player.position;
    const map = openSketchMap({
      completedChapterIds: this.profiles.profile.completedChapterIds,
      discoveredDistrictIds: this.profiles.profile.discoveredDistrictIds,
      at: { x: p.x, z: p.z },
      ...(you ? { you } : {}),
      ...(you && this.jobGoal() ? { goal: this.jobGoal()! } : {}),
    });
    this.ui.setMap(true, map.element, you !== undefined, () => {
      map.dispose();
      // Closed for good (not replaced by a redrawn map, not by a dialog that frees the mouse itself).
      queueMicrotask(() => {
        if (this.ui.isMapOpen || this.ui.isDialogOpen) return;
        this.player.mouseLook.enabled = true;
        if (this.mapRelock) this.player.mouseLook.lock();
        this.mapRelock = false;
      });
    });
    this.player.mouseLook.enabled = false;
    this.player.mouseLook.unlock();
  }

  /** "Loading Bellwick… 63%" until every model has arrived (or failed/timed out → message + retry). */
  private renderLoading(loads: readonly TrackedLoad[]): void {
    this.modelsReady = loads.every((l) => l.settled);
    if (this.modelsReady) {
      if (loads.some((l) => !l.ok)) this.ui.setLoading(STRINGS.loadFailed, () => window.location.reload());
      else this.ui.setLoading(null);
      return;
    }
    const percent = Math.floor((loads.reduce((sum, l) => sum + l.fraction, 0) / loads.length) * 100);
    this.ui.setLoading(STRINGS.loading(percent));
  }

  // ---------------------------------------------------------------- hints (FR-13)

  /** H: offer the next paid hint (with its price), or show the ones already taken for free. */
  private offerHint(): void {
    if (this.chapter.phase !== 'ACTIVE') return;
    const def = this.chapter.definition;
    const body: (string | HTMLElement)[] = [];
    if (this.chapter.hintIds.includes('hint_text')) body.push(noteParagraph(localized(def.hintText)));
    const next = this.chapter.nextHint;
    if (!next) {
      body.push(STRINGS.hintsAllTaken);
      this.showHintArea(); // re-showing is free
      this.openDialog({ title: STRINGS.hintTitle, body, buttons: [{ label: STRINGS.close, primary: true, onClick: () => this.closeDialog() }], onEscape: () => this.closeDialog() });
      return;
    }
    body.push(next.hintId === 'hint_text' ? STRINGS.hintOfferText(next.cost) : STRINGS.hintOfferArea(next.cost));
    this.openDialog({
      title: STRINGS.hintTitle,
      body,
      buttons: [
        { label: STRINGS.close, onClick: () => this.closeDialog() },
        { label: STRINGS.hintTake(next.cost), primary: true, onClick: () => this.takeHint() },
      ],
      onEscape: () => this.closeDialog(),
    });
  }

  private takeHint(): void {
    const r = this.chapter.takeNextHint();
    if (r.kind !== 'shown') return this.closeDialog();
    if (r.hintId === 'hint_area') {
      this.closeDialog();
      this.showHintArea();
      this.ui.toast(STRINGS.hintAreaShown, 4000);
      return;
    }
    this.openDialog({
      title: STRINGS.hintTitle,
      body: [noteParagraph(localized(this.chapter.definition.hintText))],
      buttons: [{ label: STRINGS.close, primary: true, onClick: () => this.closeDialog() }],
      onEscape: () => this.closeDialog(),
    });
  }

  /** Ring around the answer's area; in ch2 it follows the agreed meeting point once there is one. */
  private showHintArea(): void {
    if (!this.chapter.hintIds.includes('hint_area')) return;
    const point = this.meeting?.acceptedPointId;
    const area = point ? { ...MEETING_SPOTS[point], radius: 1.3 } : this.chapter.definition.hintArea;
    this.hintMarker.show(area.x, area.z, area.radius);
  }

  // ---------------------------------------------------------------- interactions

  /** E on a spot: an open gate is just open; everything else is up to the chapter's quest. */
  interact(spot: WorldSpot): void {
    if (spot.kind === 'gate' && this.gateById(spot.id)?.isOpen) return this.ui.toast(STRINGS.gateIsOpen);
    this.emit({ interact: spot.id });
  }

  /** The giver's pickup dialog: the note (and, when the chapter has one, Sylvie's old photo). */
  private openNote(): void {
    // World rule (every chapter): one thing at a time. A side job in hand would run unseen behind the story clock.
    if (this.jobs.active.length > 0) return this.ui.toast(STRINGS.jobs.finishFirst, 4500);
    const def = this.chapter.definition;
    this.talkingNpcId = def.giverId; // the giver explains the job while the note is open
    if (!def.photoCaption) {
      this.openDialog({
        title: STRINGS.noteTitle,
        body: [localized(def.pickupLine), noteParagraph(localized(def.note))],
        buttons: [{ label: STRINGS.acceptNote, primary: true, onClick: () => this.acceptNote() }, ...this.replayEndShift()],
      });
      return;
    }
    // Chapter 3: the album, the key and Sylvie's photo (rendered first; reading it is outside the clock).
    const attempt = this.chapter;
    let ready = false;
    window.setTimeout(() => {
      if (!ready) this.ui.toast(STRINGS.photoLoading, 3000); // only if the photo isn't there almost at once
    }, 250);
    void this.oldPhotoUrl().then((url) => {
      ready = true;
      if (this.chapter !== attempt || this.chapter.phase !== 'READY' || this.ui.isDialogOpen) return;
      this.openDialog({
        title: STRINGS.noteTitle,
        body: [
          localized(def.pickupLine),
          noteParagraph(localized(def.note)),
          def.giverExtra ? localized(def.giverExtra) : '',
          photoFigure(url, def.photoCaption ? localized(def.photoCaption) : ''),
        ],
        buttons: [{ label: STRINGS.takeAlbum, primary: true, onClick: () => this.acceptNote() }, ...this.replayEndShift()],
      });
    });
  }

  /**
   * A replayed (already delivered) chapter keeps Mara on its note; once the day's work is done she can still
   * end the shift from there, so the courier need not leave the replay through the main menu.
   */
  private replayEndShift(): { label: string; onClick: () => void }[] {
    const profile = this.profiles.profile;
    const replay = profile.completedChapterIds.includes(this.chapter.definition.id);
    if (!replay || !dayStatus(profile, PLAYABLE_CHAPTERS).canEnd) return [];
    return [{ label: STRINGS.day.endShift, onClick: () => this.openDayEnd() }];
  }

  /** Why the day cannot end yet (or that it can): Mara's line as a toast. Returns whether it can end. */
  private toastDayStatus(): boolean {
    const status = dayStatus(this.profiles.profile, PLAYABLE_CHAPTERS);
    if (status.canEnd) return true;
    const titles = (ids: readonly string[]): string => ids.map((id) => chapterById(id)?.title ?? id).join(', ');
    const line =
      status.reason === 'lastDay'
        ? STRINGS.day.weekDone
        : status.reason === 'needStory'
          ? STRINGS.day.needStory(titles(status.chapterIds), status.missingJobs)
          : STRINGS.day.notYet(status.missing);
    this.ui.toast(line, 5000);
    return false;
  }

  /**
   * Mara, with no delivery waiting (every chapter): clock off for the day. Needs today's story chapter and
   * board jobs (domain/day); shows what the day brought and what tomorrow adds, then the next day begins.
   */
  private openDayEnd(): void {
    if (this.jobs.active.length > 0) return this.ui.toast(STRINGS.jobs.finishFirst, 4500);
    const profile = this.profiles.profile;
    if (!this.toastDayStatus()) return;
    const tomorrow = profile.storyDay + 1;
    const fresh = [...vendorStock(tomorrow), ...vehicleStock(tomorrow)].filter((i) => i.isNewToday).map((i) => i.name);
    this.talkingNpcId = this.chapter.definition.giverId;
    this.openDialog({
      title: STRINGS.day.title(profile.storyDay),
      body: [
        STRINGS.day.summary(profile.dayJobs, profile.dayEarnings),
        fresh.length > 0 ? STRINGS.day.tomorrowNew(fresh.join(', ')) : '',
        tomorrow === MAGPIES_FROM_DAY ? STRINGS.day.tomorrowMagpies : '',
      ],
      buttons: [
        { label: STRINGS.day.confirm, primary: true, onClick: () => this.clockOff() },
        { label: STRINGS.cancel, onClick: () => this.closeDialog() },
      ],
      onEscape: () => this.closeDialog(),
    });
  }

  private clockOff(): void {
    this.closeDialog();
    if (!this.profiles.endDay()) return;
    // A new morning: every parked vehicle is back on the rack outside Relay (one being ridden stays under the
    // courier), the board has the new day's jobs.
    this.parked.resetToRack(this.parked.entries().filter(([, place]) => place !== 'ridden').map(([id]) => id));
    this.parkedView.sync(this.parked.entries());
    // Today's chapter: Mara now has its note (a replayed older chapter makes way for the story's one).
    const profile = this.profiles.profile;
    const story = storyChapter(profile);
    const hasStory = storyChapterId(profile, PLAYABLE_CHAPTERS) !== null && isOpenToday(profile, story);
    if (hasStory) {
      if (this.chapter.definition.id === story.id) this.openChapter();
      else {
        this.chapter = new ChapterController(story, this.profiles.ownedItemIds);
        this.setupChapter(story, false);
      }
    }
    // The world is already in the new day (saved above); the morning scene only tells it.
    const started = (): void => this.ui.toast(STRINGS.day.started(profile.storyDay, hasStory), 5000);
    const morning = MORNING_SCENES[profile.storyDay];
    if (morning) this.playScene(morning, started);
    else started();
  }

  private acceptNote(): void {
    // Clock starts now. Only a real READY → ACTIVE change moves the quest on (a double click must not).
    if (!this.chapter.accept()) return;
    this.leaveVehicleForStory(); // rode up to the giver: the vehicle stays here, the story is walked
    this.player.animator?.playOnce('pick-up'); // takes the parcel
    this.emit({ event: QUEST_EVENTS.accepted }); // closes the note / opens Finn's phone (ch2)
  }

  /** Finn's phone message with the two meeting options (each button works once; MeetingController accepts once). */
  private showMeetingChoice(): void {
    const choose = (id: MeetingPointId) => () => this.confirmMeeting(id);
    this.openDialog(
      {
        title: STRINGS.phoneTitle,
        body: [noteParagraph(localized(this.chapter.definition.note)), STRINGS.phoneHint],
        buttons: [
          { label: STRINGS.meetFountain, onClick: choose('mp_fountain') },
          { label: STRINGS.meetYard, primary: true, onClick: choose('mp_yard') },
        ],
      },
      'story',
    );
  }

  private confirmMeeting(pointId: MeetingPointId): void {
    const m = this.meeting;
    if (m && m.confirm(pointId)) {
      // No re-planning after confirmation: Finn heads there and waits indefinitely.
      this.finn.walk(FINN_ROUTES[pointId], false, () => m.markArrived());
      this.ui.toast(STRINGS.meetingSet(STRINGS.pointNames[pointId]), 4000);
      if (this.hintMarker.visible) this.showHintArea(); // the search area moves to the agreed spot
      this.emit({ event: QUEST_EVENTS.meeting(pointId) });
    }
    this.closeDialog();
  }

  /** A clue that matters to the delivery: remember it, say what it reveals (repeats are free). */
  private clueFound(id: ClueId): void {
    this.chapter.recordClue(id);
    this.ui.toast(`${localized(CLUES[id].read)} ${localized(CLUES[id].found)}`, 6500);
    if (this.ui.isTaskPanelOpen) this.renderTaskPanel(true);
  }

  /**
   * E on a delivery candidate: wrong → penalty toast (a wrong door, or the key not fitting a look-alike gate);
   * correct → handover dialog (outside the mission clock).
   */
  private checkTarget(targetId: string, variant: 'door' | 'key'): void {
    const r = this.chapter.checkTarget(targetId);
    switch (r.kind) {
      case 'no-parcel':
        return this.ui.toast(STRINGS.noParcel);
      case 'already-delivered':
        return;
      case 'wrong':
        return variant === 'key' ? this.ui.toast(STRINGS.keyDoesntFit(r.penalized), 4000) : this.ui.toast(STRINGS.wrongDoor(r.penalized));
      case 'correct':
        this.openHandover(targetId);
    }
  }

  /** The door opens: give Arthur room on his doorstep if the player is pressed against the door. */
  private arthurAtDoor(): void {
    const step = this.world.mews.arthurDoorstep.position;
    const p = this.player.position;
    if (Math.hypot(p.x - step.x, p.z - step.z) < ARTHUR_ROOM) {
      this.player.teleport(new Vector3(step.x + ARTHUR_ROOM, 0, p.z));
      this.player.body.rotation.y = -Math.PI / 2; // still facing the door
    }
    this.mewsCast.showArthurAtDoor();
  }

  private openHandover(targetId: string): void {
    const def = this.chapter.definition;
    this.emit({ event: QUEST_EVENTS.handover }); // Finn holds still / Arthur opens his door
    this.openDialog(
      {
        title: localized(def.handoverTitle),
        body: [localized(def.handoverBody)],
        buttons: [
          { label: STRINGS.cancel, onClick: () => this.cancelHandover() },
          { label: def.handoverAnswer ? localized(def.handoverAnswer) : STRINGS.deliverButton, primary: true, onClick: () => this.deliver(targetId) },
        ],
        onEscape: () => this.cancelHandover(),
      },
      'story',
    );
  }

  private cancelHandover(): void {
    this.emit({ event: QUEST_EVENTS.handoverCancelled });
    this.closeDialog();
  }

  private deliver(targetId: string): void {
    let result: AttemptResult | null = null;
    try {
      result = this.chapter.deliver(targetId);
    } finally {
      if (!result) this.cancelHandover(); // never leave the clock paused / Finn frozen on an odd path
    }
    if (!result) return;
    this.hintMarker.hide();
    // Save first, show later: the result is settled the moment the parcel is handed over, so closing
    // the tab during the finale can't lose credits or the achievement.
    const outcome = this.settleAttempt(result);
    this.leaveVehicleForStory(); // the scenes that follow (cameo, table picture) are played on foot
    this.player.animator?.playOnce('victory'); // parcel delivered
    // What follows is the chapter's: Arthur's cameo (ch1), Finn's shortcut + result (ch2), the finale (ch3).
    this.emit({ event: QUEST_EVENTS.delivered }, { result, outcome });
  }

  // ---------------------------------------------------------------- Arthur after chapter 1

  /**
   * Arthur stops beside the player at June's door, says hello, then walks off towards Dial Square
   * while the result is on screen. Story only: the attempt is already settled.
   */
  private showArthurCameo(result: AttemptResult, outcome: SettleOutcome): void {
    this.townsfolk.setVisible(false); // walkers pass exactly where Arthur stops; back with the next chapter
    const p = this.player.position;
    // A couple of steps up the street from the player, on the pavement in front of the houses
    // (clear of June's chilli pots), turned towards the player.
    const at = { x: Math.min(p.x, 3.6) - 1.2, z: p.z + 2.2 };
    this.streetArthur.place(at, Math.atan2(p.x - at.x, p.z - at.z));
    this.streetArthur.talking = true;
    this.streetArthur.gesture('wave'); // hello first, then he talks
    this.streetArthur.setEnabled(true);
    this.streetArthurActive = true;
    const goOn = (): void => {
      this.streetArthur.talking = false;
      this.streetArthur.walk(ARTHUR_CAMEO.exitRoute, false, () => this.hideStreetArthur());
      this.music.play(ARTHURS_TUNE, 'hum', HUM_BARS); // "He walks off towards Dial Square, humming."
      this.showResult(result, outcome);
    };
    this.openDialog({
      title: localized(ARTHUR_CAMEO.title),
      body: [localized(ARTHUR_CAMEO.body)],
      buttons: [{ label: STRINGS.continue, primary: true, onClick: goOn }],
      onEscape: goOn,
    });
  }

  private hideStreetArthur(): void {
    this.streetArthurActive = false;
    this.streetArthur.talking = false;
    this.streetArthur.setEnabled(false);
  }

  /** Apply the attempt to the profile (idempotent per attemptId) and persist it. */
  private settleAttempt(r: AttemptResult): SettleOutcome {
    const outcome = this.profiles.settle(r);
    this.applyProfile();
    if (!this.profiles.lastWriteOk) this.ui.toast(STRINGS.saveFailed, 6000);
    return outcome;
  }

  // ---------------------------------------------------------------- finale (chapter 3)

  /**
   * Album → final picture → map note → result (design doc: no score over the finale; the achievement
   * is announced after the picture). The clock already stopped at the handover.
   */
  private runFinale(result: AttemptResult, outcome: SettleOutcome): void {
    // "Somewhere outside, a familiar melody starts." — the tune Arthur hummed after chapter 1.
    this.music.play(ARTHURS_TUNE, 'musicbox');
    this.openDialog({
      title: localized(FINALE.albumTitle),
      body: [localized(FINALE.album)],
      buttons: [{ label: STRINGS.next, primary: true, onClick: () => this.showFinalPicture(result, outcome) }],
    });
  }

  private showFinalPicture(result: AttemptResult, outcome: SettleOutcome): void {
    const { mews } = this.world;
    this.mewsCast.moveArthurToTable();
    this.player.teleport(mews.playerSeat.position);
    this.player.body.rotation.y = mews.playerSeat.heading;
    const fromDialog = this.dialogSeq; // the album dialog (its Next button is now disabled)
    let shown = false;
    const show = (url: string | null): void => {
      if (shown || this.dialogSeq !== fromDialog) return; // another dialog (e.g. other-tab) took over
      shown = true;
      const body: (string | HTMLElement)[] = [];
      if (url) body.push(pictureFigure(url));
      body.push(localized(FINALE.picture));
      this.openDialog({
        title: localized(FINALE.pictureTitle),
        body,
        buttons: [{ label: STRINGS.next, primary: true, onClick: () => this.showMapNote(result, outcome) }],
      });
    };
    // Let a couple of frames pass so everyone stands in their new spot before the picture is taken
    // (with a time limit, in case rendering is stalled).
    const scene = this.world.scene;
    const settled = new Promise<void>((resolve) => {
      let frames = 0;
      const observer = scene.onAfterRenderObservable.add(() => {
        if (++frames < 3) return;
        scene.onAfterRenderObservable.remove(observer);
        resolve();
      });
      window.setTimeout(() => {
        scene.onAfterRenderObservable.remove(observer);
        resolve();
      }, 1000);
    });
    settled
      .then(() => withTimeout(captureView(scene, mews.finaleView, 720, 450, 0.9), CAPTURE_TIMEOUT_MS))
      .then(show)
      .catch((err: unknown) => {
        console.warn('Final picture could not be rendered.', err);
        show(null); // the story goes on without the picture
      });
  }

  private showMapNote(result: AttemptResult, outcome: SettleOutcome): void {
    this.openDialog({
      title: localized(FINALE.pictureTitle),
      body: [noteParagraph(localized(FINALE.mapNote)), buildMap(['ch3'])],
      buttons: [{ label: STRINGS.continue, primary: true, onClick: () => this.showResult(result, outcome) }],
    });
  }

  /** After the last chapter's result: thanks + replay choices (no menu yet). */
  private showEnd(): void {
    const last = PLAYABLE_CHAPTERS[PLAYABLE_CHAPTERS.length - 1] ?? CH1;
    this.openDialog({
      title: localized(FINALE.endTitle),
      body: [localized(FINALE.endBody), this.gameSummary()],
      buttons: [
        { label: STRINGS.mainMenu, onClick: () => this.showMainMenu() },
        { label: STRINGS.replayFirst, onClick: () => this.startChapter(CH1) },
        { label: STRINGS.replayFinal(last.title), onClick: () => this.startChapter(last) },
        { label: STRINGS.freeRoam, primary: true, onClick: () => this.startFreeRoam() },
      ],
    });
  }

  /** Game summary (design doc: the three chapter results and the four achievements). */
  private gameSummary(): HTMLElement {
    const profile = this.profiles.profile;
    const wrap = document.createElement('div');
    wrap.className = 'summary';
    const table = document.createElement('table');
    table.className = 'score-table';
    let total = 0;
    for (const c of PLAYABLE_CHAPTERS) {
      const best = profile.chapterRecords[c.id]?.bestResult;
      total += best?.score ?? 0;
      const tr = table.insertRow();
      const name = tr.insertCell();
      name.textContent = c.title;
      name.setAttribute('translate', 'no');
      tr.insertCell().textContent = best ? `${best.score} · ${equipmentText(best.equipmentIds)}` : '—';
    }
    const sum = table.insertRow();
    sum.className = 'total';
    sum.insertCell().textContent = STRINGS.summaryTotal;
    sum.insertCell().textContent = String(total);
    const h = document.createElement('h3');
    h.textContent = STRINGS.achievementsHeading;
    const list = document.createElement('ul');
    list.className = 'achievements';
    for (const a of ACHIEVEMENTS) {
      const li = document.createElement('li');
      const unlocked = Boolean(profile.achievementUnlocks[a.id]);
      li.className = unlocked ? 'unlocked' : 'locked';
      li.textContent = `${unlocked ? '✓' : '—'} ${a.name}: ${localized(a.description)}`;
      list.append(li);
    }
    wrap.append(table, h, list);
    return wrap;
  }

  // ---------------------------------------------------------------- results, shop, progression

  /** Result screen for an already-settled attempt; achievements are announced here (after any finale). */
  private showResult(r: AttemptResult, outcome: SettleOutcome): void {
    this.announceAchievements(outcome);

    this.openDialog({
      title: STRINGS.resultTitle,
      body: [scoreTable(r, this.chapter.definition.referenceSeconds), rewardLine(outcome)],
      buttons: [{ label: STRINGS.continue, primary: true, onClick: () => this.continueStory() }],
    });
  }

  private announceAchievements(outcome: SettleOutcome): void {
    const names = outcome.unlockedAchievementIds.map((id) => findAchievement(id)?.name ?? id);
    if (names.length > 0) this.ui.toast(STRINGS.achievementUnlocked(names.join(' · ')), 5000);
  }

  /**
   * After a result: on with the story. The next chapter starts at once when its day has come (day 1's
   * three); otherwise it waits for tomorrow and the courier works the board until clocking off with Mara.
   * The whole story done: thanks for playing.
   */
  private continueStory(): void {
    const profile = this.profiles.profile;
    const next = storyChapterId(profile, PLAYABLE_CHAPTERS);
    const def = next ? chapterById(next) : undefined;
    if (!def) return this.showEnd();
    this.startChapter(def);
    if (!isOpenToday(profile, def)) this.toastStoryDone();
  }

  private toastStoryDone(): void {
    const status = dayStatus(this.profiles.profile, PLAYABLE_CHAPTERS);
    const missing = status.canEnd ? 0 : status.reason === 'needJobs' ? status.missing : status.reason === 'needStory' ? status.missingJobs : 0;
    this.ui.toast(STRINGS.day.storyDone(missing), 6000);
  }

  // ---------------------------------------------------------------- profile / save dialogs

  /** Toggle EN/TR at runtime and remember the choice in the profile. */
  private switchLanguage(): void {
    const lang = nextLanguage(currentLanguage);
    setLanguage(lang);
    this.profiles.setLanguage(lang);
    this.applyProfile(); // credits text is language-dependent
    // A scene line on screen (HUD language button): show it again in the new language.
    if (this.scene && !this.scene.suspended) this.scene.handle?.resume();
  }

  /** Draw at the profile's graphics level; 'auto' (re)starts measuring the frame rate. */
  private applyGraphics(): void {
    const setting = this.profiles.profile.settings.quality;
    applyQuality(levelOf(setting), {
      engine: this.engine,
      scene: this.world.scene,
      pipeline: this.pipeline,
      setViewDistance: (m) => this.streamer.setRadius(m),
      setLowCrowd: (low) => {
        this.townsfolk.setLowQuality(low);
        this.animals.setLowQuality(low);
      },
    });
    this.qualityProbe = setting === 'auto' ? (this.qualityProbe ?? new FpsProbe()) : null;
  }

  /** 'auto' has measured this machine: keep the level it picked (the player can change it in Settings). */
  private settleAutoQuality(level: 'high' | 'low'): void {
    this.qualityProbe = null;
    this.profiles.setQuality(level);
    this.applyGraphics();
    if (level === 'low') this.ui.toast(STRINGS.qualityAutoLow, 7000);
  }

  private setGraphics(setting: QualitySetting): void {
    this.profiles.setQuality(setting);
    this.qualityProbe = null; // 'auto' picked again: measure afresh
    this.applyGraphics();
  }

  /** Reflect the profile in the game: HUD credits and upgrade effects (applied after a successful purchase/load). */
  private applyProfile(): void {
    this.ui.setCredits(this.profiles.profile.credits);
    this.player.runMultiplier = this.profiles.runMultiplier;
    this.player.setCameraSensitivity(this.profiles.profile.settings.sensitivity);
    this.gpsActive = this.gpsOverride ?? this.profiles.owns('gps');
    this.syncOwnedVehicles();
    this.applyGraphics();
  }

  private showCorruptSaveDialog(): void {
    const lr = this.profiles.loadResult;
    if (lr.status !== 'corrupt') return;
    const reason = document.createElement('p');
    reason.className = 'muted';
    reason.textContent = lr.reason;
    const download = document.createElement('button');
    download.type = 'button';
    download.textContent = STRINGS.downloadBackup;
    download.addEventListener('click', () => downloadText('between-doors-save-backup.json', lr.raw));
    this.openDialog({
      title: STRINGS.corruptTitle,
      body: [STRINGS.corruptBody, reason, download],
      buttons: [
        {
          label: STRINGS.startNew,
          onClick: () => {
            this.profiles.startNewProfile();
            this.applyProfile();
            this.showMainMenu();
          },
        },
        {
          label: STRINGS.playWithoutSaving,
          primary: true,
          onClick: () => {
            this.profiles.continueWithoutSaving();
            this.showMainMenu();
          },
        },
      ],
    });
  }

  private showOtherTabDialog(): void {
    this.openDialog(
      {
        title: STRINGS.otherTabTitle,
        body: [STRINGS.otherTabBody],
        buttons: [{ label: STRINGS.reload, primary: true, onClick: () => window.location.reload() }],
      },
      'menu',
    );
  }

  // ---------------------------------------------------------------- dialog plumbing

  /** Close the current dialog and release any clock pause it held. */
  private closeDialog(): void {
    this.releaseDialogPause();
    this.ui.closeDialog();
    this.player.mouseLook.enabled = true;
    // Re-capture the mouse if it was captured before (we're inside the button's click/key gesture).
    if (this.relockAfterDialog) this.player.mouseLook.lock();
    this.relockAfterDialog = false;
    // A dialog that interrupted a scene is gone: the scene carries on (unless the button opened something else).
    const run = this.scene;
    if (run?.suspended) {
      window.setTimeout(() => {
        if (this.scene === run && run.suspended && !this.ui.isDialogOpen) run.handle?.resume();
      }, 0);
    }
  }

  private releaseDialogPause(): void {
    if (this.dialogPause) this.chapter.timer.resume(this.dialogPause);
    this.dialogPause = null;
  }

  private openDialog(opts: Parameters<UIController['showDialog']>[0], pause: PauseReason | null = null): void {
    this.releaseDialogPause(); // replacing a dialog releases the previous one's pause
    this.dialogSeq++;
    if (this.scene && !this.openingSceneLine && !this.scene.suspended) {
      // Another dialog takes over a scene's line: the scene waits (follow camera meanwhile) and resumes after.
      this.scene.suspended = true;
      this.player.rig.setShot(null);
    }
    if (pause) {
      this.chapter.timer.pause(pause);
      this.dialogPause = pause;
    }
    this.player.movementEnabled = false; // effective immediately, not from the next frame
    // Free the mouse so the player can click buttons.
    // A lock still on its way (the previous line's button just asked for it) counts as captured.
    if (!this.ui.isDialogOpen) this.relockAfterDialog = this.player.mouseLook.wantsLock;
    this.player.mouseLook.enabled = false;
    this.player.mouseLook.unlock();
    this.input.releaseMovement();
    this.taskPanelRequest++; // a pending async panel render must not reopen over the dialog
    this.ui.setTaskPanel(false);
    this.ui.setMap(false);
    this.ui.showDialog(opts);
  }
}

function rewardLine(o: SettleOutcome): HTMLElement {
  const p = document.createElement('p');
  p.className = 'reward';
  const parts = [o.creditsAwarded > 0 ? STRINGS.creditsEarned(o.creditsAwarded) : STRINGS.noCreditsReplay];
  if (o.newBestScore) parts.push(STRINGS.newBest);
  p.textContent = parts.join(' ');
  return p;
}

/** Save a text file locally (works on file://, no server). */
function downloadText(filename: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Sylvie's old photo: the rendered entrance with a photo look (CSS) and a caption. */
function photoFigure(url: string | null, caption: string): HTMLElement {
  const fig = document.createElement('figure');
  fig.className = 'old-photo';
  if (url) {
    const img = document.createElement('img');
    img.src = url;
    img.alt = caption;
    fig.append(img);
  }
  const cap = document.createElement('figcaption');
  cap.textContent = caption;
  fig.append(cap);
  return fig;
}

function pictureFigure(url: string): HTMLElement {
  const fig = document.createElement('figure');
  fig.className = 'final-picture';
  const img = document.createElement('img');
  img.src = url;
  img.alt = '';
  fig.append(img);
  return fig;
}

/** Vendor item names used in an attempt ("Compass, Steady Pace"), or a dash. Names are proper names. */
function equipmentText(ids: readonly string[]): string {
  return ids.length ? ids.map((id) => findItem(id)?.name ?? id).join(', ') : STRINGS.noEquipment;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

/** Reject if `p` hasn't settled after `ms` (a stalled render must not freeze the story). */
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([p, delay(ms).then(() => Promise.reject(new Error(`timed out after ${ms} ms`)))]);
}

function noteParagraph(note: string): HTMLElement {
  const p = document.createElement('p');
  p.className = 'note';
  p.textContent = `“${note}”`;
  return p;
}

function scoreTable(r: AttemptResult, referenceSeconds: number): HTMLElement {
  const s = r.score;
  const rows: [string, string, string?][] = [
    [STRINGS.resultRows.start, '1000'],
    [STRINGS.resultRows.wrong(r.wrongTargetIds.length), `−${s.wrongPenalty}`],
    [STRINGS.resultRows.hints, `−${s.hintPenalty}`],
    [STRINGS.resultRows.base, String(s.base)],
    [STRINGS.resultRows.time(formatTime(r.timeSeconds), formatTime(referenceSeconds)), `+${s.timeBonus}`],
    [STRINGS.resultRows.total, String(s.total), 'total'],
    [STRINGS.resultRows.equipment, equipmentText(r.equipmentIds)],
  ];
  const table = document.createElement('table');
  table.className = 'score-table';
  for (const [label, value, cls] of rows) {
    const tr = table.insertRow();
    if (cls) tr.className = cls;
    tr.insertCell().textContent = label;
    tr.insertCell().textContent = value;
  }
  return table;
}
