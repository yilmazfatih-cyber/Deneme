/**
 * The level screen's windows (UX_FLOWS §5.1 Pause + exit confirm, §7 out of moves window 1 / life lost window 2, §6
 * win screen, §7 "Altın yetmez" → fake store; STORY §7.3, §7.5, §7.6; D-022, D-024). This class only builds and shows
 * them — every decision (offer number, prices, exit kind, rewards) is made before by core / ui models and passed in;
 * every button calls back into the scene. One window at a time; opening another closes the current one at once.
 *
 * Animations (JUICE P0): #70 open, #71 close, #52 the out-of-moves window (dim, slide up, options 40 ms apart), #87 the
 * resume variants, #58 the heart, #69 every button. While a window is open the board takes no input (the dim swallows
 * touches; LevelScene.boardState also checks `open`).
 */
import type Phaser from 'phaser';
import { getLocale, t, upper } from '../../services/i18n.ts';
import type { I18nKey } from '../../services/i18n.ts';
import type { Layout } from '../../theme/layout.ts';
import { TOKENS } from '../../theme/tokens.ts';
import { drawHeart } from '../../ui/icons.ts';
import type { OfferModel } from '../../ui/offer.ts';
import type { OptionButton } from '../../ui/OptionButton.ts';
import { Popup } from '../../ui/Popup.ts';
import type { PopupOption, PopupRow, PopupSpec } from '../../ui/Popup.ts';
import { realMoneyText } from '../../ui/price.ts';
import type { WinRewards } from '../../ui/rewards.ts';
import { hex, textStyle } from '../../ui/text.ts';
import { UI } from '../../ui/uiConstants.ts';
import { WinScreen } from '../../ui/WinScreen.ts';
import { DEPTH } from './depth.ts';
import type { EventPlayer } from './EventPlayer.ts';
import { juiceMs } from './juice/catalog.ts';
import { addBakedGraphics } from '../../ui/BakedGraphics.ts';

const C = TOKENS.color.ui;

export type WindowKind = 'pause' | 'exit' | 'offer' | 'loss' | 'win' | 'store';

export interface WindowsHost {
  layout(): Layout;
  readonly player: EventPlayer;
}

export interface PauseSettings {
  readonly sound: boolean;
  readonly music: boolean;
  readonly haptics: boolean;
}

export type PauseToggle = keyof PauseSettings;

interface Open {
  readonly kind: WindowKind;
  readonly view: Popup | WinScreen;
  /** Rebuilds the same window (resize). */
  readonly reopen: () => void;
}

export class LevelWindows {
  private readonly scene: Phaser.Scene;
  private readonly host: WindowsHost;
  private current: Open | null = null;
  private closing: (Popup | WinScreen)[] = [];

  constructor(scene: Phaser.Scene, host: WindowsHost) {
    this.scene = scene;
    this.host = host;
  }

  get open(): WindowKind | null {
    return this.current?.kind ?? null;
  }

  /** Centre of the open window's × in design px (harness), or null. */
  get closePoint(): { readonly x: number; readonly y: number } | null {
    const v = this.current?.view;
    return v instanceof Popup ? v.closePoint : null;
  }

  /** UX §5.1 Pause (`resume`: the K-43 resume variant — `resume.title`, JUICE #87 strip, `tut.ctx.resume` line). */
  openPause(opts: {
    readonly resume: boolean;
    readonly resumeTip: boolean;
    /** Read at every (re)build: a toggle or a language change rebuilds the window with the current values. */
    readonly settings: () => PauseSettings;
    readonly onToggle: (id: PauseToggle) => boolean;
    readonly onContinue: () => void;
    readonly onExit: () => void;
  }): void {
    const build = (animate: boolean): void => {
      const rows: PopupRow[] = [
        { kind: 'title', text: upper(t(opts.resume ? 'resume.title' : 'pause.title')) },
      ];
      if (opts.resumeTip)
        rows.push({ kind: 'text', text: t('tut.ctx.resume'), role: 'body', color: C.inkSoft });
      const toggles: [PauseToggle, I18nKey][] = [
        ['sound', 'settings.sound'],
        ['music', 'settings.music'],
        ['haptics', 'settings.haptics'],
      ];
      for (const [id, key] of toggles)
        rows.push({ kind: 'toggle', id, label: t(key), on: opts.settings()[id] });
      const spec: PopupSpec = {
        rows,
        options: [
          { id: 'exit', label: t('pause.exit'), tone: 'neutral' },
          { id: 'continue', label: t('common.continue'), tone: 'primary' },
        ],
      };
      const popup = this.popup(spec, {
        option: (id) => (id === 'exit' ? opts.onExit() : opts.onContinue()),
        toggle: (id) => popup.setToggle(id, opts.onToggle(id as PauseToggle)),
      });
      this.set('pause', popup, () => build(false));
      if (animate) {
        if (opts.resume) this.host.player.play(87, { variant: 'pause', window: popup.target });
        else this.host.player.play(70, { window: popup.target });
      }
    };
    build(true);
  }

  /** UX §5.1 exit confirm: lines from ui/windowLines `exitLines`; equal pair "Kal" (green) / "Çık" (cream). */
  openExit(opts: {
    readonly lines: readonly I18nKey[];
    readonly onStay: () => void;
    readonly onLeave: () => void;
  }): void {
    const build = (animate: boolean): void => {
      const rows: PopupRow[] = [
        { kind: 'title', text: upper(t('exit.title')) },
        ...opts.lines.map((k): PopupRow => ({ kind: 'text', text: t(k) })),
      ];
      const popup = this.popup(
        {
          rows,
          arrange: 'pair',
          close: true,
          options: [
            { id: 'stay', label: upper(t('exit.stay')), tone: 'primary' },
            { id: 'leave', label: upper(t('exit.leave')), tone: 'neutral' },
          ],
        },
        { option: (id) => (id === 'stay' ? opts.onStay() : opts.onLeave()), close: opts.onStay },
      );
      this.set('exit', popup, () => build(false));
      if (animate) this.host.player.play(70, { window: popup.target });
    };
    build(true);
  }

  /**
   * UX §7 window 1 "Hamleler bitti!" (D-024): equal options in the order coins / ad / no; × = no. `entry`: `offer` =
   * JUICE #52 after #57; `resume` = K-43 (a) reopened at launch (#87 offer variant); `none` = rebuilt in place.
   */
  openOffer(opts: {
    readonly model: OfferModel;
    readonly remaining: number;
    readonly entry: 'offer' | 'resume' | 'none';
    readonly onCoins: () => void;
    readonly onAd: () => void;
    readonly onDecline: () => void;
  }): void {
    const build = (entry: 'offer' | 'resume' | 'none'): void => {
      const m = opts.model;
      const locale = getLocale();
      const coin = m.coin;
      const coinOption: PopupOption =
        coin.kind === 'gift'
          ? { id: 'coins', label: t('lose.offer.gift', { n: coin.moves }), tone: 'secondary' }
          : coin.kind === 'buy'
            ? {
                id: 'coins',
                label: t('lose.offer.moves', { n: coin.moves }),
                tone: 'secondary',
                price: {
                  line1: t('common.coins', { n: coin.price }),
                  line2: realMoneyText(coin.price, locale),
                },
              }
            : { id: 'coins', label: t('lose.buygold', { n: coin.missing }), tone: 'secondary' };
      const options: PopupOption[] = [coinOption];
      if (m.ad) {
        const l2 = m.ad.line2;
        options.push({
          id: 'ad',
          label: t('lose.ad', { n: m.ad.moves }),
          play: true,
          tone: 'neutral',
          enabled: m.ad.enabled,
          sub: l2.key === 'lose.adToday' ? t('lose.adToday', { n: l2.n, max: l2.max }) : t(l2.key),
        });
      }
      options.push({ id: 'decline', label: t('lose.decline'), tone: 'neutral' });
      const rows: PopupRow[] = [
        { kind: 'title', text: upper(t('lose.title')) },
        {
          kind: 'custom',
          h: UI.loseInfoH,
          build: (scene, w) => infoBox(scene, w, t('lose.left', { n: opts.remaining })),
        },
        { kind: 'text', text: t(m.counterKey, { n: m.n, max: m.max }), role: 'small', color: C.inkSoft },
      ];
      const popup = this.popup(
        { rows, options, close: true },
        {
          option: (id) => (id === 'coins' ? opts.onCoins() : id === 'ad' ? opts.onAd() : opts.onDecline()),
          close: opts.onDecline,
        },
      );
      this.set('offer', popup, () => build('none'));
      if (entry === 'offer') this.host.player.play(52, { window: popup.target });
      else if (entry === 'resume') this.host.player.play(87, { variant: 'offer', window: popup.target });
    };
    build(opts.entry);
  }

  /** UX §7 window 2 (life lost): the heart greys out (#58), `lose.life` (+ `lose.streak`), retry (primary) / home. */
  openLoss(opts: {
    readonly lines: readonly I18nKey[];
    readonly lifeLost: boolean;
    readonly onRetry: () => void;
    readonly onHome: () => void;
  }): void {
    const build = (animate: boolean): void => {
      let heart: Phaser.GameObjects.Graphics | null = null;
      const rows: PopupRow[] = [
        {
          kind: 'custom',
          h: UI.heartPx + 16,
          build: (scene) => {
            heart = addBakedGraphics(scene).setPosition(0, UI.heartPx / 2 + 8);
            drawHeart(heart, UI.heartPx, animate || !opts.lifeLost ? 0 : 1);
            return [heart];
          },
        },
        ...opts.lines.map((k, i): PopupRow => ({
          kind: 'text',
          text: t(k),
          role: i === 0 ? 'h2' : 'body',
          color: C.ink,
        })),
      ];
      const popup = this.popup(
        {
          rows,
          options: [
            { id: 'home', label: t('common.home'), tone: 'text' },
            { id: 'retry', label: t('lose.retry'), tone: 'primary' },
          ],
        },
        { option: (id) => (id === 'retry' ? opts.onRetry() : opts.onHome()) },
      );
      this.set('loss', popup, () => build(false));
      if (!animate) return;
      this.host.player.play(70, { window: popup.target });
      const g = heart as Phaser.GameObjects.Graphics | null;
      if (g && opts.lifeLost)
        this.host.player.play(58, { heart: { setDrain: (k: number) => drawHeart(g, UI.heartPx, k) } });
    };
    build(true);
  }

  /** UX §6 win screen (Phase 2: rows + "Devam" under the board). */
  openWin(opts: { readonly rewards: WinRewards; readonly onContinue: () => void }): void {
    const build = (animate: boolean): void => {
      const view = new WinScreen(
        this.scene,
        this.host.layout(),
        opts.rewards,
        DEPTH.windows,
        opts.onContinue,
        (b, v) => this.press(b, v),
      );
      this.set('win', view, () => build(false));
      if (animate) this.host.player.play(70, { window: view.target });
    };
    build(true);
  }

  /** UX §7 "Altın yetmez" → the (fake, MVP) store with the smallest covering pack; returns to the same offer. */
  openStore(opts: {
    readonly missing: number;
    readonly pack: { readonly coins: number };
    readonly onBuy: () => void;
    readonly onCancel: () => void;
  }): void {
    const build = (animate: boolean): void => {
      const popup = this.popup(
        {
          // `shop.covers` / `shop.testBuy` (STORY §7.5) are not in i18n yet: the header repeats the offer's own line
          rows: [{ kind: 'text', text: t('lose.buygold', { n: opts.missing }), role: 'h2' }],
          close: true,
          options: [
            {
              id: 'buy',
              label: t('common.coins', { n: opts.pack.coins }),
              tone: 'secondary',
              sub: realMoneyText(opts.pack.coins, getLocale()),
            },
            { id: 'cancel', label: t('common.cancel'), tone: 'neutral' },
          ],
        },
        { option: (id) => (id === 'buy' ? opts.onBuy() : opts.onCancel()), close: opts.onCancel },
      );
      this.set('store', popup, () => build(false));
      if (animate) this.host.player.play(70, { window: popup.target });
    };
    build(true);
  }

  /** Closes the open window (JUICE #71), then destroys it. */
  close(): void {
    const cur = this.current;
    if (!cur) return;
    this.current = null;
    this.host.player.play(71, { window: cur.view.target });
    this.closing.push(cur.view);
    const ms = juiceMs(71, this.host.player.reduced);
    this.scene.time.delayedCall(ms + 20, () => {
      const i = this.closing.indexOf(cur.view);
      if (i < 0) return; // `clear()` already destroyed it
      this.closing.splice(i, 1);
      cur.view.destroy();
    });
  }

  /** Destroys everything at once (level change, scene shutdown). */
  clear(): void {
    this.current?.view.destroy();
    this.current = null;
    for (const v of this.closing) v.destroy();
    this.closing = [];
  }

  /** Resize: the open window is rebuilt for the new layout (no animation). */
  relayout(): void {
    const cur = this.current;
    if (!cur) return;
    cur.reopen();
  }

  // --- internals ---------------------------------------------------------------------------------------------------------

  private popup(spec: PopupSpec, handlers: Omit<ConstructorParameters<typeof Popup>[4], 'button'>): Popup {
    return new Popup(
      this.scene,
      this.host.layout(),
      spec,
      DEPTH.windows,
      { ...handlers, button: (b, v) => this.press(b, v) },
      { on: t('common.on'), off: t('common.off') },
    );
  }

  private set(kind: WindowKind, view: Popup | WinScreen, reopen: () => void): void {
    this.current?.view.destroy();
    this.current = { kind, view, reopen };
  }

  private press(b: OptionButton, variant: 'press' | 'release'): void {
    this.host.player.play(69, { button: b, variant });
  }
}

/** UX §7 window 1 info box: inset panel with the neutral "Kalan: n hücre" line (no pressure text, R-15). */
function infoBox(scene: Phaser.Scene, w: number, text: string): Phaser.GameObjects.GameObject[] {
  const h = UI.loseInfoH;
  const g = addBakedGraphics(scene);
  g.fillStyle(hex(C.panelInset), 1).fillRoundedRect(-w / 2, 0, w, h, TOKENS.radius.panelArt);
  const label = scene.add.text(0, h / 2, text, textStyle('h2', C.ink)).setOrigin(0.5, 0.5);
  return [g, label];
}
