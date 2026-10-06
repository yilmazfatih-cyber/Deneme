/**
 * What a JUICE handler may do (docs/TECH_DESIGN.md §6.3 "Sahne tarafı"). Types only: handlers.ts is pure and talks to
 * this interface; the Phaser EventPlayer implements it (and tests implement a recording fake). Every time is the
 * scene's animation clock (ms); every position is in design px.
 *
 * Board-changing calls (`piece*`, `frontShift`, `segmentDone`, `truck`, `trowelFill`, `boardRefresh`) are completed at
 * once while the EventPlayer fast-forwards (R-12); sounds, haptics, particles, the support hatch and HUD pulses keep
 * their own pace.
 */
import type { At, GameEvent, PieceId } from '../../../core/types.ts';
import type { HapticName } from '../../../services/haptics.ts';
import type { SoundName } from '../../../services/audio.ts';
import type { Rect } from '../../../theme/layout.ts';
import type { Ease, LegSpec } from '../motion.ts';
import type { JuiceId, ParticleFamily } from './catalog.ts';
import type { Drop, GravityBuild } from './plan.ts';

/** Continuous board anchor (motion.ts Pose without scale / alpha). */
export interface Anchor {
  readonly ax: number;
  readonly ay: number;
}

export interface Point {
  readonly x: number;
  readonly y: number;
}

/** A display object a window / button handler animates (Phaser GameObjects with Transform + Alpha fit). */
export interface Tweenable {
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  alpha: number;
}

export type TweenProps = Partial<Pick<Tweenable, 'x' | 'y' | 'scaleX' | 'scaleY' | 'alpha'>>;

/** #69 button: a raised button whose lip (`shadow.buttonLipPx` → `buttonPressedLipPx`) can be set. */
export interface ButtonTarget extends Tweenable {
  setLip(px: number): void;
}

/** #70 / #71 / #52 window: dim layer, panel, option buttons, the "+5" chip (#52). */
export interface WindowTarget {
  readonly dim: Tweenable | null;
  readonly panel: Tweenable;
  readonly options?: readonly Tweenable[];
  readonly chip?: Tweenable | null;
}

/** #58 heart: its fill drains bottom → top (`k` 0 = full red, 1 = grey). */
export interface HeartTarget {
  setDrain(k: number): void;
}

/** One cue as a handler sees it. */
export interface JuiceCue {
  readonly id: JuiceId;
  /** Scheduled start (animation clock). */
  readonly time: number;
  /** Duration for the current motion mode (catalogue or plan). */
  readonly ms: number;
  /** "Animasyonları azalt" (JUICE §0 rule 8). */
  readonly reduced: boolean;
  /** Played by a fast-forward (R-12): board results at once, no continuous sounds. */
  readonly instant: boolean;
  readonly ev: GameEvent | null;
  readonly piece: PieceId | null;
  /** #2: the blocks that hold the picked one (they flash). */
  readonly pieces?: readonly PieceId[];
  /** #10: gravity profile of the level (JUICE §0.1). */
  readonly gravity?: GravityBuild;
  /** Event-specific number (see plan.ts `MoveCue.n`; drag cues: see EventPlayer). */
  readonly n?: number;
  readonly first?: boolean;
  readonly flag?: boolean;
  readonly toSeg?: number | null;
  readonly drops?: readonly Drop[];
  readonly cells?: readonly At[];
  /** Drag cues: direction / speed (#3 cells/s, #4 push direction). */
  readonly dx?: number;
  readonly dy?: number;
  /** UI cues. */
  readonly button?: ButtonTarget;
  readonly window?: WindowTarget;
  readonly heart?: HeartTarget;
  /** #53 chips start here; #87 variant. */
  readonly from?: Point;
  readonly variant?: 'press' | 'release' | 'pause' | 'offer' | 'void';
}

export interface SoundOptions {
  readonly rate?: number;
  /** Linear gain multiplier. */
  readonly gain?: number;
  /** Start time (animation clock); default now. */
  readonly at?: number;
}

export interface BurstOptions {
  readonly w?: number;
  readonly h?: number;
  readonly colors?: readonly number[];
  readonly dir?: number;
  /** Start time (animation clock); default now. */
  readonly at?: number;
}

export interface JuiceStage {
  // --- feedback
  sound(name: SoundName, opts?: SoundOptions): void;
  haptic(name: HapticName, at?: number): void;
  burst(family: ParticleFamily, count: number, at: Point, opts?: BurstOptions): void;
  /** Screen shake (JUICE §0 rule 5: only the segment completion and glass breaking). */
  shake(px: number, time: number, ms: number): void;
  /** A generic animation: `apply(k)` with eased progress (`board` = completed by a fast-forward). */
  drive(time: number, ms: number, ease: Ease, apply: (k: number, u: number) => void, board: boolean): void;
  /** A generic property tween of a display object (windows, buttons). */
  tween(target: Tweenable, to: TweenProps, time: number, ms: number, ease: Ease, from?: TweenProps): void;
  ease(name: string): Ease;

  // --- geometry
  /** Board rect (rows 0–7, yard + wall + site) and the whole design canvas. */
  boardRect(): Rect;
  screenRect(): Rect;
  /** Where a piece rests in the state (board anchor), its current drawn anchor, and the anchor whose box centre is `p`. */
  restAnchor(id: PieceId): Anchor | null;
  pieceAnchor(id: PieceId): Anchor | null;
  anchorAt(id: PieceId, p: Point): Anchor | null;
  /** Box of a piece at its current pose (null when it has no view). */
  pieceBox(id: PieceId): Rect | null;
  /** Box a piece would have at board anchor `at` (yard / site At, board coordinates). */
  boxAt(id: PieceId, at: At): Rect | null;
  cellRect(x: number, y: number): Rect;
  /** Block colour (0xRRGGBB) of a piece / a colour code. */
  pieceColor(id: PieceId): number;
  colorOf(code: string): number;
  /** Colours of the segment shown on the site (#18 confetti). */
  siteColors(): readonly number[];
  /** Blocks in the truck queue now (K-26). */
  queueCount(): number;
  /** HUD anchors. */
  chipPoint(): Point;
  trowelPoint(): Point;
  beadPoint(index: number): Point;
  movesPoint(): Point;

  // --- pieces
  beginLift(id: PieceId, time: number, scale: number, hopPx: number, ms: number, ease: Ease): void;
  /** Legs from the piece's current pose (motion.ts Track). */
  pieceTrack(
    id: PieceId,
    time: number,
    legs: readonly LegSpec[],
    opts?: { readonly flying?: boolean; readonly hideAtEnd?: boolean; readonly fromBox?: At | null },
  ): void;
  pieceSquash(id: PieceId, time: number, sx: number, sy: number, ms: number, ease: Ease): void;
  /** Colour flash over the block (`sweep`: the flash opens left → right with `setCrop`). */
  pieceFlash(id: PieceId, time: number, color: number, peak: number, ms: number, sweep: boolean): void;
  pieceShake(id: PieceId, time: number, px: number, cycles: number, ms: number): void;
  pieceNudge(id: PieceId, time: number, dx: number, dy: number, ms: number, ease: Ease): void;
  /** Tilt of the dragged block (deg). */
  pieceTilt(id: PieceId, deg: number): void;
  /** Ghost trail of a piece for `ms` (`tint` null = the block itself, else a colour fill). */
  trail(id: PieceId, time: number, frames: number, alpha: number, tint: number | null, ms: number): void;
  /** #4 tether: dotted line from the block to the finger; null hides it. */
  tether(id: PieceId, finger: Point | null, leanDeg: number): void;
  shadowKind(id: PieceId, kind: 'lifted' | 'crane', time: number, ms: number, ease: Ease): void;

  // --- board
  /** Site, build front, pieces and HUD re-read from the state. */
  boardRefresh(): void;
  /** #83: the build front crossfades to its new cells. */
  frontShift(time: number, ms: number, ease: Ease): void;
  supportFlash(cells: readonly At[], time: number, ms: number, blinks: number): void;
  railGlow(gap: number, time: number, ms: number, flow: boolean): void;
  clamps(id: PieceId, time: number, ms: number, pop: boolean): void;
  segmentDone(time: number, ms: number, reduced: boolean, toSeg: number | null, ease: Ease): void;
  truck(time: number, ms: number, reduced: boolean, drops: readonly Drop[]): void;
  /** #20: blocks leave the queue chip and fly to the yard. */
  chipDrops(time: number, drops: readonly Drop[], ease: Ease, reduced: boolean): void;
  trowelFill(cell: At, time: number, flyMs: number, sweepMs: number, reduced: boolean): void;
  /** #57: the board darkens. */
  boardDim(alpha: number, time: number, ms: number): void;
  /** #87: the board appears with its saved state. */
  boardFadeIn(time: number, ms: number): void;

  // --- HUD
  movesSet(n: number): void;
  movesRoll(n: number, time: number, ms: number, ease: Ease): void;
  movesDanger(on: boolean, pulse: boolean, time: number): void;
  movesBump(time: number, peak: number, ms: number, ease: Ease): void;
  /** #53 chips flying from `from` to the counter. */
  movesChips(from: Point, count: number, time: number, stagger: number, ms: number, ease: Ease): void;
  streakSet(n: number): void;
  streakPip(index: number, time: number, from: number, peak: number, ms: number, ease: Ease): void;
  trowelsSet(n: number): void;
  trowelPop(time: number, peak: number, rest: number, ms: number, ease: Ease): void;
  queueSet(n: number): void;
  chipBump(time: number, peak: number, ms: number, ease: Ease): void;
  /** Title banner (`win.title` / `lose.title`): `pop` 0 → peak → 1, `drop` from the top, `fade`. */
  banner(key: 'win.title' | 'lose.title', time: number, ms: number, mode: 'pop' | 'drop' | 'fade', ease: Ease): void;
  /** #55 step (1): the site blocks glow. */
  siteGlow(time: number, ms: number): void;
  /** #55 step (2): the ribbon over the site is cut. */
  ribbonCut(time: number, ms: number, reduced: boolean): void;
  /** #56: one coin from the moves counter to the reward point. */
  coinFly(time: number, ms: number, ease: Ease): void;
  /** #87: `resume.strip` toast for `ms`. */
  toast(key: 'resume.strip', params: { readonly n: number }, time: number, ms: number): void;
  /** Level number (resume toast). */
  levelNumber(): number;
}

export type JuiceHandler = (cue: JuiceCue, stage: JuiceStage) => void;
