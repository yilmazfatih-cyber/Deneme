/**
 * Block drawers (ART_DIRECTION §3 recipe, D-012 palette, D-013 ink rule; TECH_DESIGN §10.2 (b), D-060).
 *
 * One texture per piece (shape × colour × flag set), drawn at the origin in a `w·cellPx × h·cellPx` box:
 *   0 inset `block.insetRatio` · 1 base with rounded outer corners (`cornerRadiusRatio`) and concave inner corners
 *   (`innerCornerRadiusRatio`) · 2 top/left bevel on open edges · 3 bottom/right shade on open edges · 4 ONE gloss
 *   pill per piece · 5 inner seams · 6 outline (inside the outline path) · flag layers (Phase 3) · 7 symbol per cell.
 * Plus per shape: blurred silhouettes (contact / lifted shadow, `shadowBlur`, no runtime filter) and fall-shadow ghost
 * frames (UX §5.4). All functions are pure Canvas2D calls; same input → same call sequence.
 */
import { shapeById } from '../../core/shapes.ts';
import type { ShapeDef } from '../../core/shapes.ts';
import type { ColorCode, ShapeId } from '../../core/types.ts';
import type { Tokens } from '../tokens.ts';
import { ART } from './art.ts';
import { BLACK, DEFAULT_MODE, WHITE, blockPalette, css, parseHex } from './color.ts';
import type { DrawMode } from './color.ts';
import type { DrawContext, Size } from './context.ts';
import { canvasCells, insetOutline, polyominoOutline, traceRoundedOutline } from './path.ts';
import type { Corner, Point } from './path.ts';
import { drawSymbol } from './symbols.ts';

/** Flags that change a piece's baked look (GDD K-21 data flags + S4 debris). `locked` / `stuck` are runtime overlays. */
export const BAKED_FLAGS = ['glass', 'mortar', 'balloon', 'chained', 'wet', 'debris'] as const;
export type BakedFlag = (typeof BAKED_FLAGS)[number];

export interface BlockSpec {
  readonly shape: ShapeId;
  readonly color: ColorCode;
  /** Phase 3 (S3, Y8, S8, Y3, Y4, S4). Phase 2 levels have none; a flagged spec throws until its layer exists. */
  readonly flags?: readonly BakedFlag[];
  readonly mode?: DrawMode;
}

export function blockSize(shape: ShapeId, tokens: Tokens): Size {
  const s = shapeById(shape);
  const c = tokens.layout.grid.cellPx;
  return { w: s.w * c, h: s.h * c };
}

/** Inset outline of a shape in canvas px (shared by block, silhouette and ghost so all three line up). */
export function blockOutline(shape: ShapeDef, tokens: Tokens): Corner[] {
  const c = tokens.layout.grid.cellPx;
  return insetOutline(polyominoOutline(canvasCells(shape.cells, shape.h), c), tokens.block.insetRatio * c);
}

function traceBlock(ctx: DrawContext, outline: readonly Corner[], tokens: Tokens): void {
  const c = tokens.layout.grid.cellPx;
  traceRoundedOutline(
    ctx,
    outline,
    tokens.block.cornerRadiusRatio * c,
    tokens.block.innerCornerRadiusRatio * c,
  );
}

/**
 * ART §3 layer 4 / TECH §10.2 (b): the single gloss cell (canvas column, row). Candidates have open top AND open left;
 * the one in the highest row wins, ties go to the leftmost column. Null if no cell qualifies (never for BRIEF shapes).
 */
export function glossCell(shape: ShapeDef): Point | null {
  const cells = canvasCells(shape.cells, shape.h);
  const has = (x: number, y: number): boolean => cells.some((p) => p.x === x && p.y === y);
  let best: Point | null = null;
  for (const p of cells) {
    if (has(p.x, p.y - 1) || has(p.x - 1, p.y)) continue;
    if (best === null || p.y < best.y || (p.y === best.y && p.x < best.x)) best = p;
  }
  return best;
}

/** Draws a placed block at the origin (ART §3 layers 0–7). */
export function drawBlock(ctx: DrawContext, spec: BlockSpec, tokens: Tokens): void {
  if (spec.flags && spec.flags.length > 0) {
    throw new Error(
      `drawBlock: flag layers ${spec.flags.join(',')} are Phase 3 (ART §3 "Bayrak katmanları")`,
    );
  }
  const mode = spec.mode ?? DEFAULT_MODE;
  const shape = shapeById(spec.shape);
  const b = tokens.block;
  const c = tokens.layout.grid.cellPx;
  const d = b.insetRatio * c;
  const pal = blockPalette(tokens, spec.color, mode);
  const outline = blockOutline(shape, tokens);
  const cells = canvasCells(shape.cells, shape.h);
  const has = (x: number, y: number): boolean => cells.some((p) => p.x === x && p.y === y);

  ctx.save();
  // 1. Base.
  traceBlock(ctx, outline, tokens);
  ctx.fillStyle = css(pal.base);
  ctx.fill();
  ctx.clip();

  // 2. Bevel on open edges (left first, then top so the brighter top band wins the corner).
  ctx.fillStyle = css(pal.left);
  for (const p of cells) if (!has(p.x - 1, p.y)) ctx.fillRect(p.x * c + d, p.y * c, b.bevelLeftRatio * c, c);
  ctx.fillStyle = css(pal.top);
  for (const p of cells) if (!has(p.x, p.y - 1)) ctx.fillRect(p.x * c, p.y * c + d, c, b.bevelTopRatio * c);
  // 3. Shade on open edges (right first, then bottom).
  ctx.fillStyle = css(pal.right);
  for (const p of cells) {
    if (!has(p.x + 1, p.y))
      ctx.fillRect((p.x + 1) * c - d - b.shadeRightRatio * c, p.y * c, b.shadeRightRatio * c, c);
  }
  ctx.fillStyle = css(pal.bottom);
  for (const p of cells) {
    if (!has(p.x, p.y + 1)) {
      ctx.fillRect(p.x * c, (p.y + 1) * c - d - b.shadeBottomRatio * c, c, b.shadeBottomRatio * c);
    }
  }

  // 4. One gloss pill per piece.
  const g = glossCell(shape);
  if (g) {
    const [gx, gy, gw, gh] = b.glossRect;
    const x = g.x * c + gx * c;
    const y = g.y * c + gy * c;
    const r = (gh * c) / 2;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + gw * c, y, x + gw * c, y + gh * c, r);
    ctx.arcTo(x + gw * c, y + gh * c, x, y + gh * c, r);
    ctx.arcTo(x, y + gh * c, x, y, r);
    ctx.arcTo(x, y, x + gw * c, y, r);
    ctx.closePath();
    ctx.fillStyle = css(WHITE, tokens.alpha.gloss);
    ctx.fill();
  }

  // 5. Inner seams between neighbouring cells, one stroke (no double alpha where seams cross).
  ctx.beginPath();
  let seams = 0;
  for (const p of cells) {
    if (has(p.x + 1, p.y)) {
      ctx.moveTo((p.x + 1) * c, p.y * c);
      ctx.lineTo((p.x + 1) * c, (p.y + 1) * c);
      seams++;
    }
    if (has(p.x, p.y + 1)) {
      ctx.moveTo(p.x * c, (p.y + 1) * c);
      ctx.lineTo((p.x + 1) * c, (p.y + 1) * c);
      seams++;
    }
  }
  if (seams > 0) {
    ctx.lineCap = 'butt';
    ctx.lineWidth = b.seamPx;
    ctx.strokeStyle = css(pal.seam, tokens.alpha.seam);
    ctx.stroke();
  }

  // 6. Outline, inside the path (the clip keeps the inner half of a double-width stroke).
  traceBlock(ctx, outline, tokens);
  ctx.lineJoin = 'round';
  ctx.lineWidth = b.outlinePx * 2;
  ctx.strokeStyle = css(pal.outline);
  ctx.stroke();
  ctx.restore();

  // 7. Symbols.
  const size = b.symbolSizeRatio * c * (mode.colorBlind ? tokens.a11y.colorBlindSymbolScale : 1);
  for (const p of cells)
    drawSymbol(ctx, spec.color, p.x * c + c / 2, p.y * c + c / 2, size, pal.symbol, pal.base);
}

/** Pre-blurred silhouettes (ART §3 layers 8–9). `crane` uses `shadow.crane`. */
export type SilhouetteKind = 'contact' | 'lifted' | 'crane';

export interface SilhouetteSpec {
  readonly shape: ShapeId;
  readonly kind: SilhouetteKind;
}

/** Transparent margin around a silhouette frame: 3σ of the Canvas blur (σ = blur / 2) → 1.5 × blur. */
export function silhouettePad(kind: SilhouetteKind, tokens: Tokens): number {
  return Math.ceil(tokens.shadow[kind].blur * 1.5);
}

export function silhouetteSize(spec: SilhouetteSpec, tokens: Tokens): Size {
  const s = blockSize(spec.shape, tokens);
  const pad = silhouettePad(spec.kind, tokens);
  return { w: s.w + 2 * pad, h: s.h + 2 * pad };
}

/** Far enough left that the source fill never lands on any atlas page (pages are ≤ 4096 px). */
const SHADOW_THROW_PX = 8192;

/**
 * Blurred, OPAQUE black silhouette with no offset; the block box starts at (pad, pad). The scene applies
 * `shadow.<kind>.alpha` and `.y` (and `.x`) when it places the image, so one bake serves several alphas.
 * The fill is thrown off-frame and only its shadow lands in the frame (no runtime Filter, D-060).
 */
export function drawSilhouette(ctx: DrawContext, spec: SilhouetteSpec, tokens: Tokens): void {
  const shape = shapeById(spec.shape);
  const pad = silhouettePad(spec.kind, tokens);
  const outline = blockOutline(shape, tokens).map((p) => ({
    ...p,
    x: p.x + pad - SHADOW_THROW_PX,
    y: p.y + pad,
  }));
  ctx.save();
  ctx.shadowColor = css(BLACK);
  ctx.shadowBlur = tokens.shadow[spec.kind].blur;
  ctx.shadowOffsetX = SHADOW_THROW_PX;
  ctx.shadowOffsetY = 0;
  traceBlock(ctx, outline, tokens);
  ctx.fillStyle = css(BLACK);
  ctx.fill();
  ctx.restore();
}

/**
 * Fall-shadow outline frames (UX §5.4, K-18 visuals). The ghost BODY ("blok rengi %25") needs no frame: the scene
 * shows the piece's own block frame with `setTint(colour).setTintMode(Phaser.TintModes.FILL)` at `alpha.ghostFill`
 * (TECH §10.2 "Filter'sız efektler"); `body` stays available for tools/level-preview.
 */
export const GHOST_STYLES = ['valid', 'invalid', 'neutral'] as const;
export type GhostStyle = (typeof GHOST_STYLES)[number] | 'body';

export interface GhostSpec {
  readonly shape: ShapeId;
  readonly style: GhostStyle;
  readonly mode?: DrawMode;
}

/** Shared margin of every ghost frame of a shape (widest stroke + glow), so all styles overlay pixel-exact. */
export function ghostPad(tokens: Tokens, mode: DrawMode = DEFAULT_MODE): number {
  const add = mode.colorBlind ? tokens.a11y.colorBlindGhostStrokeAddPx : 0;
  const s = tokens.stroke;
  const widest = Math.max(s.ghostPx, s.ghostInvalidPx, s.ghostNeutralPx) + add;
  return Math.ceil(widest / 2 + s.ghostGlowPx * 1.5);
}

export function ghostSize(spec: GhostSpec, tokens: Tokens): Size {
  const s = blockSize(spec.shape, tokens);
  const pad = ghostPad(tokens, spec.mode);
  return { w: s.w + 2 * pad, h: s.h + 2 * pad };
}

/**
 * `body`: opaque white piece silhouette; the scene tints it with the block colour at `alpha.ghostFill`.
 * `valid`: solid `stroke.ghostPx` `ghost.valid` + glow `stroke.ghostGlowPx` at `alpha.ghostGlow`.
 * `invalid`: dashed `stroke.ghostInvalidPx` `ghost.invalid`. `neutral`: dashed `stroke.ghostNeutralPx` white at
 * `alpha.ghostNeutralStroke`. Colour-blind mode adds `a11y.colorBlindGhostStrokeAddPx` to every stroke.
 */
export function drawGhost(ctx: DrawContext, spec: GhostSpec, tokens: Tokens): void {
  const mode = spec.mode ?? DEFAULT_MODE;
  const pad = ghostPad(tokens, mode);
  const add = mode.colorBlind ? tokens.a11y.colorBlindGhostStrokeAddPx : 0;
  const outline = blockOutline(shapeById(spec.shape), tokens).map((p) => ({
    ...p,
    x: p.x + pad,
    y: p.y + pad,
  }));
  const s = tokens.stroke;
  const ghost = tokens.color.ghost;
  ctx.save();
  traceBlock(ctx, outline, tokens);
  ctx.lineJoin = 'round';
  switch (spec.style) {
    case 'body':
      ctx.fillStyle = css(WHITE);
      ctx.fill();
      break;
    case 'valid':
      ctx.shadowColor = css(parseHex(ghost.valid), tokens.alpha.ghostGlow);
      ctx.shadowBlur = s.ghostGlowPx;
      ctx.lineWidth = s.ghostPx + add;
      ctx.strokeStyle = css(parseHex(ghost.valid));
      ctx.stroke();
      break;
    case 'invalid':
      ctx.setLineDash([...ART.ghostDash]);
      ctx.lineWidth = s.ghostInvalidPx + add;
      ctx.strokeStyle = css(parseHex(ghost.invalid));
      ctx.stroke();
      break;
    case 'neutral':
      ctx.setLineDash([...ART.ghostDash]);
      ctx.lineWidth = s.ghostNeutralPx + add;
      ctx.strokeStyle = css(parseHex(ghost.neutral), tokens.alpha.ghostNeutralStroke);
      ctx.stroke();
      break;
  }
  ctx.restore();
}
