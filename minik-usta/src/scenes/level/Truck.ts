/**
 * The delivery truck of JUICE #19 (K-25): a placeholder drawn once with Graphics (cab `ui.secondary`, bed
 * `board.scaffold`, wheels `ui.ink`, window `board.craneSky`) until ASSET_LIST's truck sprite exists. The EventPlayer
 * moves it (`setPose`); nothing is redrawn per frame.
 */
import type Phaser from 'phaser';
import { TOKENS } from '../../theme/tokens.ts';
import { hexColor } from './frameImage.ts';
import { addBakedGraphics } from '../../ui/BakedGraphics.ts';

/** Truck size (design px): about three cells wide, one cell high, over the crane area. */
export const TRUCK_W = 360;
export const TRUCK_H = 150;

export class Truck {
  private readonly root: Phaser.GameObjects.Container;
  private readonly bed: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene, depth: number) {
    const c = TOKENS.color;
    const body = addBakedGraphics(scene);
    // cab (front, left: the truck drives in from the right)
    body.fillStyle(hexColor(c.ui.secondaryLip), 1).fillRoundedRect(-TRUCK_W / 2, -40, 120, 96, 18);
    body.fillStyle(hexColor(c.ui.secondary), 1).fillRoundedRect(-TRUCK_W / 2, -46, 120, 92, 18);
    body.fillStyle(hexColor(c.board.craneSky), 0.9).fillRoundedRect(-TRUCK_W / 2 + 16, -34, 56, 36, 8);
    // chassis
    body.fillStyle(hexColor(c.board.wallDark), 1).fillRect(-TRUCK_W / 2 + 40, 40, TRUCK_W - 60, 16);
    // wheels
    body
      .fillStyle(hexColor(c.ui.ink), 1)
      .fillCircle(-TRUCK_W / 2 + 70, 58, 24)
      .fillCircle(TRUCK_W / 2 - 60, 58, 24);
    body
      .fillStyle(hexColor(c.board.wallLight), 1)
      .fillCircle(-TRUCK_W / 2 + 70, 58, 9)
      .fillCircle(TRUCK_W / 2 - 60, 58, 9);
    // tipping bed, pivoting on its rear-bottom corner
    this.bed = addBakedGraphics(scene);
    this.bed.fillStyle(hexColor(c.board.scaffold), 1).fillRoundedRect(-220, -78, 220, 84, 10);
    this.bed.lineStyle(6, hexColor(c.board.wallDark), 1).strokeRoundedRect(-220, -78, 220, 84, 10);
    this.bed.setPosition(TRUCK_W / 2 - 10, 34);
    this.root = scene.add.container(0, 0, [this.bed, body]).setDepth(depth).setVisible(false);
  }

  /** Centre x/y (design px), bed tilt (deg, negative = tipped toward the yard), alpha. */
  setPose(x: number, y: number, bedDeg: number, alpha: number): void {
    this.root
      .setPosition(x, y)
      .setAlpha(alpha)
      .setVisible(alpha > 0);
    this.bed.setAngle(bedDeg);
  }

  hide(): void {
    this.root.setVisible(false);
  }

  destroy(): void {
    this.root.destroy(true);
  }
}
