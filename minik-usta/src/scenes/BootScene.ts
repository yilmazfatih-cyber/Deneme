import Phaser from 'phaser';
import { t } from '../services/i18n.ts';
import { TOKENS } from '../theme/tokens.ts';
import { ensureBootAtlas } from './atlas.ts';
import { LEVEL_SCENE_KEY } from './level/LevelScene.ts';
import type { LevelSceneData } from './level/LevelScene.ts';

/**
 * Game-name text style (UX §1 logo: Baloo 2, `font.size.display` / `font.weight.display`, `color.ui.ink`). The name
 * comes from `app.title` (STORY §0-10, §7.6; working value per D-068) and is drawn as written: never through `upper()`
 * (ART §8 exception — the TR locale would turn "Lift" into "LİFT"; TECH §11.5).
 */
const TITLE_STYLE: Phaser.Types.GameObjects.Text.TextStyle = {
  fontFamily: [TOKENS.font.family, ...TOKENS.font.fallback]
    .map((f) => (f.includes(' ') ? `"${f}"` : f))
    .join(', '),
  fontSize: `${TOKENS.font.size.display}px`,
  fontStyle: String(TOKENS.font.weight.display),
  color: TOKENS.color.ui.ink,
};

/** First level of a new player (TECH §14.1 #12: Boot → Level 1 directly for the Phase 2 slice). */
const FIRST_LEVEL = 1;

/**
 * Boot scene (TECH §10.2 (a)): sky colour + the game name (`app.title`) for one frame while the boot atlas is baked
 * and uploaded once, then straight into the level screen (Phase 2 slice: Splash / Home come with TECH §14.1 #12).
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  create(): void {
    this.cameras.main.setBackgroundColor(TOKENS.color.chapter.ch1.skyTop);
    // EXPAND (D-015): the game height follows the viewport, so centre on the current game size, not on 1920.
    this.add.text(this.scale.width / 2, this.scale.height / 2, t('app.title'), TITLE_STYLE).setOrigin(0.5);
    // Let the title frame render, then bake (the bake blocks the main thread for a few tens of ms).
    this.time.delayedCall(0, () => {
      ensureBootAtlas(this.game);
      const data: LevelSceneData = { levelId: FIRST_LEVEL };
      this.scene.start(LEVEL_SCENE_KEY, data);
    });
  }
}
