/**
 * Moves counter (UX_FLOWS §5.1 "Hamle sayacı": `layout.top.moves` 280 × 224, Baloo 2 800 at `font.size.display`, label
 * `hud.moves` at `font.size.small`; JUICE #50, #51, #53). A dumb view: the EventPlayer drives every animation through
 * the setters (`rollTo`, `setDanger`, `setBump` …); the number shown is the one the EventPlayer last set, which trails
 * the core state until the move's cues reach step 4 (JUICE §0 rule 10).
 *
 * The panel is drawn once per layout (no per-frame Graphics, TECH §10.6); the last-moves pulse only scales the
 * container.
 */
import type Phaser from 'phaser';
import { t } from '../services/i18n.ts';
import type { Rect } from '../theme/layout.ts';
import { TOKENS } from '../theme/tokens.ts';
import { hex, textStyle } from './text.ts';
import { addBakedGraphics } from './BakedGraphics.ts';

const C = TOKENS.color.ui;

export class MovesCounter {
  private readonly root: Phaser.GameObjects.Container;
  private readonly panel: Phaser.GameObjects.Graphics;
  private readonly danger: Phaser.GameObjects.Graphics;
  private readonly cur: Phaser.GameObjects.Text;
  private readonly next: Phaser.GameObjects.Text;
  private readonly label: Phaser.GameObjects.Text;
  private rect: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private valueY = 0;
  private value = 0;
  private dangerOn = false;
  private pulseOn = false;
  private pulseStart = 0;
  private bump = 1;

  constructor(scene: Phaser.Scene, depth: number) {
    this.panel = addBakedGraphics(scene);
    this.danger = addBakedGraphics(scene).setVisible(false);
    this.cur = scene.add.text(0, 0, '', textStyle('display', C.ink)).setOrigin(0.5, 0.5);
    this.next = scene.add.text(0, 0, '', textStyle('display', C.ink)).setOrigin(0.5, 0.5).setVisible(false);
    this.label = scene.add.text(0, 0, t('hud.moves'), textStyle('small', C.inkSoft)).setOrigin(0.5, 0.5);
    this.root = scene.add
      .container(0, 0, [this.panel, this.danger, this.cur, this.next, this.label])
      .setDepth(depth);
  }

  layout(rect: Rect): void {
    this.rect = rect;
    const w = rect.w;
    const h = rect.h;
    const r = TOKENS.radius.panel;
    const lip = TOKENS.shadow.panelLipPx;
    this.root.setPosition(rect.x + w / 2, rect.y + h / 2);
    const g = this.panel.clear();
    g.fillStyle(hex(C.panelShadow), 1).fillRoundedRect(-w / 2, -h / 2 + lip, w, h - lip, r);
    g.fillStyle(hex(C.panel), 1).fillRoundedRect(-w / 2, -h / 2, w, h - lip, r);
    g.lineStyle(TOKENS.stroke.iconPx, hex(C.panelEdge), 1).strokeRoundedRect(-w / 2, -h / 2, w, h - lip, r);
    const d = this.danger.clear();
    d.lineStyle(TOKENS.stroke.iconPx, hex(C.danger), 1).strokeRoundedRect(-w / 2, -h / 2, w, h - lip, r);
    this.valueY = -h / 2 + (h - lip) * 0.42;
    this.cur.setPosition(0, this.valueY);
    this.next.setPosition(0, this.valueY);
    this.label.setPosition(0, -h / 2 + (h - lip) * 0.82);
  }

  /** New language: the `hud.moves` label. */
  relabel(): void {
    this.label.setText(t('hud.moves'));
  }

  /** Shows `n` at once (level start, reduced motion, re-sync). */
  set(n: number): void {
    this.value = n;
    this.cur.setText(String(n)).setPosition(0, this.valueY).setAlpha(1);
    this.next.setVisible(false);
  }

  get shown(): number {
    return this.value;
  }

  /** JUICE #50 roll toward `n`: `k` 0 → 1 (old digit up and out, new one in from below by `px`). */
  rollTo(n: number, k: number, px: number): void {
    if (k >= 1) {
      this.set(n);
      return;
    }
    if (!this.next.visible || this.next.text !== String(n)) this.next.setText(String(n)).setVisible(true);
    this.cur.setPosition(0, this.valueY - k * px).setAlpha(1 - k);
    this.next.setPosition(0, this.valueY + (1 - k) * px).setAlpha(k);
  }

  /** JUICE #51: red digit + red edge (kept in reduced motion); `pulse` = the 1,0 ↔ 1,06 loop. */
  setDanger(on: boolean, pulse: boolean, now: number): void {
    if (on !== this.dangerOn) {
      this.dangerOn = on;
      const color = on ? C.danger : C.ink;
      this.cur.setColor(color);
      this.next.setColor(color);
      this.danger.setVisible(on);
    }
    if (pulse && !this.pulseOn) this.pulseStart = now;
    this.pulseOn = on && pulse;
  }

  /** Reduced motion switched (JUICE §0 rule 8): the #51 loop stops (or starts again) at once, the red stays. */
  setPulse(pulse: boolean, now: number): void {
    const on = this.dangerOn && pulse;
    if (on && !this.pulseOn) this.pulseStart = now;
    this.pulseOn = on;
  }

  /** Extra scale from a bump (#51 strong pulse, #53 1,2). */
  setBump(scale: number): void {
    this.bump = scale;
  }

  /** Per frame: loop pulse × bump. `period` = `duration.lastMovesPulse`, `peak` = 1,06. */
  update(now: number, period: number, peak: number): void {
    let s = this.bump;
    if (this.pulseOn)
      s *= 1 + (peak - 1) * 0.5 * (1 - Math.cos((2 * Math.PI * (now - this.pulseStart)) / period));
    this.root.setScale(s);
  }

  /** Centre of the number (chips and coins fly to / from here). */
  point(): { x: number; y: number } {
    return { x: this.rect.x + this.rect.w / 2, y: this.rect.y + this.rect.h / 2 + this.valueY };
  }

  setVisible(on: boolean): void {
    this.root.setVisible(on);
  }

  destroy(): void {
    this.root.destroy(true);
  }
}
