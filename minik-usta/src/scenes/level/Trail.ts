/**
 * Ghost trail of one block (JUICE #3 drag trail "3 karelik soluk iz (%25)", #6 wall pass "3 hayalet %30 → 0", #10 fall
 * "2 karelik dikey iz (%20)"): up to 3 pooled images repeat where the block was 1, 2, 3 frames ago (a fixed ring buffer;
 * no allocation per frame). `tint` null shows the block itself, a colour shows a filled silhouette (white ghosts).
 */
import Phaser from 'phaser';
import { FRAME } from '../../theme/textures.ts';
import { BOOT_ATLAS_KEY } from '../atlas.ts';
import type { PieceView } from './PieceView.ts';

const MAX_GHOSTS = 3;
const RING = 8;

export class Trail {
  private readonly ghosts: Phaser.GameObjects.Image[] = [];
  private readonly xs = new Float32Array(RING);
  private readonly ys = new Float32Array(RING);
  private readonly sx = new Float32Array(RING);
  private readonly sy = new Float32Array(RING);
  private readonly rot = new Float32Array(RING);
  private head = 0;
  private filled = 0;
  private view: PieceView | null = null;
  private start = 0;
  private until = 0;
  private frames = 0;
  private alpha = 0;
  private fade = false;

  constructor(scene: Phaser.Scene) {
    for (let i = 0; i < MAX_GHOSTS; i++)
      this.ghosts.push(scene.add.image(0, 0, BOOT_ATLAS_KEY, FRAME.whitePixel).setVisible(false));
  }

  /** Follows `view` from `time` for `ms` (`fade`: the ghosts fade out over the duration, #6). */
  begin(
    view: PieceView,
    time: number,
    frames: number,
    alpha: number,
    tint: number | null,
    ms: number,
    fade = false,
  ): void {
    const keep = this.view === view;
    this.view = view;
    this.start = time;
    this.until = time + ms;
    this.frames = Math.min(MAX_GHOSTS, frames);
    this.alpha = alpha;
    this.fade = fade;
    if (!keep) this.filled = 0;
    const img = view.image;
    for (const g of this.ghosts) {
      g.setTexture(img.texture.key, img.frame.name).setOrigin(0.5, 0.5);
      g.setDepth(img.depth - 0.5).setBlendMode(Phaser.BlendModes.NORMAL);
      if (tint === null) g.clearTint();
      else g.setTint(tint).setTintMode(Phaser.TintModes.FILL);
    }
  }

  /** Stops the trail of `view` (or any trail). */
  stop(view?: PieceView): void {
    if (view && this.view !== view) return;
    this.view = null;
    this.filled = 0;
    for (const g of this.ghosts) g.setVisible(false);
  }

  /** Per frame, after the view was rendered. */
  update(now: number): void {
    const v = this.view;
    if (!v) return;
    if (now >= this.until || !v.bound) {
      this.stop();
      return;
    }
    if (now < this.start) return;
    const img = v.image;
    this.head = (this.head + 1) % RING;
    this.xs[this.head] = img.x;
    this.ys[this.head] = img.y;
    this.sx[this.head] = img.scaleX;
    this.sy[this.head] = img.scaleY;
    this.rot[this.head] = img.angle;
    this.filled = Math.min(RING, this.filled + 1);
    const u = (now - this.start) / Math.max(1, this.until - this.start);
    const base = this.fade ? this.alpha * (1 - u) : this.alpha;
    this.ghosts.forEach((g, k) => {
      const back = k + 1;
      if (k >= this.frames || back >= this.filled) {
        g.setVisible(false);
        return;
      }
      const i = (this.head - back + RING) % RING;
      g.setPosition(this.xs[i] ?? 0, this.ys[i] ?? 0)
        .setScale(this.sx[i] ?? 1, this.sy[i] ?? 1)
        .setAngle(this.rot[i] ?? 0)
        .setAlpha(base * (1 - k / (this.frames + 1)))
        .setVisible(true);
    });
  }
}
