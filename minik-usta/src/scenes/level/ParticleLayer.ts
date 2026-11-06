/**
 * Draws the pooled particle field (JUICE §0 rule 4; TECH_DESIGN §10.4, §10.6): `particles.maxOnScreen` images created
 * ONCE at scene start, all from the boot atlas (one texture → one batch); each frame image i shows particle i, the rest
 * are hidden. No allocation per frame (the visit callback is a bound field).
 *
 * Frames: every family uses the 4 × 4 white pixel tinted with the particle colour until the boot atlas holds the
 * `fx_*` frames (ART / ASSET `fx_dust`, `fx_spark`, `fx_gold`, `fx_confetti`); `PARTICLE_FRAME` is the one place to
 * switch.
 */
import type Phaser from 'phaser';
import { FRAME } from '../../theme/textures.ts';
import { TOKENS } from '../../theme/tokens.ts';
import { BOOT_ATLAS_KEY } from '../atlas.ts';
import { hexColor } from './frameImage.ts';
import type { ParticleFamily } from './juice/catalog.ts';
import { ParticleField } from './juice/particles.ts';
import type { BurstSpec } from './juice/particles.ts';

export const PARTICLE_FRAME: Readonly<Record<ParticleFamily, string>> = Object.freeze({
  dust: FRAME.whitePixel,
  grayDust: FRAME.whitePixel,
  spark: FRAME.whitePixel,
  gold: FRAME.whitePixel,
  confetti: FRAME.whitePixel,
  wind: FRAME.whitePixel,
});

/** Default colour of a family (ART palette tokens). */
export const PARTICLE_COLOR: Readonly<Record<ParticleFamily, number>> = Object.freeze({
  dust: hexColor(TOKENS.color.board.yardFrame),
  grayDust: hexColor(TOKENS.color.board.wallDark),
  spark: 0xffffff,
  gold: hexColor(TOKENS.color.ui.gold),
  confetti: hexColor(TOKENS.color.ui.gold),
  wind: 0xffffff,
});

export class ParticleLayer {
  readonly field: ParticleField;
  private readonly imgs: Phaser.GameObjects.Image[] = [];
  private shown = 0;
  private drawn = 0;
  private readonly draw = (
    i: number,
    x: number,
    y: number,
    size: number,
    aspect: number,
    rot: number,
    color: number,
    alpha: number,
  ): void => {
    const img = this.imgs[i];
    if (!img) return;
    img
      .setPosition(x, y)
      .setDisplaySize(size, size * aspect)
      .setAngle(rot)
      .setTint(color)
      .setAlpha(alpha);
    if (!img.visible) img.setVisible(true);
    this.drawn = i + 1;
  };

  constructor(scene: Phaser.Scene, depth: number, field: ParticleField = new ParticleField()) {
    this.field = field;
    for (let i = 0; i < field.capacity; i++) {
      this.imgs.push(
        scene.add.image(0, 0, BOOT_ATLAS_KEY, FRAME.whitePixel).setDepth(depth).setVisible(false),
      );
    }
  }

  emit(spec: BurstSpec): number {
    return this.field.emit(spec, PARTICLE_COLOR[spec.family]);
  }

  /** Advances the simulation by `dtMs` and draws it. */
  update(dtMs: number): void {
    if (this.field.count === 0 && this.shown === 0) return;
    this.field.update(dtMs);
    this.drawn = 0;
    this.field.forEach(this.draw);
    for (let i = this.drawn; i < this.shown; i++) this.imgs[i]?.setVisible(false);
    this.shown = this.drawn;
  }

  clear(): void {
    this.field.clear();
    for (const img of this.imgs) img.setVisible(false);
    this.shown = 0;
  }
}
