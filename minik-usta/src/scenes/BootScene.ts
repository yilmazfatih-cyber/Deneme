import Phaser from 'phaser';
import { DESIGN_HEIGHT, DESIGN_WIDTH } from '../config/display';

/** Phase 0 placeholder: an empty scene proving the Vite + TypeScript + Phaser pipeline works. */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#7FD3F7');
    this.add
      .text(DESIGN_WIDTH / 2, DESIGN_HEIGHT / 2, 'Minik Usta', {
        fontFamily: 'sans-serif',
        fontSize: '96px',
        fontStyle: 'bold',
        color: '#2B2B2B',
      })
      .setOrigin(0.5);
  }
}
