/**
 * The fall shadow and the cancel preview (GDD K-18, K-34 hook 2; UX_FLOWS §5.3–§5.4; D-014; TECH_DESIGN §5.1).
 *
 * It draws a `ShadowLook` (shadowLook.ts) computed from the core's `computeFall`: the ghost body (the piece's own block
 * frame filled with its colour at `alpha.ghostFill`, TECH §10.2 "Filter'sız efektler"), the outline frame
 * `ghost_<shape>_valid|invalid|neutral`, one badge (`ghost_badge_ok|warn|support|glass`) on the top-right cell, the
 * K-34 horizontal hatch (`plan_support_hatch`) on the missing-support cells, and the ↩ badge (`ghost_badge_cancel`)
 * on the dragged block when the release would cancel. Pre-built images only; nothing is drawn per frame (TECH §10.6).
 */
import Phaser from 'phaser';
import type { ShapeDef } from '../../core/shapes.ts';
import type { Anchor, At, ColorCode } from '../../core/types.ts';
import type { Layout, Rect } from '../../theme/layout.ts';
import { FRAME, badgeFrameName, ghostFrameName } from '../../theme/textures.ts';
import { TOKENS } from '../../theme/tokens.ts';
import { BOOT_ATLAS_KEY } from '../atlas.ts';
import type { Frames } from '../atlas.ts';
import { DEPTH } from './depth.ts';
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

export class ShadowView {
  private readonly scene: Phaser.Scene;
  private readonly body: Phaser.GameObjects.Image;
  private readonly outline: Phaser.GameObjects.Image;
  private readonly badge: Phaser.GameObjects.Image;
  private readonly cancelBadge: Phaser.GameObjects.Image;
  private readonly hatches: Phaser.GameObjects.Image[] = [];
  private frames: Frames | null = null;
  private shown: Shown | null = null;
  private popStart = -Infinity;
  private popEase: Ease = (u) => u;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    const img = (depth: number): Phaser.GameObjects.Image =>
      scene.add.image(0, 0, BOOT_ATLAS_KEY, FRAME.whitePixel).setDepth(depth).setVisible(false);
    this.body = img(DEPTH.fallShadow);
    this.outline = img(DEPTH.fallShadow + 2);
    this.badge = img(DEPTH.fallShadow + 3);
    this.cancelBadge = img(DEPTH.effects);
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

  /** Shows `look` at `landing` (FREE fall) or on the block's own node (rail, `look.body === false`). */
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
    if (changed) this.popStart = now;
    this.place(layout, now);
  }

  hide(): void {
    this.shown = null;
    this.body.setVisible(false);
    this.outline.setVisible(false);
    this.badge.setVisible(false);
    for (const h of this.hatches) h.setVisible(false);
  }

  /** UX §5.3 cancel preview badge "↩" on the dragged block (continuous pose). */
  showCancel(layout: Layout, shape: ShapeDef, ax: number, ay: number): void {
    const f = this.frames;
    if (!f) return;
    const ref = f.ref(badgeFrameName('cancel'));
    const p = badgeCentre(layout, shape, ax, ay, ref.w);
    setFrameCentred(this.cancelBadge, ref, p.x, p.y);
    this.cancelBadge.setVisible(true);
  }

  hideCancel(): void {
    this.cancelBadge.setVisible(false);
  }

  /** Re-places everything for a new layout. */
  relayout(layout: Layout, now: number): void {
    if (this.shown) this.place(layout, now);
  }

  /** Per frame: the 2 Hz pulse (wrong outline, support hatch) and the badge pop (JUICE #7). */
  update(now: number): void {
    const shown = this.shown;
    if (!shown) return;
    const pulse = shown.look.pulse || shown.look.supportCells.length > 0;
    if (pulse) {
      const k = 0.5 + 0.5 * Math.cos(2 * Math.PI * VIEW.pulseHz * (now / 1000));
      const a = VIEW.pulseMinAlpha + (1 - VIEW.pulseMinAlpha) * k;
      if (shown.look.pulse) this.outline.setAlpha(a);
      for (const h of this.hatches) if (h.visible) h.setAlpha(TOKENS.alpha.supportHatch * a);
    }
    if (this.badge.visible) {
      const u = (now - this.popStart) / TOKENS.duration.ghostSwitch;
      const s = u >= 1 ? 1 : VIEW.badgePopFrom + (1 - VIEW.badgePopFrom) * this.popEase(Math.max(0, u));
      this.badge.setScale(s);
    }
  }

  private place(layout: Layout, now: number): void {
    const f = this.frames;
    const shown = this.shown;
    if (!f || !shown) return;
    const { look, shape, landing } = shown;
    const g = layout.grid;
    const box: Rect = g.pieceRect(landing.ix, landing.iy, shape.w, shape.h);

    if (look.body) {
      const ref = f.ref(shown.blockFrame);
      setFrameAt(this.body, ref, box.x, box.y);
      this.body
        .setTint(hexColor(TOKENS.color.block[shown.color]))
        .setTintMode(Phaser.TintModes.FILL)
        .setAlpha(TOKENS.alpha.ghostFill)
        .setVisible(true);
    } else this.body.setVisible(false);

    const outline = f.ref(ghostFrameName(shape.id, look.outline));
    setFrameAt(this.outline, outline, box.x, box.y);
    this.outline.setAlpha(1).setVisible(true);

    if (look.badge) {
      const ref = f.ref(badgeFrameName(look.badge));
      const p = badgeCentre(layout, shape, landing.ix, landing.iy, ref.w);
      setFrameCentred(this.badge, ref, p.x, p.y);
      this.badge.setVisible(true);
    } else this.badge.setVisible(false);

    this.placeHatches(layout, look.supportCells);
    this.update(now);
  }

  private placeHatches(layout: Layout, cells: readonly At[]): void {
    const f = this.frames;
    if (!f) return;
    const ref = f.ref(FRAME.supportHatch);
    while (this.hatches.length < cells.length) {
      this.hatches.push(
        this.scene.add
          .image(0, 0, BOOT_ATLAS_KEY, FRAME.whitePixel)
          .setDepth(DEPTH.fallShadow + 1)
          .setVisible(false),
      );
    }
    this.hatches.forEach((h, i) => {
      const cell = cells[i];
      if (!cell) {
        h.setVisible(false);
        return;
      }
      const r = layout.grid.cellRect(cell.x, cell.y);
      setFrameAt(h, ref, r.x, r.y);
      h.setAlpha(TOKENS.alpha.supportHatch).setVisible(true);
    });
  }
}
