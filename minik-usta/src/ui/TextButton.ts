/**
 * A raised text button (UX §0.3 "Düğme": face + lip, `shadow.buttonLipPx` → `buttonPressedLipPx` when pressed;
 * JUICE #69). The face and the lip are two Graphics drawn once; pressing only moves the face down (no redraw). The
 * hit area is the visual + pad up to `touch.minTargetPx` (UX §0.3 "görsel + pay"). The label is an i18n text.
 *
 * It is a `ButtonTarget` (juice/stage.ts): the EventPlayer's #69 handler animates `scaleX/scaleY` and calls `setLip`.
 */
import type Phaser from 'phaser';
import { hitArea } from '../theme/layout.ts';
import { TOKENS } from '../theme/tokens.ts';
import { hex, textStyle } from './text.ts';
import { addBakedGraphics } from './BakedGraphics.ts';

export type ButtonTone = 'primary' | 'secondary' | 'neutral';

const TONES: Readonly<Record<ButtonTone, { face: string; lip: string; ink: string }>> = {
  primary: { face: TOKENS.color.ui.primary, lip: TOKENS.color.ui.primaryLip, ink: TOKENS.color.ui.inkOnDark },
  secondary: {
    face: TOKENS.color.ui.secondary,
    lip: TOKENS.color.ui.secondaryLip,
    ink: TOKENS.color.ui.inkOnDark,
  },
  neutral: { face: TOKENS.color.ui.neutral, lip: TOKENS.color.ui.neutralLip, ink: TOKENS.color.ui.ink },
};

export class TextButton {
  readonly root: Phaser.GameObjects.Container;
  private readonly face: Phaser.GameObjects.Container;
  private readonly label: Phaser.GameObjects.Text;
  private readonly lipPx = TOKENS.shadow.buttonLipPx;

  constructor(
    scene: Phaser.Scene,
    label: string,
    size: { readonly w: number; readonly h: number },
    tone: ButtonTone,
    depth: number,
  ) {
    const c = TONES[tone];
    const r = TOKENS.radius.button;
    const { w, h } = size;
    const lip = addBakedGraphics(scene);
    lip.fillStyle(hex(c.lip), 1).fillRoundedRect(-w / 2, -h / 2 + this.lipPx, w, h - this.lipPx, r);
    const bg = addBakedGraphics(scene);
    bg.fillStyle(hex(c.face), 1).fillRoundedRect(-w / 2, -h / 2, w, h - this.lipPx, r);
    const text = scene.add.text(0, -this.lipPx / 2, label, textStyle('button', c.ink)).setOrigin(0.5);
    this.label = text;
    this.face = scene.add.container(0, 0, [bg, text]);
    this.root = scene.add.container(0, 0, [lip, this.face]).setDepth(depth);
    const hit = hitArea({ x: -w / 2, y: -h / 2, w, h }, TOKENS.touch.minTargetPx);
    this.root.setSize(hit.w, hit.h);
    this.root.setInteractive();
  }

  /** New label text (a language change). */
  setLabel(text: string): void {
    this.label.setText(text);
  }

  // ButtonTarget (JUICE #69)
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

  /** Visible lip height (px): the face moves down by the difference. */
  setLip(px: number): void {
    this.face.y = this.lipPx - px;
  }

  setVisible(on: boolean): void {
    this.root.setVisible(on);
    if (on) this.root.setInteractive();
    else this.root.disableInteractive();
  }

  /** `canceled`: the touch was cancelled by the system (`touchcancel`, `pointer.wasCanceled`) — no tap. */
  on(event: 'pointerdown' | 'pointerup' | 'pointerout', fn: (canceled: boolean) => void): void {
    this.root.on(event, (pointer?: Phaser.Input.Pointer) => fn(pointer?.wasCanceled === true));
  }

  destroy(): void {
    this.root.destroy(true);
  }
}
