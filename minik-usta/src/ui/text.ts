/**
 * Text styles of the HUD (UX §0.3; ART §8: Baloo 2 with `font.fallback`, sizes / weights from `tokens.font`). Texts
 * themselves always come from i18n keys (CLAUDE.md "Kodda sabit metin yok").
 */
import type Phaser from 'phaser';
import { TOKENS } from '../theme/tokens.ts';

export type FontRole = keyof typeof TOKENS.font.size;

const FAMILY = [TOKENS.font.family, ...TOKENS.font.fallback]
  .map((f) => (f.includes(' ') ? `"${f}"` : f))
  .join(', ');

/** Style of a text role (`font.size.<role>`, `font.weight.<role>`) in `color`, with an optional outline. */
export function textStyle(
  role: FontRole,
  color: string,
  stroke?: { readonly color: string; readonly px: number },
): Phaser.Types.GameObjects.Text.TextStyle {
  return {
    fontFamily: FAMILY,
    fontSize: `${TOKENS.font.size[role]}px`,
    fontStyle: String(TOKENS.font.weight[role]),
    color,
    align: 'center',
    ...(stroke ? { stroke: stroke.color, strokeThickness: stroke.px } : {}),
  };
}

/** `#RRGGBB` → 0xRRGGBB. */
export function hex(color: string): number {
  return Number.parseInt(color.slice(1), 16);
}
