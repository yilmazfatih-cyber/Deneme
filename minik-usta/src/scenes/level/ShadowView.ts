/**
 * The fall shadow and the cancel preview (GDD K-18, K-34 hook 2; UX_FLOWS §5.3–§5.4; D-014; TECH_DESIGN §5.1).
 *
 * It draws a `ShadowLook` (shadowLook.ts) computed from the core's `computeFall`: the ghost body (the piece's own block
 * frame filled with its colour at `alpha.ghostFill`, TECH §10.2 "Filter'sız efektler"), the outline frame
 * `ghost_<shape>_valid|invalid|neutral`, one badge (`ghost_badge_ok|warn|support|glass`) on the top-right cell, the
 * K-34 horizontal hatch (`plan_support_hatch`) on the missing-support cells, the 45° hatch (`ghost_hatch45`) on the
 * cells of the primary reason (`mismatchCells`), the fall path (`ghost_path`: one dashed vertical strip per covered
 * column, from the dragged block's bottom edge to the shadow's top edge) and the ↩ badge (`ghost_badge_cancel`) on the
 * dragged block when the release would cancel. Pre-built images only; nothing is drawn per frame (TECH §10.6).
 *
 * Rail (K-12, `look.body === false`): there is no fall, the block stays where it is released, so the outline, the badge
 * and the 45° hatch sit ON the dragged block (UX §5.4 "Ray": "kontur doğrudan bloğun üstünde"). They are drawn above it
 * (`DEPTH.draggedBlock` + 2…4) and follow its drawn pose every frame (`follow`: position and lift scale, 1.08 or 1.03
 * with reduced motion), with the badge on the top-right cell. No fall path on the rail or in the cancel preview.
 *
 * During a drag (`setRaised`, UX §13.1, review Faz 2 tur 2 #1) every part is drawn above the tutorial spotlight
 * (`overTutorial`, order kept): the block in the player's hand and the result of the move never sit in the dark.
 */
import Phaser from 'phaser';
import type { BoardCell } from '../../core/grid.ts';
import type { ShapeDef } from '../../core/shapes.ts';
import type { Anchor, At, ColorCode } from '../../core/types.ts';
import { FALL_PATH } from '../../theme/draw/plan.ts';
import type { Layout, Rect } from '../../theme/layout.ts';
import { FRAME, badgeFrameName, ghostFrameName } from '../../theme/textures.ts';
import type { FrameRef } from '../../theme/textures.ts';
import { TOKENS } from '../../theme/tokens.ts';
import { BOOT_ATLAS_KEY } from '../atlas.ts';
import type { Frames } from '../atlas.ts';
import { DEPTH, overTutorial } from './depth.ts';
import { hexColor, setFrameAt, setFrameCentred } from './frameImage.ts';
import type { Ease } from './motion.ts';
import { badgeCentre } from './shadowLook.ts';
import type { ShadowLook } from './shadowLook.ts';
import { VIEW } from './viewConstants.ts';

interface Shown {
  readonly look: ShadowLook;
  readonly shape: ShapeDef;
  readonly landing: Anchor;
  readonly blockFrame: string;
  readonly color: ColorCode;
}

/** The dragged block as drawn this frame: its box centre (design px) and its scale (PieceView.drawn). */
export interface DrawnBlock {
  readonly cx: number;
  readonly cy: number;
  readonly scale: number;
}

/** Depths of the rail look: above the dragged block (`DEPTH.draggedBlock` + 1 is its flash overlay). */
export const RAIL_DEPTH = Object.freeze({
  hatch: DEPTH.draggedBlock + 2,
  outline: DEPTH.draggedBlock + 3,
  badge: DEPTH.draggedBlock + 4,
});

export class ShadowView {
  private readonly scene: Phaser.Scene;
  private readonly body: Phaser.GameObjects.Image;
  private readonly outline: Phaser.GameObjects.Image;
  private readonly badge: Phaser.GameObjects.Image;
  private readonly cancelBadge: Phaser.GameObjects.Image;
  private readonly hatches: Phaser.GameObjects.Image[] = [];
  private readonly wrongHatches: Phaser.GameObjects.Image[] = [];
  private readonly paths: Phaser.GameObjects.Image[] = [];
  private frames: Frames | null = null;
  private shown: Shown | null = null;
  private drawn: DrawnBlock | null = null;
  private layout: Layout | null = null;
  private cancelOn = false;
  private raised = false;
  private popStart = -Infinity;
  private popEase: Ease = (u) => u;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.body = this.image(DEPTH.fallShadow);
    this.outline = this.image(DEPTH.fallShadow + 2);
    this.badge = this.image(DEPTH.fallShadow + 3);
    this.cancelBadge = this.image(DEPTH.effects);
  }

  setFrames(frames: Frames, popEase: Ease): void {
    this.frames = frames;
    this.popEase = popEase;
    this.hide();
  }

  get visible(): boolean {
    return this.shown !== null;
  }

  /** The look of the current fall shadow (tests, harness), null when hidden. */
  get look(): ShadowLook | null {
    return this.shown?.look ?? null;
  }

  /** Display depths of the outline and the badge now (tests: the rail look is drawn above the dragged block). */
  get depths(): { readonly outline: number; readonly badge: number } {
    return { outline: this.outline.depth, badge: this.badge.depth };
  }

  /** Display depths of every part on screen now (tests: above the spotlight during a drag). */
  get allDepths(): readonly number[] {
    return [
      this.body,
      this.outline,
      this.badge,
      this.cancelBadge,
      ...this.hatches,
      ...this.wrongHatches,
      ...this.paths,
    ]
      .filter((o) => o.visible)
      .map((o) => o.depth);
  }

  /** A drag starts (true) or ends (false): the parts go above / back under the tutorial spotlight. */
  setRaised(on: boolean): void {
    if (on === this.raised) return;
    this.raised = on;
    this.applyDepths();
  }

  private z(depth: number): number {
    return this.raised ? overTutorial(depth) : depth;
  }

  private applyDepths(): void {
    const rail = this.shown !== null && !this.shown.look.body;
    this.body.setDepth(this.z(DEPTH.fallShadow));
    this.outline.setDepth(this.z(rail ? RAIL_DEPTH.outline : DEPTH.fallShadow + 2));
    this.badge.setDepth(this.z(rail ? RAIL_DEPTH.badge : DEPTH.fallShadow + 3));
    this.cancelBadge.setDepth(this.z(DEPTH.effects));
    for (const h of this.hatches) h.setDepth(this.z(DEPTH.fallShadow + 1));
    for (const h of this.wrongHatches) h.setDepth(this.z(rail ? RAIL_DEPTH.hatch : DEPTH.fallShadow + 1));
    for (const p of this.paths) p.setDepth(this.z(DEPTH.fallShadow));
  }

  /** Fall-path strips on screen now (tests). */
  get pathCount(): number {
    return this.paths.filter((p) => p.visible).length;
  }

  /** Shows `look` at `landing` (FREE fall) or on the dragged block itself (rail, `look.body === false`). */
  showFall(
    layout: Layout,
    now: number,
    look: ShadowLook,
    shape: ShapeDef,
    landing: Anchor,
    blockFrame: string,
    color: ColorCode,
  ): void {
    const changed = this.shown?.look.key !== look.key;
    this.shown = { look, shape, landing, blockFrame, color };
    this.layout = layout;
    if (changed) this.popStart = now;
    this.place(layout, now);
  }

  hide(): void {
    this.shown = null;
    this.body.setVisible(false);
    this.outline.setVisible(false);
    this.badge.setVisible(false);
    for (const h of this.hatches) h.setVisible(false);
    for (const h of this.wrongHatches) h.setVisible(false);
    for (const p of this.paths) p.setVisible(false);
  }

  /** UX §5.3 cancel preview badge "↩" on the dragged block (continuous pose). No fall path meanwhile. */
  showCancel(layout: Layout, shape: ShapeDef, ax: number, ay: number): void {
    const f = this.frames;
    if (!f) return;
    const ref = f.ref(badgeFrameName('cancel'));
    const p = badgeCentre(layout, shape, ax, ay, ref.w);
    setFrameCentred(this.cancelBadge, ref, p.x, p.y);
    this.cancelBadge.setVisible(true);
    this.cancelOn = true;
    for (const p of this.paths) p.setVisible(false);
  }

  hideCancel(): void {
    this.cancelBadge.setVisible(false);
    this.cancelOn = false;
  }

  /**
   * The dragged block's drawn pose this frame (LevelScene, after the DragController): the rail look rides on it and the
   * fall path stretches from its bottom edge to the shadow.
   */
  follow(drawn: DrawnBlock | null): void {
    this.drawn = drawn;
    const layout = this.layout;
    const shown = this.shown;
    if (!layout || !shown) return;
    if (!shown.look.body) this.placeRail(layout, shown);
    else this.placePaths(layout, shown);
  }

  /** Re-places everything for a new layout. */
  relayout(layout: Layout, now: number): void {
    this.layout = layout;
    if (this.shown) this.place(layout, now);
  }

  /** Per frame: the 2 Hz pulse (wrong outline, both hatches) and the badge pop (JUICE #7). */
  update(now: number): void {
    const shown = this.shown;
    if (!shown) return;
    const look = shown.look;
    const pulse = look.pulse || look.supportCells.length > 0 || look.mismatchCells.length > 0;
    if (pulse) {
      const k = 0.5 + 0.5 * Math.cos(2 * Math.PI * VIEW.pulseHz * (now / 1000));
      const a = VIEW.pulseMinAlpha + (1 - VIEW.pulseMinAlpha) * k;
      if (look.pulse) this.outline.setAlpha(a);
      for (const h of this.hatches) if (h.visible) h.setAlpha(a);
      for (const h of this.wrongHatches) if (h.visible) h.setAlpha(a);
    }
    if (this.badge.visible) {
      const u = (now - this.popStart) / TOKENS.duration.ghostSwitch;
      const s = u >= 1 ? 1 : VIEW.badgePopFrom + (1 - VIEW.badgePopFrom) * this.popEase(Math.max(0, u));
      this.badge.setScale(s); // the rail badge keeps its Ø 44 size, only its position follows the lift
    }
  }

  // --- internals ---------------------------------------------------------------------------------------------------------

  private image(depth: number): Phaser.GameObjects.Image {
    return this.scene.add.image(0, 0, BOOT_ATLAS_KEY, FRAME.whitePixel).setDepth(depth).setVisible(false);
  }

  private place(layout: Layout, now: number): void {
    const f = this.frames;
    const shown = this.shown;
    if (!f || !shown) return;
    const { look, shape, landing } = shown;
    const rail = !look.body;
    this.applyDepths();

    if (!rail) {
      const box: Rect = layout.grid.pieceRect(landing.ix, landing.iy, shape.w, shape.h);
      const ref = f.ref(shown.blockFrame);
      setFrameAt(this.body, ref, box.x, box.y);
      this.body
        .setTint(hexColor(TOKENS.color.block[shown.color]))
        .setTintMode(Phaser.TintModes.FILL)
        .setAlpha(TOKENS.alpha.ghostFill)
        .setVisible(true);
      const outline = f.ref(ghostFrameName(shape.id, look.outline));
      setFrameAt(this.outline, outline, box.x, box.y);
      this.outline.setAlpha(1).setVisible(true);
      if (look.badge) {
        const bref = f.ref(badgeFrameName(look.badge));
        const p = badgeCentre(layout, shape, landing.ix, landing.iy, bref.w);
        setFrameCentred(this.badge, bref, p.x, p.y);
        this.badge.setVisible(true);
      } else this.badge.setVisible(false);
      this.placeCells(
        this.wrongHatches,
        f.ref(FRAME.wrongHatch),
        DEPTH.fallShadow + 1,
        look.mismatchCells,
        (c) => layout.grid.cellRect(c.x, c.y),
      );
      this.placePaths(layout, shown);
    } else {
      this.body.setVisible(false);
      for (const p of this.paths) p.setVisible(false);
      this.placeRail(layout, shown);
    }

    this.placeCells(this.hatches, f.ref(FRAME.supportHatch), DEPTH.fallShadow + 1, look.supportCells, (c) =>
      layout.grid.cellRect(c.x, c.y),
    );
    this.update(now);
  }

  /** Rail look on the dragged block's drawn box (scaled about its centre), above the block. */
  private placeRail(layout: Layout, shown: Shown): void {
    const f = this.frames;
    if (!f) return;
    const { look, shape, landing } = shown;
    const c = layout.grid.cellPx;
    const box = layout.grid.pieceRect(landing.ix, landing.iy, shape.w, shape.h);
    const d = this.drawn ?? { cx: box.x + box.w / 2, cy: box.y + box.h / 2, scale: 1 };
    const s = d.scale;
    const toDrawn = (x: number, y: number): { x: number; y: number } => ({
      x: d.cx + (x - (box.x + box.w / 2)) * s,
      y: d.cy + (y - (box.y + box.h / 2)) * s,
    });

    const outline = f.ref(ghostFrameName(shape.id, look.outline));
    setFrameCentred(this.outline, outline, d.cx, d.cy);
    this.outline.setScale(s).setVisible(true);
    if (!look.pulse) this.outline.setAlpha(1);

    if (look.badge) {
      const bref = f.ref(badgeFrameName(look.badge));
      const p = badgeCentre(layout, shape, landing.ix, landing.iy, bref.w);
      const q = toDrawn(p.x, p.y);
      setFrameCentred(this.badge, bref, q.x, q.y);
      this.badge.setVisible(true);
    } else this.badge.setVisible(false);

    this.placeCells(
      this.wrongHatches,
      f.ref(FRAME.wrongHatch),
      RAIL_DEPTH.hatch,
      look.mismatchCells,
      (cell) => {
        const r = layout.grid.cellRect(cell.x, cell.y);
        const q = toDrawn(r.x, r.y);
        return { x: q.x, y: q.y, w: c * s, h: c * s };
      },
    );
  }

  /** UX §5.4 fall path: per covered column, from the dragged block's bottom edge down to the shadow's top edge. */
  private placePaths(layout: Layout, shown: Shown): void {
    const f = this.frames;
    const d = this.drawn;
    const { shape, landing } = shown;
    if (!f || !d || this.cancelOn) {
      for (const p of this.paths) p.setVisible(false);
      return;
    }
    const ref = f.ref(FRAME.fallPath);
    const g = layout.grid;
    const c = g.cellPx;
    const ghost = g.pieceRect(landing.ix, landing.iy, shape.w, shape.h);
    const blockTop = d.cy - (shape.h * c * d.scale) / 2;
    for (let col = 0; col < shape.w; col++) {
      const img = this.pathImage(col);
      const bottom = shape.colBottom[col] ?? shape.h;
      const top = shape.colTop[col] ?? -1;
      if (top < 0) {
        img.setVisible(false);
        continue;
      }
      const from = blockTop + (shape.h - bottom) * c * d.scale;
      const to = ghost.y + (shape.h - 1 - top) * c;
      const len = Math.min(ref.h, Math.floor(to - from));
      if (len < FALL_PATH.dashPx) {
        img.setVisible(false);
        continue;
      }
      // the strip ends on the shadow (dashes keep their place while the block moves); its top is cropped to the block
      const x = ghost.x + (col + 0.5) * c;
      img.setTexture(ref.key, ref.frame).setOrigin(0.5, 1).setPosition(x, to);
      img
        .setCrop(0, ref.h - len, ref.w, len)
        .setAlpha(FALL_PATH.alpha)
        .setVisible(true);
    }
    for (let i = shape.w; i < this.paths.length; i++) this.paths[i]?.setVisible(false);
  }

  private pathImage(i: number): Phaser.GameObjects.Image {
    while (this.paths.length <= i) this.paths.push(this.image(this.z(DEPTH.fallShadow)));
    return this.paths[i] as Phaser.GameObjects.Image;
  }

  /** Cell images from a pool: `cells[i]` at `rect(cell)` (frame scaled to the rect), the rest hidden. */
  private placeCells(
    pool: Phaser.GameObjects.Image[],
    ref: FrameRef,
    depth: number,
    cells: readonly (At | BoardCell)[],
    rect: (cell: At | BoardCell) => Rect,
  ): void {
    while (pool.length < cells.length) pool.push(this.image(this.z(depth)));
    pool.forEach((h, i) => {
      const cell = cells[i];
      if (!cell) {
        h.setVisible(false);
        return;
      }
      const r = rect(cell);
      setFrameAt(h, ref, r.x, r.y);
      h.setScale(r.w / ref.w, r.h / ref.h)
        .setDepth(this.z(depth))
        .setAlpha(1)
        .setVisible(true);
    });
  }
}
