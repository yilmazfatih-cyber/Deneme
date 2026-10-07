/**
 * Panorama strip (GDD K-06; UX_FLOWS §5.1; TECH_DESIGN §1.2, §10.3): a small preview of every segment of the plan in
 * `layout.top.panorama`. It only draws the data of core `panoramaView(state)` (a pure read; it never changes the game):
 * segments side by side as 2-column strips, bottom-aligned on a common base, the block vertically centred in the strip;
 * completed segments in full block colour, the active one framed in white with its plan colours, future ones with plan
 * colours at `alpha.panoramaFuture`; unrevealed `?` cells keep the `?` tag (K-32), `.` cells and cells outside the plan
 * stay empty. Cell size (UX §5.1 Faz 2 tur 2, review #7): from the level's tallest segment, `min(24, ⌊(110 − 2·pad) /
 * rows⌋)`, at least 12 px — every segment at the same scale (an 8-row plan keeps 12 px, the 3–5-row plans of levels
 * 1–5 get 18–24 px).
 *
 * Built from boot-atlas frames scaled down (≤ 16 images per segment); no RenderTexture. The tap → large preview is
 * MVP-lite UI work (TECH §14.1 #12).
 */
import type Phaser from 'phaser';
import type { PanoramaSegment } from '../core/panorama.ts';
import type { Rect } from '../theme/layout.ts';
import { FRAME, planFrameName } from '../theme/textures.ts';
import type { FrameRef } from '../theme/textures.ts';
import { TOKENS } from '../theme/tokens.ts';

/** Frame lookup the strip needs (scenes/atlas.ts `Frames`). */
export interface PanoramaFrames {
  ref(name: string): FrameRef;
}

export interface PanoramaStyle {
  /** Depth of the strip (HUD). */
  readonly depth: number;
  /** Inner padding and active-frame line width (px), gap between segments (cells). */
  readonly padPx: number;
  /** Cell size bounds (UX §5.1: 24 px at most, 12 px at least). */
  readonly maxCellPx: number;
  readonly minCellPx: number;
  readonly gapCells: number;
  readonly framePx: number;
}

/** Cell size and origin of the strip for `segments` in `rect` (pure; exported for tests). */
export function panoramaGeometry(
  rect: Rect,
  segments: readonly PanoramaSegment[],
  style: Pick<PanoramaStyle, 'padPx' | 'gapCells' | 'maxCellPx' | 'minCellPx'>,
): { cell: number; x0: number; bottom: number; colW: number; step: number } {
  const n = Math.max(1, segments.length);
  const rows = Math.max(1, ...segments.map((s) => s.rows.length));
  const innerW = rect.w - 2 * style.padPx;
  const innerH = rect.h - 2 * style.padPx;
  const byH = Math.floor(innerH / rows);
  const byW = Math.floor(innerW / (2 * n + style.gapCells * (n - 1)));
  const cell = Math.max(1, Math.min(byW, Math.max(style.minCellPx, Math.min(style.maxCellPx, byH))));
  const colW = 2 * cell;
  const step = colW + style.gapCells * cell;
  const total = n * colW + (n - 1) * style.gapCells * cell;
  // the tallest segment is vertically centred; the others stand on the same base
  const bottom = rect.y + (rect.h + rows * cell) / 2;
  return { cell, x0: rect.x + (rect.w - total) / 2, bottom, colW, step };
}

/** Column of segment `index` in the strip (JUICE #18: the completed segment flies here). */
export function panoramaSlot(
  rect: Rect,
  segments: readonly PanoramaSegment[],
  index: number,
  style: Pick<PanoramaStyle, 'padPx' | 'gapCells' | 'maxCellPx' | 'minCellPx'>,
): Rect | null {
  const seg = segments[index];
  if (!seg) return null;
  const geo = panoramaGeometry(rect, segments, style);
  const h = seg.rows.length * geo.cell;
  return { x: geo.x0 + index * geo.step, y: geo.bottom - h, w: geo.colW, h };
}

export class Panorama {
  private readonly scene: Phaser.Scene;
  private readonly style: PanoramaStyle;
  private readonly imgs: Phaser.GameObjects.Image[] = [];
  private used = 0;

  constructor(scene: Phaser.Scene, style: PanoramaStyle) {
    this.scene = scene;
    this.style = style;
  }

  /** Redraws the strip for `segments` in `rect`. */
  draw(rect: Rect, segments: readonly PanoramaSegment[], frames: PanoramaFrames): void {
    for (let i = 0; i < this.used; i++) this.imgs[i]?.setVisible(false);
    this.used = 0;
    if (segments.length === 0) return;
    const geo = panoramaGeometry(rect, segments, this.style);
    const px = frames.ref(FRAME.whitePixel);
    const backing = TOKENS.color.board.blueprint;
    const tint = (hex: string): number => Number.parseInt(hex.slice(1), 16);

    segments.forEach((seg, i) => {
      const left = geo.x0 + i * geo.step;
      const h = seg.rows.length * geo.cell;
      const top = geo.bottom - h;
      this.rect(px, left, top, geo.colW, h, tint(backing), 1);
      seg.rows.forEach((row, r) => {
        row.forEach((cell, c) => {
          if (cell === null || cell === '.') return;
          const x = left + c * geo.cell;
          const y = top + r * geo.cell;
          if (seg.status === 'done' && cell !== '?') {
            this.rect(px, x, y, geo.cell, geo.cell, tint(TOKENS.color.block[cell]), 1);
            return;
          }
          const ref = frames.ref(cell === '?' ? FRAME.hidden : planFrameName(cell));
          const img = this.take();
          img.setTexture(ref.key, ref.frame).setOrigin(0, 0).setPosition(x, y);
          img.setDisplaySize(geo.cell, geo.cell).clearTint();
          img.setAlpha(seg.status === 'future' ? TOKENS.alpha.panoramaFuture : 1);
        });
      });
      if (seg.status === 'active') {
        const f = this.style.framePx;
        const white = tint(TOKENS.color.ui.inkOnDark);
        this.rect(px, left - f, top - f, geo.colW + 2 * f, f, white, 1);
        this.rect(px, left - f, top + h, geo.colW + 2 * f, f, white, 1);
        this.rect(px, left - f, top, f, h, white, 1);
        this.rect(px, left + geo.colW, top, f, h, white, 1);
      }
    });
  }

  /** Column of segment `index` for `segments` in `rect` (JUICE #18). */
  slot(rect: Rect, segments: readonly PanoramaSegment[], index: number): Rect | null {
    return panoramaSlot(rect, segments, index, this.style);
  }

  destroy(): void {
    for (const img of this.imgs) img.destroy();
    this.imgs.length = 0;
    this.used = 0;
  }

  private take(): Phaser.GameObjects.Image {
    let img = this.imgs[this.used];
    if (!img) {
      img = this.scene.add.image(0, 0, '__WHITE');
      this.imgs.push(img);
    }
    this.used += 1;
    return img.setVisible(true).setDepth(this.style.depth).setScale(1).setAlpha(1);
  }

  private rect(px: FrameRef, x: number, y: number, w: number, h: number, color: number, alpha: number): void {
    const img = this.take();
    img.setTexture(px.key, px.frame).setOrigin(0, 0).setPosition(x, y);
    img.setDisplaySize(w, h).setTint(color).setAlpha(alpha);
  }
}
