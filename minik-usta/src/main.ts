import Phaser from 'phaser';
import { DESIGN_HEIGHT, DESIGN_WIDTH, scaleMode } from './config/display';
import { BootScene } from './scenes/BootScene';
import { TOKENS } from './theme/tokens';

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: DESIGN_WIDTH,
  height: DESIGN_HEIGHT,
  backgroundColor: TOKENS.color.chapter.ch1.skyTop,
  scale: {
    mode: scaleMode === 'fit' ? Phaser.Scale.FIT : Phaser.Scale.EXPAND,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    // EXPAND (D-015): Phaser 4 clamps the expanded game size to `max`, so the width stays 1080 and the height stops at
    // meta.scale.expandMaxHeight; the rest of a taller (or wider) viewport is letterboxed (pillarboxed), TECH §10.1.
    ...(scaleMode === 'expand'
      ? { max: { width: DESIGN_WIDTH, height: TOKENS.meta.scale.expandMaxHeight } }
      : {}),
  },
  input: { activePointers: 2 },
  scene: [BootScene],
});

if (import.meta.env.DEV) {
  (window as unknown as { __game: Phaser.Game }).__game = game;
}
