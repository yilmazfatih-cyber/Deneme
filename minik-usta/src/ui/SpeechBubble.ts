/**
 * Speech bubble (UX_FLOWS §13.1 "Usta Dede balonu": bust 200 px + bubble at most 760 × 280, `font.size.body`; STORY §4.0
 * intro balloons). The text is word-wrapped greedily inside the bubble width; inline icons (`{ok}`, `{coin}`) keep their
 * 1 em size (InlineLabel per line). Drawn once per text (no per-frame Graphics).
 */
import type Phaser from 'phaser';
import { splitInline } from '../services/i18n.ts';
import { TOKENS } from '../theme/tokens.ts';
import { drawDedeBust } from './icons.ts';
import { InlineLabel } from './InlineLabel.ts';
import { hex, textStyle } from './text.ts';
import { UI } from './uiConstants.ts';
import { addBakedGraphics, bakeNow } from './BakedGraphics.ts';

const C = TOKENS.color.ui;

/** Greedy word wrap of a text with inline icons; `measure` gives a plain word's width. */
export function wrapWords(
  text: string,
  maxW: number,
  measure: (word: string) => number,
  iconW: number,
  spaceW: number,
): string[] {
  const words = text.split(/\s+/).filter((w) => w.length > 0);
  const width = (word: string): number =>
    splitInline(word).reduce((s, r) => s + (r.kind === 'icon' ? iconW : measure(r.text)), 0);
  const lines: string[] = [];
  let line = '';
  let lineW = 0;
  for (const w of words) {
    const ww = width(w);
    if (line.length > 0 && lineW + spaceW + ww > maxW) {
      lines.push(line);
      line = w;
      lineW = ww;
    } else {
      lineW += (line.length > 0 ? spaceW : 0) + ww;
      line = line.length > 0 ? `${line} ${w}` : w;
    }
  }
  if (line.length > 0) lines.push(line);
  return lines;
}

export interface BubbleOptions {
  /** Usta Dede's bust on the left (tutorial); off for the intro balloons. */
  readonly bust: boolean;
  /** Bubble width limit (default UX §13.1 760). */
  readonly maxW?: number;
}

export class SpeechBubble {
  readonly root: Phaser.GameObjects.Container;
  private readonly scene: Phaser.Scene;
  private readonly opts: BubbleOptions;
  private readonly bg: Phaser.GameObjects.Graphics;
  private readonly bust: Phaser.GameObjects.Graphics | null;
  private lines: InlineLabel[] = [];
  private text = '';
  private size = { w: 0, h: 0 };

  constructor(scene: Phaser.Scene, depth: number, opts: BubbleOptions) {
    this.scene = scene;
    this.opts = opts;
    this.bg = addBakedGraphics(scene);
    const parts: Phaser.GameObjects.GameObject[] = [this.bg];
    this.bust = null;
    if (opts.bust) {
      this.bust = addBakedGraphics(scene);
      drawDedeBust(this.bust, UI.dedeBustPx);
      parts.push(this.bust);
    }
    this.root = scene.add.container(0, 0, parts).setDepth(depth).setVisible(false);
  }

  /** Total width / height of bust + bubble (for placement). */
  get width(): number {
    return (this.opts.bust ? UI.dedeBustPx + 16 : 0) + this.size.w;
  }

  get height(): number {
    return Math.max(this.size.h, this.opts.bust ? UI.dedeBustPx : 0);
  }

  /** Width of the box alone (without the bust). */
  get boxWidth(): number {
    return this.size.w;
  }

  /** Lines of the wrapped text (UX §13.1: a candidate whose box needs more than 3 is invalid). */
  get lineCount(): number {
    return this.lines.length;
  }

  setText(text: string): this {
    if (text === this.text) return this;
    this.text = text;
    for (const l of this.lines) l.destroy();
    this.lines = [];
    const role = 'body';
    const pad = UI.bubblePadPx;
    const maxW = (this.opts.maxW ?? UI.bubbleMaxW) - 2 * pad;
    const probe = this.scene.add.text(0, 0, '', textStyle(role, C.ink)).setVisible(false);
    const measure = (w: string): number => probe.setText(w).width;
    const space = measure('a a') - measure('aa');
    const em = TOKENS.font.size[role];
    const wrapped = wrapWords(text, maxW, measure, em * UI.inlineIconEm, space);
    probe.destroy();
    const lineH = em * TOKENS.font.lineHeight[role];
    const labels = wrapped.map((l) => new InlineLabel(this.scene, role, C.ink, 'left').setText(l));
    const textW = Math.max(0, ...labels.map((l) => l.width));
    const w = Math.min(this.opts.maxW ?? UI.bubbleMaxW, textW + 2 * pad);
    const h = Math.min(UI.bubbleMaxH, wrapped.length * lineH + 2 * pad);
    this.size = { w, h };
    const x0 = this.opts.bust ? UI.dedeBustPx + 16 : 0;
    const top = this.opts.bust ? Math.max(0, (UI.dedeBustPx - h) / 2) : 0;
    const g = this.bg.clear();
    const r = TOKENS.radius.panel;
    g.fillStyle(hex(C.panelShadow), 1).fillRoundedRect(x0, top + 8, w, h, r);
    g.fillStyle(hex(C.panel), 1).fillRoundedRect(x0, top, w, h, r);
    g.lineStyle(TOKENS.stroke.iconSmallPx, hex(C.panelEdge), 1).strokeRoundedRect(x0, top, w, h, r);
    if (this.opts.bust) {
      // the bubble's tail points at the bust
      g.fillStyle(hex(C.panel), 1).fillTriangle(
        x0,
        top + h / 2 - 20,
        x0,
        top + h / 2 + 20,
        x0 - 18,
        top + h / 2,
      );
      this.bust?.setPosition(UI.dedeBustPx / 2, UI.dedeBustPx / 2);
    }
    labels.forEach((l, i) => {
      l.setPosition(x0 + pad, top + pad + lineH * (i + 0.5));
      this.root.add(l.root);
    });
    this.lines = labels;
    return this;
  }

  /** Bakes the box and the bust now (a bubble built ahead of time shows without a bake in that frame). */
  prebake(): this {
    bakeNow(this.bg);
    if (this.bust) bakeNow(this.bust);
    return this;
  }

  setPosition(x: number, y: number): this {
    this.root.setPosition(x, y);
    return this;
  }

  get visible(): boolean {
    return this.root.visible;
  }

  /** Bust + bubble box at the current position (design px). */
  get rect(): { readonly x: number; readonly y: number; readonly w: number; readonly h: number } {
    return { x: this.root.x, y: this.root.y, w: this.width, h: this.height };
  }

  setVisible(on: boolean): this {
    this.root.setVisible(on);
    return this;
  }

  setAlpha(a: number): this {
    this.root.setAlpha(a);
    return this;
  }

  destroy(): void {
    this.root.destroy(true);
  }
}
