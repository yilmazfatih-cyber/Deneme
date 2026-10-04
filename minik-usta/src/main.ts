import Phaser from 'phaser';
import { DESIGN_HEIGHT, DESIGN_WIDTH } from './config/display';
import { BootScene } from './scenes/BootScene';

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: DESIGN_WIDTH,
  height: DESIGN_HEIGHT,
  backgroundColor: '#7FD3F7',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  input: { activePointers: 2 },
  scene: [BootScene],
});

if (import.meta.env.DEV) {
  (window as unknown as { __game: Phaser.Game }).__game = game;
}
