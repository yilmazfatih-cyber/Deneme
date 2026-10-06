/**
 * Status strip under the board (UX_FLOWS §5.1: `layout.board.status`, board group — it moves with the board in EXPAND):
 * left "Usta Serisi" with 4 beads and the Golden Trowel icon (K-33; tap → trowel use, UX §5.2), right the "Kamyonda: N"
 * chip (K-26; hidden at 0, "Kamyonda: 0" is never written). A dumb view: the EventPlayer drives JUICE #15 (bead pop),
 * #16 (trowel glow), #20 / #88 (chip bump) through the setters. Graphics are redrawn only when a value changes.
 *
 * Touch: the trowel icon is a 128 px target (`touch.minTargetPx`, UX §0.3 "görsel + pay"); being interactive, it
 * keeps the board's drag controller out (DragController ignores presses over HUD objects).
 */
import type Phaser from 'phaser';
import { t } from '../services/i18n.ts';
import type { Rect } from '../theme/layout.ts';
import { TOKENS } from '../theme/tokens.ts';
import { hex, textStyle } from './text.ts';

const C = TOKENS.color.ui;
/** UX §5.1: 4 beads (K-33 `COMBO_FOR_TROWEL`). */
export const STREAK_BEADS = 4;
const PAD = 24;
const BEAD_R = 20;
const BEAD_STEP = 56;
const ICON = 72;
const CHIP_H = 72;

export class StatusStrip {
  private readonly panel: Phaser.GameObjects.Graphics;
  private readonly label: Phaser.GameObjects.Text;
  private readonly beads: Phaser.GameObjects.Graphics[] = [];
  private readonly glow: Phaser.GameObjects.Graphics;
  private readonly trowel: Phaser.GameObjects.Graphics;
  private readonly trowelCount: Phaser.GameObjects.Text;
  private readonly trowelZone: Phaser.GameObjects.Zone;
  private readonly chip: Phaser.GameObjects.Container;
  private readonly chipBg: Phaser.GameObjects.Graphics;
  private readonly chipText: Phaser.GameObjects.Text;
  private streak = -1;
  private trowels = -1;
  private queued = -1;
  private beadXs: number[] = [];
  private rowY = 0;
  private trowelX = 0;
  private chipX = 0;
  private onTrowel: (() => void) | null = null;

  constructor(scene: Phaser.Scene, depth: number) {
    this.panel = scene.add.graphics().setDepth(depth);
    this.label = scene.add.text(0, 0, t('hud.streak'), textStyle('small', C.ink)).setOrigin(0, 0.5).setDepth(depth + 1);
    for (let i = 0; i < STREAK_BEADS; i++) this.beads.push(scene.add.graphics().setDepth(depth + 1));
    this.glow = scene.add.graphics().setDepth(depth + 1).setAlpha(0);
    this.trowel = scene.add.graphics().setDepth(depth + 2);
    this.trowelCount = scene.add.text(0, 0, '', textStyle('small', C.ink)).setOrigin(0, 0.5).setDepth(depth + 2);
    const min = TOKENS.touch.minTargetPx;
    this.trowelZone = scene.add.zone(0, 0, min, min).setDepth(depth + 3);
    this.trowelZone.setInteractive();
    this.trowelZone.on('pointerup', () => {
      if (this.trowels > 0) this.onTrowel?.();
    });
    this.chipBg = scene.add.graphics();
    this.chipText = scene.add.text(0, 0, '', textStyle('small', C.inkOnDark)).setOrigin(0.5, 0.5);
    this.chip = scene.add.container(0, 0, [this.chipBg, this.chipText]).setDepth(depth + 1).setVisible(false);
    this.drawTrowel();
  }

  /** Called on a tap on the trowel icon while the player holds a trowel (UX §5.2). */
  setTrowelHandler(fn: (() => void) | null): void {
    this.onTrowel = fn;
  }

  layout(rect: Rect): void {
    const y = rect.y + rect.h / 2;
    this.rowY = y;
    const x0 = rect.x;
    this.label.setPosition(x0 + PAD, y);
    const beadsX = x0 + PAD + this.label.width + PAD + BEAD_R;
    this.beadXs = Array.from({ length: STREAK_BEADS }, (_, i) => beadsX + i * BEAD_STEP);
    this.beads.forEach((b, i) => b.setPosition(this.beadXs[i] ?? 0, y));
    this.trowelX = beadsX + (STREAK_BEADS - 1) * BEAD_STEP + BEAD_R + PAD + ICON / 2;
    this.trowel.setPosition(this.trowelX, y);
    this.glow.setPosition(this.trowelX, y);
    this.trowelZone.setPosition(this.trowelX, y);
    this.trowelCount.setPosition(this.trowelX + ICON / 2 + 4, y);
    const leftW = this.trowelX + ICON / 2 + 4 + 72 - x0;
    const g = this.panel.clear();
    g.fillStyle(hex(C.panel), 0.92).fillRoundedRect(x0, rect.y, leftW, rect.h, TOKENS.radius.chip);
    this.chipX = rect.x + rect.w;
    this.drawChip();
    const s = this.streak;
    this.streak = -1;
    this.setStreak(Math.max(0, s));
  }

  /** K-33 streak `c` (0…3 shown; 4 earns a trowel and resets). */
  setStreak(n: number): void {
    if (n === this.streak) return;
    this.streak = n;
    this.beads.forEach((b, i) => {
      b.clear();
      if (i < n) b.fillStyle(hex(C.gold), 1).fillCircle(0, 0, BEAD_R).lineStyle(3, hex(C.goldDark), 1);
      else b.fillStyle(hex(C.inkOnDark), 0.5).fillCircle(0, 0, BEAD_R).lineStyle(3, hex(C.inkSoft), 1);
      b.strokeCircle(0, 0, BEAD_R).setScale(1);
    });
  }

  /** JUICE #15: scale of bead `i`. */
  setBeadScale(i: number, s: number): void {
    this.beads[i]?.setScale(s);
  }

  setTrowels(n: number): void {
    if (n === this.trowels) return;
    this.trowels = n;
    this.trowel.setAlpha(n > 0 ? 1 : 0.35);
    this.trowelCount.setText(n > 0 ? t('common.times', { n }) : '').setVisible(n > 0);
  }

  /** JUICE #16: trowel icon scale and glow (0…1). */
  setTrowelPop(scale: number, glow: number): void {
    this.trowel.setScale(scale);
    this.glow.setScale(scale).setAlpha(glow);
  }

  /** UX §5.2: the trowel is selected (picking a build-front cell). */
  setTrowelSelected(on: boolean): void {
    this.glow.setAlpha(on ? 0.6 : 0);
  }

  /** K-26 truck queue N (chip hidden at 0). */
  setQueue(n: number): void {
    if (n === this.queued) return;
    this.queued = n;
    this.drawChip();
  }

  /** JUICE #20 / #88: chip scale. */
  setChipScale(s: number): void {
    this.chip.setScale(s);
  }

  beadPoint(i: number): { x: number; y: number } {
    return { x: this.beadXs[Math.max(0, Math.min(STREAK_BEADS - 1, i))] ?? 0, y: this.rowY };
  }

  trowelPoint(): { x: number; y: number } {
    return { x: this.trowelX, y: this.rowY };
  }

  /** Centre of the truck chip (also while it is hidden: where it will appear). */
  chipPoint(): { x: number; y: number } {
    return { x: this.chip.x, y: this.rowY };
  }

  destroy(): void {
    for (const o of [this.panel, this.label, this.glow, this.trowel, this.trowelCount, this.trowelZone, ...this.beads])
      o.destroy();
    this.chip.destroy(true);
  }

  private drawChip(): void {
    const n = Math.max(0, this.queued);
    this.chipText.setText(t('truck.queue', { n }));
    const w = this.chipText.width + 2 * PAD;
    const g = this.chipBg.clear();
    g.fillStyle(hex(C.secondaryLip), 1).fillRoundedRect(-w / 2, -CHIP_H / 2 + 6, w, CHIP_H, TOKENS.radius.chip);
    g.fillStyle(hex(C.secondary), 1).fillRoundedRect(-w / 2, -CHIP_H / 2, w, CHIP_H, TOKENS.radius.chip);
    this.chip.setPosition(this.chipX - w / 2, this.rowY).setVisible(n > 0);
  }

  private drawTrowel(): void {
    drawTrowelIcon(this.trowel);
    this.glow.clear().fillStyle(hex(C.gold), 1).fillCircle(0, 0, ICON / 2 + 8);
  }
}

/** The Golden Trowel icon (gold blade, wooden handle; placeholder until the `ui_trowel` asset), drawn once at (0, 0). */
export function drawTrowelIcon(g: Phaser.GameObjects.Graphics): void {
  g.clear();
  g.fillStyle(hex(TOKENS.color.board.yardFrame), 1).fillRoundedRect(-6, 8, 12, 30, 5);
  g.fillStyle(hex(C.gold), 1).fillTriangle(0, -34, 26, 2, -26, 2).fillTriangle(26, 2, 0, 14, -26, 2);
  g.lineStyle(4, hex(C.goldDark), 1).beginPath();
  g.moveTo(0, -34).lineTo(26, 2).lineTo(0, 14).lineTo(-26, 2).closePath().strokePath();
  g.setAngle(-20);
}
