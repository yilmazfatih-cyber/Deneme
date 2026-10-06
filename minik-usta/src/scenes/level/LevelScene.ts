/**
 * Level screen (docs/TECH_DESIGN.md §1.4, §10.3–§10.5, §14.1 #11; UX_FLOWS §5). Part 1 skeleton: board, blocks,
 * drag, fall shadow, panorama; moves go through `GameSession` and the views re-sync from the state.
 *
 * Flow of a move (TECH §1.4): DragController → core `tryBeginDrag` (BFS once) → `DragSession.follow` per pointer move →
 * ShadowView from core `computeFall` + `isCorrectPlacement` (via `shadowLook`) → release → `GameSession.commit` (core
 * `applyMove`, K-35) → the views move to the new state: the dropped block falls / settles / bounces along the core's
 * events (`pieceFell`, `pieceBounced`, `pieceReturned`), then the site, build front and panorama refresh and newly
 * delivered truck blocks drop in. The scene never changes the game state itself.
 *
 * Not in part 1 (TECH §14.1 #11–#12, next steps): the JUICE P0 EventPlayer (sounds, haptics, particles, landing squash,
 * segment slide, truck), HUD (moves, goals, streak, truck chip), win / out-of-moves windows, tutorials, save / resume.
 * Until then a won level moves on to the next level of the slice (1–5, then 1 again) and an out-of-moves level is
 * declined and restarted.
 *
 * EXPAND (D-015): the layout is rebuilt from the design height on every resize (`theme/layout.ts` anchors: top group
 * from the top, board group shifted by `(H − 1920) × board.expandShare`, bottom group from the bottom).
 */
import Phaser from 'phaser';
import { DESIGN_WIDTH, scaleMode } from '../../config/display.ts';
import { computeFall } from '../../core/gravity.ts';
import type { CompiledLevel } from '../../core/level/compile.ts';
import type { DragRules, DragSession, DropClass, PickFailure } from '../../core/movement.ts';
import { ArraySink } from '../../core/moves.ts';
import type { MoveHooks, MoveResult } from '../../core/moves.ts';
import { levelHooks } from '../../core/obstacles/registry.ts';
import { panoramaView } from '../../core/panorama.ts';
import { GameSession } from '../../core/session.ts';
import { pieceColor } from '../../core/state.ts';
import type { GameState } from '../../core/state.ts';
import { COLOR_CODES } from '../../core/types.ts';
import type { DragNode, GameEvent, PieceId } from '../../core/types.ts';
import { createLayout, designHeight } from '../../theme/layout.ts';
import type { Layout } from '../../theme/layout.ts';
import { FRAME } from '../../theme/textures.ts';
import { TOKENS } from '../../theme/tokens.ts';
import { Panorama } from '../../ui/Panorama.ts';
import { BOOT_ATLAS_KEY, bakeLevelAtlas } from '../atlas.ts';
import type { Frames } from '../atlas.ts';
import { BoardView } from './BoardView.ts';
import { DEPTH } from './depth.ts';
import { DragController } from './DragController.ts';
import type { DragSignal } from './DragController.ts';
import { easeOf } from './easing.ts';
import { hexColor } from './frameImage.ts';
import { loadLevelById, nextSliceLevel } from './levels.ts';
import { Timeline, Track, fallLeg, glideMs, linear } from './motion.ts';
import type { Pose } from './motion.ts';
import { PieceLayer } from './PieceLayer.ts';
import { pieceFrameName, statePose } from './pieceState.ts';
import type { PieceView } from './PieceView.ts';
import { ShadowView } from './ShadowView.ts';
import { cancelPreview, shadowLook, showsShadow } from './shadowLook.ts';
import { VIEW } from './viewConstants.ts';

export const LEVEL_SCENE_KEY = 'Level';

export interface LevelSceneData {
  /** Level to open (default 1). */
  readonly levelId?: number;
}

type ChapterKey = keyof typeof TOKENS.color.chapter;

/** Chapter sky colours of a level (`color.chapter.chN`). */
function chapterColors(lvl: CompiledLevel): (typeof TOKENS.color.chapter)[ChapterKey] {
  const key = `ch${lvl.chapter}` as ChapterKey;
  return TOKENS.color.chapter[key] ?? TOKENS.color.chapter.ch1;
}

export class LevelScene extends Phaser.Scene {
  private layoutNow!: Layout;
  private levelId = 1;
  private loadToken = 0;
  private lvl: CompiledLevel | null = null;
  private session: GameSession | null = null;
  private hooks: MoveHooks = {};
  private frames: Frames | null = null;
  private board!: BoardView;
  private pieces!: PieceLayer;
  private shadow!: ShadowView;
  private panorama!: Panorama;
  private drag!: DragController;
  private sky!: Phaser.GameObjects.Image;
  private readonly timeline = new Timeline();
  /** R-12: board input is locked while a blocking sequence (truck delivery) plays. */
  private lockedUntil = 0;
  private endTimer: Phaser.Time.TimerEvent | null = null;

  constructor() {
    super(LEVEL_SCENE_KEY);
  }

  init(data: LevelSceneData): void {
    this.levelId = data.levelId ?? 1;
  }

  create(): void {
    this.layoutNow = this.computeLayout();
    this.sky = this.add
      .image(0, 0, BOOT_ATLAS_KEY, FRAME.whitePixel)
      .setOrigin(0, 0)
      .setDepth(DEPTH.background);
    this.board = new BoardView(this);
    this.pieces = new PieceLayer(this);
    this.shadow = new ShadowView(this);
    this.panorama = new Panorama(this, {
      depth: DEPTH.hud,
      padPx: VIEW.panoramaPadPx,
      gapCells: VIEW.panoramaGapCells,
      framePx: VIEW.panoramaFramePx,
      refRows: TOKENS.layout.grid.rows,
    });
    this.drag = new DragController(this, this.dragHost());
    this.paintSky(TOKENS.color.chapter.ch1);

    const onResize = (): void => this.relayout();
    const onHidden = (): void => this.drag.abort();
    this.scale.on(Phaser.Scale.Events.RESIZE, onResize);
    this.game.events.on(Phaser.Core.Events.HIDDEN, onHidden);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, onResize);
      this.game.events.off(Phaser.Core.Events.HIDDEN, onHidden);
      this.drag.destroy();
      this.panorama.destroy();
      this.timeline.clear();
      this.loadToken += 1;
    });

    void this.startLevel(this.levelId);
  }

  update(): void {
    const now = this.time.now;
    this.timeline.run(now);
    this.pieces.update(this.layoutNow, now);
    this.drag.update(now);
    this.shadow.update(now);
  }

  /** The current attempt (debug panel, harness: TECH §12.2–§12.3). */
  get gameSession(): GameSession | null {
    return this.session;
  }

  /** TECH §10.4 `LevelScene.reset(level)`: views go back to their pools, the level is loaded, baked and started. */
  async startLevel(id: number): Promise<void> {
    const token = ++this.loadToken;
    this.levelId = id;
    this.endTimer?.remove();
    this.endTimer = null;
    this.drag.abort();
    this.shadow.hide();
    this.timeline.clear();
    this.pieces.clear();
    this.board.clear();
    this.session = null;
    this.lvl = null;

    const res = await loadLevelById(id);
    if (token !== this.loadToken) return; // another load started, or the scene shut down
    if (!res.ok) {
      // TECH §8.3: a rejected level never starts (`level_load_failed` + home screen arrive with the UI step, #12)
      throw new Error(`level ${id} does not load (${res.stage}): ${JSON.stringify(res.issues)}`);
    }
    const lvl = res.level;
    this.lvl = lvl;
    this.frames = bakeLevelAtlas(this.game, lvl);
    this.hooks = levelHooks(lvl);
    this.session = GameSession.start(lvl);
    this.lockedUntil = 0;
    const s = this.session.state;
    this.paintSky(chapterColors(lvl));
    this.pieces.setFrames(this.frames);
    this.shadow.setFrames(this.frames, easeOf(TOKENS.easing.move));
    this.board.setLevel(lvl, this.frames, this.layoutNow, s);
    this.pieces.sync(s);
    this.refreshHud(s);
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
    this.layoutNow = this.computeLayout();
    this.paintSky(this.lvl ? chapterColors(this.lvl) : TOKENS.color.chapter.ch1);
    const s = this.session?.state;
    if (!s) return;
    this.board.relayout(this.layoutNow, s);
    this.shadow.relayout(this.layoutNow, this.time.now);
    this.refreshHud(s);
  }

  /** Sky gradient (`color.chapter.chN.skyTop` → `skyBottom`) over the whole design canvas; the body band matches. */
  private paintSky(colors: { readonly skyTop: string; readonly skyBottom: string }): void {
    const top = hexColor(colors.skyTop);
    const bottom = hexColor(colors.skyBottom);
    this.sky.setDisplaySize(DESIGN_WIDTH, this.layoutNow.H).setTint(top, top, bottom, bottom);
    this.cameras.main.setBackgroundColor(colors.skyTop);
  }

  private refreshHud(s: GameState): void {
    if (!this.frames) return;
    this.panorama.draw(this.layoutNow.top.panorama, panoramaView(s), this.frames);
  }

  // --- drag host ---------------------------------------------------------------------------------------------------------

  private dragHost(): ConstructorParameters<typeof DragController>[1] {
    return {
      boardState: () => this.boardState(),
      layout: () => this.layoutNow,
      dragRules: (): DragRules => this.hooks.drag ?? {},
      view: (id) => this.pieces.view(id),
      now: () => this.time.now,
      fastForward: () => this.fastForward(),
      liftEase: () => easeOf(TOKENS.easing.pop),
      pickFailed: (id, reason) => this.pickFailed(id, reason),
      tapped: (id) => this.pieces.view(id)?.startHop(this.time.now),
      lifted: () => undefined,
      nodeChanged: (session, drop) => this.nodeChanged(session, drop),
      moved: (session, ax, ay) => this.dragMoved(session, ax, ay),
      released: (session, node) => this.release(session, node),
      aborted: (session) => this.returnHome(session.pieceId),
      signal: (kind, session) => this.dragSignal(kind, session),
    };
  }

  /** The state the board may be picked on: a running attempt and no blocking sequence (R-12). */
  private boardState(): GameState | null {
    const session = this.session;
    if (!session || session.outcome !== 'playing') return null;
    if (this.time.now < this.lockedUntil) return null;
    return session.state;
  }

  /** R-12 / JUICE §0 rule 3: pending board motions and their follow-ups jump to the end. */
  private fastForward(): void {
    this.pieces.finishTracks();
    this.timeline.flush();
    this.pieces.finishTracks();
  }

  private pickFailed(id: PieceId, reason: PickFailure): void {
    // K-09 (a)/(c): "kımıldamıyor" shake; K-14 locked, no moves, hidden segment: no reaction
    if (reason === 'immovable' || reason === 'rule') this.pieces.view(id)?.startShake(this.time.now);
  }

  private nodeChanged(session: DragSession, drop: DropClass): void {
    const s = this.session?.state;
    const lvl = this.lvl;
    const view = this.pieces.view(session.pieceId);
    if (!s || !lvl || !view) return;
    const node = session.current;
    // JUICE #5: the silhouette lengthens over the crane area (rows 8–9)
    view.setShadowKind(node.iy + session.shape.h > TOKENS.layout.grid.rows ? 'crane' : 'lifted');
    const cancel = cancelPreview(drop);
    view.pose = { ...view.pose, alpha: cancel ? VIEW.cancelAlpha : 1 };
    if (cancel) this.shadow.showCancel(this.layoutNow, session.shape, view.pose.ax, view.pose.ay);
    else this.shadow.hideCancel();
    if (!showsShadow(drop)) {
      this.shadow.hide();
      return;
    }
    const fall = computeFall(s, session.pieceId, node, { rules: this.hooks.fall });
    const look = shadowLook(fall, lvl.difficulty);
    const color = COLOR_CODES[pieceColor(s, session.pieceId)] ?? 'W';
    this.shadow.showFall(
      this.layoutNow,
      this.time.now,
      look,
      session.shape,
      fall.landing,
      pieceFrameName(s, session.pieceId),
      color,
    );
  }

  private dragMoved(session: DragSession, ax: number, ay: number): void {
    const view = this.pieces.view(session.pieceId);
    if (view && view.pose.alpha < 1) this.shadow.showCancel(this.layoutNow, session.shape, ax, ay);
  }

  private dragSignal(_kind: DragSignal, _session: DragSession): void {
    // Tutorial `overWall` / `gapPass` and the K-05 crane-area flash belong to the EventPlayer / TutorialController steps.
  }

  // --- moves -------------------------------------------------------------------------------------------------------------

  /** Release: the core decides (K-07 table, K-35 pipeline); the views follow the result. */
  private release(session: DragSession, node: DragNode): void {
    const game = this.session;
    const id = session.pieceId;
    this.shadow.hide();
    this.shadow.hideCancel();
    if (!game) return;
    const sink = new ArraySink();
    const res = game.commit({ kind: 'drag', pieceId: id, to: node }, sink);
    if (res.status !== 'applied') {
      this.returnHome(id, res.reason === 'sameSpot');
      return;
    }
    this.playMove(id, res, sink.events);
  }

  /** A cancelled release / aborted drag: the block goes back to its (unchanged) state pose (JUICE #8). */
  private returnHome(id: PieceId, sameSpot = false): void {
    const s = this.session?.state;
    const view = this.pieces.view(id);
    if (!s || !view) return;
    const home = statePose(s, id);
    const now = this.time.now;
    const from: Pose = { ...view.pose, scale: view.dragScale(now) };
    view.endDrag();
    view.pose = from;
    if (!home) return;
    const track = new Track(from, now).to({
      ax: home.ax,
      ay: home.ay,
      ms: sameSpot ? TOKENS.duration.setYard : TOKENS.duration.cancel,
      ease: easeOf(sameSpot ? TOKENS.easing.move : TOKENS.easing.slide),
      arc: sameSpot ? 0 : VIEW.cancelArcCells,
      scale: 1,
      alpha: 1,
    });
    view.track = track;
    view.setFlying(true);
  }

  /**
   * An applied drag (part 1 sync; the JUICE P0 EventPlayer replaces it): the dropped block falls / settles along the
   * core's events and bounces back when the placement was wrong (K-17); at its end the site, the build front and the
   * panorama refresh, the views re-sync with the state and newly delivered truck blocks drop into the yard (K-25).
   */
  private playMove(id: PieceId, res: MoveResult, events: readonly GameEvent[]): void {
    const game = this.session;
    const lvl = this.lvl;
    const view = this.pieces.view(id);
    if (!game || !lvl) return;
    const s = game.state;
    const now = this.time.now;
    let end = now;
    if (view) {
      const from: Pose = { ...view.pose, scale: view.dragScale(now), alpha: 1 };
      view.endDrag();
      view.pose = from;
      const track = new Track(from, now);
      const fell = events.find((e) => e.t === 'pieceFell' && e.pieceId === id && e.cause === 'release');
      const bounced = events.find((e) => e.t === 'pieceBounced' && e.pieceId === id);
      const returned = events.find((e) => e.t === 'pieceReturned' && e.pieceId === id);
      const moved = events.find((e) => e.t === 'pieceMoved' && e.pieceId === id);
      if (fell && fell.t === 'pieceFell') {
        const leg = this.releaseFall(lvl, fell.rows);
        track.to({ ax: fell.to.x, ay: fell.to.y, ms: leg.ms, ease: leg.ease, scale: 1 });
      } else if (moved && moved.t === 'pieceMoved') {
        // yard drop (K-10) or rail park (K-12): settle on the release node
        const ms = moved.entry === 'gap' ? TOKENS.duration.land : TOKENS.duration.setYard;
        track.to({ ax: moved.to.x, ay: moved.to.y, ms, ease: easeOf(TOKENS.easing.move), scale: 1 });
      }
      const back = bounced ?? returned;
      if (back && (back.t === 'pieceBounced' || back.t === 'pieceReturned')) {
        if (back.to === 'queue') {
          view.hideAtEnd = true;
          track.to({ ax: track.final.ax, ay: track.final.ay, ms: TOKENS.duration.bounceToQueue, alpha: 0 });
        } else {
          track.to({
            ax: back.to.x,
            ay: back.to.y,
            ms: TOKENS.duration.placeBad,
            ease: easeOf(TOKENS.easing.move),
            arc: VIEW.bounceArcCells,
          });
        }
      }
      const home = statePose(s, id);
      if (home && !view.hideAtEnd && (track.final.ax !== home.ax || track.final.ay !== home.ay))
        track.to({ ax: home.ax, ay: home.ay, ms: TOKENS.duration.setYard, ease: easeOf(TOKENS.easing.move) });
      view.track = track;
      view.setFlying(back !== undefined);
      end = track.end;
    }
    this.timeline.at(end, () => this.afterMove(res, events));
  }

  /** Release fall per gravity profile (JUICE §0.1, `tokens.physics`). */
  private releaseFall(lvl: CompiledLevel, rows: number): { ms: number; ease: (u: number) => number } {
    const ph = TOKENS.physics;
    if (lvl.gravity.build === 'low') return { ms: glideMs(rows, ph.fallLowSpeed), ease: linear };
    if (lvl.gravity.build === 'high') return fallLeg(rows, ph.fallHighAccel, ph.fallHighMax);
    return fallLeg(rows, ph.fallNormalAccel, ph.fallNormalMax);
  }

  private afterMove(res: MoveResult, events: readonly GameEvent[]): void {
    const game = this.session;
    if (!game) return;
    const s = game.state;
    const now = this.time.now;
    this.board.refreshSite(this.layoutNow, s);
    this.refreshHud(s);
    const added = new Set(this.pieces.sync(s));

    // K-25 step 9: delivered truck blocks drop from above the yard, FIFO, staggered (JUICE #19 without the truck)
    const ph = TOKENS.physics;
    let i = 0;
    let lastDrop = now;
    for (const e of events) {
      if (e.t !== 'pieceFell' || e.cause !== 'delivery' || !added.has(e.pieceId)) continue;
      const view: PieceView | undefined = this.pieces.view(e.pieceId);
      if (!view) continue;
      const start = now + i * ph.truckDropStaggerMs;
      const leg = fallLeg(e.from.y - e.to.y, ph.yardFallAccel, ph.yardFallMax);
      const track = new Track({ ax: e.from.x, ay: e.from.y, scale: 1, alpha: 1 }, start).to({
        ax: e.to.x,
        ay: e.to.y,
        ms: leg.ms,
        ease: leg.ease,
      });
      view.pose = track.at(now);
      view.track = track;
      lastDrop = Math.max(lastDrop, track.end);
      i += 1;
    }
    if (i > 0) this.lockedUntil = Math.max(this.lockedUntil, lastDrop);

    if (res.won || game.outcome === 'won')
      this.scheduleEnd(lastDrop, () => this.startLevel(nextSliceLevel(this.levelId)));
    else if (game.outcome === 'outOfMoves' || game.outcome === 'lost') {
      this.scheduleEnd(lastDrop, () => {
        if (this.session?.outcome === 'outOfMoves') this.session.declineOffer();
        return this.startLevel(this.levelId);
      });
    }
  }

  /** Level over (no window yet): wait for the motions, then `duration.win`, then go on. */
  private scheduleEnd(after: number, next: () => Promise<void>): void {
    const delay = Math.max(0, after - this.time.now) + TOKENS.duration.win;
    this.endTimer?.remove();
    this.endTimer = this.time.delayedCall(delay, () => {
      this.endTimer = null;
      void next();
    });
  }
}
