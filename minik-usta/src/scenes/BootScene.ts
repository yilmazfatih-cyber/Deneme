import Phaser from 'phaser';
import { RULES_VERSION, levelHash } from '../core/session.ts';
import { t } from '../services/i18n.ts';
import type { LevelIdentity } from '../services/save.ts';
import { TOKENS } from '../theme/tokens.ts';
import { textStyle } from '../ui/text.ts';
import { appSave, appTrack, applySettings } from './appServices.ts';
import { ensureBootAtlas } from './atlas.ts';
import { launchRoute, voidedLast } from './flow/launch.ts';
import { INTRO_SCENE_KEY } from './IntroScene.ts';
import { HOME_SCENE_KEY, LEVEL_SCENE_KEY } from './level/LevelScene.ts';
import type { HomeSceneData, LevelSceneData } from './level/LevelScene.ts';
import { loadLevelById } from './level/levels.ts';
import { gameAudio } from './level/sceneServices.ts';

/** TECH §10.2: Text objects are created only after the game font is loaded (or failed), at most this long. */
const FONT_WAIT_MS = 1500;

/**
 * Boot scene (TECH §10.2 (a), §11.1; UX_FLOWS §1, §12): sky colour + the game name (`app.title`, never upper-cased —
 * ART §8) while the boot atlas is baked once, the save is opened (recovery, K-43 launch decision) and the route chosen:
 * resume a saved attempt on the level screen, the 3-panel intro on first launch (then Level 1 directly), else home.
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  create(): void {
    this.cameras.main.setBackgroundColor(TOKENS.color.chapter.ch1.skyTop);
    // Let the sky frame render, then wait for the font, bake and route (the bake blocks the main thread ≈ tens of ms).
    this.time.delayedCall(0, () => void this.boot());
  }

  private async boot(): Promise<void> {
    // the save's language (and the other settings) before the first text; opening the save is synchronous and small
    const save = appSave();
    applySettings();
    // ART §8 / D-046: no Text before the Baloo 2 weights are loaded (a fallback rasterisation would stay)
    await waitForFont();
    // EXPAND (D-015): the game height follows the viewport, so centre on the current game size, not on 1920.
    this.add
      .text(
        this.scale.width / 2,
        this.scale.height / 2,
        t('app.title'),
        textStyle('display', TOKENS.color.ui.ink),
      )
      .setOrigin(0.5);
    // the title frame renders before the bake blocks the main thread
    await new Promise<void>((resolve) => this.time.delayedCall(0, resolve));
    ensureBootAtlas(this.game);
    // the audio context is created here, on the loading screen, not in the first drag's touch handler (TECH §10.7)
    gameAudio().prepare();
    appTrack({ name: 'app_open' });
    const il = save.data.inLevel;
    // K-43 item 4: the saved attempt is checked against this build's level data and rules version
    let identity: LevelIdentity | null = null;
    if (il) {
      const res = await loadLevelById(il.levelId);
      identity = res.ok ? { levelHash: levelHash(res.level.data), rulesVersion: RULES_VERSION } : null;
    }
    const decision = save.resumeOnLaunch(() => identity);
    const route = launchRoute(save.data, decision);
    if (route.kind === 'level') {
      const data: LevelSceneData = {
        levelId: route.levelId,
        resume: { actions: route.resume, window: route.window },
      };
      this.scene.start(LEVEL_SCENE_KEY, data);
    } else if (route.kind === 'intro') this.scene.start(INTRO_SCENE_KEY);
    else {
      // UX §1 (c): after a voided attempt the level button restarts the same level (review Faz 2 tur 2 #17)
      const last = voidedLast(save.data);
      this.scene.start(HOME_SCENE_KEY, (last ? { last } : {}) satisfies HomeSceneData);
    }
  }
}

/**
 * `document.fonts.load` for the two weights the HUD uses (TECH §10.2 "Font": `800 120px` display, `600 44px` body) of the
 * self-hosted subset (`public/fonts/baloo2-latin-tr.woff2`, preloaded by index.html, `font-display: block`), capped by
 * `FONT_WAIT_MS` so a missing file never blocks the game (the fallback stack then draws).
 */
async function waitForFont(): Promise<void> {
  const fonts = (globalThis as { document?: Document }).document?.fonts;
  if (!fonts) return;
  const family = `"${TOKENS.font.family}"`;
  const load = Promise.all([
    fonts.load(`${TOKENS.font.weight.display} ${TOKENS.font.size.display}px ${family}`),
    fonts.load(`${TOKENS.font.weight.body} ${TOKENS.font.size.body}px ${family}`),
  ]).then(
    () => undefined,
    () => undefined,
  );
  await Promise.race([load, new Promise<void>((resolve) => setTimeout(resolve, FONT_WAIT_MS))]);
}
