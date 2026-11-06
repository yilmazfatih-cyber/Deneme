/**
 * Goals panel (UX_FLOWS §5.1 "Hedefler": `layout.top.goals` 592 × 104; GDD K-41). One cell per goal: icon + counter
 * `common.count` "{n}/{max}" (build: completed segments of S); a reached goal turns green with ✓. It only draws the
 * core's `goalViews(state)` (pure read) and redraws when a value changes (TECH §10.3: update on change only).
 */
import type Phaser from 'phaser';
import type { GoalView } from '../core/goals.ts';
import { t } from '../services/i18n.ts';
import type { Rect } from '../theme/layout.ts';
import { TOKENS } from '../theme/tokens.ts';
import { drawBuildIcon, drawOk } from './icons.ts';
import { hex, textStyle } from './text.ts';
import { UI } from './uiConstants.ts';
import { addBakedGraphics } from './BakedGraphics.ts';

const C = TOKENS.color.ui;

interface Cell {
  readonly icon: Phaser.GameObjects.Graphics;
  readonly check: Phaser.GameObjects.Graphics;
  readonly text: Phaser.GameObjects.Text;
}

export class GoalsPanel {
  private readonly scene: Phaser.Scene;
  private readonly root: Phaser.GameObjects.Container;
  private readonly panel: Phaser.GameObjects.Graphics;
  private cells: Cell[] = [];
  private rect: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private key = '';

  constructor(scene: Phaser.Scene, depth: number) {
    this.scene = scene;
    this.panel = addBakedGraphics(scene);
    this.root = scene.add.container(0, 0, [this.panel]).setDepth(depth);
  }

  layout(rect: Rect): void {
    this.rect = rect;
    this.root.setPosition(rect.x, rect.y);
    const g = this.panel.clear();
    const r = TOKENS.radius.panel;
    const lip = TOKENS.shadow.panelLipPx;
    g.fillStyle(hex(C.panelShadow), 1).fillRoundedRect(0, lip, rect.w, rect.h - lip, r);
    g.fillStyle(hex(C.panel), 1).fillRoundedRect(0, 0, rect.w, rect.h - lip, r);
    g.lineStyle(TOKENS.stroke.iconPx, hex(C.panelEdge), 1).strokeRoundedRect(0, 0, rect.w, rect.h - lip, r);
    this.key = '';
  }

  /** Goal values from core `goalViews(state)`. */
  setGoals(goals: readonly GoalView[]): void {
    const key = goals.map((g) => `${g.kind}:${g.value}/${g.target}`).join(',');
    if (key === this.key) return;
    this.key = key;
    for (const c of this.cells) {
      c.icon.destroy();
      c.check.destroy();
      c.text.destroy();
    }
    this.cells = [];
    const n = Math.max(1, goals.length);
    const cellW = this.rect.w / n;
    const midY = (this.rect.h - TOKENS.shadow.panelLipPx) / 2;
    goals.forEach((goal, i) => {
      const x0 = i * cellW;
      const icon = addBakedGraphics(this.scene);
      if (goal.kind === 'build') drawBuildIcon(icon, UI.goalIconPx);
      else icon.fillStyle(hex(TOKENS.color.board.yardFrame), 1).fillRoundedRect(-30, -30, 60, 60, 12);
      const text = this.scene.add
        .text(
          0,
          midY,
          t('common.count', { n: goal.value, max: goal.target }),
          textStyle('h2', goal.done ? C.primaryLip : C.ink),
        )
        .setOrigin(0, 0.5);
      const total = UI.goalIconPx + UI.goalPadPx + text.width;
      const left = x0 + (cellW - total) / 2;
      icon.setPosition(left + UI.goalIconPx / 2, midY);
      text.setX(left + UI.goalIconPx + UI.goalPadPx);
      const check = addBakedGraphics(this.scene).setVisible(goal.done);
      drawOk(check, UI.goalIconPx * 0.6);
      check.setPosition(left + UI.goalIconPx * 0.9, midY + UI.goalIconPx * 0.3);
      this.root.add([icon, text, check]);
      this.cells.push({ icon, check, text });
    });
  }

  setVisible(on: boolean): void {
    this.root.setVisible(on);
  }

  destroy(): void {
    this.root.destroy(true);
  }
}
