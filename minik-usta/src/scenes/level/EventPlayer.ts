/**
 * EventPlayer (docs/TECH_DESIGN.md §6.3 "Sahne tarafı", §10.3–§10.6, §14.1 #11; JUICE.md Phase 2 P0): replays the core's
 * `GameEvent` log of a move as animations, particles, sounds (services/audio) and haptics (services/haptics). The core
 * has already decided everything (TECH §1.4); the player only shows it, in K-35 step order (juice/plan.ts), through the
 * JUICE handlers (juice/handlers.ts) for which it is the `JuiceStage`.
 *
 * Input during animations (JUICE §0 rule 3, R-12, D-021):
 * - a grab fast-forwards: pending board cues run at once and board motions jump to their last frame (`fastForward`);
 *   particles, sounds, the support hatch and HUD pulses keep their pace; the drag starts from the real state;
 * - the board is locked only during the segment slide (#18), the truck delivery (#19) and the level end (#55–#57);
 *   a touch then plays the rest 3× faster (`touched` → `rate`; the scene's animation clock runs at that rate).
 * Reduced motion (`reduced`): every handler plays its fade variant (JUICE §0 rule 8).
 * Pooling: block views (PieceLayer), particles (`particles.maxOnScreen` images, ParticleLayer), trail ghosts, tether
 * dots, chips and coins are created once and reused; nothing is allocated per frame on the drag path.
 */
import Phaser from 'phaser';
import { SITE_X } from '../../core/coords.ts';
import { visibleSegment } from '../../core/grid.ts';
import { PLAN_DOT, PLAN_OUTSIDE } from '../../core/level/compile.ts';
import type { CompiledLevel } from '../../core/level/compile.ts';
import { comboOf, trowelsOf } from '../../core/combo.ts';
import { shapeByIndex } from '../../core/shapes.ts';
import type { ShapeDef } from '../../core/shapes.ts';
import { H, hdr, pieceColor, pieceShape } from '../../core/state.ts';
import type { GameState } from '../../core/state.ts';
import { COLOR_CODES } from '../../core/types.ts';
import type { At, ColorCode, GameEvent, PieceId } from '../../core/types.ts';
import type { AudioService, SoundName } from '../../services/audio.ts';
import type { HapticName, Haptics } from '../../services/haptics.ts';
import { t, upper } from '../../services/i18n.ts';
import type { Layout, Rect } from '../../theme/layout.ts';
import { FRAME } from '../../theme/textures.ts';
import { TOKENS } from '../../theme/tokens.ts';
import { textStyle } from '../../ui/text.ts';
import type { MovesCounter } from '../../ui/MovesCounter.ts';
import { drawTrowelIcon } from '../../ui/StatusStrip.ts';
import type { StatusStrip } from '../../ui/StatusStrip.ts';
import { BOOT_ATLAS_KEY } from '../atlas.ts';
import { RAIL_GLOW_DEPTH } from './BoardView.ts';
import type { BoardView } from './BoardView.ts';
import { DEPTH, overTutorial } from './depth.ts';
import { easeOf } from './easing.ts';
import { hexColor } from './frameImage.ts';
import { JUICE, juiceMs } from './juice/catalog.ts';
import type { JuiceId, ParticleFamily } from './juice/catalog.ts';
import { DragFeel } from './juice/dragFeel.ts';
import type { FeelFrame } from './juice/dragFeel.ts';
import { FxRunner, popCurve, pulse01 } from './juice/fx.ts';
import { JUICE_HANDLERS } from './juice/handlers.ts';
import { planMove } from './juice/plan.ts';
import type { Drop, GravityBuild, MoveCue, PlanContext } from './juice/plan.ts';
import { Playback } from './juice/playback.ts';
import type {
  Anchor,
  BurstOptions,
  JuiceCue,
  JuiceStage,
  Point,
  SoundOptions,
  TweenProps,
  Tweenable,
} from './juice/stage.ts';
import { Timeline, Track, fallLeg, linear } from './motion.ts';
import type { Ease, LegSpec, Pose } from './motion.ts';
import { ParticleLayer } from './ParticleLayer.ts';
import type { PieceLayer } from './PieceLayer.ts';
import { statePose } from './pieceState.ts';
import type { PieceView } from './PieceView.ts';
import { Trail } from './Trail.ts';
import { TRUCK_H, TRUCK_W, Truck } from './Truck.ts';
import { JUICE_VIEW, VIEW } from './viewConstants.ts';
import { addBakedGraphics } from '../../ui/BakedGraphics.ts';

const D = TOKENS.duration;
const V = JUICE_VIEW;
const WHITE = 0xffffff;
const RIBBON_PX = 44;
const CHIP_POOL = 5;
const COIN_POOL = 6;

export interface EventPlayerHost {
  layout(): Layout;
  state(): GameState | null;
  level(): CompiledLevel | null;
  readonly pieces: PieceLayer;
  readonly board: BoardView;
  readonly moves: MovesCounter;
  readonly strip: StatusStrip;
  /** Redraws the panorama from the state (K-06). */
  panoramaRedraw(): void;
  /** Panorama column of segment `seg` (JUICE #18 target). */
  panoramaSlot(seg: number): Rect | null;
  levelNumber(): number;
  /** The move's last cue ran: the board shows the state again (level end decisions). */
  planEnded(): void;
}

export interface PlayerServices {
  readonly audio: AudioService | null;
  readonly haptics: Haptics | null;
}

/** Drag cues reuse one object (no allocation per pointer move, TECH §10.6). */
type MutableCue = { -readonly [K in keyof JuiceCue]: JuiceCue[K] };

/** Base transforms of a group of images (#18 segment flight / slide). */
class ImageGroup {
  private readonly items: {
    img: Phaser.GameObjects.Image;
    x: number;
    y: number;
    sx: number;
    sy: number;
    a: number;
  }[];

  constructor(imgs: readonly Phaser.GameObjects.Image[]) {
    this.items = imgs.map((img) => ({
      img,
      x: img.x,
      y: img.y,
      sx: img.scaleX,
      sy: img.scaleY,
      a: img.alpha,
    }));
  }

  apply(px: number, py: number, scale: number, dx: number, dy: number, alpha: number): void {
    for (const it of this.items) {
      it.img.setPosition(px + (it.x - px) * scale + dx, py + (it.y - py) * scale + dy);
      it.img.setScale(it.sx * scale, it.sy * scale).setAlpha(it.a * alpha);
    }
  }

  restore(): void {
    for (const it of this.items) it.img.setPosition(it.x, it.y).setScale(it.sx, it.sy).setAlpha(it.a);
  }
}

export class EventPlayer implements JuiceStage {
  readonly fx = new FxRunner();
  readonly playback: Playback<MoveCue>;
  /** "Animasyonları azalt" (JUICE §0 rule 8). */
  reduced = false;
  /** META `levelRewards.bonusMaxMovesCounted` (#56). */
  bonusMax = 10;

  private readonly scene: Phaser.Scene;
  private readonly host: EventPlayerHost;
  private readonly services: PlayerServices;
  private readonly later = new Timeline();
  private readonly particles: ParticleLayer;
  private readonly trailFx: Trail;
  private readonly truckView: Truck;
  private readonly feel = new DragFeel();
  private readonly dots: Phaser.GameObjects.Image[] = [];
  private readonly ribbon: Phaser.GameObjects.Image[] = [];
  private readonly chips: Phaser.GameObjects.Text[] = [];
  private readonly coins: Phaser.GameObjects.Graphics[] = [];
  private readonly banners = new Map<string, Phaser.GameObjects.Text>();
  private readonly flyer: Phaser.GameObjects.Graphics;
  private toastText: Phaser.GameObjects.Text | null = null;
  private toastBg: Phaser.GameObjects.Graphics | null = null;
  private toastRoot: Phaser.GameObjects.Container | null = null;
  private now = 0;
  private gravity: GravityBuild = 'normal';
  private wasCrane = false;
  private readonly dragCue: MutableCue = {
    id: 3,
    time: 0,
    ms: 0,
    reduced: false,
    instant: false,
    ev: null,
    piece: null,
  };
  private readonly point = { x: 0, y: 0 };

  constructor(scene: Phaser.Scene, host: EventPlayerHost, services: PlayerServices) {
    this.scene = scene;
    this.host = host;
    this.services = services;
    this.playback = new Playback<MoveCue>((cue, time, instant) => this.runCue(cue, time, instant));
    this.particles = new ParticleLayer(scene, DEPTH.effects + 2);
    this.trailFx = new Trail(scene);
    this.truckView = new Truck(scene, DEPTH.effects);
    for (let i = 0; i < V.tetherDots; i++)
      this.dots.push(
        scene.add.image(0, 0, BOOT_ATLAS_KEY, FRAME.whitePixel).setDepth(DEPTH.effects).setVisible(false),
      );
    for (let i = 0; i < 2; i++)
      this.ribbon.push(
        scene.add.image(0, 0, BOOT_ATLAS_KEY, FRAME.whitePixel).setDepth(DEPTH.effects).setVisible(false),
      );
    for (let i = 0; i < CHIP_POOL; i++)
      this.chips.push(
        scene.add
          .text(
            0,
            0,
            t('common.plus', { n: 1 }),
            textStyle('button', TOKENS.color.ui.inkOnDark, { color: TOKENS.color.ui.ink, px: 8 }),
          )
          .setOrigin(0.5)
          .setDepth(DEPTH.hud + 5)
          .setVisible(false),
      );
    for (let i = 0; i < COIN_POOL; i++) {
      const g = addBakedGraphics(scene)
        .setDepth(DEPTH.hud + 5)
        .setVisible(false);
      g.fillStyle(hexColor(TOKENS.color.ui.goldDark), 1).fillCircle(0, 0, 24);
      g.fillStyle(hexColor(TOKENS.color.ui.gold), 1).fillCircle(0, 0, 19);
      this.coins.push(g);
    }
    this.flyer = addBakedGraphics(scene)
      .setDepth(DEPTH.effects + 1)
      .setVisible(false);
    drawTrowelIcon(this.flyer);
  }

  // --- scene interface ---------------------------------------------------------------------------------------------------

  /** Level start: drops everything pending, HUD from the state. */
  startLevel(s: GameState, gravity: GravityBuild): void {
    this.reset();
    this.gravity = gravity;
    this.hudSync(s, true);
    // the #55 / #57 titles are made (or refreshed after a language change) here, not in the level end's frames
    for (const key of ['win.title', 'lose.title'] as const) this.bannerText(key).setText(upper(t(key)));
  }

  /** Hides the JUICE #55 / #57 title banners (a window with its own title took over the screen). */
  hideBanners(): void {
    for (const b of this.banners.values()) b.setVisible(false);
  }

  /**
   * UX §6: the win screen keeps the "KAZANDIN!" title (review Faz 2 tur 1 #5) — the JUICE #55 banner at its rest pose
   * (also when #55 never played: a K-43 resume onto the saved win). Other banners are hidden.
   */
  showBanner(key: 'win.title'): void {
    for (const [k, b] of this.banners) if (k !== key) b.setVisible(false);
    const text = this.bannerText(key);
    const b = this.boardRect();
    text
      .setPosition(b.x + b.w / 2, b.y + b.h * 0.38)
      .setScale(1)
      .setAlpha(1)
      .setVisible(true);
  }

  private bannerText(key: 'win.title' | 'lose.title'): Phaser.GameObjects.Text {
    let text = this.banners.get(key);
    if (!text) {
      text = this.scene.add
        .text(
          0,
          0,
          upper(t(key)),
          textStyle('display', TOKENS.color.ui.inkOnDark, { color: TOKENS.color.ui.ink, px: 16 }),
        )
        .setOrigin(0.5)
        .setDepth(DEPTH.hud + 10)
        .setVisible(false); // made ahead at level start (`startLevel`): shown only by #55 / #57 / `showBanner`
      this.banners.set(key, text);
    }
    return text;
  }

  /** Drops every pending cue and effect (level change). */
  reset(): void {
    this.playback.clear();
    this.later.clear();
    this.fx.clear();
    this.particles.clear();
    this.trailFx.stop();
    this.truckView.hide();
    for (const b of this.banners.values()) b.setVisible(false);
    this.toastRoot?.setVisible(false);
    for (const d of this.dots) d.setVisible(false);
    for (const r of this.ribbon) r.setVisible(false);
    for (const c of this.chips) c.setVisible(false);
    for (const c of this.coins) c.setVisible(false);
    this.flyer.setVisible(false);
    this.host.board.hideDim();
    this.host.moves.setBump(1);
    this.feel.end();
    // the camera is already gone when the scene shuts down (Level → Home)
    this.scene.cameras?.main?.resetFX();
  }

  /** Per frame (animation clock `now`, elapsed `dtMs` at the current rate): cues, delayed calls, effects, particles. */
  update(now: number, dtMs: number): void {
    this.now = now;
    this.playback.advance(now);
    this.later.run(now);
    this.fx.run(now);
    this.particles.update(dtMs);
    this.host.moves.update(now, D.lastMovesPulse, V.lastMovesPulse);
  }

  /** After the block views were drawn this frame (trail ghosts read their positions). */
  lateUpdate(now: number): void {
    this.trailFx.update(now);
  }

  /** Clock rate of the next frame (3× while a touched locked sequence plays). */
  rate(): number {
    return this.playback.rate(this.now);
  }

  /** The board takes no input (segment slide, truck, level end). */
  get locked(): boolean {
    return this.playback.locked(this.now);
  }

  /** Cues still waiting. */
  get busy(): boolean {
    return this.playback.pending > 0;
  }

  /**
   * R-12: a grab — pending unlocked cues run at once, board motions jump to their last frame. Inside a locked sequence
   * nothing is skipped (the touch only speeds it up, `touched`).
   */
  fastForward(): void {
    if (this.playback.locked(this.now)) return;
    this.playback.fastForward(this.now);
    this.finishBoardMotion();
  }

  /** Everything pending runs at once, locked sequences included (resize, debug "skip"). */
  settle(): void {
    this.playback.flush(this.now);
    this.finishBoardMotion();
  }

  /** A touch: a locked sequence plays 3× faster. */
  touched(): void {
    this.playback.speedUp(this.now);
  }

  /** Schedules one committed move (drag, trowel, accepted offer). */
  playMove(events: readonly GameEvent[], ctx: Omit<PlanContext, 'reduced' | 'gravity'>): void {
    const plan = planMove(events, { ...ctx, reduced: this.reduced, gravity: this.gravity }, this.bonusMax);
    this.playback.schedule(plan.cues, this.now);
    this.playback.advance(this.now);
  }

  /** Plays a P0 cue now (drag-time and UI events: #1–8, #22, #52, #58, #69–71, #87 …). */
  play(id: JuiceId, extra: Partial<JuiceCue> = {}): void {
    const cue: JuiceCue = {
      id,
      time: this.now,
      ms: juiceMs(id, this.reduced),
      reduced: this.reduced,
      instant: false,
      ev: null,
      piece: null,
      ...extra,
    };
    JUICE_HANDLERS[id](cue, this);
  }

  /** Drag lifted (#1); `crane` = the drag starts in the crane area. */
  dragStarted(id: PieceId, ax: number, ay: number): void {
    this.feel.reset(this.now, ax, ay);
    this.wasCrane = false;
    // the #4 tether belongs to the dragged block: above the tutorial spotlight with it (UX §13.1)
    for (const d of this.dots) d.setDepth(overTutorial(DEPTH.effects));
    this.play(1, { piece: id });
  }

  /** Every drawn drag frame: #3 (tilt, trail) and #4 (contact, tether). */
  dragMoved(id: PieceId, ax: number, ay: number, px: number, py: number, fx: number, fy: number): void {
    const f: Readonly<FeelFrame> = this.feel.step(this.now, ax, ay, px, py);
    const c = this.dragCue;
    c.id = 3;
    c.time = this.now;
    c.ms = 0;
    c.reduced = this.reduced;
    c.piece = id;
    c.dx = f.vx;
    c.dy = f.speed;
    c.first = undefined;
    c.flag = undefined;
    c.from = undefined;
    JUICE_HANDLERS[3](c, this);
    if (!f.contact && !f.tether && !this.dots[0]?.visible) return;
    c.id = 4;
    c.ms = juiceMs(4, this.reduced);
    c.first = f.contact;
    c.flag = f.haptic;
    c.dx = f.dirX;
    c.dy = f.dirY;
    this.point.x = fx;
    this.point.y = fy;
    c.from = f.tether ? this.point : undefined;
    JUICE_HANDLERS[4](c, this);
  }

  /**
   * UX §5.3 "Tıklama" (a press released under the drag threshold; review Faz 2 tur 2 #13): a one-cell hop — with
   * reduced motion a ≤ 3 % scale pulse (JUICE §0 rule 8) — and the light haptic in both modes (only the Titreşim switch
   * gates haptics).
   */
  tapped(id: PieceId): void {
    this.host.pieces.view(id)?.startHop(this.now, this.reduced);
    this.haptic('light');
  }

  /** The drag's node changed: #5 (crane area) and #7 (shadow switch, `ok` = the shadow turned ✓). */
  dragNode(id: PieceId, crane: boolean, shadowChanged: boolean, ok: boolean): void {
    if (crane !== this.wasCrane) {
      this.wasCrane = crane;
      this.play(5, { piece: id, flag: crane });
    }
    if (shadowChanged) this.play(7, { piece: id, flag: ok });
  }

  /** The drag ended (release, cancel, abort): tether and tilt off. */
  dragEnded(id: PieceId): void {
    this.feel.end();
    this.tether(id, null, 0);
    for (const d of this.dots) d.setDepth(DEPTH.effects);
    const v = this.host.pieces.view(id);
    if (v) v.tiltDeg = 0;
  }

  // --- cue execution -----------------------------------------------------------------------------------------------------

  /** Times each move cue kind started playing since the scene was made (harness `waitCue`; review Faz 2 tur 2 #6). */
  readonly cueRuns = new Map<MoveCue['kind'], number>();

  private runCue(cue: MoveCue, time: number, instant: boolean): void {
    this.cueRuns.set(cue.kind, (this.cueRuns.get(cue.kind) ?? 0) + 1);
    this.fx.instantBoard = instant;
    try {
      if (typeof cue.kind === 'number') {
        const c: JuiceCue = {
          id: cue.kind,
          time,
          ms: cue.ms,
          reduced: this.reduced,
          instant,
          ev: cue.ev,
          piece: cue.piece,
          gravity: this.gravity,
          ...(cue.n !== undefined ? { n: cue.n } : {}),
          ...(cue.first !== undefined ? { first: cue.first } : {}),
          ...(cue.flag !== undefined ? { flag: cue.flag } : {}),
          ...(cue.toSeg !== undefined ? { toSeg: cue.toSeg } : {}),
          ...(cue.drops !== undefined ? { drops: cue.drops } : {}),
          ...(cue.cells !== undefined ? { cells: cue.cells } : {}),
        };
        JUICE_HANDLERS[cue.kind](c, this);
      } else this.internalCue(cue, time);
    } finally {
      this.fx.instantBoard = false;
    }
    if (instant) this.finishBoardMotion();
  }

  private finishBoardMotion(): void {
    this.host.pieces.finishTracks();
    this.fx.finishBoard();
    this.host.pieces.finishTracks();
  }

  /** Non-P0 events the board still shows (K-20 cascade, S8 balloon, S3 return) and re-syncs. */
  private internalCue(cue: MoveCue, time: number): void {
    const e = cue.ev;
    switch (cue.kind) {
      case 'yardFall': {
        if (!e || e.t !== 'pieceFell' || cue.piece === null) return;
        const ph = TOKENS.physics;
        const leg = fallLeg(e.rows, ph.yardFallAccel, ph.yardFallMax);
        this.pieceTrack(cue.piece, time, [
          { ax: e.to.x, ay: e.to.y, ms: cue.ms, ease: leg.ease, scale: 1, alpha: 1 },
        ]);
        const land = time + cue.ms;
        const sx = this.reduced ? 1 : 1 + (V.landSquashX - 1) / 2;
        if (!this.reduced) this.pieceSquash(cue.piece, land, sx, 2 - sx, D.land, easeOf(TOKENS.easing.pop));
        const box = this.boxAt(cue.piece, e.to);
        if (box)
          this.burst(
            'dust',
            this.reduced ? 0 : 3,
            { x: box.x + box.w / 2, y: box.y + box.h },
            { w: box.w, at: land },
          );
        this.sound('sfx_land', { at: land, gain: 10 ** (V.cascadeLandDb / 20) });
        if (cue.n === 0) this.haptic('light', land);
        return;
      }
      case 'glide': {
        if (!e || e.t !== 'balloonRose' || cue.piece === null) return;
        this.pieceTrack(cue.piece, time, [{ ax: e.to.x, ay: e.to.y, ms: cue.ms, ease: linear, scale: 1 }]);
        return;
      }
      case 'return': {
        if (!e || e.t !== 'pieceReturned' || cue.piece === null) return;
        if (e.to === 'queue') {
          this.play(88, { piece: cue.piece, time });
          return;
        }
        this.pieceTrack(
          cue.piece,
          time,
          [
            {
              ax: e.to.x,
              ay: e.to.y,
              ms: cue.ms,
              ease: easeOf(TOKENS.easing.move),
              arc: VIEW.bounceArcCells,
              scale: 1,
            },
          ],
          { flying: true },
        );
        return;
      }
      case 'streakReset':
        this.host.strip.setStreak(0);
        return;
      case 'resync':
        this.resync(false);
        return;
      case 'end':
        this.resync(false);
        this.host.planEnded();
        return;
    }
  }

  /** Board, pieces, panorama and HUD re-read from the state. */
  private resync(hudMoves: boolean): void {
    const s = this.host.state();
    if (!s) return;
    this.refreshSite();
    this.host.pieces.sync(s);
    this.host.panoramaRedraw();
    this.hudSync(s, hudMoves || (hdr(s, H.flags) & 1) === 0);
  }

  /** HUD values from the state (moves only while the level is not won: the win bonus counts them down, #56). */
  private hudSync(s: GameState, moves: boolean): void {
    const left = hdr(s, H.movesLeft);
    if (moves) {
      this.host.moves.set(left);
      this.host.moves.setDanger(left <= V.lastMovesAt, !this.reduced, this.now);
    }
    this.host.strip.setStreak(comboOf(s));
    this.trowelsSet(trowelsOf(s));
    this.host.strip.setQueue(hdr(s, H.queueLen));
  }

  private refreshSite(): void {
    const s = this.host.state();
    if (!s) return;
    this.fx.finishOwner(this.host.board);
    this.host.board.refreshSite(this.host.layout(), s);
  }

  private at(time: number, fn: () => void): void {
    if (time <= this.now) fn();
    else this.later.at(time, fn);
  }

  private shapeOf(id: PieceId): ShapeDef | null {
    const v = this.host.pieces.view(id);
    if (v?.shape) return v.shape;
    const s = this.host.state();
    return s ? shapeByIndex(pieceShape(s, id)) : null;
  }

  // --- JuiceStage: feedback ----------------------------------------------------------------------------------------------

  sound(name: SoundName, opts: SoundOptions = {}): void {
    const audio = this.services.audio;
    if (!audio) return;
    const play = (): void => {
      audio.play(name, { rate: opts.rate ?? 1, volume: opts.gain ?? 1 });
    };
    this.at(opts.at ?? this.now, play);
  }

  haptic(name: HapticName, at?: number): void {
    const h = this.services.haptics;
    if (!h) return;
    this.at(at ?? this.now, () => h.play(name));
  }

  burst(family: ParticleFamily, count: number, p: Point, opts: BurstOptions = {}): void {
    if (count <= 0) return;
    const x = p.x;
    const y = p.y;
    this.at(opts.at ?? this.now, () => {
      this.particles.emit({ family, count, x, y, w: opts.w, h: opts.h, colors: opts.colors, dir: opts.dir });
    });
  }

  shake(px: number, time: number, ms: number): void {
    const l = this.host.layout();
    this.at(time, () => this.scene.cameras.main.shake(ms, new Phaser.Math.Vector2(px / l.W, px / l.H)));
  }

  drive(time: number, ms: number, ease: Ease, apply: (k: number, u: number) => void, board: boolean): void {
    if (ms <= 0) {
      this.at(time, () => apply(1, 1));
      return;
    }
    this.fx.add({ start: time, ms, ease, cls: board ? 'board' : 'free', apply });
  }

  tween(target: Tweenable, to: TweenProps, time: number, ms: number, ease: Ease, from?: TweenProps): void {
    const keys = Object.keys(to) as (keyof TweenProps)[];
    if (from) for (const k of Object.keys(from) as (keyof TweenProps)[]) target[k] = from[k] ?? target[k];
    const start = keys.map((k) => target[k]);
    const end = keys.map((k) => to[k] ?? target[k]);
    this.drive(
      time,
      ms,
      ease,
      (k) => {
        keys.forEach((key, i) => {
          const a = start[i] ?? 0;
          target[key] = a + ((end[i] ?? a) - a) * k;
        });
      },
      false,
    );
  }

  ease(name: string): Ease {
    return easeOf(name);
  }

  // --- JuiceStage: geometry ----------------------------------------------------------------------------------------------

  boardRect(): Rect {
    return this.host.layout().board.board;
  }

  screenRect(): Rect {
    const l = this.host.layout();
    return { x: 0, y: 0, w: l.W, h: l.H };
  }

  restAnchor(id: PieceId): Anchor | null {
    const s = this.host.state();
    const p = s ? statePose(s, id) : null;
    return p ? { ax: p.ax, ay: p.ay } : null;
  }

  pieceAnchor(id: PieceId): Anchor | null {
    const v = this.host.pieces.view(id);
    return v ? { ax: v.pose.ax, ay: v.pose.ay } : null;
  }

  anchorAt(id: PieceId, p: Point): Anchor | null {
    const shape = this.shapeOf(id);
    if (!shape) return null;
    const g = this.host.layout().grid;
    const c = g.cellPx;
    return {
      ax: g.anchorXAt(p.x - (shape.w * c) / 2, shape.w),
      ay: g.anchorYAt(p.y - (shape.h * c) / 2, shape.h),
    };
  }

  pieceBox(id: PieceId): Rect | null {
    const v = this.host.pieces.view(id);
    if (!v?.shape) return null;
    return this.host.layout().grid.pieceRect(v.pose.ax, v.pose.ay, v.shape.w, v.shape.h);
  }

  boxAt(id: PieceId, at: At): Rect | null {
    const shape = this.shapeOf(id);
    if (!shape) return null;
    return this.host.layout().grid.pieceRect(at.x, at.y, shape.w, shape.h);
  }

  cellRect(x: number, y: number): Rect {
    return this.host.layout().grid.cellRect(x, y);
  }

  pieceColor(id: PieceId): number {
    const s = this.host.state();
    const code = s ? COLOR_CODES[pieceColor(s, id)] : undefined;
    return code ? hexColor(TOKENS.color.block[code]) : WHITE;
  }

  colorOf(code: string): number {
    if (code.startsWith('#')) return hexColor(code);
    const hex = (TOKENS.color.block as Readonly<Record<string, string>>)[code];
    return hex ? hexColor(hex) : WHITE;
  }

  siteColors(): readonly number[] {
    const s = this.host.state();
    const lvl = this.host.level();
    if (!s || !lvl) return [];
    const out = new Set<number>();
    const plan = lvl.segments[Math.min(visibleSegment(s), lvl.segments.length - 1)];
    for (const v of plan?.planColors ?? []) {
      if (v === PLAN_DOT || v === PLAN_OUTSIDE) continue;
      const code: ColorCode | undefined = COLOR_CODES[v];
      if (code) out.add(hexColor(TOKENS.color.block[code]));
    }
    return [...out];
  }

  queueCount(): number {
    const s = this.host.state();
    return s ? hdr(s, H.queueLen) : 0;
  }

  chipPoint(): Point {
    return this.host.strip.chipPoint();
  }

  trowelPoint(): Point {
    return this.host.strip.trowelPoint();
  }

  beadPoint(index: number): Point {
    return this.host.strip.beadPoint(index);
  }

  movesPoint(): Point {
    return this.host.moves.point();
  }

  levelNumber(): number {
    return this.host.levelNumber();
  }

  // --- JuiceStage: pieces ------------------------------------------------------------------------------------------------

  beginLift(id: PieceId, time: number, scale: number, hopPx: number, ms: number, ease: Ease): void {
    this.host.pieces.view(id)?.beginDrag(time, { scale, ms, ease, hopPx });
  }

  pieceTrack(
    id: PieceId,
    time: number,
    legs: readonly LegSpec[],
    opts: { readonly flying?: boolean; readonly hideAtEnd?: boolean } = {},
  ): void {
    const v = this.host.pieces.view(id);
    if (!v) return;
    const from: Pose = v.track ? v.track.at(time) : v.pose;
    const track = new Track(from, time);
    for (const leg of legs) track.to(leg);
    v.track = track;
    v.hideAtEnd = opts.hideAtEnd ?? false;
    v.setFlying(opts.flying ?? false);
  }

  pieceSquash(id: PieceId, time: number, sx: number, sy: number, ms: number, ease: Ease): void {
    const v = this.host.pieces.view(id);
    if (!v) return;
    this.fx.add({
      start: time,
      ms,
      ease,
      cls: 'board',
      owner: v,
      channel: 'squash',
      apply: (k) => {
        v.squashX = sx + (1 - sx) * k;
        v.squashY = sy + (1 - sy) * k;
      },
    });
  }

  pieceFlash(id: PieceId, time: number, color: number, peak: number, ms: number, sweep: boolean): void {
    const v = this.host.pieces.view(id);
    if (!v) return;
    const add = color === WHITE;
    this.fx.add({
      start: time,
      ms,
      cls: 'board',
      owner: v,
      channel: 'flash',
      apply: (_k, u) => v.setFlash(color, peak * pulse01(u), add, sweep ? easeOf(JUICE[12].ease)(u) : 1),
      end: () => v.clearFlash(),
    });
  }

  pieceShake(id: PieceId, time: number, px: number, cycles: number, ms: number): void {
    if (this.fx.instantBoard) return;
    this.host.pieces.view(id)?.startShake(time, ms, px, cycles);
  }

  pieceNudge(id: PieceId, time: number, dx: number, dy: number, ms: number, ease: Ease): void {
    const v = this.host.pieces.view(id);
    if (!v) return;
    this.fx.add({
      start: time,
      ms,
      ease,
      cls: 'board',
      owner: v,
      channel: 'nudge',
      apply: (k) => {
        v.nudgeX = dx * (1 - k);
        v.nudgeY = dy * (1 - k);
      },
    });
  }

  pieceTilt(id: PieceId, deg: number): void {
    const v = this.host.pieces.view(id);
    if (v) v.tiltDeg = deg;
  }

  trail(id: PieceId, time: number, frames: number, alpha: number, tint: number | null, ms: number): void {
    if (this.fx.instantBoard) return;
    const v = this.host.pieces.view(id);
    if (v) this.trailFx.begin(v, time, frames, alpha, tint, ms, tint !== null);
  }

  tether(id: PieceId, finger: Point | null, leanDeg: number): void {
    const v = this.host.pieces.view(id);
    if (!finger || !v?.shape) {
      for (const d of this.dots) if (d.visible) d.setVisible(false);
      return;
    }
    const box = this.pieceBox(id);
    if (!box) return;
    const cx = box.x + box.w / 2;
    const cy = box.y + box.h / 2;
    const n = this.dots.length;
    const tint = hexColor(TOKENS.color.ui.inkOnDark);
    for (let i = 0; i < n; i++) {
      const k = (i + 1) / (n + 1);
      const d = this.dots[i];
      if (!d) continue;
      d.setPosition(cx + (finger.x - cx) * k, cy + (finger.y - cy) * k)
        .setDisplaySize(V.tetherDotPx, V.tetherDotPx)
        .setTint(tint)
        .setAlpha(0.85)
        .setVisible(true);
    }
    v.tiltDeg = leanDeg;
  }

  shadowKind(id: PieceId, kind: 'lifted' | 'crane', time: number, ms: number, ease: Ease): void {
    this.host.pieces.view(id)?.setShadowKind(kind, time, ms, ease);
  }

  // --- JuiceStage: board -------------------------------------------------------------------------------------------------

  boardRefresh(): void {
    this.resync(false);
  }

  frontShift(time: number, ms: number, ease: Ease): void {
    this.at(time, () => {
      this.refreshSite();
      const imgs = this.host.board.frontImages;
      if (ms <= 0) return;
      for (const img of imgs) img.setAlpha(0);
      this.fx.add({
        start: time,
        ms,
        ease,
        cls: 'board',
        owner: this.host.board,
        channel: 'front',
        apply: (k) => {
          for (const img of imgs) img.setAlpha(k);
        },
      });
    });
  }

  supportFlash(cells: readonly At[], time: number, ms: number, blinks: number): void {
    this.at(time, () => {
      const imgs = this.host.board.supportHatch(this.host.layout(), cells);
      // the baked frame carries `alpha.supportHatch` (and its ink line) already: full image alpha at the peak
      const top = 1;
      this.fx.add({
        start: time,
        ms,
        cls: 'free',
        apply: (_k, u) => {
          const a = blinks > 0 ? top * Math.abs(Math.sin(blinks * Math.PI * u)) : top;
          for (const img of imgs) img.setAlpha(u >= 1 ? 0 : a);
        },
        end: () => {
          for (const img of imgs) img.setVisible(false);
        },
      });
    });
  }

  railGlow(gap: number, time: number, ms: number, flow: boolean): void {
    const rails = this.host.board.railsOf(gap);
    if (rails.length === 0) return;
    const imgs = this.host.board.glowImages(rails.length * 2);
    const px = FRAME.whitePixel;
    rails.forEach((r, i) => {
      const glow = imgs[i * 2];
      const spot = imgs[i * 2 + 1];
      if (glow) {
        glow.setTexture(BOOT_ATLAS_KEY, px).setOrigin(0, 0).setPosition(r.x, r.y).setDisplaySize(r.w, r.h);
        glow
          .setTint(WHITE)
          .setBlendMode(Phaser.BlendModes.ADD)
          .setDepth(RAIL_GLOW_DEPTH)
          .setAlpha(0)
          .setVisible(true);
      }
      if (spot) {
        spot
          .setTexture(BOOT_ATLAS_KEY, px)
          .setOrigin(0.5, 0)
          .setDisplaySize(r.h * 4, r.h);
        spot
          .setTint(WHITE)
          .setBlendMode(Phaser.BlendModes.ADD)
          .setDepth(RAIL_GLOW_DEPTH + 0.5)
          .setAlpha(0);
        spot.setVisible(flow);
      }
    });
    this.fx.add({
      start: time,
      ms,
      cls: 'free',
      apply: (k, u) => {
        rails.forEach((r, i) => {
          imgs[i * 2]?.setAlpha(0.6 * pulse01(u));
          if (flow) imgs[i * 2 + 1]?.setPosition(r.x + r.w * k, r.y).setAlpha(0.9 * (1 - u));
        });
      },
      end: () => {
        for (const img of imgs) img.setVisible(false);
      },
    });
  }

  clamps(id: PieceId, time: number, ms: number, pop: boolean): void {
    const v = this.host.pieces.view(id);
    if (!v?.shape) return;
    const pose = v.track ? v.track.final : v.pose;
    const box = this.host.layout().grid.pieceRect(pose.ax, pose.ay, v.shape.w, v.shape.h);
    const imgs = this.host.board.clampImages(box);
    const ease = easeOf(JUICE[23].ease);
    const hold = ms + 3 * D.clamp;
    this.fx.add({
      start: time,
      ms: hold + D.clamp,
      cls: 'free',
      apply: (_k, u) => {
        const t = u * (hold + D.clamp);
        const s = pop && t < ms ? ease(t / ms) : 1;
        const a = t <= hold ? 1 : 1 - (t - hold) / D.clamp;
        for (const img of imgs) img.setScale(s).setAlpha(a);
      },
      end: () => {
        for (const img of imgs) img.setVisible(false);
      },
    });
  }

  segmentDone(
    time: number,
    ms: number,
    reduced: boolean,
    seg: number,
    toSeg: number | null,
    ease: Ease,
  ): void {
    const host = this.host;
    const board = host.board;
    const fade = Math.min(D.scaffoldFade, ms);
    const doneAlpha = TOKENS.alpha.segmentDoneScaffold;
    this.drive(time, fade, linear, (k) => board.setScaffoldAlpha(1 + (doneAlpha - 1) * k), true);
    const siteViews = [...host.pieces.views()].filter((v) => v.pose.ax >= SITE_X - 0.01 && !v.isDragged);
    if (!reduced) {
      for (const v of siteViews) {
        this.fx.add({
          start: time,
          ms: fade,
          cls: 'board',
          owner: v,
          channel: 'flash',
          apply: (_k, u) => v.setFlash(WHITE, V.segmentFlashPeak * pulse01((u * V.segmentFlashes) % 1), true),
          end: () => v.clearFlash(),
        });
      }
    }
    if (toSeg === null) {
      this.drive(time + ms, 0, linear, () => host.panoramaRedraw(), true);
      return;
    }
    const slideStart = reduced ? time : time + fade;
    const slideMs = reduced ? ms : ms - fade;
    this.at(slideStart, () => {
      const s = host.state();
      if (!s) return;
      const layout = host.layout();
      this.fx.finishOwner(board);
      const out = new ImageGroup(board.detachSite());
      board.refreshSite(layout, s);
      const inc = new ImageGroup([...board.siteImages]);
      const site = layout.board.site;
      const pivotX = site.x + site.w / 2;
      const pivotY = site.y + site.h / 2;
      const slot = host.panoramaSlot(seg);
      const scale = slot ? slot.w / site.w : 0.1;
      const tx = slot ? slot.x + slot.w / 2 - pivotX : 0;
      const ty = slot ? slot.y + slot.h - (site.y + site.h) * scale - (pivotY - pivotY * scale) : 0;
      const enterDx = layout.W - site.x;
      const apply = (k: number, u: number): void => {
        if (reduced) {
          const outA = Math.max(0, 1 - 2 * u);
          const inA = Math.max(0, 2 * u - 1);
          out.apply(pivotX, pivotY, 1, 0, 0, outA);
          inc.apply(pivotX, pivotY, 1, 0, 0, inA);
          for (const v of siteViews) v.xf = { px: pivotX, py: pivotY, scale: 1, dx: 0, dy: 0, alpha: outA };
          return;
        }
        const sc = 1 + (scale - 1) * k;
        const a = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3;
        out.apply(pivotX, pivotY, sc, tx * k, ty * k, a);
        for (const v of siteViews)
          v.xf = { px: pivotX, py: pivotY, scale: sc, dx: tx * k, dy: ty * k, alpha: a };
        inc.apply(pivotX, pivotY, 1, enterDx * (1 - k), 0, 1);
      };
      apply(0, 0);
      this.fx.add({
        start: slideStart,
        ms: slideMs,
        ease: reduced ? linear : ease,
        cls: 'board',
        apply,
        end: () => {
          board.releaseOutgoing();
          inc.restore();
          for (const v of siteViews) v.xf = null;
          board.setScaffoldAlpha(1);
          host.pieces.sync(s);
          host.panoramaRedraw();
        },
      });
    });
  }

  truck(time: number, ms: number, reduced: boolean, drops: readonly Drop[]): void {
    const host = this.host;
    const s = host.state();
    if (!s) return;
    const added = host.pieces.sync(s);
    for (const id of added) {
      if (drops.some((d) => d.pieceId === id)) continue;
      const v = host.pieces.view(id);
      if (v) v.pose = { ...v.pose, alpha: 0 }; // a queued block comes out of the chip later (#20)
    }
    const ph = TOKENS.physics;
    for (const d of drops) {
      const v = host.pieces.view(d.pieceId);
      if (!v) continue;
      const leg = fallLeg(d.rows, ph.yardFallAccel, ph.yardFallMax);
      const track = new Track({ ax: d.from.x, ay: d.from.y, scale: 1, alpha: 0 }, time)
        .wait(d.delay)
        .to({ ax: d.from.x, ay: d.from.y, ms: 0, alpha: 1 })
        .to({ ax: d.to.x, ay: d.to.y, ms: d.ms, ease: leg.ease });
      v.pose = track.at(this.now);
      v.track = track;
      v.hideAtEnd = false;
    }
    // the truck body: in from the right over the crane area, bed tipped while blocks drop, out to the left
    const layout = host.layout();
    const crane = layout.board.crane;
    const yard = layout.board.yard;
    const y = crane.y + crane.h / 2 - TRUCK_H / 4;
    const parkX = yard.x + yard.w / 2;
    const inX = layout.W + TRUCK_W / 2;
    const outX = -TRUCK_W / 2;
    const enter = Math.min(V.truckEnterMs, ms);
    const exit = Math.min(V.truckExitMs, ms - enter);
    const back = easeOf(TOKENS.easing.pop);
    const moveIn = easeOf(TOKENS.easing.moveIn);
    this.drive(
      time,
      ms,
      linear,
      (_k, u) => {
        const tms = u * ms;
        if (u >= 1) {
          this.truckView.hide();
          return;
        }
        if (reduced) {
          const fade = D.reducedFade;
          const a = tms < fade ? tms / fade : tms > ms - fade ? (ms - tms) / fade : 1;
          this.truckView.setPose(parkX, y, -12, Math.max(0.01, a));
          return;
        }
        let x = parkX;
        let bed = -18;
        if (tms < enter) {
          x = inX + (parkX - inX) * back(tms / enter);
          bed = 0;
        } else if (tms > ms - exit) {
          x = parkX + (outX - parkX) * moveIn((tms - (ms - exit)) / exit);
          bed = 0;
        }
        this.truckView.setPose(x, y, bed, 1);
      },
      true,
    );
  }

  chipDrops(time: number, drops: readonly Drop[], ease: Ease, reduced: boolean): void {
    const host = this.host;
    const s = host.state();
    if (!s) return;
    host.pieces.sync(s);
    for (const d of drops) {
      const v = host.pieces.view(d.pieceId);
      if (!v) continue;
      const start = reduced
        ? { ax: d.to.x, ay: d.to.y }
        : (this.anchorAt(d.pieceId, this.chipPoint()) ?? { ax: d.to.x, ay: d.to.y });
      const track = new Track({ ...start, scale: reduced ? 1 : V.queueShrink, alpha: 0 }, time)
        .wait(d.delay)
        .to({ ax: d.to.x, ay: d.to.y, ms: d.ms, ease, scale: 1, alpha: 1 });
      v.pose = track.at(this.now);
      v.track = track;
      v.hideAtEnd = false;
      v.setFlying(true);
    }
  }

  trowelFill(cell: At, time: number, flyMs: number, sweepMs: number, reduced: boolean): void {
    this.refreshSite();
    const img = this.host.board.trowelImage(cell.x, cell.y);
    const r = this.cellRect(cell.x, cell.y);
    const fw = img ? img.frame.realWidth : 0;
    const fh = img ? img.frame.realHeight : 0;
    if (img) {
      if (reduced) img.setAlpha(0);
      else img.setCrop(0, 0, 0, fh);
    }
    if (!reduced && flyMs > 0) {
      const from = this.trowelPoint();
      const tx = r.x + r.w / 2;
      const ty = r.y + r.h / 2;
      const arc = V.trowelArcCells * r.h;
      const ease = easeOf(JUICE[17].ease);
      this.flyer.setPosition(from.x, from.y).setVisible(true);
      this.fx.add({
        start: time,
        ms: flyMs + sweepMs,
        cls: 'board',
        apply: (_k, u) => {
          const tms = u * (flyMs + sweepMs);
          if (tms <= flyMs) {
            const f = ease(tms / flyMs);
            const lift = arc * 4 * f * (1 - f);
            this.flyer.setPosition(from.x + (tx - from.x) * f, from.y + (ty - from.y) * f - lift).setAlpha(1);
          } else {
            // plaster stroke: the trowel crosses the cell left → right while the colour opens
            const k = (tms - flyMs) / sweepMs;
            this.flyer.setPosition(r.x + r.w * k, ty).setAlpha(1 - k);
          }
        },
        end: () => this.flyer.setVisible(false),
      });
    }
    if (!img) return;
    this.fx.add({
      start: time + flyMs,
      ms: sweepMs,
      cls: 'board',
      owner: this.host.board,
      channel: 'trowel',
      apply: (k) => {
        if (reduced) img.setAlpha(k);
        else img.setCrop(0, 0, fw * k, fh);
      },
      end: () => {
        img.setCrop();
        img.setAlpha(1);
      },
    });
  }

  boardDim(alpha: number, time: number, ms: number): void {
    this.at(time, () => {
      const img = this.host.board.dimLayer(this.host.layout());
      if (!img) return;
      this.fx.add({ start: time, ms, cls: 'free', apply: (k) => img.setAlpha(alpha * k) });
    });
  }

  boardFadeIn(time: number, ms: number): void {
    this.at(time, () => this.scene.cameras.main.fadeIn(ms));
  }

  // --- JuiceStage: HUD ---------------------------------------------------------------------------------------------------

  movesSet(n: number): void {
    this.host.moves.set(n);
  }

  movesRoll(n: number, time: number, ms: number, ease: Ease): void {
    const m = this.host.moves;
    this.fx.add({
      start: time,
      ms,
      ease,
      cls: 'board',
      owner: m,
      channel: 'roll',
      apply: (k) => m.rollTo(n, k, V.movesRollPx),
      end: () => m.set(n),
    });
  }

  movesDanger(on: boolean, pulse: boolean, time: number): void {
    this.at(time, () => this.host.moves.setDanger(on, pulse, time));
  }

  movesBump(time: number, peak: number, ms: number, _ease: Ease): void {
    const m = this.host.moves;
    this.fx.add({
      start: time,
      ms,
      cls: 'board',
      owner: m,
      channel: 'bump',
      apply: (_k, u) => m.setBump(popCurve(u, 1, peak, 1, 0.4)),
      end: () => m.setBump(1),
    });
  }

  movesChips(from: Point, count: number, time: number, stagger: number, ms: number, ease: Ease): void {
    const to = this.movesPoint();
    for (let i = 0; i < Math.min(count, this.chips.length); i++) {
      const chip = this.chips[i];
      if (!chip) continue;
      const start = time + i * stagger;
      chip.setPosition(from.x, from.y).setAlpha(0).setVisible(true);
      this.fx.add({
        start,
        ms,
        ease,
        cls: 'free',
        apply: (k) => {
          const lift = 80 * 4 * k * (1 - k);
          chip.setPosition(from.x + (to.x - from.x) * k, from.y + (to.y - from.y) * k - lift).setAlpha(1);
        },
        end: () => chip.setVisible(false),
      });
    }
  }

  streakSet(n: number): void {
    this.host.strip.setStreak(n);
  }

  streakPip(index: number, time: number, from: number, peak: number, ms: number, _ease: Ease): void {
    const strip = this.host.strip;
    this.at(time, () => strip.setStreak(index + 1));
    this.fx.add({
      start: time,
      ms,
      cls: 'board',
      owner: strip,
      channel: `pip${index}`,
      apply: (_k, u) => strip.setBeadScale(index, popCurve(u, from, peak, 1, 0.5)),
      end: () => strip.setBeadScale(index, 1),
    });
  }

  trowelsSet(n: number): void {
    const strip = this.host.strip;
    strip.setTrowels(n);
    if (n <= 0) strip.setTrowelPop(1, 0);
  }

  trowelPop(time: number, peak: number, rest: number, ms: number, _ease: Ease): void {
    const strip = this.host.strip;
    this.fx.add({
      start: time,
      ms,
      cls: 'board',
      owner: strip,
      channel: 'trowel',
      apply: (_k, u) => strip.setTrowelPop(popCurve(u, 1, peak, rest, 0.35), 0.8 * pulse01(u)),
      end: () => strip.setTrowelPop(rest, 0),
    });
  }

  queueSet(n: number): void {
    this.host.strip.setQueue(n);
  }

  chipBump(time: number, peak: number, ms: number, _ease: Ease): void {
    const strip = this.host.strip;
    this.fx.add({
      start: time,
      ms,
      cls: 'board',
      owner: strip,
      channel: 'chip',
      apply: (_k, u) => strip.setChipScale(popCurve(u, 1, peak, 1, 0.4)),
      end: () => strip.setChipScale(1),
    });
  }

  banner(
    key: 'win.title' | 'lose.title',
    time: number,
    ms: number,
    mode: 'pop' | 'drop' | 'fade',
    ease: Ease,
  ): void {
    const text = this.bannerText(key);
    const b = this.boardRect();
    const x = b.x + b.w / 2;
    const y = b.y + b.h * 0.38;
    const banner = text;
    banner
      .setPosition(x, y)
      .setScale(mode === 'pop' ? 0 : 1)
      .setAlpha(mode === 'fade' ? 0 : 1)
      .setVisible(false);
    this.at(time, () => banner.setVisible(true));
    this.fx.add({
      start: time,
      ms,
      ease,
      cls: 'free',
      apply: (k, u) => {
        if (mode === 'pop') banner.setScale(popCurve(u, 0, V.winTitlePeak, 1, 0.6));
        else if (mode === 'drop') banner.setPosition(x, b.y - 160 + (y - b.y + 160) * k);
        else banner.setAlpha(u);
      },
    });
  }

  siteGlow(time: number, ms: number): void {
    for (const v of this.host.pieces.views()) {
      if (v.pose.ax < SITE_X - 0.01) continue;
      this.fx.add({
        start: time,
        ms,
        cls: 'board',
        owner: v,
        channel: 'flash',
        apply: (_k, u) => v.setFlash(WHITE, V.flashPeak * pulse01(u), true),
        end: () => v.clearFlash(),
      });
    }
  }

  ribbonCut(time: number, ms: number, reduced: boolean): void {
    const site = this.host.layout().board.site;
    const y = site.y + site.h * 0.45;
    const left = site.x - 30;
    const mid = site.x + site.w / 2;
    const right = site.x + site.w + 30;
    const gold = hexColor(TOKENS.color.ui.gold);
    const px = FRAME.whitePixel;
    const halves = this.ribbon;
    halves.forEach((img, i) => {
      img.setTexture(BOOT_ATLAS_KEY, px).setTint(gold).setDepth(DEPTH.effects).setAngle(0);
      if (i === 0)
        img
          .setOrigin(0, 0.5)
          .setPosition(left, y)
          .setDisplaySize(mid - left, RIBBON_PX);
      else
        img
          .setOrigin(1, 0.5)
          .setPosition(right, y)
          .setDisplaySize(right - mid, RIBBON_PX);
      img.setAlpha(0).setVisible(false);
    });
    const [l, r] = halves;
    if (!l || !r) return;
    const lw = mid - left;
    const rw = right - mid;
    this.at(time, () => {
      l.setVisible(true);
      r.setVisible(true);
    });
    this.fx.add({
      start: time,
      ms,
      cls: 'board',
      apply: (_k, u) => {
        if (reduced) {
          const a = u < 0.5 ? u * 2 : 2 - u * 2;
          l.setAlpha(a);
          r.setAlpha(a);
          return;
        }
        if (u < 0.4) {
          // the ribbon is stretched across the site
          const k = u / 0.4;
          l.setAlpha(1).setDisplaySize(lw * k, RIBBON_PX);
          r.setAlpha(1).setDisplaySize(rw * k, RIBBON_PX);
          return;
        }
        if (u < 0.55) return; // held taut, then cut in the middle
        const k = (u - 0.55) / 0.45;
        l.setDisplaySize(lw, RIBBON_PX)
          .setAngle(28 * k)
          .setPosition(left, y + 140 * k * k)
          .setAlpha(1 - k);
        r.setDisplaySize(rw, RIBBON_PX)
          .setAngle(-28 * k)
          .setPosition(right, y + 140 * k * k)
          .setAlpha(1 - k);
      },
      end: () => {
        l.setVisible(false);
        r.setVisible(false);
      },
    });
  }

  coinFly(time: number, ms: number, ease: Ease): void {
    const coin = this.coins.find((c) => !c.visible) ?? this.coins[0];
    if (!coin) return;
    const from = this.movesPoint();
    const b = this.boardRect();
    const to = { x: b.x + b.w / 2, y: b.y + b.h * 0.38 + 140 };
    coin.setPosition(from.x, from.y).setVisible(false);
    this.at(time, () => coin.setVisible(true).setAlpha(1));
    this.fx.add({
      start: time,
      ms,
      ease,
      cls: 'free',
      apply: (k) =>
        coin.setPosition(from.x + (to.x - from.x) * k, from.y + (to.y - from.y) * k - 160 * 4 * k * (1 - k)),
      end: () => coin.setVisible(false),
    });
  }

  /**
   * JUICE #87 / UX §1 `resume.strip` (review Faz 2 tur 1 #7): a cream pill (`ui.panel`, `radius.chip`, 96 px high,
   * 32 px side pad) with `ui.ink` text (12.5:1) in the crane band, ABOVE the window dim (`DEPTH.windows` + 5) — the
   * Pause window it comes with is bottom-anchored, so they never overlap.
   */
  toast(key: 'resume.strip', params: { readonly n: number }, time: number, ms: number): void {
    let root = this.toastRoot;
    let text = this.toastText;
    let bg = this.toastBg;
    if (!root || !text || !bg) {
      bg = addBakedGraphics(this.scene);
      text = this.scene.add.text(0, 0, '', textStyle('body', TOKENS.color.ui.ink)).setOrigin(0.5);
      root = this.scene.add
        .container(0, 0, [bg, text])
        .setDepth(DEPTH.windows + 5)
        .setVisible(false);
      this.toastRoot = root;
      this.toastText = text;
      this.toastBg = bg;
    }
    text.setText(t(key, params));
    const h = V.toastH;
    const w = Math.ceil(text.width) + 2 * V.toastPadPx;
    bg.clear()
      .fillStyle(hexColor(TOKENS.color.ui.panelShadow), 1)
      .fillRoundedRect(-w / 2, -h / 2 + TOKENS.shadow.panelLipPx / 2, w, h, TOKENS.radius.chip)
      .fillStyle(hexColor(TOKENS.color.ui.panel), 1)
      .fillRoundedRect(-w / 2, -h / 2, w, h, TOKENS.radius.chip);
    const crane = this.host.layout().board.crane;
    const toast = root.setPosition(crane.x + crane.w / 2, crane.y + crane.h / 2).setAlpha(0);
    this.at(time, () => toast.setVisible(true));
    const fade = D.reducedFade;
    this.fx.add({
      start: time,
      ms,
      cls: 'free',
      apply: (_k, u) => {
        const tms = u * ms;
        toast.setAlpha(tms < fade ? tms / fade : tms > ms - fade ? Math.max(0, (ms - tms) / fade) : 1);
      },
      end: () => toast.setVisible(false),
    });
  }

  /** A view leaves the board: its animations and trail end first. */
  viewReleased(v: PieceView): void {
    this.fx.finishOwner(v);
    this.trailFx.stop(v);
  }
}
