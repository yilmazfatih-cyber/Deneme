/**
 * Golden Trowel use (GDD K-33; UX_FLOWS §5.2; JUICE #17 "cephe hücresi seçimi"): a tap on the trowel icon of the status
 * strip opens the pick mode — the hint strip `booster.hint.trowel` with "Vazgeç" (`common.cancel`), and the eligible
 * cells (core `eligibleTrowelCells` = the build front, K-34 holds by construction) pulse with a gold contour. A tap on an
 * eligible cell hands the target to the scene, which commits it through `GameSession` (the core re-checks it; an
 * invalid target is rejected and consumes nothing); the other plan cells are dimmed to 50 % meanwhile. The picker
 * never decides a rule.
 *
 * While it is open a full-screen input zone takes the touches, so the board's DragController stays out.
 */
import type Phaser from 'phaser';
import { SITE_X } from '../../core/coords.ts';
import type { TrowelTarget } from '../../core/combo.ts';
import { visibleSegment } from '../../core/grid.ts';
import { eligibleTrowelCells } from '../../core/placement.ts';
import { H, hdr } from '../../core/state.ts';
import type { GameState } from '../../core/state.ts';
import type { At } from '../../core/types.ts';
import { t } from '../../services/i18n.ts';
import type { Layout } from '../../theme/layout.ts';
import { FRAME } from '../../theme/textures.ts';
import { TOKENS } from '../../theme/tokens.ts';
import { TextButton } from '../../ui/TextButton.ts';
import { textStyle } from '../../ui/text.ts';
import { BOOT_ATLAS_KEY } from '../atlas.ts';
import type { Frames } from '../atlas.ts';
import { DEPTH } from './depth.ts';
import { hexColor, setFrameAt } from './frameImage.ts';

export interface TrowelPickerHost {
  layout(): Layout;
  state(): GameState | null;
  frames(): Frames | null;
  /** The player chose a build-front cell. */
  pick(target: TrowelTarget): void;
  /** The pick mode opened / closed (status strip highlight). */
  changed(open: boolean): void;
  /** JUICE #69 on the cancel button. */
  button(button: TextButton, variant: 'press' | 'release'): void;
  /** Reduced motion (JUICE §0 rule 8): the eligible cells do not pulse. */
  reduced(): boolean;
  /**
   * UX §5.2 "seçilemeyenler %50 soluklaşır" (review Faz 2 tur 2 #5): the other plan cells dim while the pick mode is
   * open (`eligible`), and light again on close (null). Information, so also with reduced motion.
   */
  dim(eligible: readonly At[] | null): void;
}

/** UX §5.2: valid cells pulse once every `duration.spotlightPulse` (1,2 s). */
const PULSE_MIN = 0.35;
const CANCEL_W = 360;
const CANCEL_H = 144;

export class TrowelPicker {
  private readonly scene: Phaser.Scene;
  private readonly host: TrowelPickerHost;
  private readonly zone: Phaser.GameObjects.Zone;
  private readonly hint: Phaser.GameObjects.Text;
  private readonly cancel: TextButton;
  private readonly marks: Phaser.GameObjects.Image[] = [];
  private cells: At[] = [];
  private open = false;
  private since = 0;

  constructor(scene: Phaser.Scene, host: TrowelPickerHost) {
    this.scene = scene;
    this.host = host;
    this.zone = scene.add
      .zone(0, 0, 1, 1)
      .setOrigin(0, 0)
      .setDepth(DEPTH.hud - 1);
    this.zone.on('pointerup', (p: Phaser.Input.Pointer) => {
      if (!p.wasCanceled) this.tap(p.worldX, p.worldY); // a cancelled touch (touchcancel) places nothing
    });
    this.hint = scene.add
      .text(
        0,
        0,
        t('booster.hint.trowel'),
        textStyle('body', TOKENS.color.ui.inkOnDark, { color: TOKENS.color.ui.ink, px: 10 }),
      )
      .setOrigin(0.5)
      .setDepth(DEPTH.hud + 1)
      .setVisible(false);
    this.cancel = new TextButton(
      scene,
      t('common.cancel'),
      { w: CANCEL_W, h: CANCEL_H },
      'neutral',
      DEPTH.hud + 1,
    );
    this.cancel.setVisible(false);
    this.cancel.on('pointerdown', () => host.button(this.cancel, 'press'));
    this.cancel.on('pointerup', (canceled) => {
      host.button(this.cancel, 'release');
      if (!canceled) this.close();
    });
  }

  get active(): boolean {
    return this.open;
  }

  /** Opens the pick mode (no-op without eligible cells). */
  start(now: number): void {
    const s = this.host.state();
    if (!s || this.open) return;
    this.cells = eligibleTrowelCells(s);
    if (this.cells.length === 0) return;
    this.open = true;
    this.since = now;
    this.zone.setInteractive();
    this.hint.setVisible(true);
    this.cancel.setVisible(true);
    this.place();
    this.host.dim(this.cells);
    this.host.changed(true);
  }

  close(): void {
    if (!this.open) return;
    this.open = false;
    this.zone.disableInteractive();
    this.hint.setVisible(false);
    this.cancel.setVisible(false);
    for (const m of this.marks) m.setVisible(false);
    this.host.dim(null);
    this.host.changed(false);
  }

  /** Re-places everything for a new layout. */
  relayout(): void {
    if (this.open) this.place();
  }

  /** New language: the hint and the cancel button. */
  relabel(): void {
    this.hint.setText(t('booster.hint.trowel'));
    this.cancel.setLabel(t('common.cancel'));
    this.relayout();
  }

  /** Per frame: the eligible cells pulse (steady with reduced motion, JUICE §0 rule 8). */
  update(now: number): void {
    if (!this.open) return;
    if (this.host.reduced()) {
      for (const m of this.marks) if (m.visible) m.setAlpha(1);
      return;
    }
    const period = TOKENS.duration.spotlightPulse;
    const k = 0.5 + 0.5 * Math.cos((2 * Math.PI * (now - this.since)) / period);
    const a = PULSE_MIN + (1 - PULSE_MIN) * k;
    for (const m of this.marks) if (m.visible) m.setAlpha(a);
  }

  destroy(): void {
    this.zone.destroy();
    this.hint.destroy();
    this.cancel.destroy();
    for (const m of this.marks) m.destroy();
  }

  private place(): void {
    const layout = this.host.layout();
    const f = this.host.frames();
    if (!f) return;
    this.zone.setPosition(0, 0).setSize(layout.W, layout.H);
    this.zone.input?.hitArea.setSize(layout.W, layout.H);
    // UX §5.2 "tahta üstünde ince açıklama şeridi": hint and "Vazgeç" above the board, inside the crane area band
    const crane = layout.board.crane;
    this.cancel.x = crane.x + crane.w / 2;
    this.cancel.y = crane.y + crane.h - CANCEL_H / 2 - 8;
    this.hint.setPosition(crane.x + crane.w / 2, this.cancel.y - CANCEL_H / 2 - this.hint.height / 2 - 8);
    const ref = f.ref(FRAME.front);
    while (this.marks.length < this.cells.length)
      this.marks.push(this.scene.add.image(0, 0, BOOT_ATLAS_KEY, FRAME.whitePixel).setDepth(DEPTH.effects));
    this.marks.forEach((m, i) => {
      const cell = this.cells[i];
      if (!cell) {
        m.setVisible(false);
        return;
      }
      const r = layout.grid.cellRect(cell.x, cell.y);
      setFrameAt(m, ref, r.x, r.y);
      m.setTint(hexColor(TOKENS.color.ui.gold)).setVisible(true);
    });
  }

  private tap(x: number, y: number): void {
    if (!this.open) return;
    const s = this.host.state();
    const layout = this.host.layout();
    const cell = layout.grid.cellAt(x, y);
    if (!s || !cell) return;
    if (!this.cells.some((c) => c.x === cell.x && c.y === cell.y)) return;
    const target: TrowelTarget = {
      seg: visibleSegment(s),
      x: cell.x - SITE_X === 0 ? 0 : 1,
      y: cell.y - hdr(s, H.elev),
    };
    this.close();
    this.host.pick(target);
  }
}
