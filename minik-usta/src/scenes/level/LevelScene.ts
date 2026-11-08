/**
 * Level screen (docs/TECH_DESIGN.md §1.4, §6.3, §10.3–§10.5, §14.1 #11–#12; UX_FLOWS §5, §6, §7, §13): board, blocks,
 * drag, fall shadow, HUD (pause, panorama, goals, moves counter, status strip), the EventPlayer, the windows and the
 * tutorial. Moves go through `GameSession`; the views follow the core's events and re-sync from the state. The scene
 * never changes the game state itself and never decides a rule.
 *
 * Flow of a move (TECH §1.4): DragController → core `tryBeginDrag` (BFS once) → `DragSession.follow` per pointer move →
 * ShadowView from core `computeFall` + `isCorrectPlacement` (via `shadowLook`) → release → `GameSession.commit` (core
 * `applyMove`, K-35) → the save records the action at once (K-43) → `EventPlayer.playMove` plays the JUICE cues in K-35
 * step order; when the move's last cue ran (`planEnded`) the tutorial counts the move's events, contextual tips fire
 * and the level end opens its window: win (K-28, rewards saved at once), out of moves (K-29 offer window, D-024) or
 * the life-lost window.
 *
 * Attempt record (K-43): `LevelAttempt` writes `inLevel` at start and after every action; a commit that ends the game
 * (win, or out of moves with no offer left) is saved right after the commit (`LevelAttempt.settle`), before its cues —
 * the window opens when the cues end. A resumed attempt (Boot → `resume`) is rebuilt by `GameSession.replay` and opens
 * on the Pause window with the `resume.strip` (JUICE #87) or the same offer window; a log that does not replay voids
 * the attempt penalty-free (`voidUnreplayable`) and goes home, where the `resume.void` window shows. The tutorial
 * position on screen is kept in `inLevel.tutorial` (written whenever it changes, with the log entries whose move end it
 * includes) and restored on resume (`TutorialResume`, review Faz 2 tur 3 #1).
 *
 * Settings (UX §5.1 switches → `changeSetting`): a language change relabels the HUD, the open window and the tutorial
 * balloon in place; "reduce motion" switches the EventPlayer to the fade variants (JUICE §0 rule 8); colour-blind mode
 * writes the streak count. Audio unlocks page-wide on the first activating input (`installAudioUnlock`, main.ts).
 *
 * Animation clock (`animNow`): advances with the frame time × `EventPlayer.rate()` — 3× while a touched locked
 * sequence (segment slide, truck, level end) plays (JUICE §0 rule 3). Every view, track and effect reads this clock.
 *
 * EXPAND (D-015): the layout is rebuilt from the design height on every resize (`theme/layout.ts` anchors: top group
 * from the top, board group shifted by `(H − 1920) × board.expandShare`, bottom group from the bottom, windows from the
 * bottom).
 *
 * Lifetime (TECH §10.4 "bölüm geçişinde sahne yok edilmez"; review Faz 2 tur 1 #17): going home SLEEPS the scene
 * (`scene.switch`), the home screen wakes it (`scene.run`) with the next level's data and the WAKE handler runs the
 * reset path `startLevel` — the PieceView / particle pools, the board, the HUD and their baked textures are built once
 * per game, not once per level.
 */
import Phaser from 'phaser';
import economy from '../../../config/economy.json' with { type: 'json' };
import { DESIGN_WIDTH, scaleMode } from '../../config/display.ts';
import { comboOf, trowelsOf } from '../../core/combo.ts';
import type { TrowelTarget } from '../../core/combo.ts';
import { SITE_X } from '../../core/coords.ts';
import { goalViews } from '../../core/goals.ts';
import { computeFall } from '../../core/gravity.ts';
import type { CompiledLevel } from '../../core/level/compile.ts';
import { FREE, blockCells, tryBeginDrag } from '../../core/movement.ts';
import type { DragRules, DragSession, DropClass, PickFailure } from '../../core/movement.ts';
import { ArraySink } from '../../core/moves.ts';
import type { MoveHooks } from '../../core/moves.ts';
import { levelHooks } from '../../core/obstacles/registry.ts';
import { panoramaView } from '../../core/panorama.ts';
import { GameSession, OFFER_MOVES, ReplayError } from '../../core/session.ts';
import { shapeByIndex } from '../../core/shapes.ts';
import { pieceColor, pieceShape, queueIds } from '../../core/state.ts';
import type { GameState } from '../../core/state.ts';
import { COLOR_CODES } from '../../core/types.ts';
import type { DragNode, GameEvent, PieceId, SessionAction } from '../../core/types.ts';
import { systemClock } from '../../services/clock.ts';
import type { DeepReadonly, Settings } from '../../services/save.ts';
import { createLayout, designHeight } from '../../theme/layout.ts';
import type { Layout, Rect } from '../../theme/layout.ts';
import { FRAME } from '../../theme/textures.ts';
import { TOKENS } from '../../theme/tokens.ts';
import { GoalsPanel } from '../../ui/GoalsPanel.ts';
import { MovesCounter } from '../../ui/MovesCounter.ts';
import { offerModel } from '../../ui/offer.ts';
import type { OfferModel } from '../../ui/offer.ts';
import { Panorama } from '../../ui/Panorama.ts';
import { PauseButton } from '../../ui/PauseButton.ts';
import { remainingPlanCells } from '../../ui/remaining.ts';
import { winRewards } from '../../ui/rewards.ts';
import { StatusStrip } from '../../ui/StatusStrip.ts';
import { exitLines, lossLines } from '../../ui/windowLines.ts';
import {
  appSave,
  appTrack,
  applySettings,
  changeSetting,
  onSettingChanged,
  reducedMotion,
} from '../appServices.ts';
import type { SettingKey } from '../appServices.ts';
import { BOOT_ATLAS_KEY, bakeLevelAtlas } from '../atlas.ts';
import type { Frames } from '../atlas.ts';
import {
  LevelAttempt,
  packFor,
  packSku,
  streakActive,
  streakBonusOf,
  streakTierOf,
} from '../flow/attempt.ts';
import type { AttemptEnd } from '../flow/attempt.ts';
import type { LastLevel } from '../flow/launch.ts';
import { BoardView } from './BoardView.ts';
import { DEPTH } from './depth.ts';
import { DragController } from './DragController.ts';
import type { DragSignal } from './DragController.ts';
import { easeOf } from './easing.ts';
import { EventPlayer } from './EventPlayer.ts';
import { hexColor } from './frameImage.ts';
import { LevelWindows } from './LevelWindows.ts';
import type { PauseToggle } from './LevelWindows.ts';
import { loadLevelById } from './levels.ts';
import { PieceLayer } from './PieceLayer.ts';
import { blockersAbove, pieceFrameName } from './pieceState.ts';
import { gameAudio, gameHaptics, systemReducedMotion } from './sceneServices.ts';
import { shaderWarmup } from '../shaderWarmup.ts';
import { ShadowView } from './ShadowView.ts';
import { cancelPreview, shadowLook, showsShadow } from './shadowLook.ts';
import { TrowelPicker } from './TrowelPicker.ts';
import { ContextTips, ctxFromMove, ctxMoveHighlight } from './tutorial/contextTips.ts';
import { pidHighlight } from './tutorial/highlights.ts';
import type { CtxTopic } from './tutorial/contextTips.ts';
import { TutorialController, TutorialResume } from './tutorial/TutorialController.ts';
import { TutorialOverlay } from './TutorialOverlay.ts';
import type { OverlayContent } from './TutorialOverlay.ts';
import { JUICE_VIEW, VIEW } from './viewConstants.ts';

export const LEVEL_SCENE_KEY = 'Level';
/** Minimal home scene key (scenes/HomeScene.ts; kept here so the level does not import the home module). */
export const HOME_SCENE_KEY = 'Home';

export interface ResumeData {
  /** K-43: the saved action log of the attempt (`start` first). */
  readonly actions: readonly SessionAction[];
  /** UX §1: the Pause window, or the same out-of-moves offer (K-43 item 3, exception (a)). */
  readonly window: 'pause' | 'outOfMoves';
}

export interface LevelSceneData {
  /** Level to open (default 1). */
  readonly levelId?: number;
  readonly resume?: ResumeData;
}

/** The home scene's start data (scenes/HomeScene.ts). */
export interface HomeSceneData {
  readonly last?: LastLevel;
}

type ChapterKey = keyof typeof TOKENS.color.chapter;

/** A frame longer than this (tab switch, debugger) advances the animation clock by this much only. */
const MAX_FRAME_MS = 250;

/** Chapter sky colours of a level (`color.chapter.chN`). */
function chapterColors(lvl: CompiledLevel): (typeof TOKENS.color.chapter)[ChapterKey] {
  const key = `ch${lvl.chapter}` as ChapterKey;
  return TOKENS.color.chapter[key] ?? TOKENS.color.chapter.ch1;
}

export class LevelScene extends Phaser.Scene {
  private layoutNow!: Layout;
  private levelId = 1;
  private pendingResume: ResumeData | null = null;
  private loadToken = 0;
  private lvl: CompiledLevel | null = null;
  private session: GameSession | null = null;
  /** The session being rebuilt by a K-43 replay (the tutorial reads its state meanwhile). */
  private replaying: GameSession | null = null;
  private hooks: MoveHooks = {};
  private frames: Frames | null = null;
  private board!: BoardView;
  private pieces!: PieceLayer;
  private shadow!: ShadowView;
  private panorama!: Panorama;
  private goals!: GoalsPanel;
  private pauseBtn!: PauseButton;
  private moves!: MovesCounter;
  private strip!: StatusStrip;
  private drag!: DragController;
  private picker!: TrowelPicker;
  private player!: EventPlayer;
  private windows!: LevelWindows;
  private overlay!: TutorialOverlay;
  private tips!: ContextTips;
  private tutorial: TutorialController | null = null;
  /**
   * K-43 tutorial save (review Faz 2 tur 3 #1): log entries (`start` included) whose move end the tutorial has read,
   * the log length of the move whose cues play now (read at its `planEnded`), and the position last saved.
   */
  private tutActions = 0;
  private tutPendingActions = 0;
  private tutSavedVersion = -1;
  private tutSavedActions = -1;
  private tutorialVersion = -1;
  private tipsVersion = -1;
  private overlayKey = '';
  private attempt: LevelAttempt | null = null;
  private sky!: Phaser.GameObjects.Image;
  /** Animation clock (ms): frame time × the EventPlayer's rate. */
  private animNow = 0;
  /** Events of the last committed move, consumed when its cues end (tutorial, contextual tips). */
  private lastEvents: readonly GameEvent[] | null = null;
  private lastMovesBefore = 0;
  /** The level-end window of this attempt was opened (planEnded may run more than once). */
  private endShown = false;
  /** A commit ended the game and the outcome is saved (K-43); its window opens when the move's cues end. */
  private ended: AttemptEnd | null = null;
  /** `holdOverBuild`: since when the dragged block touches the site columns in FREE mode (null: not now). */
  private holdSince: number | null = null;
  /** A move was committed since the last update (release / trowel): that frame does not pre-render sounds. */
  private commitFrame = false;
  /** Outline of the fall shadow last shown in this drag (JUICE #7 switch). */
  private lastOutline: string | null = null;
  private lastLookKey: string | null = null;

  constructor() {
    super(LEVEL_SCENE_KEY);
  }

  init(data: LevelSceneData): void {
    this.levelId = data.levelId ?? 1;
    this.pendingResume = data.resume ?? null;
  }

  create(): void {
    applySettings();
    this.animNow = this.time.now;
    this.endShown = false;
    this.overlayKey = '';
    this.tutorialVersion = -1;
    this.tipsVersion = -1;
    this.holdSince = null;
    this.layoutNow = this.computeLayout();
    this.sky = this.add
      .image(0, 0, BOOT_ATLAS_KEY, FRAME.whitePixel)
      .setOrigin(0, 0)
      .setDepth(DEPTH.background);
    this.board = new BoardView(this);
    this.pieces = new PieceLayer(this, (v) => this.player?.viewReleased(v));
    this.shadow = new ShadowView(this);
    this.panorama = new Panorama(this, {
      depth: DEPTH.hud,
      padPx: VIEW.panoramaPadPx,
      gapCells: VIEW.panoramaGapCells,
      framePx: VIEW.panoramaFramePx,
      maxCellPx: VIEW.panoramaMaxCellPx,
      minCellPx: VIEW.panoramaMinCellPx,
    });
    this.goals = new GoalsPanel(this, DEPTH.hud);
    this.pauseBtn = new PauseButton(this, DEPTH.hud);
    this.pauseBtn.onTap(() => this.openPause(false));
    this.pauseBtn.onPress((v) => this.player.play(69, { button: this.pauseBtn, variant: v }));
    this.moves = new MovesCounter(this, DEPTH.hud);
    this.strip = new StatusStrip(this, DEPTH.hud);
    this.strip.setTrowelHandler(() => this.toggleTrowel());
    const save = appSave();
    this.strip.setColorBlind(save.data.settings.colorblind);
    const audio = gameAudio();
    this.player = new EventPlayer(
      this,
      {
        layout: () => this.layoutNow,
        state: () => this.session?.state ?? null,
        level: () => this.lvl,
        pieces: this.pieces,
        board: this.board,
        moves: this.moves,
        strip: this.strip,
        panoramaRedraw: () => this.refreshPanorama(),
        panoramaSlot: (seg) => this.panoramaSlot(seg),
        levelNumber: () => this.levelId,
        planEnded: () => this.planEnded(),
      },
      { audio, haptics: gameHaptics() },
    );
    this.player.reduced = reducedMotion();
    this.player.bonusMax = economy.levelRewards.bonusMaxMovesCounted;
    this.windows = new LevelWindows(this, { layout: () => this.layoutNow, player: this.player });
    this.overlay = new TutorialOverlay(this, {
      layout: () => this.layoutNow,
      state: () => this.session?.state ?? null,
      level: () => this.lvl,
      hud: () => ({ truck: this.strip.chipRect(), streak: this.strip.streakRect() }),
      dragging: () => {
        const d = this.drag.dragging;
        return d ? { pieceId: d.pieceId, ix: d.current.ix, iy: d.current.iy } : null;
      },
      panoramaArrow: () => this.panoramaArrow(),
    });
    this.overlay.setReduced(this.player.reduced);
    this.tips = new ContextTips({
      seen: (topic) => appSave().data.seenContextTips[topic] === true,
      markSeen: (topic) => appSave().markContextTip(topic),
    });
    this.picker = new TrowelPicker(this, {
      layout: () => this.layoutNow,
      state: () => this.session?.state ?? null,
      frames: () => this.frames,
      pick: (target) => this.commitTrowel(target),
      changed: (open) => this.strip.setTrowelSelected(open),
      reduced: () => this.player.reduced,
      button: (button, variant) => this.player.play(69, { button, variant }),
      dim: (eligible) => this.board.setPickDim(eligible),
    });
    this.drag = new DragController(this, this.dragHost());
    this.paintSky(TOKENS.color.chapter.ch1);
    this.placeHud();

    const onResize = (): void => {
      if (this.sys.isActive()) this.relayout(); // asleep: the wake re-lays out
    };
    const onWake = (_sys: Phaser.Scenes.Systems, data?: LevelSceneData): void => this.woken(data ?? {});
    const onHidden = (): void => {
      if (!this.sys.isActive()) return;
      this.drag.abort();
      this.saveTutorial(); // K-43: the step on screen, also when it changed in this frame's input
      // UX §5.1 "duraklatma (uygulama arka plana atılınca otomatik)"; the save writes itself (appSave lifecycle) and
      // the audio is suspended page-wide (installAudioUnlock)
      if (this.session?.outcome === 'playing' && !this.windows.open) this.openPause(false);
    };
    this.scale.on(Phaser.Scale.Events.RESIZE, onResize);
    this.game.events.on(Phaser.Core.Events.HIDDEN, onHidden);
    this.events.on(Phaser.Scenes.Events.WAKE, onWake);
    const offSettings = onSettingChanged((key, settings) => this.settingChanged(key, settings));
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      offSettings();
      this.events.off(Phaser.Scenes.Events.WAKE, onWake);
      this.scale.off(Phaser.Scale.Events.RESIZE, onResize);
      this.game.events.off(Phaser.Core.Events.HIDDEN, onHidden);
      this.drag.destroy();
      this.picker.destroy();
      this.panorama.destroy();
      this.goals.destroy();
      this.pauseBtn.destroy();
      this.moves.destroy();
      this.strip.destroy();
      this.windows.clear();
      this.overlay.destroy();
      this.player.reset();
      this.loadToken += 1;
    });

    const resume = this.pendingResume;
    this.pendingResume = null;
    void this.startLevel(this.levelId, resume ? { resume } : {});
  }

  /** The home screen woke the scene for the next level (TECH §10.4 reset path). */
  private woken(data: LevelSceneData): void {
    // settings changed while asleep reached `settingChanged` already; a resize did not (onResize skips a sleeping scene)
    applySettings();
    this.layoutNow = this.computeLayout();
    this.paintSky(TOKENS.color.chapter.ch1);
    this.placeHud();
    this.picker.relayout();
    void this.startLevel(data.levelId ?? 1, data.resume ? { resume: data.resume } : {});
  }

  update(_time: number, delta: number): void {
    const dt = Math.min(MAX_FRAME_MS, delta) * this.player.rate();
    this.animNow += dt;
    const now = this.animNow;
    // the sound bank pre-renders (≤ audio.prerenderBudgetMsPerFrame, in resumable chunks) and the image shader variants
    // are built (one per frame, shaderWarmup.ts) in idle frames only: not
    // during a press or drag, not in the frame of a commit (release / trowel: applyMove + plan + save write), not while
    // cues play (review Faz 2 tur 4 #0; TECH §10.7 item 6). A sound not rendered yet is skipped, never rendered on demand.
    const commitFrame = this.commitFrame;
    this.commitFrame = false;
    if (!this.drag.active && !commitFrame && !this.player.busy) {
      gameAudio().pump();
      shaderWarmup(this.game).step();
    }
    this.player.update(now, dt);
    this.pieces.update(this.layoutNow, now);
    this.drag.update(now);
    const dragged = this.drag.dragging;
    this.shadow.follow(dragged ? (this.pieces.view(dragged.pieceId)?.drawn ?? null) : null);
    this.shadow.update(now);
    this.picker.update(now);
    this.player.lateUpdate(now);
    this.updateTutorial(now);
  }

  /** The current attempt (debug panel, harness: TECH §12.2–§12.3). */
  get gameSession(): GameSession | null {
    return this.session;
  }

  /** The EventPlayer (debug panel, harness). */
  get eventPlayer(): EventPlayer {
    return this.player;
  }

  /** The tutorial of the level (debug panel, harness). */
  get tutorialController(): TutorialController | null {
    return this.tutorial;
  }

  /** Contextual Usta Dede lines `tut.ctx.*` (harness: the one on screen and the queue). */
  get contextTips(): ContextTips {
    return this.tips;
  }

  /** The open window, if any (harness). */
  get openWindow(): string | null {
    return this.windows.open;
  }

  /** Centre of the status strip's Golden Trowel target in design px (harness; UX §5.2). */
  get trowelPoint(): { readonly x: number; readonly y: number } {
    const r = this.strip.streakRect();
    return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
  }

  /** Centre of the open window's × in design px, or null (harness). */
  get windowClosePoint(): { readonly x: number; readonly y: number } | null {
    return this.windows.closePoint;
  }

  /** Settings "Animasyonları azalt" (OR-ed with `prefers-reduced-motion`; JUICE §0 rule 8). */
  setReducedMotion(on: boolean): void {
    const reduced = on || systemReducedMotion();
    this.player.reduced = reduced;
    // JUICE §0 rule 8 outside the EventPlayer too (review Faz 2 tur 1 #18): idle loops stop at once
    this.moves.setPulse(!reduced, this.animNow);
    this.overlay.setReduced(reduced);
  }

  /** A setting changed (`changeSetting`, any screen): relabel / restyle what this screen shows. */
  private settingChanged(key: SettingKey, settings: DeepReadonly<Settings>): void {
    if (key === 'reduceMotion') this.setReducedMotion(settings.reduceMotion);
    else if (key === 'colorblind') this.strip.setColorBlind(settings.colorblind);
    else if (key === 'lang') this.relabel();
  }

  /** New language: HUD labels, the trowel hint, the open window (rebuilt in place) and the tutorial balloon. */
  private relabel(): void {
    this.moves.relabel();
    this.strip.relabel();
    this.picker.relabel();
    this.windows.relayout();
    this.overlayKey = '';
    this.tutorialVersion = -1;
    this.prepareBubbles();
    this.refreshPanorama();
  }

  /**
   * TECH §10.4 `LevelScene.reset(level)`: views go back to their pools, the level is loaded, baked and started — a new
   * attempt (saved at once, K-43) or the saved one (`resume`).
   */
  async startLevel(id: number, opts: { readonly resume?: ResumeData } = {}): Promise<void> {
    const token = ++this.loadToken;
    this.levelId = id;
    this.drag.abort();
    this.picker.close();
    this.shadow.hide();
    this.windows.clear();
    this.player.reset();
    this.pieces.clear();
    this.board.clear();
    this.session = null;
    this.lvl = null;
    this.attempt = null;
    this.tutorial = null;
    this.tutActions = 0;
    this.tutPendingActions = 0;
    this.tutSavedVersion = -1;
    this.tutSavedActions = -1;
    this.tips.clear();
    this.overlay.show(null, this.animNow);
    this.lastEvents = null;
    this.endShown = false;
    this.ended = null;

    const res = await loadLevelById(id);
    if (token !== this.loadToken) return; // another load started, or the scene shut down
    if (!res.ok) {
      // TECH §8.3: a rejected level never starts (`level_load_failed` + home)
      if (res.stage !== 'missing')
        appTrack({
          name: 'level_load_failed',
          level: id,
          stage: res.stage,
          code: res.issues[0]?.code ?? null,
        });
      this.scene.start(HOME_SCENE_KEY, {} satisfies HomeSceneData);
      return;
    }
    const lvl = res.level;
    const save = appSave();
    const hooks = levelHooks(lvl);
    this.lvl = lvl;
    this.hooks = hooks;
    let session: GameSession;
    let resumed = opts.resume ?? null;
    // K-43 item 3: a saved attempt of this level is always continued (another level cannot start meanwhile)
    const il = save.data.inLevel;
    if (!resumed && il && il.levelId === id)
      resumed = { actions: il.actions as SessionAction[], window: 'pause' };
    const replayed = new ArraySink();
    if (resumed) {
      // the tutorial goes back to the saved position on screen, or is rebuilt from the log of an older save, each move
      // with the state of its time (review Faz 2 tur 2 #8, Faz 2 tur 3 #1)
      const tut = this.makeTutorial(lvl);
      const savedTut = il && il.levelId === id ? il.tutorial : null;
      const tutResume = tut ? new TutorialResume(tut, savedTut, resumed.actions.length) : null;
      let mark = 0;
      try {
        session = GameSession.replay(
          lvl,
          resumed.actions,
          { hooks, streakBonus: streakBonusOf },
          replayed,
          (index, action, at) => {
            this.replaying = at;
            const events = replayed.events.slice(mark);
            mark = replayed.events.length;
            tutResume?.action(index, action, events, this.animNow);
          },
        );
      } catch (e) {
        if (!(e instanceof ReplayError)) throw e;
        // TECH §11.1 / K-43 item 4: a log that does not replay voids the attempt (refunds), home shows the notice
        this.replaying = null;
        this.lvl = null;
        save.voidUnreplayable();
        this.scene.start(HOME_SCENE_KEY, { last: { levelId: id, won: false } } satisfies HomeSceneData);
        return;
      } finally {
        this.replaying = null;
      }
      this.tutorial = tut;
      this.tutActions = resumed.actions.length; // the replay read every move end
      const deps = { save, track: appTrack, clock: systemClock };
      // the attempt's counters cover the moves before the kill too (ANALYTICS §2 level_end, K-43 item 3)
      this.attempt = save.data.inLevel
        ? LevelAttempt.resumed(deps, save.data.inLevel, replayed.events)
        : null;
    } else {
      const streakTier = streakTierOf(id, save.data.winStreak);
      session = GameSession.start(
        lvl,
        { preBoosters: [], streakTier },
        { hooks, streakBonus: streakBonusOf },
      );
      this.attempt = LevelAttempt.begin({ save, track: appTrack, clock: systemClock }, lvl, {
        preBoosters: [],
        streakTier,
      });
    }
    this.session = session;
    this.frames = bakeLevelAtlas(this.game, lvl);
    const s = session.state;
    this.paintSky(chapterColors(lvl));
    this.pieces.setFrames(this.frames);
    this.shadow.setFrames(this.frames, easeOf(TOKENS.easing.move));
    this.board.setLevel(lvl, this.frames, this.layoutNow, s);
    this.pieces.sync(s);
    this.player.startLevel(s, lvl.gravity.build);
    this.refreshPanorama();

    this.warmDragPath(s);

    // tutorial: a new attempt starts it; a resumed one rebuilt it from its log above
    this.prepareBubbles();
    if (!resumed) {
      this.tutorial = this.makeTutorial(lvl);
      this.tutorial?.start(this.animNow);
      this.tutActions = session.log.length; // `start`
    }
    this.tutorialVersion = -1;
    this.saveTutorial();

    if (resumed) {
      // a log whose last move ended the game but whose outcome was not written (crash between two writes): save it now
      this.settle(session);
      if (this.ended) this.showEnd();
      else if (session.outcome === 'outOfMoves') this.openOffer('resume');
      else this.openPause(true);
    }
  }

  /**
   * TECH §10.7 item 6 (review Faz 2 tur 2 #11): the first lift ran cold code (BFS, sticky follow, K-07 class, fall,
   * shadow look, the view's lift and render, the shadow images) inside the first drag's frames. One dry run at level
   * start, nothing shown: a pick on the first movable block, one follow, its fall shadow (built and hidden in the same
   * frame) and the view's lift and back.
   */
  private warmDragPath(s: GameState): void {
    const lvl = this.lvl;
    if (!lvl) return;
    const rules = this.hooks.drag ?? {};
    for (let id = 0; id < lvl.layout.counts.pieces; id++) {
      const a = tryBeginDrag(s, id, rules);
      if (!a.ok) continue;
      const session = a.session;
      session.follow(session.start.ix + 0.4, session.start.iy + 0.4);
      // a node over the site in the crane area (where every golden drag goes): the fall shadow path
      const g = TOKENS.layout.grid;
      const node: DragNode = { ix: SITE_X, iy: g.rows + g.craneRows - session.shape.h, mode: FREE };
      const view = this.pieces.view(id);
      if (session.pathTo(node) !== null && showsShadow(session.classify(node)) && view) {
        const fall = computeFall(s, id, node, { rules: this.hooks.fall });
        const look = shadowLook(fall, lvl.difficulty, { state: s, pieceId: id });
        const color = COLOR_CODES[pieceColor(s, id)] ?? 'W';
        this.shadow.showFall(
          this.layoutNow,
          this.animNow,
          look,
          session.shape,
          fall.landing,
          pieceFrameName(s, id),
          color,
        );
        this.shadow.hide();
      }
      if (view) {
        const pose = view.pose;
        view.beginDrag(this.animNow, { scale: 1, ms: 0, ease: (u) => u, hopPx: 0 });
        view.render(this.layoutNow, this.animNow);
        view.endDrag();
        view.pose = pose;
        view.render(this.layoutNow, this.animNow);
      }
      return;
    }
  }

  // --- layout ------------------------------------------------------------------------------------------------------------

  private computeLayout(): Layout {
    const parent = this.scale.parentSize;
    const vp =
      parent.width > 0 && parent.height > 0
        ? { width: parent.width, height: parent.height }
        : { width: this.scale.width, height: this.scale.height };
    return createLayout(TOKENS, designHeight(scaleMode, vp, TOKENS));
  }

  private relayout(): void {
    this.drag.abort();
    this.player.settle();
    this.layoutNow = this.computeLayout();
    this.paintSky(this.lvl ? chapterColors(this.lvl) : TOKENS.color.chapter.ch1);
    this.placeHud();
    this.picker.relayout();
    this.windows.relayout();
    const s = this.session?.state;
    if (!s) return;
    this.board.relayout(this.layoutNow, s);
    this.shadow.relayout(this.layoutNow, this.animNow);
    this.refreshPanorama();
    this.overlay.relayout();
  }

  private placeHud(): void {
    const top = this.layoutNow.top;
    this.pauseBtn.layout(top.pause);
    this.goals.layout(top.goals);
    this.moves.layout(top.moves);
    this.strip.layout(this.layoutNow.board.status);
  }

  /** Sky gradient (`color.chapter.chN.skyTop` → `skyBottom`) over the whole design canvas; the body band matches. */
  private paintSky(colors: { readonly skyTop: string; readonly skyBottom: string }): void {
    const top = hexColor(colors.skyTop);
    const bottom = hexColor(colors.skyBottom);
    this.sky.setDisplaySize(DESIGN_WIDTH, this.layoutNow.H).setTint(top, top, bottom, bottom);
    this.cameras.main.setBackgroundColor(colors.skyTop);
  }

  private refreshPanorama(): void {
    const s = this.session?.state;
    if (!this.frames || !s) return;
    this.panorama.draw(this.layoutNow.top.panorama, panoramaView(s), this.frames);
    this.goals.setGoals(goalViews(s));
  }

  /** UX §13.2 level 5: the active segment's panorama column and the next one (≥ 2 segments). */
  private panoramaArrow(): { readonly from: Rect; readonly to: Rect } | null {
    const s = this.session?.state;
    if (!s) return null;
    const view = panoramaView(s);
    if (view.length < 2) return null;
    const active = view.findIndex((v) => v.status === 'active');
    if (active < 0 || active + 1 >= view.length) return null;
    const rect = this.layoutNow.top.panorama;
    const from = this.panorama.slot(rect, view, active);
    const to = this.panorama.slot(rect, view, active + 1);
    return from && to ? { from, to } : null;
  }

  private panoramaSlot(seg: number): Rect | null {
    const s = this.session?.state;
    if (!s) return null;
    return this.panorama.slot(this.layoutNow.top.panorama, panoramaView(s), seg);
  }

  // --- tutorial ----------------------------------------------------------------------------------------------------------

  /**
   * The level's tutorial controller (null without steps). Its state is the live session's — or, during a K-43 replay,
   * the replaying session's (`replaying`); steps ended in a replay are not reported again (ANALYTICS `tutorial_step`).
   */
  private makeTutorial(lvl: CompiledLevel): TutorialController | null {
    if (!lvl.data.tutorial || lvl.data.tutorial.length === 0) return null;
    return new TutorialController(lvl, {
      state: () => (this.replaying ?? this.session)?.state ?? null,
      dragRules: () => this.hooks.drag ?? {},
      hooks: () => this.hooks,
      markContextTip: (topic) => appSave().markContextTip(topic),
      stepEnded: (step) => {
        if (this.replaying === null) this.attempt?.tutorialStep(step);
      },
    });
  }

  /** The level's step bubbles are built now, not when a step opens (maybe mid-drag; TECH §10.7 item 6). */
  private prepareBubbles(): void {
    this.overlay.prepare((this.lvl?.data.tutorial ?? []).map((st) => st.textKey));
  }

  /** Per frame: timeouts, the hold timer, contextual tips and the overlay content (redrawn only on a change). */
  private updateTutorial(now: number): void {
    const tut = this.tutorial;
    if (tut) {
      tut.update(now);
      const session = this.drag.dragging;
      const min = tut.holdMinMs();
      if (session && min !== null) {
        const node = session.current;
        const onSite =
          node.mode === FREE && blockCells(session.shape, node.ix, node.iy).some((c) => c.x >= SITE_X);
        if (!onSite) this.holdSince = null;
        else {
          this.holdSince ??= now;
          if (now - this.holdSince >= min) tut.dragSignal('holdOverBuild', now, now - this.holdSince);
        }
      } else this.holdSince = null;
    }
    const step = tut?.current ?? null;
    // GDD K-34 hook 4 / LEVELS §0: a contextual line never shows while a tutorial step is on screen; a stale one drops.
    // It does not open mid-drag either (its bubble is built on first use: no Text object in a drag frame, TECH §10.7)
    this.tips.update(
      now,
      step === null && this.windows.open === null && !this.drag.active,
      TOKENS.duration.hint,
      (topic, serial) => this.tipStillValid(topic, serial),
    );
    this.overlay.setSuppressed(this.windows.open !== null);
    const tv = tut?.version ?? -1;
    if (tv !== this.tutorialVersion || this.tips.version !== this.tipsVersion) {
      this.tutorialVersion = tv;
      this.tipsVersion = this.tips.version;
      const content = this.overlayContent();
      const key = this.contentKey(content);
      if (key !== this.overlayKey) {
        this.overlayKey = key;
        this.overlay.show(content, now);
      } else if (content?.kind === 'step' && content.step.handHidden) this.overlay.hideHand();
    }
    this.overlay.update(now);
    this.saveTutorial();
  }

  /**
   * K-43 (review Faz 2 tur 3 #1; TECH §8.2): the tutorial position on screen goes to `inLevel.tutorial` whenever it
   * changes — a drag signal, a move end, a tap, a timeout — written at once (`SaveService.setTutorial`), so every action
   * record and the `pagehide` / `visibilitychange` write carry it. Per frame and from the hidden handler; an unchanged
   * position costs two number compares (no allocation in drag frames), an unchanged value no write (`setTutorial`).
   */
  private saveTutorial(): void {
    const tut = this.tutorial;
    const game = this.session;
    if (!tut || !game || !this.attempt || this.attempt.ended || game.outcome !== 'playing') return;
    if (tut.positionVersion === this.tutSavedVersion && this.tutActions === this.tutSavedActions) return;
    const pos = tut.position();
    if (!pos) return;
    this.tutSavedVersion = tut.positionVersion;
    this.tutSavedActions = this.tutActions;
    appSave().setTutorial({ ...pos, actions: this.tutActions });
  }

  private overlayContent(): OverlayContent {
    const step = this.tutorial?.current ?? null;
    if (step) return { kind: 'step', step };
    const topic = this.tips.showing;
    if (!topic) return null;
    return {
      kind: 'tip',
      textKey: `tut.ctx.${topic}`,
      params: topic === 'streak' ? { n: economy.combo.correctPlacementsPerTrowel } : undefined,
      highlight: this.tips.highlight,
    };
  }

  private contentKey(content: OverlayContent): string {
    if (!content) return '';
    if (content.kind === 'tip') return `tip:${content.textKey}`;
    return `step:${content.step.index}:${content.step.since}`;
  }

  /** A contextual tip's trigger happened; `highlight` = its occurrence's ids (UX §13.2 "Vurgu", `ctxMoveHighlight`). */
  private tip(topic: CtxTopic, highlight: readonly string[] = []): void {
    this.tips.trigger(topic, this.session?.log.length ?? 0, highlight);
  }

  /**
   * Review Faz 2 tur 1 #13: a queued tip shows only while its trigger still holds — a lasting state (truck queue not
   * empty, streak at "3/4", a trowel held, last moves) or, for a moment (bounce, blocked pick, too tall …), until the
   * next action is committed.
   */
  private tipStillValid(topic: CtxTopic, serial: number): boolean {
    const game = this.session;
    if (!game || game.outcome !== 'playing') return false;
    const s = game.state;
    switch (topic) {
      case 'queue':
        return queueIds(s).length > 0;
      case 'streak':
        return comboOf(s) === economy.combo.correctPlacementsPerTrowel - 1;
      case 'goldtrowel':
        return trowelsOf(s) > 0 && !this.picker.active; // UX §13.2: never while the pick is open
      case 'lastmoves':
        return game.movesLeft > 0 && game.movesLeft <= JUICE_VIEW.lastMovesAt;
      case 'resume':
        return true;
      default:
        return serial === game.log.length;
    }
  }

  // --- drag host ---------------------------------------------------------------------------------------------------------

  private dragHost(): ConstructorParameters<typeof DragController>[1] {
    return {
      boardState: () => this.boardState(),
      mayPick: (id) => this.tutorial?.allowsPick(id) ?? true,
      layout: () => this.layoutNow,
      dragRules: (): DragRules => this.hooks.drag ?? {},
      view: (id) => this.pieces.view(id),
      now: () => this.animNow,
      fastForward: () => this.player.fastForward(),
      touched: () => this.player.touched(),
      pickFailed: (id, reason) => this.pickFailed(id, reason),
      tapped: (id) => {
        this.player.tapped(id);
        this.tutorial?.tapped(id, this.animNow);
      },
      lifted: (session) => this.lifted(session),
      nodeChanged: (session, drop) => this.nodeChanged(session, drop),
      moved: (session, ax, ay, px, py, fx, fy) => this.dragMoved(session, ax, ay, px, py, fx, fy),
      released: (session, node) => this.release(session, node),
      aborted: (session) => this.returnHome(session.pieceId, false),
      signal: (kind, session) => this.dragSignal(kind, session),
    };
  }

  /** The state the board may be picked on: a running attempt, no window, no locked sequence (R-12), no trowel pick. */
  private boardState(): GameState | null {
    const session = this.session;
    if (!session || session.outcome !== 'playing') return null;
    if (this.windows.open !== null) return null;
    if (this.player.locked || this.picker.active) return null;
    return session.state;
  }

  private pickFailed(id: PieceId, reason: PickFailure): void {
    // K-09 (a)/(c): JUICE #2; K-14 locked, no moves, hidden segment: no reaction
    if (reason !== 'immovable' && reason !== 'rule') return;
    const s = this.session?.state;
    this.player.play(2, { piece: id, pieces: s ? blockersAbove(s, id) : [] });
    this.tip('blocked', [pidHighlight(id)]);
  }

  private lifted(session: DragSession): void {
    this.lastOutline = null;
    this.lastLookKey = null;
    this.holdSince = null;
    this.shadow.setRaised(true); // UX §13.1: the drag's look draws above the tutorial spotlight
    this.player.dragStarted(session.pieceId, session.start.ix, session.start.iy);
    this.tutorial?.dragStarted(session.pieceId);
  }

  private nodeChanged(session: DragSession, drop: DropClass): void {
    const s = this.session?.state;
    const lvl = this.lvl;
    const view = this.pieces.view(session.pieceId);
    if (!s || !lvl || !view) return;
    const node = session.current;
    // JUICE #5: the silhouette lengthens over the crane area (rows 8–9)
    const crane = node.iy + session.shape.h > TOKENS.layout.grid.rows;
    const cancel = cancelPreview(drop);
    view.pose = { ...view.pose, alpha: cancel ? VIEW.cancelAlpha : 1 };
    if (cancel) this.shadow.showCancel(this.layoutNow, session.shape, view.pose.ax, view.pose.ay);
    else this.shadow.hideCancel();
    if (!showsShadow(drop)) {
      this.shadow.hide();
      this.lastOutline = null;
      this.lastLookKey = null;
      this.player.dragNode(session.pieceId, crane, false, false);
      return;
    }
    const fall = computeFall(s, session.pieceId, node, { rules: this.hooks.fall });
    const look = shadowLook(fall, lvl.difficulty, { state: s, pieceId: session.pieceId });
    const color = COLOR_CODES[pieceColor(s, session.pieceId)] ?? 'W';
    this.shadow.showFall(
      this.layoutNow,
      this.animNow,
      look,
      session.shape,
      fall.landing,
      pieceFrameName(s, session.pieceId),
      color,
    );
    // JUICE #7: a switch of the shadow; `sfx_ghost_ok` only when it turns ✓ (easy / normal, no `?` cell)
    const changed = look.key !== this.lastLookKey;
    const turnedOk = look.outline === 'valid' && this.lastOutline !== 'valid';
    this.lastLookKey = look.key;
    this.lastOutline = look.outline;
    this.player.dragNode(session.pieceId, crane, changed, turnedOk);
  }

  private dragMoved(
    session: DragSession,
    ax: number,
    ay: number,
    px: number,
    py: number,
    fx: number,
    fy: number,
  ): void {
    const view = this.pieces.view(session.pieceId);
    if (view && view.pose.alpha < 1) this.shadow.showCancel(this.layoutNow, session.shape, ax, ay);
    this.player.dragMoved(session.pieceId, ax, ay, px, py, fx, fy);
  }

  /** Tutorial `overWall` / `gapPass` (GDD §14.1/3) and K-05 `tut.ctx.tootall`; JUICE #6 / #22. */
  private dragSignal(kind: DragSignal, session: DragSession): void {
    if (kind === 'crossedWall') {
      this.player.play(6, { piece: session.pieceId, dx: session.current.ix >= SITE_X ? 1 : -1 });
      this.tutorial?.dragSignal('overWall', this.animNow);
    } else if (kind === 'enteredRail') {
      if (session.current.mode > 0)
        this.player.play(22, { piece: session.pieceId, n: session.current.mode - 1 });
      this.tutorial?.dragSignal('gapPass', this.animNow);
    } else this.tip('tootall');
  }

  // --- moves -------------------------------------------------------------------------------------------------------------

  /** Release: the core decides (K-07 table, K-35 pipeline); the save records it; the EventPlayer shows the result. */
  private release(session: DragSession, node: DragNode): void {
    const game = this.session;
    const id = session.pieceId;
    this.commitFrame = true;
    this.holdSince = null;
    this.shadow.hide();
    this.shadow.hideCancel();
    this.shadow.setRaised(false);
    this.player.dragEnded(id);
    if (!game) return;
    const s = game.state;
    const queuedBefore = queueIds(s);
    const movesBefore = game.movesLeft;
    const sink = new ArraySink();
    const move = { kind: 'drag', pieceId: id, to: node } as const;
    const res = game.commit(move, sink);
    this.settleDraggedView(id);
    if (res.status !== 'applied') {
      this.player.play(8, { piece: id, flag: res.reason === 'sameSpot' });
      return;
    }
    this.recordMove(move, sink.events, movesBefore);
    this.player.playMove(sink.events, {
      queuedBefore,
      movesBefore,
      pieceHeight: (pid) => shapeByIndex(pieceShape(s, pid)).h,
    });
  }

  /**
   * K-43: the committed action is written at once, and a game it ended is saved at once too (`settle`: win rewards or
   * the loss, before the cues); the move's events wait for the end of its cues.
   */
  private recordMove(action: SessionAction, events: readonly GameEvent[], movesBefore: number): void {
    const game = this.session;
    if (!game) return;
    this.attempt?.observe(events);
    this.attempt?.recorded(action, game.movesMade);
    this.settle(game);
    this.lastEvents = events;
    this.lastMovesBefore = movesBefore;
    this.tutPendingActions = game.log.length;
  }

  /** Saves a game-ending outcome once (`LevelAttempt.settle`); the window waits for `planEnded`. */
  private settle(game: GameSession): void {
    const lvl = this.lvl;
    if (this.ended || !this.attempt || !lvl) return;
    this.ended = this.attempt.settle(game, () =>
      winRewards({ difficulty: lvl.difficulty, movesLeft: game.movesLeft, trowels: trowelsOf(game.state) }),
    );
  }

  /** The dragged view leaves the drag at its drawn pose and current lift scale (the cues move it from there). */
  private settleDraggedView(id: PieceId): void {
    const view = this.pieces.view(id);
    if (!view) return;
    const pose = { ...view.pose, scale: view.dragScale(this.animNow), alpha: 1 };
    view.endDrag();
    view.pose = pose;
  }

  /** An aborted drag (app hidden, resize, level change): back home (JUICE #8). */
  private returnHome(id: PieceId, sameSpot: boolean): void {
    this.shadow.hide();
    this.shadow.hideCancel();
    this.shadow.setRaised(false);
    this.player.dragEnded(id);
    this.settleDraggedView(id);
    this.player.play(8, { piece: id, flag: sameSpot });
  }

  /** UX §5.2: the trowel icon opens / closes the pick mode (only while the board takes input). */
  private toggleTrowel(): void {
    if (this.picker.active) {
      this.picker.close();
      return;
    }
    if (!this.boardState() || this.drag.active) return;
    this.player.fastForward();
    this.picker.start(this.animNow);
    // UX §13.2 (Faz 2 tur 3): the pick's hint strip gives the same instruction as `tut.ctx.goldtrowel`, so the line
    // closes if it shows, drops if it waits, and counts as seen — never the same text twice
    if (this.picker.active) this.tips.retire('goldtrowel');
  }

  private commitTrowel(target: TrowelTarget): void {
    const game = this.session;
    if (!game) return;
    this.commitFrame = true;
    const s = game.state;
    const queuedBefore = queueIds(s);
    const movesBefore = game.movesLeft;
    const sink = new ArraySink();
    const move = { kind: 'trowel', seg: target.seg, x: target.x, y: target.y } as const;
    const res = game.commit(move, sink);
    if (res.status !== 'applied') return; // K-33: an invalid target consumes nothing
    this.recordMove(move, sink.events, movesBefore);
    this.player.playMove(sink.events, {
      queuedBefore,
      movesBefore,
      pieceHeight: (pid) => shapeByIndex(pieceShape(s, pid)).h,
    });
  }

  /** The move's last cue ran: tutorial + contextual tips read the move, then the level end (TECH §14.1 #12). */
  private planEnded(): void {
    const game = this.session;
    if (!game) return;
    const events = this.lastEvents;
    this.lastEvents = null;
    if (events) {
      this.tutorial?.moveEnded(events, this.animNow);
      this.tutActions = Math.max(this.tutActions, this.tutPendingActions);
      this.saveTutorial();
      const topics = ctxFromMove(
        events,
        this.lastMovesBefore,
        economy.combo.correctPlacementsPerTrowel - 1,
        JUICE_VIEW.lastMovesAt,
      );
      for (const t of topics) this.tip(t, ctxMoveHighlight(t, events, game.state));
    }
    if (this.endShown || this.windows.open !== null) return;
    if (this.ended) this.showEnd();
    else if (game.outcome === 'outOfMoves') this.openOffer('offer');
  }

  // --- level end ---------------------------------------------------------------------------------------------------------

  /**
   * The saved outcome's window: K-28 win screen (the rewards were written at the winning commit, so a kill on this
   * screen keeps them once, K-43 item 3) or, for a K-29 loss with no offer left, UX §7 window 2.
   */
  private showEnd(): void {
    const end = this.ended;
    if (!end) return;
    this.endShown = true;
    this.endTutorial();
    if (end.kind === 'win') {
      // UX §6: "KAZANDIN!" stays the screen's title (the loss windows repeat their own title instead)
      this.player.showBanner('win.title');
      this.windows.openWin({
        rewards: end.rewards,
        onContinue: () => this.goHome({ levelId: this.levelId, won: true }),
      });
    } else {
      this.player.hideBanners();
      this.openLossWindow(end.result);
    }
  }

  /** K-29 window 1 (D-024). `entry`: after #57 (`offer`), at launch (`resume`) or rebuilt (`none`). */
  private openOffer(entry: 'offer' | 'resume' | 'none'): void {
    const game = this.session;
    if (!game) return;
    const offer = game.nextOffer();
    if (!offer) return;
    this.drag.abort();
    const save = appSave();
    const model = offerModel({
      n: offer.n,
      adAllowed: offer.adAllowed,
      giftAvailable: !save.data.firstOfferGiftUsed,
      coins: save.data.coins,
      ads: { kind: 'none' }, // TECH §11.8: no AdsService in the web MVP yet
    });
    if (entry !== 'none') this.attempt?.offerShown(model);
    this.player.hideBanners(); // the window repeats the title (`lose.title`)
    this.windows.openOffer({
      model,
      remaining: remainingPlanCells(game.state),
      entry,
      onCoins: () => this.takeOffer(model),
      onAd: () => {},
      onDecline: () => {
        this.attempt?.declined(model);
        game.declineOffer();
        this.showLoss(game, 'lose');
      },
    });
  }

  /** The coin option: pay (gift = free) and +5 (K-29; step 12 once), or the fake store when coins are short. */
  private takeOffer(model: OfferModel): void {
    const game = this.session;
    if (!game) return;
    if (model.coin.kind === 'short') {
      const missing = model.coin.missing;
      const pack = packFor(missing);
      this.attempt?.storeOpened();
      this.windows.openStore({
        missing,
        pack,
        onBuy: () => {
          this.attempt?.fakePurchase(packSku(pack.sku));
          this.openOffer('none');
        },
        onCancel: () => this.openOffer('none'),
      });
      return;
    }
    if (!game.nextOffer()) return;
    const s = game.state;
    const queuedBefore = queueIds(s);
    const movesBefore = game.movesLeft;
    // the wallet first: an offer it cannot pay changes nothing (review Faz 2 tur 2 #14); the logged action is the one
    // the core applies and the replay checks (+`OFFER_MOVES`)
    const action: SessionAction = { kind: 'addMoves', amount: OFFER_MOVES, source: 'offerCoins' };
    if (this.attempt && !this.attempt.payOffer(model, action, game.movesMade)) return;
    const sink = new ArraySink();
    const res = game.acceptOffer('offerCoins', sink);
    if (res.status !== 'applied') return;
    this.attempt?.observe(sink.events);
    this.lastEvents = sink.events;
    this.lastMovesBefore = movesBefore;
    this.tutPendingActions = game.log.length;
    this.windows.close();
    this.board.hideDim();
    this.player.playMove(sink.events, {
      queuedBefore,
      movesBefore,
      pieceHeight: (pid) => shapeByIndex(pieceShape(s, pid)).h,
    });
  }

  /** UX §7 window 2 after the player's choice: offer declined, or exit with m ≥ 1 (the loss is saved first). */
  private showLoss(game: GameSession, result: 'lose' | 'quit'): void {
    this.endShown = true;
    this.endTutorial();
    const res = this.attempt?.loss(game, result) ?? { lifeLost: false, streakLost: false };
    this.player.hideBanners();
    this.openLossWindow(res);
  }

  private openLossWindow(res: { readonly lifeLost: boolean; readonly streakLost: boolean }): void {
    this.windows.openLoss({
      lines: lossLines(res.streakLost),
      lifeLost: res.lifeLost,
      onRetry: () => void this.startLevel(this.levelId),
      onHome: () => this.goHome({ levelId: this.levelId, won: false }),
    });
  }

  private endTutorial(): void {
    this.tutorial?.stop();
    this.tips.clear();
  }

  // --- pause and exit ----------------------------------------------------------------------------------------------------

  /**
   * UX §5.1 Pause (K-43 item 1: nothing moves on — running cues are completed first). It opens over no window, at a
   * resume (`resume`), or back from the exit confirm (`fromExit`: "Kal", × — UX §12 `EX -->|Kal| PA`).
   */
  private openPause(resume: boolean, fromExit = false): void {
    const game = this.session;
    if (!game || game.outcome !== 'playing') return;
    const open = this.windows.open;
    if (open !== null && !resume && !(fromExit && open === 'exit')) return;
    this.drag.abort();
    this.picker.close();
    this.player.settle();
    const save = appSave();
    const resumeTip = resume && save.data.seenContextTips['resume'] !== true;
    if (resumeTip) save.markContextTip('resume');
    this.windows.openPause({
      resume,
      resumeTip,
      settings: () => appSave().data.settings,
      onToggle: (id) => this.toggleSetting(id),
      onContinue: () => this.windows.close(),
      onExit: () => this.openExit(),
    });
  }

  private toggleSetting(id: PauseToggle): boolean {
    changeSetting(id, !appSave().data.settings[id]);
    return appSave().data.settings[id];
  }

  /** UX §5.1 exit confirm (K-43 item 2, D-022): "Kal" goes back to Pause, "Çık" ends the attempt. */
  private openExit(): void {
    const game = this.session;
    if (!game) return;
    const save = appSave();
    this.windows.openExit({
      lines: exitLines({
        movesMade: game.movesMade,
        preBoosters: game.preBoosters.length,
        winStreak: streakActive(this.levelId) ? save.data.winStreak : 0,
        bridge: false,
      }),
      onStay: () => this.openPause(false, true),
      onLeave: () => {
        if (game.outcome !== 'playing') return;
        const ex = game.exit();
        if (ex.kind === 'free') {
          this.attempt?.exitFree(game, ex.refundPreBoosters);
          this.goHome({ levelId: this.levelId, won: false });
        } else this.showLoss(game, 'quit');
      },
    });
  }

  /** Home: this scene sleeps with its pools and HUD (TECH §10.4); the home screen wakes it for the next level. */
  private goHome(last: LastLevel): void {
    this.drag.abort();
    this.picker.close();
    this.windows.clear();
    this.player.reset();
    this.endTutorial();
    this.overlay.show(null, this.animNow);
    this.scene.switch(HOME_SCENE_KEY, { last } satisfies HomeSceneData);
  }
}
