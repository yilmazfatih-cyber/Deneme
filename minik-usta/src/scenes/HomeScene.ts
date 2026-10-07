/**
 * Minimal home (UX_FLOWS §6 "Faz 2 dikey dilimi"; TECH_DESIGN §14.1 #12): the level screen's sky, the game name
 * `app.title` at 0.6× (never upper-cased, ART §8) and the level button `home.play` "BÖLÜM N" (720 × 176 at
 * `layout.bottom.playButton*`, upper-cased). After level 5 the `home.moreSoon` band shows and the button opens level 1
 * (1–5 loop); right after level 1 "BÖLÜM 2" pulses (UX §2.2 step 11). No top bar, town, side icons or bottom nav.
 *
 * A voided attempt (K-43 item 4, UX §1 (c)) shows the `resume.void` window first: title, body, the refund row (life,
 * coins), the bridge line when it applies, "Tamam" — then the notice is removed from the save (the refund itself was
 * written at launch and is never repeated).
 */
import Phaser from 'phaser';
import { DESIGN_WIDTH, scaleMode } from '../config/display.ts';
import { t, upper } from '../services/i18n.ts';
import type { DeepReadonly, VoidNotice } from '../services/save.ts';
import { createLayout, designHeight } from '../theme/layout.ts';
import type { Layout } from '../theme/layout.ts';
import { FRAME } from '../theme/textures.ts';
import { TOKENS } from '../theme/tokens.ts';
import { drawHeart } from '../ui/icons.ts';
import { InlineLabel } from '../ui/InlineLabel.ts';
import { OptionButton } from '../ui/OptionButton.ts';
import { Popup } from '../ui/Popup.ts';
import { hex, textStyle } from '../ui/text.ts';
import { UI } from '../ui/uiConstants.ts';
import { addBakedGraphics } from '../ui/BakedGraphics.ts';
import { appSave, applySettings, onSettingChanged, reducedMotion } from './appServices.ts';
import { BOOT_ATLAS_KEY } from './atlas.ts';
import { homeTarget } from './flow/launch.ts';
import type { HomeTarget } from './flow/launch.ts';
import { HOME_SCENE_KEY, LEVEL_SCENE_KEY } from './level/LevelScene.ts';
import type { HomeSceneData, LevelSceneData } from './level/LevelScene.ts';
import { DEPTH } from './level/depth.ts';
import { gameAudio } from './level/sceneServices.ts';

const C = TOKENS.color.ui;

export class HomeScene extends Phaser.Scene {
  private data0: HomeSceneData = {};
  private target!: HomeTarget;
  private layoutNow!: Layout;
  private sky!: Phaser.GameObjects.Image;
  private title!: Phaser.GameObjects.Text;
  private button: OptionButton | null = null;
  private band: Phaser.GameObjects.Container | null = null;
  private notice: Popup | null = null;
  /** Reduced motion: "BÖLÜM 2" gets a steady gold edge instead of the scale pulse (JUICE §0 rule 8, ≤ 3 %). */
  private edge: Phaser.GameObjects.Graphics | null = null;
  private reduced = false;
  private starting = false;

  constructor() {
    super(HOME_SCENE_KEY);
  }

  init(data: HomeSceneData): void {
    this.data0 = data ?? {};
    this.starting = false;
  }

  create(): void {
    applySettings();
    const save = appSave();
    this.target = homeTarget(save.data, this.data0.last ?? null);
    this.layoutNow = this.computeLayout();
    const sky = TOKENS.color.chapter.ch1;
    this.sky = this.add.image(0, 0, BOOT_ATLAS_KEY, FRAME.whitePixel).setOrigin(0, 0);
    this.sky.setTint(hex(sky.skyTop), hex(sky.skyTop), hex(sky.skyBottom), hex(sky.skyBottom));
    this.cameras.main.setBackgroundColor(sky.skyTop);
    const style = textStyle('display', C.ink);
    this.title = this.add
      .text(0, 0, t('app.title'), {
        ...style,
        fontSize: `${Math.round(TOKENS.font.size.display * UI.homeTitleScale)}px`,
      })
      .setOrigin(0.5);
    // read before the first build: the steady gold edge of "BÖLÜM 2" is created visible with reduced motion (UX §2.2
    // step 11, JUICE §0 rule 8; review Faz 2 tur 2 #3)
    this.reduced = reducedMotion();
    this.build();
    const onResize = (): void => {
      this.layoutNow = this.computeLayout();
      this.build();
    };
    this.scale.on(Phaser.Scale.Events.RESIZE, onResize);
    // a new language: the screen is rebuilt with the same data (an open `resume.void` window comes back from the save)
    const offSettings = onSettingChanged((key) => {
      if (key === 'lang') this.scene.restart(this.data0);
      else if (key === 'reduceMotion') this.setReduced(reducedMotion());
    });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      offSettings();
      this.scale.off(Phaser.Scale.Events.RESIZE, onResize);
      this.button?.destroy();
      this.band?.destroy(true);
      this.notice?.destroy();
      this.edge?.destroy();
      this.edge = null;
      this.button = null;
      this.band = null;
      this.notice = null;
    });
    const notice = save.data.voidNotice;
    if (notice) this.openNotice(notice);
  }

  update(time: number): void {
    // the idle home screen fills the sound bank (TECH §10.6): fewer budgeted slices are left for the level's idle frames
    gameAudio().bank.pump();
    if (!this.button || !this.target.pulse || this.reduced) return;
    const period = TOKENS.duration.lastMovesPulse;
    const k = 0.5 - 0.5 * Math.cos((2 * Math.PI * (time % period)) / period);
    this.button.root.setScale(1 + (UI.homePulsePeak - 1) * k);
  }

  private computeLayout(): Layout {
    const parent = this.scale.parentSize;
    const vp =
      parent.width > 0 && parent.height > 0
        ? { width: parent.width, height: parent.height }
        : { width: this.scale.width, height: this.scale.height };
    return createLayout(TOKENS, designHeight(scaleMode, vp, TOKENS));
  }

  private build(): void {
    const L = this.layoutNow;
    this.sky.setDisplaySize(DESIGN_WIDTH, L.H);
    this.title.setPosition(L.W / 2, L.H * 0.3);
    this.button?.destroy();
    this.band?.destroy(true);
    const r = L.bottom.playButton;
    const btn = new OptionButton(this, { w: r.w, h: r.h }, 'primary', {
      label: upper(t('home.play', { n: this.target.next })),
    });
    btn.root.setPosition(r.x + r.w / 2, r.y + r.h / 2).setDepth(DEPTH.hud);
    this.edge?.destroy();
    this.edge = null;
    if (this.target.pulse) {
      const e = UI.homeEdgePx;
      this.edge = addBakedGraphics(this)
        .lineStyle(e, hex(C.gold), 1)
        .strokeRoundedRect(r.x - e, r.y - e, r.w + 2 * e, r.h + 2 * e, TOKENS.radius.button + e)
        .setDepth(DEPTH.hud - 1)
        .setVisible(this.reduced);
    }
    btn.onTap(() => this.play());
    btn.onPress((v) => {
      if (v === 'press') {
        btn.setLip(TOKENS.shadow.buttonPressedLipPx);
        gameAudio().play('sfx_button');
      } else btn.setLip(TOKENS.shadow.buttonLipPx);
    });
    this.button = btn;
    this.band = null;
    if (this.target.moreSoon) {
      const w = r.w;
      const h = UI.homeBandH;
      const g = this.add.graphics();
      g.fillStyle(hex(C.goldDark), 1).fillRoundedRect(-w / 2, -h / 2 + 6, w, h, TOKENS.radius.chip);
      g.fillStyle(hex(C.gold), 1).fillRoundedRect(-w / 2, -h / 2, w, h, TOKENS.radius.chip);
      const text = this.add.text(0, 0, t('home.moreSoon'), textStyle('body', C.ink)).setOrigin(0.5);
      this.band = this.add.container(L.W / 2, r.y - UI.homeBandGapPx - h / 2, [g, text]).setDepth(DEPTH.hud);
    }
    this.notice?.setVisible(true);
  }

  /** JUICE §0 rule 8: the "BÖLÜM 2" pulse stops (steady gold edge) or starts again. */
  private setReduced(on: boolean): void {
    this.reduced = on;
    this.edge?.setVisible(on);
    if (on) this.button?.root.setScale(1);
  }

  private play(): void {
    if (this.starting || this.notice) return;
    this.starting = true;
    // TECH §10.4: a sleeping level screen is woken (its pools and HUD are kept), else started; home stops
    this.scene.run(LEVEL_SCENE_KEY, { levelId: this.target.next } satisfies LevelSceneData);
    this.scene.stop();
  }

  /** UX §1 (c): the update window (refund row: life, coins; no blame, no red). */
  private openNotice(notice: DeepReadonly<VoidNotice>): void {
    const refunds = notice.refunds;
    const popup = new Popup(
      this,
      this.layoutNow,
      {
        rows: [
          { kind: 'title', text: upper(t('resume.void.title')) },
          { kind: 'text', text: t('resume.void.body', { n: notice.level }) },
          {
            kind: 'custom',
            h: 112,
            build: (scene) => refundRow(scene, refunds.life, refunds.coins),
          },
          ...(notice.bridge
            ? [
                {
                  kind: 'text' as const,
                  text: t('resume.void.bridge'),
                  role: 'caption' as const,
                  color: C.inkSoft,
                },
              ]
            : []),
        ],
        options: [{ id: 'ok', label: upper(t('common.ok')), tone: 'primary' }],
      },
      DEPTH.windows,
      {
        option: () => {
          appSave().dismissVoidNotice();
          popup.destroy();
          this.notice = null;
        },
      },
    );
    this.notice = popup;
  }
}

/** UX §1 (c) refund row: only the items > 0, icon + amount. */
function refundRow(scene: Phaser.Scene, life: number, coins: number): Phaser.GameObjects.GameObject[] {
  const out: Phaser.GameObjects.GameObject[] = [];
  // the life gets its heart icon; the coin amount carries its inline `{coin}` icon (`common.coins`)
  const items: { heart: boolean; text: string }[] = [];
  if (life > 0) items.push({ heart: true, text: t('common.times', { n: life }) });
  if (coins > 0) items.push({ heart: false, text: t('common.coins', { n: coins }) });
  const step = 280;
  items.forEach((it, i) => {
    const x = (i - (items.length - 1) / 2) * step;
    if (it.heart) {
      const g = scene.add.graphics().setPosition(x - 60, 56);
      drawHeart(g, 72);
      out.push(g);
    }
    const label = new InlineLabel(scene, 'h2', C.ink, it.heart ? 'left' : 'center')
      .setText(it.text)
      .setPosition(it.heart ? x - 12 : x, 56);
    out.push(label.root);
  });
  return out;
}
