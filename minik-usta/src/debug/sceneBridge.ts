/**
 * The debug panel's view of the running game (docs/TECH_DESIGN.md §12.3; R-20: development only).
 *
 * Reads only public surfaces: Phaser's scene manager and scale manager, and the level screen's debug accessors
 * (`LevelScene.gameSession`, `eventPlayer`, `tutorialController`, `openWindow`, `startLevel`). It decides no rule:
 * a level is (re)started through the level screen's own `startLevel`, which loads, validates and starts or resumes the
 * attempt exactly like the game does.
 */
import type Phaser from 'phaser';
import { scaleMode } from '../config/display.ts';
import type { GameSession } from '../core/session.ts';
import { voidAttempt } from '../services/save.ts';
import { appSave } from '../scenes/appServices.ts';
import { LEVEL_SCENE_KEY } from '../scenes/level/LevelScene.ts';
import type { LevelScene, LevelSceneData } from '../scenes/level/LevelScene.ts';
import { createLayout, designHeight } from '../theme/layout.ts';
import type { Layout } from '../theme/layout.ts';
import { TOKENS } from '../theme/tokens.ts';
import type { CanvasMapping } from './dragPlan.ts';

/** BootScene's key (it routes by itself; nothing is started over it). */
const BOOT_SCENE_KEY = 'Boot';

/**
 * Drops the saved attempt without any penalty and without the "attempt voided" home notice: K-43 item 4's
 * `voidAttempt` (life, boosters and offer coins back), keeping a notice that was already waiting. Debug only: a level
 * switch must not cost the developer a life, and the level screen would otherwise resume the saved attempt (K-43
 * item 3).
 */
export function dropAttempt(): boolean {
  const save = appSave();
  if (save.data.inLevel === null) return false;
  save.commit((d) => {
    const notice = d.voidNotice;
    voidAttempt(d);
    d.voidNotice = notice;
  });
  return true;
}

export class SceneBridge {
  readonly game: Phaser.Game;

  constructor(game: Phaser.Game) {
    this.game = game;
  }

  /** The level screen while it runs. */
  levelScene(): LevelScene | null {
    if (!this.game.scene.isActive(LEVEL_SCENE_KEY)) return null;
    return this.game.scene.getScene<LevelScene>(LEVEL_SCENE_KEY);
  }

  /** The running attempt. */
  session(): GameSession | null {
    return this.levelScene()?.gameSession ?? null;
  }

  booting(): boolean {
    return this.game.scene.isActive(BOOT_SCENE_KEY);
  }

  /** The level screen's layout (the same computation as `LevelScene.computeLayout`). */
  layout(): Layout {
    const s = this.game.scale;
    const parent = s.parentSize;
    const vp =
      parent.width > 0 && parent.height > 0
        ? { width: parent.width, height: parent.height }
        : { width: s.width, height: s.height };
    return createLayout(TOKENS, designHeight(scaleMode, vp, TOKENS));
  }

  /** Canvas → page mapping of Phaser's input (`transformX/Y`), refreshed from the DOM first. */
  mapping(): CanvasMapping {
    const s = this.game.scale;
    s.updateBounds();
    return {
      left: s.canvasBounds.x,
      top: s.canvasBounds.y,
      scaleX: s.displayScale.x,
      scaleY: s.displayScale.y,
    };
  }

  get canvas(): HTMLCanvasElement {
    return this.game.canvas;
  }

  /**
   * Opens level `id`. `fresh`: a new attempt (the saved one is dropped first, `dropAttempt`); otherwise the level
   * screen continues the saved attempt of that level, if any (K-43 item 3: its log is replayed under the current
   * debug rules). Returns an error text, or null.
   */
  async openLevel(id: number, fresh: boolean): Promise<string | null> {
    if (this.booting()) return 'the game is still booting';
    const level = this.levelScene();
    if (level) {
      // `startLevel` drops the scene's attempt synchronously and resumes a saved attempt only after its load:
      // dropping the saved attempt in between makes it a new attempt
      const started = level.startLevel(id);
      if (fresh) dropAttempt();
      await started;
      return null;
    }
    dropAttempt(); // another scene runs: no attempt can be resumed there (K-43 item 3 would block a new one)
    const running = this.game.scene.getScenes(true)[0];
    if (!running) return 'no running scene';
    running.scene.start(LEVEL_SCENE_KEY, { levelId: id } satisfies LevelSceneData);
    return null;
  }
}
