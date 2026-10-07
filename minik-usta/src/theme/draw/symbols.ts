/**
 * Colour symbols (ART_DIRECTION §3.1): one glyph per colour, defined in a 100 × 100 unit box, stroke widths in units
 * (× 0.55 → px at 55 px), round caps and joins. Fill and stroke use the symbol ink; parts marked `carve` use the
 * cell's base colour ("TABAN", a line cut into the glyph).
 */
import type { ColorCode } from '../../core/types.ts';
import type { DrawContext } from './context.ts';
import { css } from './color.ts';
import type { Ink, Rgb } from './color.ts';
import { parseSvgPath, replayPath } from './path.ts';
import type { PathOp } from './path.ts';

type Geometry =
  | { readonly kind: 'path'; readonly ops: readonly PathOp[] }
  | { readonly kind: 'circle'; readonly cx: number; readonly cy: number; readonly r: number }
  | {
      readonly kind: 'ellipse';
      readonly cx: number;
      readonly cy: number;
      readonly rx: number;
      readonly ry: number;
    }
  | {
      readonly kind: 'rect';
      readonly x: number;
      readonly y: number;
      readonly w: number;
      readonly h: number;
      readonly rx: number;
    };

export interface SymbolPart {
  readonly geometry: Geometry;
  /** `fill` or `stroke` with a width in units. */
  readonly paint: 'fill' | 'stroke';
  readonly width: number;
  /** `ink` = symbol ink; `carve` = the cell's base colour. */
  readonly color: 'ink' | 'carve';
}

const path = (d: string): Geometry => ({ kind: 'path', ops: parseSvgPath(d) });
const stroke = (geometry: Geometry, width: number, color: 'ink' | 'carve' = 'ink'): SymbolPart => ({
  geometry,
  paint: 'stroke',
  width,
  color,
});
const fill = (geometry: Geometry): SymbolPart => ({ geometry, paint: 'fill', width: 0, color: 'ink' });

/** ART §3.1 table, verbatim. */
export const SYMBOLS: Readonly<Record<ColorCode, readonly SymbolPart[]>> = Object.freeze({
  W: [
    stroke(path('M10 24 C30 14 50 34 90 22'), 9),
    stroke(path('M10 50 C22 42 34 58 48 50'), 9),
    stroke({ kind: 'ellipse', cx: 70, cy: 51, rx: 11, ry: 7 }, 7),
    stroke(path('M10 76 C30 66 50 86 90 74'), 9),
  ],
  Y: [
    fill({ kind: 'circle', cx: 50, cy: 28, r: 13 }),
    fill({ kind: 'circle', cx: 27, cy: 70, r: 13 }),
    fill({ kind: 'circle', cx: 73, cy: 70, r: 13 }),
  ],
  G: [
    fill(path('M18 82 C18 40 46 14 86 14 C86 54 60 82 18 82 Z')),
    stroke(path('M24 76 L68 32'), 7, 'carve'),
  ],
  R: [
    stroke({ kind: 'rect', x: 10, y: 16, w: 80, h: 68, rx: 10 }, 8),
    stroke(path('M10 50 H90 M50 16 V50 M30 50 V84 M70 50 V84'), 8),
  ],
  O: [
    stroke(path('M8 44 Q22 18 36 44 Q50 18 64 44 Q78 18 92 44'), 9),
    stroke(path('M8 80 Q22 54 36 80 Q50 54 64 80 Q78 54 92 80'), 9),
  ],
  C: [stroke(path('M18 50 L50 18 M18 82 L82 18 M50 82 L82 50 M18 50 L50 82 M18 18 L82 82 M50 18 L82 50'), 8)],
  B: [
    fill(path('M46 8 C50 36 58 44 86 48 C58 52 50 60 46 88 C42 60 34 52 6 48 C34 44 42 36 46 8 Z')),
    fill(path('M82 8 C83 16 85 18 93 19 C85 20 83 22 82 30 C81 22 79 20 71 19 C79 18 81 16 82 8 Z')),
  ],
  P: [
    fill(path('M50 8 L90 42 L50 92 L10 42 Z')),
    stroke(path('M10 42 H90 M30 42 L50 8 L70 42 L50 92'), 6, 'carve'),
  ],
});

/** Unit box of the recipes. */
export const SYMBOL_UNITS = 100;

function trace(ctx: DrawContext, g: Geometry): void {
  ctx.beginPath();
  switch (g.kind) {
    case 'path':
      replayPath(ctx, g.ops);
      break;
    case 'circle':
      ctx.moveTo(g.cx + g.r, g.cy);
      ctx.arc(g.cx, g.cy, g.r, 0, Math.PI * 2);
      break;
    case 'ellipse':
      ctx.moveTo(g.cx + g.rx, g.cy);
      ctx.ellipse(g.cx, g.cy, g.rx, g.ry, 0, 0, Math.PI * 2);
      break;
    case 'rect': {
      const { x, y, w, h, rx } = g;
      ctx.moveTo(x + rx, y);
      ctx.arcTo(x + w, y, x + w, y + h, rx);
      ctx.arcTo(x + w, y + h, x, y + h, rx);
      ctx.arcTo(x, y + h, x, y, rx);
      ctx.arcTo(x, y, x + w, y, rx);
      ctx.closePath();
      break;
    }
  }
}

/**
 * Draws the symbol of `color` centred at (cx, cy) in a `sizePx` box. `ink` paints the glyph; `carve` is the base
 * colour under the glyph (block base or plan composite).
 */
export function drawSymbol(
  ctx: DrawContext,
  color: ColorCode,
  cx: number,
  cy: number,
  sizePx: number,
  ink: Ink,
  carve: Rgb,
): void {
  const k = sizePx / SYMBOL_UNITS;
  ctx.save();
  ctx.translate(cx - sizePx / 2, cy - sizePx / 2);
  ctx.scale(k, k);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const part of SYMBOLS[color]) {
    const style = part.color === 'ink' ? css(ink.rgb, ink.alpha) : css(carve);
    trace(ctx, part.geometry);
    if (part.paint === 'fill') {
      ctx.fillStyle = style;
      ctx.fill();
    } else {
      ctx.lineWidth = part.width;
      ctx.strokeStyle = style;
      ctx.stroke();
    }
  }
  ctx.restore();
}
