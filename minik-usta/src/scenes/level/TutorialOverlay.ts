/**
 * Tutorial view (UX_FLOWS §13.1 "Öğretici dili"; TECH_DESIGN §10.2 "spot ışığı 4 dikdörtgen + 4 çeyrek daire", JUICE §0
 * rule 11: no mask, no filter). It draws what `TutorialController.current` (and a `tut.ctx.*` tip) says:
 *
 * - Spotlight: `ui.overlay` at `alpha.tutorialOverlay` (required step) or `alpha.tutorialSoftOverlay` (soft step) around
 *   rounded holes (12 px pad) over the highlighted things; a 6 px white edge pulses every `duration.spotlightPulse`.
 *   Required step: touches outside the holes are swallowed (invisible zones over the dark parts) — except on the pause
 *   button (review Faz 2 tur 2 #9: the Pause window, its settings and "Bölümden çık" stay reachable); soft step:
 *   everything stays touchable. The dark layer is redrawn only when the step (or the layout) changes. Two holes the pad
 *   merges into one box light only their own parts: the rest of the box is dark too (UX §13.1 "Birleşen delik", review
 *   Faz 2 tur 2 #0).
 * - Glove: Tuna's yellow glove plays the step's `hand` (`tap` press + ring, `drag` along the path with a dotted trail,
 *   `hold` = path then pressed `gloveHoldMs`), loop `duration.tutorialHandLoop` incl. `tutorialHandPause`; it never
 *   blocks the player's touch and leaves after the first correct touch.
 * - Usta Dede bubble: upper half, never over a hole, the plan nor the HUD it would hide (pause, goals, moves): first
 *   free band of `bubbleCandidates` (under the HUD group, crane band, under the upper holes, above the status strip, top
 *   margin last; review Faz 2 tur 2 #15).
 * - Panorama arrow (UX §13.2 level 5 row, Faz 2 tur 2 #7; presentation, not level data): whenever `panorama` is lit and
 *   the level has ≥ 2 segments, a 64 × 40 white arrow with an ink outline points from the active segment to the next
 *   one in the strip, sliding 16 px right every 1.2 s (steady with reduced motion).
 * Contextual tips use the bubble and the pulsing edge only (no dark layer, nothing blocked).
 * The holes follow what they show (review Faz 2 tur 1 #4): every frame the highlight rectangles are recomputed (a few
 * rects, no drawing) and the layer is rebuilt only when they changed — a highlighted block that moved (committed move,
 * board settled). A dragged block's hole uses the drag node captured when the drag (or a step opening mid-drag) was
 * first seen, so the layer is not re-baked on every node change of the drag (TECH §10.6); it moves to the block's new
 * place when the drag ends. Bubbles are built per text and kept (TECH §10.7 item 6, review Faz 2 tur 2 #11): the
 * level's step texts are built at level start (`prepare`), so a step that opens mid-drag (a drag signal ends the step
 * before) only shows and places a ready bubble — no Text object, no texture upload in a drag frame.
 */
import type Phaser from 'phaser';
import type { CompiledLevel } from '../../core/level/compile.ts';
import type { GameState } from '../../core/state.ts';
import { tDynamic } from '../../services/i18n.ts';
import type { I18nParams } from '../../services/i18n.ts';
import type { Layout, Rect } from '../../theme/layout.ts';
import { TOKENS } from '../../theme/tokens.ts';
import { drawGlove, drawPanoramaArrow } from '../../ui/icons.ts';
import { pauseHitRect } from '../../ui/PauseButton.ts';
import { SpeechBubble } from '../../ui/SpeechBubble.ts';
import { hex } from '../../ui/text.ts';
import { UI } from '../../ui/uiConstants.ts';
import { DEPTH } from './depth.ts';
import { SpotPieces } from './spotPieces.ts';
import {
  blockerRects,
  bubbleAvoid,
  bubbleCandidates,
  bubbleSpot,
  darkRects,
  highlightAll,
  hudPenalties,
  spotlight,
} from './tutorial/highlights.ts';
import type { HudRects } from './tutorial/highlights.ts';
import type { ShownStep } from './tutorial/TutorialController.ts';
import { addBakedGraphics } from '../../ui/BakedGraphics.ts';
import { VIEW } from './viewConstants.ts';

export interface TutorialOverlayHost {
  layout(): Layout;
  state(): GameState | null;
  level(): CompiledLevel | null;
  hud(): HudRects;
  /** The dragged block and its current drag node (null while nothing is dragged). */
  dragging(): { readonly pieceId: number; readonly ix: number; readonly iy: number } | null;
  /** Panorama columns of the active segment and the next one (null: fewer than 2 segments or no next one). */
  panoramaArrow(): { readonly from: Rect; readonly to: Rect } | null;
}

/** What the overlay shows: a tutorial step, a contextual tip, or nothing. */
export type OverlayContent =
  | { readonly kind: 'step'; readonly step: ShownStep }
  | {
      readonly kind: 'tip';
      readonly textKey: string;
      readonly params?: I18nParams;
      readonly highlight: readonly string[];
    }
  | null;

const RING_MAX = 1.8;

export class TutorialOverlay {
  private readonly scene: Phaser.Scene;
  private readonly host: TutorialOverlayHost;
  /** Dark rectangles around the holes: plain quads, cheap to draw live (a full-screen bake would cost memory). */
  private readonly dark: Phaser.GameObjects.Graphics;
  /** The holes' rounded dark corners and the white edge: pre-drawn pieces, no bake per change (spotPieces.ts). */
  private readonly spot: SpotPieces;
  private readonly glove: Phaser.GameObjects.Graphics;
  private readonly ring: Phaser.GameObjects.Graphics;
  private readonly dots: Phaser.GameObjects.Graphics;
  private readonly arrow: Phaser.GameObjects.Graphics;
  /** Rest position of the panorama arrow (null: not shown). */
  private arrowAt: { x: number; y: number } | null = null;
  /** Ready bubbles by text (the level's step texts from `prepare`, tips on first use). */
  private readonly bubbles = new Map<string, SpeechBubble>();
  /** The bubble on screen. */
  private bubble: SpeechBubble | null = null;
  private readonly bubbleMaxW: number;
  private blockers: Phaser.GameObjects.Zone[] = [];
  private content: OverlayContent = null;
  private suppressed = false;
  private holes: Rect[] = [];
  /** Blocker rects of the last rebuild (tests, harness). */
  private blockRects: Rect[] = [];
  private handPath: { x: number; y: number }[] = [];
  private handKind: 'tap' | 'drag' | 'hold' | null = null;
  private handSince = 0;
  /** The glove left for this content (first correct touch); a geometry rebuild does not bring it back. */
  private handOff = false;
  /** Highlight rectangles the holes were built from (rebuild when they change). */
  private rectsKey = '';
  /** The dragged block's node the holes use during this drag (captured once; null between drags). */
  private heldDrag: { readonly pieceId: number; readonly ix: number; readonly iy: number } | null = null;
  /** Reduced motion (JUICE §0 rule 8): steady spotlight edge; the glove plays its path once and rests. */
  private reduced = false;

  constructor(scene: Phaser.Scene, host: TutorialOverlayHost) {
    this.scene = scene;
    this.host = host;
    const d = DEPTH.tutorial;
    this.dark = scene.add.graphics().setDepth(d).setVisible(false);
    this.spot = new SpotPieces(scene, d, d + 1);
    this.dots = addBakedGraphics(scene)
      .setDepth(d + 2)
      .setVisible(false);
    this.ring = scene.add
      .graphics()
      .setDepth(d + 2)
      .setVisible(false);
    this.glove = addBakedGraphics(scene)
      .setDepth(d + 3)
      .setVisible(false);
    drawGlove(this.glove, UI.gloveW, UI.gloveH);
    this.arrow = addBakedGraphics(scene)
      .setDepth(d + 2)
      .setVisible(false);
    drawPanoramaArrow(this.arrow, VIEW.panoramaArrowW, VIEW.panoramaArrowH, VIEW.panoramaArrowStrokePx);
    // left-aligned; it goes under the HUD (bubbleCandidates), so it may use the UX §13.1 width within the margins
    const maxW = TOKENS.meta.designWidth - 2 * TOKENS.layout.marginPx - UI.dedeBustPx - 16;
    this.bubbleMaxW = Math.min(UI.bubbleMaxW, maxW);
  }

  /**
   * Builds the bubbles of the text keys `keys` now (level start: the level's tutorial step lines) and drops the other
   * ready bubbles; called again after a language change.
   */
  prepare(keys: readonly string[]): void {
    const texts = keys.map((k) => tDynamic(k));
    const keep = new Set(texts);
    for (const [text, b] of this.bubbles) {
      if (keep.has(text)) continue;
      if (b === this.bubble) this.bubble = null;
      b.destroy();
      this.bubbles.delete(text);
    }
    for (const text of texts) this.bubbleFor(text);
  }

  private bubbleFor(text: string): SpeechBubble {
    let b = this.bubbles.get(text);
    if (!b) {
      b = new SpeechBubble(this.scene, DEPTH.tutorial + 4, { bust: true, maxW: this.bubbleMaxW });
      b.setText(text);
      this.bubbles.set(text, b);
    }
    return b;
  }

  /** Shows `content` (null hides). Rebuilds the geometry; call again on a step change or a resize. */
  show(content: OverlayContent, now: number): void {
    this.content = content;
    this.handSince = now;
    this.handOff = content?.kind === 'step' && content.step.handHidden;
    this.rebuild();
  }

  /** Windows hide the tutorial (and release its blockers) while they are open. */
  setSuppressed(on: boolean): void {
    if (on === this.suppressed) return;
    this.suppressed = on;
    this.rebuild();
  }

  /** The step's glove is gone (first correct touch). */
  hideHand(): void {
    this.handOff = true;
    this.clearHand();
  }

  private clearHand(): void {
    this.handKind = null;
    this.glove.setVisible(false);
    this.ring.setVisible(false);
    this.dots.setVisible(false);
  }

  relayout(): void {
    this.rebuild();
  }

  /** Touch-swallowing rects of the step on screen (required steps; tests, harness). */
  get blockerRects(): readonly Rect[] {
    return this.blockRects;
  }

  /** The bubble's rect when shown (harness). */
  get bubbleRect(): Rect | null {
    return this.bubble?.visible ? this.bubble.rect : null;
  }

  setReduced(on: boolean): void {
    this.reduced = on;
  }

  update(now: number): void {
    const live = this.host.dragging();
    if (!live) this.heldDrag = null;
    else if (!this.heldDrag || this.heldDrag.pieceId !== live.pieceId) this.heldDrag = live;
    if (this.suppressed || !this.content) return;
    if (this.highlightKey() !== this.rectsKey) this.rebuild();
    const pulse = TOKENS.duration.spotlightPulse;
    const k = this.reduced
      ? 1
      : 0.5 - 0.5 * Math.cos((2 * Math.PI * ((now - this.handSince) % pulse)) / pulse);
    this.spot.setEdgeAlpha(0.45 + 0.55 * k);
    this.animateHand(now);
    const at = this.arrowAt;
    if (at) {
      const period = VIEW.panoramaArrowPeriodMs;
      const slide = this.reduced
        ? 0
        : (VIEW.panoramaArrowSlidePx * ((now - this.handSince) % period)) / period;
      this.arrow.setPosition(at.x + slide, at.y);
    }
  }

  /** The panorama arrow's rest position, null when hidden (tests, harness). */
  get panoramaArrowAt(): { readonly x: number; readonly y: number } | null {
    return this.arrowAt;
  }

  destroy(): void {
    this.clearBlockers();
    for (const o of [this.dark, this.glove, this.ring, this.dots, this.arrow]) o.destroy();
    this.spot.destroy();
    for (const b of this.bubbles.values()) b.destroy();
    this.bubbles.clear();
    this.bubble = null;
  }

  // --- internals ---------------------------------------------------------------------------------------------------------

  /** The highlight rectangles of the content now (null: nothing to show). */
  private highlightRects(): Rect[] | null {
    const content = this.content;
    const s = this.host.state();
    const level = this.host.level();
    if (!content || !s || !level) return null;
    const ids = content.kind === 'step' ? content.step.data.highlight : content.highlight;
    return highlightAll(ids, {
      layout: this.host.layout(),
      state: s,
      level,
      hud: this.host.hud(),
      dragging: this.heldDrag,
    });
  }

  private highlightKey(): string {
    const rects = this.highlightRects();
    return rects ? rects.map((r) => `${r.x},${r.y},${r.w},${r.h}`).join(';') : '';
  }

  private rebuild(): void {
    this.clearBlockers();
    // a step that opens mid-drag shows the dragged block's hole where it is now (L1 step 2 opens at overWall)
    this.heldDrag = this.host.dragging();
    const content = this.content;
    const rects = this.highlightRects();
    this.rectsKey = rects ? rects.map((r) => `${r.x},${r.y},${r.w},${r.h}`).join(';') : '';
    this.dark.setVisible(false).clear();
    this.spot.hide();
    this.bubble?.setVisible(false);
    this.clearHand();
    this.blockRects = [];
    this.arrowAt = null;
    this.arrow.setVisible(false);
    if (this.suppressed || !content || !rects) return;
    const layout = this.host.layout();
    const sp = spotlight(rects, UI.spotPadPx);
    this.holes = sp.holes;
    const screen: Rect = { x: 0, y: 0, w: layout.W, h: layout.H };

    // dark layer (+ the unlit parts of merged holes) and the swallowing zones (steps only)
    let darkCorners: { color: number; alpha: number } | null = null;
    if (content.kind === 'step') {
      const required = content.step.required;
      const alpha = required ? TOKENS.alpha.tutorialOverlay : TOKENS.alpha.tutorialSoftOverlay;
      const color = hex(TOKENS.color.ui.overlay);
      const g = this.dark;
      g.fillStyle(color, alpha);
      for (const r of [...darkRects(screen, this.holes), ...sp.fills]) g.fillRect(r.x, r.y, r.w, r.h);
      g.setVisible(true);
      darkCorners = { color, alpha };
      if (required) {
        this.blockRects = blockerRects(screen, sp, [pauseHitRect(layout.top.pause)]);
        for (const r of this.blockRects) {
          const z = this.scene.add.zone(r.x, r.y, r.w, r.h).setOrigin(0, 0).setDepth(DEPTH.tutorial);
          z.setInteractive();
          this.blockers.push(z);
        }
      }
    }

    // rounded dark corners + pulsing white edge around every hole (pieces, no bake); a corner a fill covers is dark
    this.spot.show(this.holes, darkCorners, darkCorners ? sp.fills : []);

    // Usta Dede bubble
    const key = content.kind === 'step' ? content.step.data.textKey : content.textKey;
    const params = content.kind === 'tip' ? content.params : undefined;
    const bubble = this.bubbleFor(tDynamic(key, params));
    this.bubble = bubble;
    const m = TOKENS.layout.marginPx;
    const candidates = bubbleCandidates(
      layout,
      bubble.width,
      bubble.height,
      m,
      UI.bubbleHudGapPx,
      this.holes,
    );
    const s = this.host.state();
    const avoid = s ? bubbleAvoid(layout, s) : [];
    const spot = bubbleSpot(candidates, this.holes, hudPenalties(layout), avoid) ?? candidates[0];
    if (spot) bubble.setPosition(spot.x, spot.y).setVisible(true);

    // UX §13.2 level 5: the panorama arrow from the active segment to the next one
    const ids = content.kind === 'step' ? content.step.data.highlight : content.highlight;
    const pair = ids.includes('panorama') ? this.host.panoramaArrow() : null;
    if (pair) {
      const y = (pair.from.y + pair.from.h / 2 + pair.to.y + pair.to.h / 2) / 2;
      const x = (pair.from.x + pair.from.w + pair.to.x) / 2 - VIEW.panoramaArrowSlidePx / 2;
      this.arrowAt = { x, y };
      this.arrow.setPosition(x, y).setVisible(true);
    }

    // glove
    if (content.kind === 'step' && content.step.data.hand && !this.handOff) {
      const hand = content.step.data.hand;
      const path = (hand.path ?? []).map(([cx, cy]) => {
        const r = layout.grid.cellRect(cx, cy);
        return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
      });
      if (path.length === 0 && this.holes[0]) {
        const h = this.holes[0];
        path.push({ x: h.x + h.w / 2, y: h.y + h.h / 2 });
      }
      if (path.length > 0) {
        this.handPath = path;
        this.handKind = hand.kind;
        this.drawTrail();
      }
    }
  }

  private drawTrail(): void {
    const d = this.dots.clear();
    if (this.handKind === 'tap' || this.handPath.length < 2) {
      d.setVisible(false);
      return;
    }
    d.fillStyle(hex(TOKENS.color.ui.inkOnDark), UI.gloveTrailAlpha);
    for (let i = 0; i <= UI.gloveTrailDots; i++) {
      const p = pathAt(this.handPath, i / UI.gloveTrailDots);
      d.fillCircle(p.x, p.y, 7);
    }
    d.setVisible(true);
  }

  private animateHand(now: number): void {
    const kind = this.handKind;
    if (!kind || this.handPath.length === 0) return;
    const loop = TOKENS.duration.tutorialHandLoop;
    const pause = TOKENS.duration.tutorialHandPause;
    const t = (now - this.handSince) % loop;
    const move = loop - pause;
    const g = this.glove.setVisible(true);
    const tip = (p: { x: number; y: number }): void => {
      // the fingertip (top of the glove) is the touch point
      g.setPosition(p.x, p.y + UI.gloveH / 2);
    };
    if (this.reduced && now - this.handSince >= move) {
      // reduced motion: after one pass the glove rests on its target, pressed (no loop, no ring)
      tip(kind === 'tap' ? (this.handPath[0] as { x: number; y: number }) : pathAt(this.handPath, 1));
      g.setScale(UI.glovePressScale).setAlpha(1);
      this.ring.setVisible(false);
      return;
    }
    if (kind === 'tap') {
      const p = this.handPath[0] as { x: number; y: number };
      tip(p);
      const press = t < pause ? Math.sin((Math.PI * t) / pause) : 0;
      g.setScale(1 - (1 - UI.glovePressScale) * press);
      const u = t < move ? t / move : 1;
      this.ring
        .clear()
        .lineStyle(UI.spotEdgePx, hex(TOKENS.color.ui.inkOnDark), 1)
        .strokeCircle(p.x, p.y, 30 * (1 + (RING_MAX - 1) * u))
        .setAlpha(1 - u)
        .setVisible(true);
      return;
    }
    const holdMs = kind === 'hold' ? UI.gloveHoldMs : 0;
    const travel = Math.max(1, move - holdMs);
    const u = Math.min(1, t / travel);
    tip(pathAt(this.handPath, u));
    g.setScale(t < move ? UI.glovePressScale : 1);
    g.setAlpha(t < move ? 1 : 1 - (t - move) / pause);
  }

  private clearBlockers(): void {
    for (const z of this.blockers) z.destroy();
    this.blockers = [];
  }
}

/** Point at fraction `u` of a polyline (by length). */
function pathAt(path: readonly { x: number; y: number }[], u: number): { x: number; y: number } {
  if (path.length === 1) return path[0] as { x: number; y: number };
  const lens: number[] = [];
  let total = 0;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1] as { x: number; y: number };
    const b = path[i] as { x: number; y: number };
    const l = Math.hypot(b.x - a.x, b.y - a.y);
    lens.push(l);
    total += l;
  }
  let d = Math.max(0, Math.min(1, u)) * total;
  for (let i = 1; i < path.length; i++) {
    const l = lens[i - 1] as number;
    const a = path[i - 1] as { x: number; y: number };
    const b = path[i] as { x: number; y: number };
    if (d <= l || i === path.length - 1) {
      const k = l === 0 ? 1 : Math.min(1, d / l);
      return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
    }
    d -= l;
  }
  return path[path.length - 1] as { x: number; y: number };
}
