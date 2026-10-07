/**
 * Win screen (UX_FLOWS §6; STORY §7.6 `win.*`; GDD K-28; JUICE #55–#56 play on the board before it). Phase 2 slice: the
 * board stays visible with the JUICE #55 "KAZANDIN!" banner; under it a cream panel lists the Bonus İnşaat line (moves
 * left → coins), the leftover Golden Trowel line (only when > 0) and the reward row (★ +1 · ● +N); the single primary
 * action "Devam" (640 × 176) sits in the thumb zone (UX §0.2). The layout is bottom-anchored (EXPAND, D-015): button
 * bottom `H − winButtonBottomPx`; the panel sits in the band between the status strip (`layout.board.status` bottom +
 * `winPanelGapPx`) and the button top (− `winPanelButtonGapPx`), so it never covers the board or the "Usta Serisi" strip (review Faz 2 tur 1 #6):
 * line step 60 px, tightened down to 44 px and the padding down to 8 px when the band is short (`winPanelLayout`). A
 * design height without that band (FIT, H = 1920) keeps the older placement above the button.
 *
 * Amounts come from ui/rewards.ts (economy.json); texts from i18n. Opens with JUICE #70 (`target`, no dim).
 */
import type Phaser from 'phaser';
import { t } from '../services/i18n.ts';
import type { Layout } from '../theme/layout.ts';
import { TOKENS } from '../theme/tokens.ts';
import { drawStar } from './icons.ts';
import { InlineLabel } from './InlineLabel.ts';
import { OptionButton } from './OptionButton.ts';
import type { WinRewards } from './rewards.ts';
import { hex } from './text.ts';
import { UI } from './uiConstants.ts';
import { addBakedGraphics } from './BakedGraphics.ts';

const C = TOKENS.color.ui;

/** Geometry of the win panel (design px): panel box, line step, first line and reward row centres. */
export interface WinPanelLayout {
  readonly top: number;
  readonly h: number;
  readonly step: number;
  /** Centre y of the first text line (the next ones `step` lower). */
  readonly firstY: number;
  readonly rewardY: number;
  /** The panel fits the band between the status strip and the button (false: FIT fallback above the button). */
  readonly inBand: boolean;
}

/** UX §6 win panel with `rows` text lines above the reward row (review Faz 2 tur 1 #6). */
export function winPanelLayout(layout: Layout, rows: number): WinPanelLayout {
  const btnTop = layout.H - UI.winButtonBottomPx - UI.winButtonH;
  const status = layout.board.status;
  const bandTop = status.y + status.h + UI.winPanelGapPx;
  const bandBottom = btnTop - UI.winPanelButtonGapPx;
  const band = bandBottom - bandTop;
  const rewardH = UI.winRewardRowPx;
  const needed = (step: number, pad: number): number => 2 * pad + rows * step + rewardH;
  let step: number = UI.winLineStepPx;
  let pad: number = UI.winPanelPadPx;
  if (rows > 0 && needed(step, pad) > band)
    step = Math.max(UI.winLineStepMinPx, Math.floor((band - 2 * pad - rewardH) / rows));
  if (needed(step, pad) > band)
    pad = Math.max(UI.winPanelPadMinPx, Math.floor((band - rows * step - rewardH) / 2));
  const h = needed(step, pad);
  if (h <= band) {
    const top = bandTop + (band - h) / 2;
    return {
      top,
      h,
      step,
      firstY: top + pad + step / 2,
      rewardY: top + pad + rows * step + rewardH / 2,
      inBand: true,
    };
  }
  // FIT (H = 1920): the status strip ends where the button begins; the panel stands above the button (UX §6 wireframe)
  const legacyStep = UI.winLineStepPx;
  const rewardY = btnTop - UI.winLinesAboveButtonPx;
  const firstY = rewardY - rows * legacyStep;
  const top = firstY - legacyStep;
  return { top, h: rewardY + legacyStep - top, step: legacyStep, firstY, rewardY, inBand: false };
}

export class WinScreen {
  readonly panel: Phaser.GameObjects.Container;
  readonly button: OptionButton;
  /** Swallows touches on the board while the screen is up (transparent). */
  private readonly blocker: Phaser.GameObjects.Zone;

  constructor(
    scene: Phaser.Scene,
    layout: Layout,
    rewards: WinRewards,
    depth: number,
    onContinue: () => void,
    onPress: (b: OptionButton, v: 'press' | 'release') => void,
  ) {
    const W = layout.W;
    const btnBottom = layout.H - UI.winButtonBottomPx;
    const btnTop = btnBottom - UI.winButtonH;
    const rows: { left: string; right: string }[] = [];
    if (rewards.bonusMoves > 0)
      rows.push({
        left: t('win.bonus', { n: rewards.bonusMoves }),
        right: t('common.coins', { n: rewards.bonusCoins }),
      });
    if (rewards.trowels > 0)
      rows.push({
        left: t('win.trowel', { n: rewards.trowels }),
        right: t('common.coins', { n: rewards.trowelCoins }),
      });
    const geo = winPanelLayout(layout, rows.length);
    const { step, firstY, rewardY } = geo;
    const panelW = TOKENS.layout.popup.optionW;
    const panelTop = geo.top;
    const panelH = geo.h;
    const cx = W / 2;
    const cy = panelTop + panelH / 2;

    const g = addBakedGraphics(scene);
    const r = TOKENS.radius.panel;
    g.fillStyle(hex(C.panelShadow), 1).fillRoundedRect(-panelW / 2, -panelH / 2 + 10, panelW, panelH, r);
    g.fillStyle(hex(C.panel), 1).fillRoundedRect(-panelW / 2, -panelH / 2, panelW, panelH, r);
    const children: Phaser.GameObjects.GameObject[] = [g];
    const pad = UI.panelSidePadPx;
    rows.forEach((row, i) => {
      const y = firstY + i * step - cy;
      const left = new InlineLabel(scene, 'body', C.ink, 'left')
        .setText(row.left)
        .setPosition(-panelW / 2 + pad, y);
      const right = new InlineLabel(scene, 'body', C.ink, 'right')
        .setText(row.right)
        .setPosition(panelW / 2 - pad, y);
      children.push(left.root, right.root);
    });
    // reward row: ★ +1 · ● +N
    const ry = rewardY - cy;
    const star = addBakedGraphics(scene);
    drawStar(star, TOKENS.font.size.h2);
    const starText = new InlineLabel(scene, 'h2', C.ink, 'left').setText(
      t('common.plus', { n: rewards.stars }),
    );
    const coins = new InlineLabel(scene, 'h2', C.ink, 'left').setText(
      t('common.coins', { n: t('common.plus', { n: rewards.totalCoins }) }),
    );
    const gap = 48;
    const iconW = TOKENS.font.size.h2;
    const total = iconW + 12 + starText.width + gap + coins.width;
    let x = -total / 2;
    star.setPosition(x + iconW / 2, ry);
    x += iconW + 12;
    starText.setPosition(x, ry);
    x += starText.width + gap;
    coins.setPosition(x, ry);
    children.push(star, starText.root, coins.root);
    this.panel = scene.add.container(cx, cy, children).setDepth(depth + 1);

    this.blocker = scene.add.zone(0, 0, W, layout.H).setOrigin(0, 0).setDepth(depth);
    this.blocker.setInteractive();

    this.button = new OptionButton(scene, { w: UI.winButtonW, h: UI.winButtonH }, 'primary', {
      label: t('common.continue'),
    });
    this.button.root.setPosition(cx, btnTop + UI.winButtonH / 2).setDepth(depth + 2);
    this.button.onTap(onContinue);
    this.button.onPress((v) => onPress(this.button, v));
  }

  /** WindowTarget of JUICE #70 / #71 (no dim: the board and the banner stay visible). */
  get target(): { dim: null; panel: Phaser.GameObjects.Container; options: readonly OptionButton[] } {
    return { dim: null, panel: this.panel, options: [this.button] };
  }

  destroy(): void {
    this.panel.destroy(true);
    this.button.destroy();
    this.blocker.destroy();
  }
}
