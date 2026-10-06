import Phaser from 'phaser';
import { DESIGN_HEIGHT, DESIGN_WIDTH, scaleMode } from './config/display';
import { BootScene } from './scenes/BootScene';
import { LevelScene } from './scenes/level/LevelScene';
import { getLocale, t } from './services/i18n';
import { TOKENS } from './theme/tokens';

// Browser / PWA title and document language from i18n (STORY §0-10, §7.6 `app.title`; TECH §11.5). The game name is
// never written in code and never upper-cased (ART §8 exception).
document.title = t('app.title');
document.documentElement.lang = getLocale();

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
  render: { antialias: true, roundPixels: false, powerPreference: 'high-performance' },
  input: { activePointers: 2, windowEvents: true },
  scene: [BootScene, LevelScene],
});

if (import.meta.env.DEV) {
  (window as unknown as { __game: Phaser.Game }).__game = game;
}
