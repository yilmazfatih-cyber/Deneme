import Phaser from 'phaser';
import { DESIGN_HEIGHT, DESIGN_WIDTH, scaleMode } from './config/display';
import { BootScene } from './scenes/BootScene';
import { HomeScene } from './scenes/HomeScene';
import { IntroScene } from './scenes/IntroScene';
import { LevelScene } from './scenes/level/LevelScene';
import { installAudioUnlock } from './scenes/level/sceneServices';
import { installQuietTouchCancel } from './scenes/touchCancel';
import { changeSetting } from './scenes/appServices';
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
  // TECH §11.6: sounds play through the game's own AudioService (one context, unlocked on the first activating input);
  // Phaser's sound manager would open a second AudioContext before any gesture.
  audio: { noAudio: true },
  // TECH §14.1 #12: Boot → (first launch) Intro → Level 1; Home ↔ Level for the 1–5 slice
  scene: [BootScene, IntroScene, HomeScene, LevelScene],
});

// TECH §11.6: page-wide audio unlock on the first activating input (intro, home or level) + background suspend
installAudioUnlock();
// TECH §4.6: a system-cancelled touch is no release (`pointer.wasCanceled`) and logs no console error
installQuietTouchCancel(game);

if (import.meta.env.DEV) {
  // development hooks: the game, and the settings stub (e.g. `__settings('lang', 'en')`) until the Settings screen
  const w = window as unknown as { __game: Phaser.Game; __settings: typeof changeSetting };
  w.__game = game;
  w.__settings = changeSetting;
  // TECH §12.3 (R-20): the debug panel exists only on the development server; production builds drop this branch,
  // so the chunk is never emitted and `?debug=1` has no handler there (tools/verify-dist.ts checks dist/)
  void import('./debug/debug.ts').then((m) => m.installDebug(game));
}

if (import.meta.env.MODE === 'harness') {
  // TECH §1.2, §12.2 (R-20): Playwright hooks only in `vite build --mode harness` (artifacts/harness); in every other
  // build the condition is a constant and the chunk is never emitted (tools/verify-dist.ts checks dist/).
  void import('./harness/index.ts').then((m) => m.installHarness(game));
}
