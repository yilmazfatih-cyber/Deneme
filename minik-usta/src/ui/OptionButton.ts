/**
 * Window option / raised button (UX_FLOWS §0.3: "Birincil", "İkincil", "Nötr", "Eşit çift düğme", "Metin düğme",
 * "Fiyat etiketi (PriceLabel)"; R-15 equal options; JUICE #69 press). A face + lip drawn once (two Graphics); pressing
 * only moves the face down. Content: a main label (inline icons allowed) and, for priced or counted options, a right
 * column — the PriceLabel's two lines ("● 900" over "≈ ₺81") or one small line ("bugün 1/3").
 *
 * Colours by tone (tokens `color.ui.*`); the second line is `ui.ink` on coloured faces and `ui.inkSoft` on cream
 * (UX §0.3 contrast rule). A disabled option stays visible and grey (UX §7: "gizlenmez") and does nothing on tap.
 * It is a `ButtonTarget` (juice/stage.ts) so the EventPlayer's #69 handler can animate it.
 */
import type Phaser from 'phaser';
import { hitArea } from '../theme/layout.ts';
import { TOKENS } from '../theme/tokens.ts';
import { drawPlay } from './icons.ts';
import { InlineLabel } from './InlineLabel.ts';
import { hex } from './text.ts';
import { addBakedGraphics } from './BakedGraphics.ts';

export type OptionTone = 'primary' | 'secondary' | 'neutral' | 'disabled' | 'text';

export interface OptionContent {
  readonly label: string;
  /** Leading "▶" (rewarded ad, UX §7). */
  readonly play?: boolean;
  /** PriceLabel (UX §0.3): coins line + real-money line. */
  readonly price?: { readonly line1: string; readonly line2: string } | null;
  /** One small right-hand line (ad: `lose.adToday` / `ads.none` / `ads.tomorrow`). */
  readonly sub?: string | null;
}

interface ToneColors {
  readonly face: string | null;
  readonly lip: string | null;
  readonly ink: string;
  readonly stroke: string | null;
  readonly line2: string;
}

const C = TOKENS.color.ui;
const TONES: Readonly<Record<OptionTone, ToneColors>> = {
  primary: { face: C.primary, lip: C.primaryLip, ink: C.inkOnDark, stroke: C.primaryStroke, line2: C.ink },
  secondary: {
    face: C.secondary,
    lip: C.secondaryLip,
    ink: C.inkOnDark,
    stroke: C.secondaryStroke,
    line2: C.ink,
  },
  neutral: { face: C.neutral, lip: C.neutralLip, ink: C.ink, stroke: null, line2: C.inkSoft },
  disabled: { face: C.disabled, lip: C.disabledLip, ink: C.ink, stroke: null, line2: C.ink },
  text: { face: null, lip: null, ink: C.inkSoft, stroke: null, line2: C.inkSoft },
};

/** Inner side padding of a label / the right column (px). */
const SIDE_PAD = 44;

export class OptionButton {
  readonly root: Phaser.GameObjects.Container;
  private readonly face: Phaser.GameObjects.Container;
  private readonly lipPx: number;
  private enabledNow = true;
  private pressed = false;
  private tapFn: (() => void) | null = null;
  private pressFn: ((variant: 'press' | 'release') => void) | null = null;

  constructor(
    scene: Phaser.Scene,
    size: { readonly w: number; readonly h: number },
    tone: OptionTone,
    content: OptionContent,
  ) {
    const c = TONES[tone];
    const { w, h } = size;
    const r = TOKENS.radius.button;
    this.lipPx = c.face ? TOKENS.shadow.buttonLipPx : 0;
    const parts: Phaser.GameObjects.GameObject[] = [];
    if (c.lip) {
      const lip = addBakedGraphics(scene);
      lip.fillStyle(hex(c.lip), 1).fillRoundedRect(-w / 2, -h / 2 + this.lipPx, w, h - this.lipPx, r);
      parts.push(lip);
    }
    const faceParts: Phaser.GameObjects.GameObject[] = [];
    if (c.face) {
      const bg = addBakedGraphics(scene);
      bg.fillStyle(hex(c.face), 1).fillRoundedRect(-w / 2, -h / 2, w, h - this.lipPx, r);
      faceParts.push(bg);
    }
    const cy = -this.lipPx / 2;
    const right = content.price ?? null;
    const sub = content.sub ?? null;
    const hasRight = right !== null || sub !== null;
    let labelX = hasRight ? -w / 2 + SIDE_PAD : 0;
    if (content.play) {
      const play = addBakedGraphics(scene);
      drawPlay(play, 48, c.ink);
      play.setPosition(labelX + 24, cy);
      faceParts.push(play);
      labelX += 60;
    }
    let rightW = 0;
    if (right) {
      const l1 = new InlineLabel(scene, 'button', c.ink, 'right').setText(right.line1);
      l1.setPosition(w / 2 - SIDE_PAD, cy - 22);
      if (c.stroke) for (const child of l1.root.list) strokeText(child, c.stroke);
      const l2 = new InlineLabel(scene, 'caption', c.line2, 'right').setText(right.line2);
      l2.setPosition(w / 2 - SIDE_PAD, cy + 34);
      faceParts.push(l1.root, l2.root);
      rightW = Math.max(l1.width, l2.width);
    } else if (sub) {
      const l2 = new InlineLabel(scene, 'caption', c.line2, 'right').setText(sub);
      l2.setPosition(w / 2 - SIDE_PAD, cy + 34);
      faceParts.push(l2.root);
      rightW = l2.width;
    }
    const label = new InlineLabel(scene, 'button', c.ink, hasRight ? 'left' : 'center');
    label.setText(content.label).setPosition(labelX, cy);
    if (c.stroke) for (const child of label.root.list) strokeText(child, c.stroke);
    // a long label shrinks to fit (TR texts run longer than EN; R-15: every option keeps the same size)
    const room = hasRight ? w / 2 - SIDE_PAD - rightW - SIDE_PAD / 2 - labelX : w - 2 * SIDE_PAD;
    if (label.width > room && label.width > 0) label.root.setScale(room / label.width);
    faceParts.push(label.root);
    this.face = scene.add.container(0, 0, faceParts);
    parts.push(this.face);
    this.root = scene.add.container(0, 0, parts);
    const hit = hitArea({ x: -w / 2, y: -h / 2, w, h }, TOKENS.touch.minTargetPx);
    this.root.setSize(hit.w, hit.h);
    this.root.setInteractive();
    this.root.on('pointerdown', () => {
      if (!this.enabledNow) return;
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

  get enabled(): boolean {
    return this.enabledNow;
  }

  setEnabled(on: boolean): this {
    this.enabledNow = on;
    return this;
  }

  onTap(fn: () => void): this {
    this.tapFn = fn;
    return this;
  }

  /** JUICE #69 hook (press / release). */
  onPress(fn: (variant: 'press' | 'release') => void): this {
    this.pressFn = fn;
    return this;
  }

  // ButtonTarget (JUICE #69) + Tweenable (#52 option entry)
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
    if (this.lipPx > 0) this.face.y = this.lipPx - px;
  }

  destroy(): void {
    this.root.destroy(true);
  }
}

/** UX §0.3 "metin beyaz + kontur" on coloured buttons. */
function strokeText(obj: Phaser.GameObjects.GameObject, color: string): void {
  const t = obj as Partial<Phaser.GameObjects.Text>;
  if (typeof t.setStroke === 'function')
    t.setStroke(color, Math.round(TOKENS.font.size.button * TOKENS.stroke.textEm));
}
