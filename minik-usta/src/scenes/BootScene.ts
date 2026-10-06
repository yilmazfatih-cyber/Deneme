import Phaser from 'phaser';
import { hasKey, tDynamic } from '../services/i18n.ts';
import { TOKENS } from '../theme/tokens.ts';

/**
 * i18n key of the game name (STORY §0-10 "Oyun adı `app.title` anahtarından gelir"; NAMING §5.2, TECH §13). The key has
 * no STORY row yet (store name pending, D-068), so the placeholder scene draws no title until it exists; the name is
 * never written in code (CLAUDE.md "Kodda sabit metin yok").
 */
const TITLE_KEY = 'app.title';

/** Phase 0 placeholder: an empty scene proving the Vite + TypeScript + Phaser pipeline works. */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  create(): void {
    this.cameras.main.setBackgroundColor(TOKENS.color.chapter.ch1.skyTop);
    if (!hasKey(TITLE_KEY)) return;
    // EXPAND (D-015): the game height follows the viewport, so centre on the current game size, not on 1920.
    const title = this.add
      .text(this.scale.width / 2, this.scale.height / 2, tDynamic(TITLE_KEY), {
        fontFamily: 'sans-serif',
        fontSize: '96px',
        fontStyle: 'bold',
        color: '#2B2B2B',
      })
      .setOrigin(0.5);
    const centre = (size: Phaser.Structs.Size): void => {
      title.setPosition(size.width / 2, size.height / 2);
    };
    this.scale.on(Phaser.Scale.Events.RESIZE, centre);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.scale.off(Phaser.Scale.Events.RESIZE, centre));
  }
}
