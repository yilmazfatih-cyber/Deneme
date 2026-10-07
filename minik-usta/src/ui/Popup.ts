/**
 * Window (UX_FLOWS §0.3 "Pencere": cream panel, 12 px `panelEdge`, 48 px corners, `ui.overlay` dim at
 * `alpha.overlay`; §0.1 / TECH §10.1 popup anchor contract: the panel's bottom edge is at `H − popup.panelBottomPx`, the
 * options are stacked bottom → top from `optionsBottomInsetPx` above it — never vertically centred; R-15 equal options;
 * §0.3 "Kapat (×)").
 *
 * Content rows (title, text, switches, custom drawings) sit above the options; the panel grows upward to hold them. The
 * dim layer takes every touch under the window (the board and the HUD stay out). The window opens / closes through the
 * EventPlayer (JUICE #70 / #71, or #52 for the out-of-moves offer) via `target`; options press with #69.
 */
import type Phaser from 'phaser';
import type { Layout, Rect } from '../theme/layout.ts';
import { TOKENS } from '../theme/tokens.ts';
import { splitInline } from '../services/i18n.ts';
import { drawClose } from './icons.ts';
import { InlineLabel } from './InlineLabel.ts';
import { OptionButton } from './OptionButton.ts';
import type { OptionContent, OptionTone } from './OptionButton.ts';
import { hex, textStyle } from './text.ts';
import type { FontRole } from './text.ts';
import { UI } from './uiConstants.ts';
import { addBakedGraphics } from './BakedGraphics.ts';

const C = TOKENS.color.ui;

export interface PopupOption extends OptionContent {
  readonly id: string;
  readonly tone: OptionTone;
  readonly enabled?: boolean;
}

export type PopupRow =
  | { readonly kind: 'title'; readonly text: string }
  | { readonly kind: 'text'; readonly text: string; readonly role?: FontRole; readonly color?: string }
  | { readonly kind: 'gap'; readonly h: number }
  | { readonly kind: 'toggle'; readonly id: string; readonly label: string; readonly on: boolean }
  | {
      readonly kind: 'custom';
      readonly h: number;
      /** Builds the row's objects centred on x = 0, top at y = 0 (local to the row). */
      readonly build: (scene: Phaser.Scene, width: number) => Phaser.GameObjects.GameObject[];
    };

export interface PopupSpec {
  readonly rows: readonly PopupRow[];
  readonly options: readonly PopupOption[];
  /** `stack` = equal options one under the other (920 × 152); `pair` = UX §0.3 equal pair (2 × 440 × 152). */
  readonly arrange?: 'stack' | 'pair';
  /** × in the top-right corner (same result as the "no" option, R-15). */
  readonly close?: boolean;
}

export interface PopupHandlers {
  option(id: string): void;
  close?(): void;
  toggle?(id: string): void;
  /** JUICE #69 on any button of the window. */
  button?(b: OptionButton, variant: 'press' | 'release'): void;
}

/** Equal-pair rects (UX §0.3): one row at the lowest option slot. */
export function pairRects(layout: Layout): readonly Rect[] {
  const p = TOKENS.layout.popup;
  const y = layout.popup.optionsBottomY - p.optionH;
  const total = 2 * UI.pairW + UI.pairGapPx;
  const x0 = (layout.W - total) / 2;
  return [
    { x: x0, y, w: UI.pairW, h: p.optionH },
    { x: x0 + UI.pairW + UI.pairGapPx, y, w: UI.pairW, h: p.optionH },
  ];
}

interface Toggle {
  readonly pill: Phaser.GameObjects.Graphics;
  readonly state: Phaser.GameObjects.Text;
  on: boolean;
  readonly onText: string;
  readonly offText: string;
}

export class Popup {
  readonly dim: Phaser.GameObjects.Rectangle;
  readonly panel: Phaser.GameObjects.Container;
  readonly options: readonly OptionButton[];
  /** Panel rectangle in design px (tests of the anchor contract read it). */
  readonly rect: Rect;
  private readonly toggles = new Map<string, Toggle>();
  private readonly extras: Phaser.GameObjects.GameObject[] = [];
  private closeButton: Phaser.GameObjects.Container | null = null;

  constructor(
    scene: Phaser.Scene,
    layout: Layout,
    spec: PopupSpec,
    depth: number,
    handlers: PopupHandlers,
    toggleTexts: { readonly on: string; readonly off: string } = { on: '', off: '' },
  ) {
    const W = layout.W;
    const panelW = TOKENS.layout.popup.optionW + 2 * UI.panelSidePadPx;
    const innerW = panelW - 2 * UI.panelSidePadPx;
    const arrange = spec.arrange ?? 'stack';
    const optionRects: readonly Rect[] =
      spec.options.length === 0
        ? []
        : arrange === 'pair'
          ? pairRects(layout).slice(0, spec.options.length)
          : layout.popup.options(spec.options.length);
    const optionsTop =
      optionRects.length > 0 ? Math.min(...optionRects.map((r) => r.y)) : layout.popup.optionsBottomY;

    // rows → objects with heights (measured), laid out top → bottom later
    const built: { objs: Phaser.GameObjects.GameObject[]; h: number; place: (top: number) => void }[] = [];
    for (const row of spec.rows) {
      if (row.kind === 'gap') {
        built.push({ objs: [], h: row.h, place: () => {} });
        continue;
      }
      if (row.kind === 'title' || row.kind === 'text') {
        const role: FontRole = row.kind === 'title' ? 'h1' : (row.role ?? 'body');
        const color = row.kind === 'title' ? C.ink : (row.color ?? C.ink);
        if (splitInline(row.text).some((r) => r.kind === 'icon')) {
          // one line with inline icons (`{coin}`, `{ok}`, STORY §0-11), shrunk to the panel width when needed
          const label = new InlineLabel(scene, role, color, 'center').setText(row.text);
          if (label.width > innerW) label.root.setScale(innerW / label.width);
          const lh = label.height;
          built.push({ objs: [label.root], h: lh, place: (top) => label.setPosition(0, top + lh / 2) });
          continue;
        }
        const t = scene.add
          .text(0, 0, row.text, {
            ...textStyle(role, color),
            wordWrap: { width: innerW, useAdvancedWrap: true },
          })
          .setOrigin(0.5, 0);
        built.push({ objs: [t], h: t.height, place: (top) => t.setPosition(0, top) });
        continue;
      }
      if (row.kind === 'toggle') {
        const objs = this.buildToggle(scene, row, innerW, handlers, toggleTexts);
        built.push({
          objs,
          h: UI.toggleRowH,
          place: (top) => objs.forEach((o) => ((o as unknown as { y: number }).y += top)),
        });
        continue;
      }
      const objs = row.build(scene, innerW);
      built.push({
        objs,
        h: row.h,
        place: (top) => objs.forEach((o) => ((o as unknown as { y: number }).y += top)),
      });
    }
    const contentH = built.reduce((s, b) => s + b.h, 0) + Math.max(0, built.length - 1) * UI.contentGapPx;
    const bottom = layout.popup.panelBottomY;
    const top = optionsTop - UI.contentToOptionsPx - contentH - UI.panelTopPadPx;
    const h = bottom - top;
    this.rect = { x: (W - panelW) / 2, y: top, w: panelW, h };
    const cx = W / 2;
    const cy = top + h / 2;

    this.dim = scene.add
      .rectangle(0, 0, W, layout.H, hex(C.overlay), 1)
      .setOrigin(0, 0)
      .setDepth(depth)
      .setAlpha(TOKENS.alpha.overlay);
    this.dim.setInteractive(); // swallows every touch under the window

    const g = addBakedGraphics(scene);
    const r = TOKENS.radius.panel;
    const lip = TOKENS.shadow.panelLipPx;
    g.fillStyle(hex(C.panelShadow), 1).fillRoundedRect(-panelW / 2, -h / 2 + lip, panelW, h, r);
    g.fillStyle(hex(C.panelEdge), 1).fillRoundedRect(-panelW / 2, -h / 2, panelW, h, r);
    const e = UI.panelEdgePx;
    g.fillStyle(hex(C.panel), 1).fillRoundedRect(
      -panelW / 2 + e,
      -h / 2 + e,
      panelW - 2 * e,
      h - 2 * e,
      r - e,
    );
    const children: Phaser.GameObjects.GameObject[] = [g];

    let y = -h / 2 + UI.panelTopPadPx;
    for (const b of built) {
      b.place(y);
      children.push(...b.objs);
      y += b.h + UI.contentGapPx;
    }

    const buttons: OptionButton[] = [];
    spec.options.forEach((o, i) => {
      const rr = optionRects[i];
      if (!rr) return;
      const tone: OptionTone = o.enabled === false ? 'disabled' : o.tone;
      const btn = new OptionButton(scene, { w: rr.w, h: rr.h }, tone, o);
      btn.setEnabled(o.enabled !== false);
      btn.root.setPosition(rr.x + rr.w / 2 - cx, rr.y + rr.h / 2 - cy);
      btn.onTap(() => handlers.option(o.id));
      btn.onPress((v) => handlers.button?.(btn, v));
      buttons.push(btn);
      children.push(btn.root);
    });
    this.options = buttons;

    if (spec.close) {
      const close = scene.add.container(
        panelW / 2 - UI.closeVisualPx / 2 + UI.closeOverhangPx,
        -h / 2 + UI.closeVisualPx / 2 - UI.closeOverhangPx,
      );
      const cg = addBakedGraphics(scene);
      drawClose(cg, UI.closeVisualPx);
      close.add(cg);
      const size = Math.max(TOKENS.touch.minTargetPx, UI.closeVisualPx + 32);
      close.setSize(size, size).setInteractive();
      close.on('pointerup', (p: Phaser.Input.Pointer) => {
        if (!p.wasCanceled) handlers.close?.();
      });
      children.push(close);
      this.closeButton = close;
    }

    this.panel = scene.add.container(cx, cy, children).setDepth(depth + 1);
  }

  /** WindowTarget of JUICE #70 / #71 / #52 / #87. */
  get target(): {
    dim: Phaser.GameObjects.Rectangle;
    panel: Phaser.GameObjects.Container;
    options: readonly OptionButton[];
  } {
    return { dim: this.dim, panel: this.panel, options: this.options };
  }

  /** Centre of the × in design px (null without one): the harness taps it (tests/e2e). */
  get closePoint(): { readonly x: number; readonly y: number } | null {
    const c = this.closeButton;
    if (!c) return null;
    const p = this.panel;
    return { x: p.x + c.x * p.scaleX, y: p.y + c.y * p.scaleY };
  }

  /** Switch row state (Pause window). */
  setToggle(id: string, on: boolean): void {
    const t = this.toggles.get(id);
    if (!t || t.on === on) return;
    t.on = on;
    drawPill(t.pill, on);
    t.state.setText(on ? t.onText : t.offText).setColor(on ? C.inkOnDark : C.ink);
  }

  /** Extra objects owned by the window (destroyed with it). */
  own(...objs: Phaser.GameObjects.GameObject[]): void {
    this.extras.push(...objs);
  }

  setVisible(on: boolean): void {
    this.dim.setVisible(on);
    this.panel.setVisible(on);
  }

  destroy(): void {
    for (const o of this.extras) o.destroy();
    this.panel.destroy(true);
    this.dim.destroy();
  }

  private buildToggle(
    scene: Phaser.Scene,
    row: Extract<PopupRow, { kind: 'toggle' }>,
    innerW: number,
    handlers: PopupHandlers,
    texts: { readonly on: string; readonly off: string },
  ): Phaser.GameObjects.GameObject[] {
    const h = UI.toggleRowH;
    const label = scene.add.text(-innerW / 2, h / 2, row.label, textStyle('body', C.ink)).setOrigin(0, 0.5);
    const pill = addBakedGraphics(scene).setPosition(innerW / 2 - UI.togglePillW / 2, h / 2);
    drawPill(pill, row.on);
    const state = scene.add
      .text(
        innerW / 2 - UI.togglePillW / 2,
        h / 2,
        row.on ? texts.on : texts.off,
        textStyle('small', row.on ? C.inkOnDark : C.ink),
      )
      .setOrigin(0.5, 0.5);
    const zone = scene.add.zone(0, h / 2, innerW, h).setInteractive();
    zone.on('pointerup', (p: Phaser.Input.Pointer) => {
      if (!p.wasCanceled) handlers.toggle?.(row.id);
    });
    this.toggles.set(row.id, { pill, state, on: row.on, onText: texts.on, offText: texts.off });
    return [label, pill, state, zone];
  }
}

function drawPill(g: Phaser.GameObjects.Graphics, on: boolean): void {
  const w = UI.togglePillW;
  const h = UI.togglePillH;
  g.clear();
  g.fillStyle(hex(on ? C.primaryLip : C.disabledLip), 1).fillRoundedRect(
    -w / 2,
    -h / 2 + 6,
    w,
    h,
    TOKENS.radius.toggle,
  );
  g.fillStyle(hex(on ? C.primary : C.disabled), 1).fillRoundedRect(
    -w / 2,
    -h / 2,
    w,
    h,
    TOKENS.radius.toggle,
  );
}
