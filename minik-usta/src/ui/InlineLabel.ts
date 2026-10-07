/**
 * A one-line label with inline icons (STORY §0-11: `{coin}`, `{ok}` stay in the translated text; services/i18n
 * `splitInline` cuts it into text and icon runs). Text runs are Phaser `Text` in the role's style; icons are 1 em
 * procedural images (ui/icons.ts). The runs are laid out left → right inside one container, aligned on its origin
 * (left / centre / right). Rebuilt only when the text changes (TECH §10.3 `Label`: update on change only).
 */
import type Phaser from 'phaser';
import { splitInline } from '../services/i18n.ts';
import { TOKENS } from '../theme/tokens.ts';
import { drawCoin, drawOk } from './icons.ts';
import { textStyle } from './text.ts';
import type { FontRole } from './text.ts';
import { UI } from './uiConstants.ts';
import { addBakedGraphics } from './BakedGraphics.ts';

export type LabelAlign = 'left' | 'center' | 'right';

/** Gap between a run and an icon (px, ≈ a thin space at 56 px). */
const ICON_GAP = 6;

export class InlineLabel {
  readonly root: Phaser.GameObjects.Container;
  private readonly scene: Phaser.Scene;
  private readonly role: FontRole;
  private color: string;
  private readonly align: LabelAlign;
  private text = '';
  private widthPx = 0;

  constructor(scene: Phaser.Scene, role: FontRole, color: string, align: LabelAlign = 'center') {
    this.scene = scene;
    this.role = role;
    this.color = color;
    this.align = align;
    this.root = scene.add.container(0, 0);
  }

  get width(): number {
    return this.widthPx;
  }

  get height(): number {
    return TOKENS.font.size[this.role] * TOKENS.font.lineHeight[this.role];
  }

  setText(text: string): this {
    if (text === this.text && this.root.length > 0) return this;
    this.text = text;
    this.rebuild();
    return this;
  }

  setColor(color: string): this {
    if (color === this.color) return this;
    this.color = color;
    this.rebuild();
    return this;
  }

  setPosition(x: number, y: number): this {
    this.root.setPosition(x, y);
    return this;
  }

  destroy(): void {
    this.root.destroy(true);
  }

  private rebuild(): void {
    this.root.removeAll(true);
    const em = TOKENS.font.size[this.role] * UI.inlineIconEm;
    const items: { obj: Phaser.GameObjects.Text | Phaser.GameObjects.Graphics; w: number; icon: boolean }[] =
      [];
    for (const run of splitInline(this.text)) {
      if (run.kind === 'text') {
        if (run.text.length === 0) continue;
        const t = this.scene.add.text(0, 0, run.text, textStyle(this.role, this.color)).setOrigin(0, 0.5);
        items.push({ obj: t, w: t.width, icon: false });
      } else {
        const g = addBakedGraphics(this.scene);
        if (run.icon === 'coin') drawCoin(g, em * 0.8);
        else drawOk(g, em * 0.8);
        items.push({ obj: g, w: em * 0.8, icon: true });
      }
    }
    let total = 0;
    items.forEach((it, i) => {
      if (i > 0 && (it.icon || items[i - 1]?.icon)) total += ICON_GAP;
      total += it.w;
    });
    this.widthPx = total;
    let x = this.align === 'left' ? 0 : this.align === 'right' ? -total : -total / 2;
    items.forEach((it, i) => {
      if (i > 0 && (it.icon || items[i - 1]?.icon)) x += ICON_GAP;
      it.obj.setPosition(it.icon ? x + it.w / 2 : x, 0);
      this.root.add(it.obj);
      x += it.w;
    });
  }
}
