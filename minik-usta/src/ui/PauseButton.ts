/**
 * Pause button (UX_FLOWS §5.1 "Duraklat": 128 × 128 at `layout.top.pause`, top-left — deliberately in the hard-to-reach
 * zone, §0.2). A cream square with two bars; a tap opens the Pause window. It is a `ButtonTarget` for JUICE #69.
 */
import type Phaser from 'phaser';
import type { Rect } from '../theme/layout.ts';
import { TOKENS } from '../theme/tokens.ts';
import { drawPauseBars } from './icons.ts';
import { hex } from './text.ts';
import { UI } from './uiConstants.ts';
import { addBakedGraphics } from './BakedGraphics.ts';

const C = TOKENS.color.ui;

/** The button's touch area for `rect`: a centred square of at least `touch.minTargetPx` (UX §0.3). */
export function pauseHitRect(rect: Rect): Rect {
  const side = Math.max(TOKENS.touch.minTargetPx, Math.max(rect.w, rect.h));
  return { x: rect.x + rect.w / 2 - side / 2, y: rect.y + rect.h / 2 - side / 2, w: side, h: side };
}

export class PauseButton {
  readonly root: Phaser.GameObjects.Container;
  private readonly face: Phaser.GameObjects.Container;
  private readonly bg: Phaser.GameObjects.Graphics;
  private readonly lip: Phaser.GameObjects.Graphics;
  private readonly lipPx = TOKENS.shadow.buttonLipPx;
  private pressed = false;
  private tapFn: (() => void) | null = null;
  private pressFn: ((variant: 'press' | 'release') => void) | null = null;

  constructor(scene: Phaser.Scene, depth: number) {
    this.lip = addBakedGraphics(scene);
    this.bg = addBakedGraphics(scene);
    const bars = addBakedGraphics(scene);
    drawPauseBars(bars, UI.pauseBarW, UI.pauseBarH, UI.pauseBarGap);
    bars.setY(-this.lipPx / 2);
    this.face = scene.add.container(0, 0, [this.bg, bars]);
    this.root = scene.add.container(0, 0, [this.lip, this.face]).setDepth(depth);
    this.root.on('pointerdown', () => {
      this.pressed = true;
      this.pressFn?.('press');
    });
    this.root.on('pointerup', (pointer: Phaser.Input.Pointer) => {
      if (!this.pressed) return;
      this.pressed = false;
      this.pressFn?.('release');
      // a touch the system cancelled (touchcancel) releases the press but is no tap
      if (!pointer.wasCanceled) this.tapFn?.();
    });
    this.root.on('pointerout', () => {
      if (!this.pressed) return;
      this.pressed = false;
      this.pressFn?.('release');
    });
  }

  layout(rect: Rect): void {
    const { w, h } = rect;
    const r = TOKENS.radius.chip;
    this.lip
      .clear()
      .fillStyle(hex(C.neutralLip), 1)
      .fillRoundedRect(-w / 2, -h / 2 + this.lipPx, w, h - this.lipPx, r);
    this.bg
      .clear()
      .fillStyle(hex(C.neutral), 1)
      .fillRoundedRect(-w / 2, -h / 2, w, h - this.lipPx, r);
    this.root.setPosition(rect.x + w / 2, rect.y + h / 2);
    const hit = pauseHitRect(rect);
    this.root.setSize(hit.w, hit.h);
    if (!this.root.input) this.root.setInteractive();
  }

  onTap(fn: () => void): this {
    this.tapFn = fn;
    return this;
  }

  onPress(fn: (variant: 'press' | 'release') => void): this {
    this.pressFn = fn;
    return this;
  }

  get x(): number {
    return this.root.x;
  }
  set x(v: number) {
    this.root.x = v;
  }
  get y(): number {
    return this.root.y;
  }
  set y(v: number) {
    this.root.y = v;
  }
  get scaleX(): number {
    return this.root.scaleX;
  }
  set scaleX(v: number) {
    this.root.scaleX = v;
  }
  get scaleY(): number {
    return this.root.scaleY;
  }
  set scaleY(v: number) {
    this.root.scaleY = v;
  }
  get alpha(): number {
    return this.root.alpha;
  }
  set alpha(v: number) {
    this.root.alpha = v;
  }

  setLip(px: number): void {
    this.face.y = this.lipPx - px;
  }

  setVisible(on: boolean): void {
    this.root.setVisible(on);
  }

  destroy(): void {
    this.root.destroy(true);
  }
}
