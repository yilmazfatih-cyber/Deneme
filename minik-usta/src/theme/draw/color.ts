/**
 * Colour math for the procedural art (ART_DIRECTION §2.2, §3, §4; D-012, D-013; TECH_DESIGN §10.2).
 *
 * Every derived colour is computed by formula from base tokens. `check.*` in tokens.json is a control table read only by
 * tests/theme/tokens.test.ts (±1 per channel); code never reads it, so the colour-blind mode (different plan fill alpha
 * and ink contrast) stays correct. Pure functions, no Canvas access.
 */
import type { ColorCode } from '../../core/types.ts';
import type { Tokens } from '../tokens.ts';

/** sRGB channels 0–255 (not rounded until `toHex` / `css`). */
export type Rgb = readonly [number, number, number];

export const WHITE: Rgb = [255, 255, 255];
export const BLACK: Rgb = [0, 0, 0];

export function parseHex(hex: string): Rgb {
  const m = /^#([0-9A-Fa-f]{2})([0-9A-Fa-f]{2})([0-9A-Fa-f]{2})$/.exec(hex);
  if (!m) throw new RangeError(`bad colour ${hex}`);
  return [parseInt(m[1] ?? '0', 16), parseInt(m[2] ?? '0', 16), parseInt(m[3] ?? '0', 16)];
}

const channel = (v: number): number => Math.min(255, Math.max(0, Math.round(v)));

/** Upper-case `#RRGGBB`, channels rounded to the nearest integer and clamped. */
export function toHex(c: Rgb): string {
  return '#' + c.map((v) => channel(v).toString(16).padStart(2, '0').toUpperCase()).join('');
}

/** Canvas colour string. Opaque colours are `#RRGGBB`; otherwise `rgba(r,g,b,a)` with a 4-decimal alpha. */
export function css(c: Rgb, alpha = 1): string {
  if (alpha >= 1) return toHex(c);
  const a = Math.max(0, Math.round(alpha * 10000) / 10000);
  return `rgba(${channel(c[0])},${channel(c[1])},${channel(c[2])},${a})`;
}

/** `a·(1 − t) + b·t` per channel. */
export function mix(a: Rgb, b: Rgb, t: number): Rgb {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

/** Mix with white (`*Lighten` tokens). */
export const lighten = (c: Rgb, t: number): Rgb => mix(c, WHITE, t);

/** Multiply every channel (`*Factor` tokens). */
export const shade = (c: Rgb, f: number): Rgb => [c[0] * f, c[1] * f, c[2] * f];

const linear = (v: number): number => {
  const s = v / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};

/** CIE L* (D65) of an sRGB colour, 0–100 (ART §2.1 lightness ladder). */
export function lstar(c: Rgb): number {
  const y = 0.2126729 * linear(c[0]) + 0.7151522 * linear(c[1]) + 0.072175 * linear(c[2]);
  const f = y > 216 / 24389 ? Math.cbrt(y) : ((24389 / 27) * y + 16) / 116;
  return 116 * f - 16;
}

/** A colour plus the opacity it is painted with. */
export interface Ink {
  readonly rgb: Rgb;
  readonly alpha: number;
}

export interface DrawMode {
  /** Settings → colour-blind mode (ART §10): larger symbols, stronger ink, plan fill `a11y.colorBlindPlanFill`. */
  readonly colorBlind: boolean;
}
export const DEFAULT_MODE: DrawMode = Object.freeze({ colorBlind: false });

/** Layer colours of a placed block (ART §3 table "Hesaplanmış katman renkleri"). */
export interface BlockPalette {
  readonly base: Rgb;
  /** Top bevel band: base + `bevelTopLighten` white. */
  readonly top: Rgb;
  /** Left bevel band: base + `bevelLeftLighten` white. */
  readonly left: Rgb;
  /** Bottom shade band: base × `shadeBottomFactor`. */
  readonly bottom: Rgb;
  /** Right shade band: base × `shadeRightFactor`. */
  readonly right: Rgb;
  /** Outer outline: base × `outlineFactor`. */
  readonly outline: Rgb;
  /** Inner seam: base × `seamFactor`, painted at `alpha.seam`. */
  readonly seam: Rgb;
  readonly symbol: Ink;
}

export function blockBase(tokens: Tokens, color: ColorCode): Rgb {
  return parseHex(tokens.color.block[color]);
}

/**
 * Symbol ink rule (ART §2.2, D-013), always by formula: L*(base) ≥ `block.symbolLightThresholdLstar` → base ×
 * `block.symbolDarkFactor`, opaque; otherwise white at `alpha.symbolWhite`. Colour-blind mode (ART §10) boosts the
 * contrast by `a11y.colorBlindContrastBoost`: dark factor × (1 − boost), white opacity × (1 + boost), capped at 1.
 */
export function symbolInk(tokens: Tokens, color: ColorCode, mode: DrawMode = DEFAULT_MODE): Ink {
  const base = blockBase(tokens, color);
  const boost = mode.colorBlind ? tokens.a11y.colorBlindContrastBoost : 0;
  if (lstar(base) >= tokens.block.symbolLightThresholdLstar) {
    return { rgb: shade(base, tokens.block.symbolDarkFactor * (1 - boost)), alpha: 1 };
  }
  return { rgb: WHITE, alpha: Math.min(1, tokens.alpha.symbolWhite * (1 + boost)) };
}

export function blockPalette(tokens: Tokens, color: ColorCode, mode: DrawMode = DEFAULT_MODE): BlockPalette {
  const b = tokens.block;
  const base = blockBase(tokens, color);
  return {
    base,
    top: lighten(base, b.bevelTopLighten),
    left: lighten(base, b.bevelLeftLighten),
    bottom: shade(base, b.shadeBottomFactor),
    right: shade(base, b.shadeRightFactor),
    outline: shade(base, b.outlineFactor),
    seam: shade(base, b.seamFactor),
    symbol: symbolInk(tokens, color, mode),
  };
}

/** Plan cell colours (ART §4, D-013). */
export interface PlanPalette {
  /** Opaque composite: `planUnderlay`·(1 − a) + `block.X`·a, a = `alpha.planFill` (colour-blind: `a11y.colorBlindPlanFill`). */
  readonly fill: Rgb;
  /** Dashed outline: fill × `plan.strokeFactor` per channel. */
  readonly stroke: Rgb;
  /** `color.planInk.X`; white inks use `alpha.planInkLight`. */
  readonly ink: Ink;
}

export function planFillAlpha(tokens: Tokens, mode: DrawMode = DEFAULT_MODE): number {
  return mode.colorBlind ? tokens.a11y.colorBlindPlanFill : tokens.alpha.planFill;
}

export function planPalette(tokens: Tokens, color: ColorCode, mode: DrawMode = DEFAULT_MODE): PlanPalette {
  const fill = mix(
    parseHex(tokens.color.board.planUnderlay),
    blockBase(tokens, color),
    planFillAlpha(tokens, mode),
  );
  const inkRgb = parseHex(tokens.color.planInk[color]);
  const isWhite = inkRgb[0] === 255 && inkRgb[1] === 255 && inkRgb[2] === 255;
  return {
    fill,
    stroke: shade(fill, tokens.plan.strokeFactor),
    ink: { rgb: inkRgb, alpha: isWhite ? tokens.alpha.planInkLight : 1 },
  };
}
