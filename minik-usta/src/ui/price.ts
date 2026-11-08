/**
 * `PriceLabel` text (UX_FLOWS §0.3; BUSINESS E2; D-024): every coin price shows its real-money equivalent on a second
 * line, in the local currency, computed from the reference pack (`config/economy.json → priceDisplay.referenceSku`,
 * the "Avuç" 1 000-coin pack): TR in lira (rounded to whole lira), EN in dollars (cents). Pure.
 *
 * The approximation sign and the currency format are not i18n keys yet (no `price.approx` key in STORY §7): the sign is
 * a symbol, the amount is `Intl.NumberFormat` currency formatting of the locale (TR "₺81", EN "$1.79").
 */
import economy from '../../config/economy.json' with { type: 'json' };
import { LOCALE_TAGS } from '../services/i18n.ts';
import type { Locale } from '../services/i18n.ts';

/** Shown before the real-money amount (UX §0.3 "≈ 81 TL"). */
export const APPROX_SIGN = '≈';

export interface ReferencePack {
  readonly coins: number;
  readonly usd: number;
  readonly try: number;
}

/** The pack named by `priceDisplay.referenceSku`. */
export function referencePack(): ReferencePack {
  const sku = economy.priceDisplay.referenceSku;
  const pack = economy.shop.coinPacks.find((p) => p.sku === sku);
  if (!pack) throw new Error(`priceDisplay.referenceSku ${sku} is not a coin pack`);
  return pack;
}

const CURRENCY: Readonly<Record<Locale, { readonly code: string; readonly digits: number }>> = {
  tr: { code: 'TRY', digits: 0 },
  en: { code: 'USD', digits: 2 },
};

/** Real-money value of `coins` in the locale's currency (number, not rounded). */
export function realMoneyValue(coins: number, locale: Locale, pack: ReferencePack = referencePack()): number {
  const perPack = locale === 'tr' ? pack.try : pack.usd;
  return (coins * perPack) / pack.coins;
}

/** Second line of a PriceLabel: "≈ ₺81" (TR) / "≈ $1.79" (EN). */
export function realMoneyText(coins: number, locale: Locale, pack: ReferencePack = referencePack()): string {
  const c = CURRENCY[locale];
  const fmt = new Intl.NumberFormat(LOCALE_TAGS[locale], {
    style: 'currency',
    currency: c.code,
    minimumFractionDigits: c.digits,
    maximumFractionDigits: c.digits,
  });
  return `${APPROX_SIGN} ${fmt.format(realMoneyValue(coins, locale, pack))}`;
}
