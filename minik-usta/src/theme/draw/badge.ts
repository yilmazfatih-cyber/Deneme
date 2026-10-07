/**
 * Fall-shadow badges `ghost_badge_ok/_warn/_support/_glass/_cancel` (ASSET_LIST §3; UX §5.3–5.4; D-014):
 * white disc with a dark outline and a mark — ✓ correct, ! wrong, ↓ missing support (K-34), cracked glass, ↩ cancel.
 * Diameter `a11y.ghostBadgePx` (colour-blind `a11y.colorBlindGhostBadgePx`). ASSET lists them as procedural with no
 * vector recipe: the mark polylines below are code-lead placeholders, for design-lead review.
 */
import type { Tokens } from '../tokens.ts';
import { DEFAULT_MODE, WHITE, css } from './color.ts';
import type { DrawMode } from './color.ts';
import type { DrawContext, Size } from './context.ts';

export const BADGE_KINDS = ['ok', 'warn', 'support', 'glass', 'cancel'] as const;
export type BadgeKind = (typeof BADGE_KINDS)[number];

export interface BadgeSpec {
  readonly kind: BadgeKind;
  readonly mode?: DrawMode;
}

export function badgeSize(spec: BadgeSpec, tokens: Tokens): Size {
  const mode = spec.mode ?? DEFAULT_MODE;
  const d = mode.colorBlind ? tokens.a11y.colorBlindGhostBadgePx : tokens.a11y.ghostBadgePx;
  return { w: d, h: d };
}

/** Polylines of each mark in unit coordinates (0–1 of the badge diameter). */
const MARKS: Readonly<Record<BadgeKind, readonly (readonly (readonly [number, number])[])[]>> = {
  ok: [
    [
      [0.28, 0.52],
      [0.44, 0.68],
      [0.72, 0.34],
    ],
  ],
  warn: [
    [
      [0.5, 0.24],
      [0.5, 0.56],
    ],
  ],
  support: [
    [
      [0.5, 0.24],
      [0.5, 0.74],
    ],
    [
      [0.32, 0.56],
      [0.5, 0.74],
      [0.68, 0.56],
    ],
  ],
  glass: [
    [
      [0.3, 0.24],
      [0.48, 0.46],
      [0.38, 0.56],
      [0.62, 0.78],
    ],
    [
      [0.48, 0.46],
      [0.72, 0.38],
    ],
  ],
  cancel: [
    [
      [0.7, 0.74],
      [0.7, 0.5],
      [0.56, 0.36],
      [0.3, 0.36],
    ],
    [
      [0.42, 0.24],
      [0.3, 0.36],
      [0.42, 0.48],
    ],
  ],
};

export function drawGhostBadge(ctx: DrawContext, spec: BadgeSpec, tokens: Tokens): void {
  const { w: d } = badgeSize(spec, tokens);
  const ink = tokens.color.ui.ink;
  const ring = Math.max(2, Math.round(d * 0.07));
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(d - ring / 2, d / 2);
  ctx.arc(d / 2, d / 2, d / 2 - ring / 2, 0, Math.PI * 2);
  ctx.fillStyle = css(WHITE);
  ctx.fill();
  ctx.lineWidth = ring;
  ctx.strokeStyle = ink;
  ctx.stroke();

  ctx.beginPath();
  for (const line of MARKS[spec.kind]) {
    line.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x * d, y * d) : ctx.lineTo(x * d, y * d)));
  }
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = d * 0.12;
  ctx.strokeStyle = ink;
  ctx.stroke();
  if (spec.kind === 'warn') {
    ctx.beginPath();
    ctx.moveTo(d * 0.57, d * 0.74);
    ctx.arc(d * 0.5, d * 0.74, d * 0.07, 0, Math.PI * 2);
    ctx.fillStyle = ink;
    ctx.fill();
  }
  ctx.restore();
}
