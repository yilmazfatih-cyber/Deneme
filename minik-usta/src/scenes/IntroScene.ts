/**
 * First-launch intro (UX_FLOWS §2, §2.1; STORY §4.0 `story.prologue`; D-018 prologue on first launch; TECH_DESIGN §14.1
 * #12 "giriş sahnesi (yer tutucu 3 panel)"). Three placeholder panels advance by themselves every
 * `duration.ftuePanelAuto`; a tap shows the next one, "Geç" (`common.skip`) ends the intro with one tap; then the board
 * comes in (`introToBoardMs`) and Level 1 starts directly (no home, no pre-level window: UX §2). Level 1 is loaded,
 * compiled and baked (its texture pages) behind the panels (UX §2.1 critical path, TECH §10.7 item 6), so the level
 * screen finds its bake ready. The prologue counts as seen when it ends, skipped or not
 * (`economy.json → town.cutscenes.skippedCountsAsSeen`).
 *
 * The sound bank is pre-rendered in the intro's frames (`AudioService.pump`, ≤ `audio.prerenderBudgetMsPerFrame`) and
 * the image shader variants are built (`shaderWarmup`), so level 1 starts with every P0 sound ready and no cold shader.
 *
 * Every step of the intro runs on the wall clock of the game loop, the panel → board fade included: the UX §2.1 budget
 * is wall time, and Phaser's frame delta is clamped on slow frames (a frame hitch must not stretch the transition).
 *
 * Placeholder art: flat shapes in token colours (attic, back yard, house front) with the STORY speech balloons; the
 * painted panels (`cut_prologue_p1…p3`, ASSET_LIST) replace them later.
 */
import Phaser from 'phaser';
import { DESIGN_WIDTH, scaleMode } from '../config/display.ts';
import { t, upper } from '../services/i18n.ts';
import type { I18nKey } from '../services/i18n.ts';
import { createLayout, designHeight } from '../theme/layout.ts';
import type { Layout } from '../theme/layout.ts';
import { TOKENS } from '../theme/tokens.ts';
import { drawDedeBust } from '../ui/icons.ts';
import { OptionButton } from '../ui/OptionButton.ts';
import { SpeechBubble } from '../ui/SpeechBubble.ts';
import { hex, textStyle } from '../ui/text.ts';
import { UI } from '../ui/uiConstants.ts';
import { appSave, applySettings, onSettingChanged, reducedMotion } from './appServices.ts';
import { bakeLevelAtlas } from './atlas.ts';
import { IntroTimeline, INTRO_PANELS } from './flow/intro.ts';
import { PROLOGUE_SCENE } from './flow/launch.ts';
import { LEVEL_SCENE_KEY } from './level/LevelScene.ts';
import type { LevelSceneData } from './level/LevelScene.ts';
import { loadLevelById } from './level/levels.ts';
import { gameAudio } from './level/sceneServices.ts';
import { shaderWarmup } from './shaderWarmup.ts';

export const INTRO_SCENE_KEY = 'Intro';

const C = TOKENS.color.ui;
const CH = TOKENS.color.character;
const SKY = TOKENS.color.chapter.ch1;
/** Above the panels and the skip button. */
const VEIL_DEPTH = 100;

/** STORY §4.0 balloons per panel: speaker key + text key. */
const LINES: readonly (readonly I18nKey[])[] = [
  ['story.prologue.p1.tuna'],
  ['story.prologue.p2.dede'],
  ['story.prologue.p3.tuna', 'story.prologue.p3.kepce'],
];

const col = (v: string | undefined): number => hex(v ?? CH.outline);

export class IntroScene extends Phaser.Scene {
  private readonly timeline = new IntroTimeline();
  private layoutNow!: Layout;
  private panels: Phaser.GameObjects.Container[] = [];
  private skip: OptionButton | null = null;
  private shown = -1;
  /** Wall-clock time the panel → board fade started (null: the intro is still running). */
  private leaveAt: number | null = null;
  private veil: Phaser.GameObjects.Rectangle | null = null;
  private started = false;
  /** Harness only: the panel the intro is held on (no auto-advance), or null. */
  private held: number | null = null;
  /** Wall-clock time of the game loop (ms): the same clock for the start, the auto-advance, the taps and the fade. */
  private clock = (): number => this.game.loop.time;

  constructor() {
    super(INTRO_SCENE_KEY);
  }

  create(): void {
    applySettings();
    this.leaveAt = null;
    this.veil = null;
    this.started = false;
    this.shown = -1;
    this.held = null;
    this.layoutNow = this.computeLayout();
    this.prepareLevel();
    this.panels = Array.from({ length: INTRO_PANELS }, (_, i) => this.buildPanel(i));
    this.buildSkip();
    this.input.on('pointerdown', (_p: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]) => {
      if (over.length > 0) return; // the skip button
      this.timeline.tap(this.clock());
    });
    // a new language: the panels' balloons and sign are rebuilt in place (the timeline goes on)
    const offSettings = onSettingChanged((key) => {
      if (key === 'lang') this.relabel();
    });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, offSettings);
    this.timeline.start(this.clock());
    this.showPanel(0);
  }

  /** Harness (screen shots, review Faz 2 tur 1 #10): show panel `i` and stay on it. */
  holdPanel(i: number): void {
    this.held = Math.max(0, Math.min(INTRO_PANELS - 1, Math.floor(i)));
  }

  update(): void {
    const now = this.clock();
    // the idle intro fills the sound bank (review Faz 2 tur 4 #0): the FTUE path Boot → Intro → Level 1 skips the home
    // screen, so without this every P0 sound was rendered during level 1's first moves (≤ 4 ms per frame, TECH §10.6)
    gameAudio().pump();
    shaderWarmup(this.game).step();
    if (this.held !== null) {
      if (this.shown !== this.held) this.showPanel(this.held);
      return;
    }
    if (this.leaveAt !== null) {
      this.fade(now);
      return;
    }
    this.timeline.update(now);
    if (this.timeline.done) this.leave(now);
    else if (this.timeline.panel !== this.shown) this.showPanel(this.timeline.panel);
  }

  /**
   * UX §2.1: level 1 is loaded, compiled and baked behind the panels. The bake waits for the next frame so the first
   * panel is drawn first; `bakeLevelAtlas` keeps the pages, and the level screen's own bake of level 1 reuses them.
   */
  private prepareLevel(): void {
    void loadLevelById(1).then((res) => {
      if (!res.ok) return; // the level screen reports a rejected level (TECH §8.3)
      this.time.delayedCall(0, () => {
        if (!this.started) bakeLevelAtlas(this.game, res.level);
      });
    });
  }

  private computeLayout(): Layout {
    const parent = this.scale.parentSize;
    const vp =
      parent.width > 0 && parent.height > 0
        ? { width: parent.width, height: parent.height }
        : { width: this.scale.width, height: this.scale.height };
    return createLayout(TOKENS, designHeight(scaleMode, vp, TOKENS));
  }

  private relabel(): void {
    this.skip?.destroy();
    this.buildSkip();
    for (const p of this.panels) p.destroy(true);
    this.panels = Array.from({ length: INTRO_PANELS }, (_, i) => this.buildPanel(i));
    this.panels[this.shown]?.setVisible(true).setAlpha(1);
  }

  private showPanel(i: number): void {
    const fade = reducedMotion() ? TOKENS.duration.reducedFade : TOKENS.duration.panelEnter;
    this.panels.forEach((p, j) => {
      if (j === i) {
        p.setVisible(true).setAlpha(0);
        this.tweens.add({ targets: p, alpha: 1, duration: fade, ease: 'Quad.easeOut' });
      } else if (j === this.shown) {
        this.tweens.add({ targets: p, alpha: 0, duration: fade, onComplete: () => p.setVisible(false) });
      } else p.setVisible(false);
    });
    this.shown = i;
  }

  /** The intro ended (last panel, or "Geç"): the prologue is seen, the sky-coloured veil fades in over the panels. */
  private leave(now: number): void {
    if (this.leaveAt !== null) return;
    this.leaveAt = now;
    const save = appSave();
    if (!save.data.town.seenScenes.includes(PROLOGUE_SCENE))
      save.commit((d) => {
        d.town.seenScenes.push(PROLOGUE_SCENE);
      });
    this.veil = this.add
      .rectangle(0, 0, DESIGN_WIDTH, this.layoutNow.H, hex(SKY.skyTop))
      .setOrigin(0, 0)
      .setAlpha(0)
      .setDepth(VEIL_DEPTH);
    this.fade(now);
  }

  /** Panel → board (`introToBoardMs`, linear like a camera fade) on the wall clock; then Level 1 starts. */
  private fade(now: number): void {
    const start = this.leaveAt;
    if (start === null || this.started) return;
    const u = Math.min(1, Math.max(0, (now - start) / UI.introToBoardMs));
    this.veil?.setAlpha(u);
    if (u < 1) return;
    this.started = true;
    this.scene.start(LEVEL_SCENE_KEY, { levelId: 1 } satisfies LevelSceneData);
  }

  private buildSkip(): void {
    const L = this.layoutNow;
    const w = 280;
    const h = TOKENS.touch.minTargetPx;
    const btn = new OptionButton(this, { w, h }, 'neutral', { label: t('common.skip') });
    btn.root.setPosition(L.W - TOKENS.layout.marginPx - w / 2, TOKENS.layout.top.pauseY + h / 2).setDepth(10);
    btn.onTap(() => this.timeline.skip());
    btn.onPress((v) =>
      btn.setLip(v === 'press' ? TOKENS.shadow.buttonPressedLipPx : TOKENS.shadow.buttonLipPx),
    );
    this.skip = btn;
  }

  /** One placeholder panel (STORY §4.0 scene description in flat shapes) with its balloons. */
  private buildPanel(i: number): Phaser.GameObjects.Container {
    const L = this.layoutNow;
    const W = DESIGN_WIDTH;
    const H = L.H;
    const g = this.add.graphics();
    const parts: Phaser.GameObjects.GameObject[] = [g];
    const groundY = H * 0.68;
    if (i === 0) {
      // attic: wooden walls, a beam of light, the open chest with the old sign
      g.fillStyle(hex(TOKENS.color.board.yardFrame), 1).fillRect(0, 0, W, H);
      g.fillStyle(hex(TOKENS.color.board.yardFloorAlt), 1).fillRect(0, groundY, W, H - groundY);
      g.fillStyle(hex(C.inkOnDark), 0.18).fillTriangle(W * 0.2, 0, W * 0.45, 0, W * 0.62, groundY);
      g.fillStyle(hex(C.panelShadow), 1).fillRect(W * 0.5, groundY - 220, 360, 220);
      g.fillStyle(hex(C.panelInset), 1).fillRect(W * 0.53, groundY - 300, 300, 110);
      this.figure(parts, W * 0.28, groundY, 'tuna');
      this.figure(parts, W * 0.86, groundY, 'kepce');
    } else if (i === 1) {
      // back yard: the sign on two trestles, painted in stripes; Usta Dede smiles
      g.fillStyle(hex(SKY.skyTop), 1).fillRect(0, 0, W, groundY);
      g.fillStyle(hex(SKY.mid), 1).fillRect(0, groundY, W, H - groundY);
      const blocks = Object.values(TOKENS.color.block);
      const sw = 520 / blocks.length;
      blocks.forEach((c, k) => g.fillStyle(hex(c), 1).fillRect(W * 0.4 + k * sw, groundY - 260, sw, 140));
      g.fillStyle(hex(TOKENS.color.board.yardFrame), 1).fillRect(W * 0.43, groundY - 120, 24, 120);
      g.fillStyle(hex(TOKENS.color.board.yardFrame), 1).fillRect(W * 0.86, groundY - 120, 24, 120);
      const dede = this.add.graphics();
      drawDedeBust(dede, 320);
      dede.setPosition(W * 0.2, groundY - 160);
      parts.push(dede);
      this.figure(parts, W * 0.68, groundY + 120, 'tuna');
    } else {
      // house front: the painted sign over the door (`story.sign`, upper-cased), Tuna and Kepçe
      g.fillStyle(hex(SKY.skyTop), 1).fillRect(0, 0, W, groundY);
      g.fillStyle(hex(SKY.near), 1).fillRect(0, groundY, W, H - groundY);
      g.fillStyle(hex(C.panel), 1).fillRect(W * 0.2, groundY - 620, W * 0.6, 620);
      g.fillStyle(hex(TOKENS.color.block.R), 1).fillTriangle(
        W * 0.15,
        groundY - 620,
        W * 0.85,
        groundY - 620,
        W * 0.5,
        groundY - 860,
      );
      g.fillStyle(hex(TOKENS.color.board.yardFrame), 1).fillRect(W * 0.43, groundY - 300, W * 0.14, 300);
      g.fillStyle(hex(C.secondary), 1).fillRoundedRect(W * 0.24, groundY - 560, W * 0.52, 130, 24);
      const sign = this.add
        .text(
          W / 2,
          groundY - 495,
          upper(t('story.sign')),
          textStyle('h2', C.inkOnDark, { color: C.secondaryStroke, px: 8 }),
        )
        .setOrigin(0.5);
      parts.push(sign);
      this.figure(parts, W * 0.16, groundY + 40, 'tuna');
      this.figure(parts, W * 0.86, groundY + 40, 'kepce');
    }
    const lines = LINES[i] ?? [];
    lines.forEach((key, k) => {
      const b = new SpeechBubble(this, 0, { bust: false, maxW: 760 }).setText(t(key));
      const x = k === 0 ? TOKENS.layout.marginPx * 2 : W - b.width - TOKENS.layout.marginPx * 2;
      const y = H * 0.12 + k * (UI.bubbleMaxH + 24) + TOKENS.layout.top.groupBottomY * 0.5;
      b.setPosition(x, y).setVisible(true);
      parts.push(b.root);
    });
    return this.add.container(0, 0, parts).setVisible(false);
  }

  /** Placeholder character standing on `groundY` (Tuna: helmet + vest; Kepçe: the dog with its helmet). */
  private figure(
    parts: Phaser.GameObjects.GameObject[],
    x: number,
    groundY: number,
    who: 'tuna' | 'kepce',
  ): void {
    const g = this.add.graphics().setPosition(x, groundY);
    const line = hex(CH.outline);
    if (who === 'tuna') {
      g.fillStyle(col(CH.tuna.trousers), 1).fillRoundedRect(-50, -150, 100, 150, 20);
      g.fillStyle(col(CH.tuna.vest), 1).fillRoundedRect(-70, -320, 140, 190, 30);
      g.fillStyle(col(CH.tuna.skin), 1).fillCircle(0, -390, 70);
      g.fillStyle(col(CH.tuna.helmet), 1).slice(0, -410, 78, Math.PI, 0, false).fillPath();
      g.lineStyle(5, line, 1).strokeCircle(0, -390, 70);
    } else {
      g.fillStyle(col(CH.kepce.fur), 1).fillEllipse(0, -70, 200, 120);
      g.fillStyle(col(CH.kepce.fur), 1).fillCircle(70, -150, 60);
      g.fillStyle(col(CH.kepce.muzzle), 1).fillEllipse(110, -135, 60, 40);
      g.fillStyle(col(CH.kepce.helmet), 1).slice(70, -170, 62, Math.PI, 0, false).fillPath();
      g.lineStyle(5, line, 1).strokeEllipse(0, -70, 200, 120);
    }
    parts.push(g);
  }
}
