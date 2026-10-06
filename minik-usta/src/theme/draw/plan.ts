/**
 * Build-site (blueprint) and plan-cell drawers (ART_DIRECTION §2.4, §4; D-013; TECH_DESIGN §10.2 (a)).
 *
 * Cell frames are `cellPx × cellPx` with the origin at the cell's top-left corner; plan art sits `plan.insetPx` inside.
 * Layer order on the board (ART §4, TECH §10.3): blueprint floor → plan cells → blueprint grid overlay → build front
 * → placed blocks. Every function is pure Canvas2D; the paper speckle uses a seeded mulberry32 (no Math.random).
 */
import { mulberry32 } from '../../core/rng.ts';
import type { ColorCode } from '../../core/types.ts';
import type { Tokens } from '../tokens.ts';
import { ART } from './art.ts';
import { DEFAULT_MODE, WHITE, css, lighten, parseHex, planPalette, shade } from './color.ts';
import type { DrawMode } from './color.ts';
import type { DrawContext, Size } from './context.ts';
import { hatch45, insetOutline, polyominoOutline, roundRectPath, traceRoundedOutline } from './path.ts';
import { drawSymbol } from './symbols.ts';

export function cellSize(tokens: Tokens): Size {
  const c = tokens.layout.grid.cellPx;
  return { w: c, h: c };
}

function planRect(ctx: DrawContext, tokens: Tokens): void {
  const c = tokens.layout.grid.cellPx;
  const i = tokens.plan.insetPx;
  roundRectPath(ctx, i, i, c - 2 * i, c - 2 * i, tokens.plan.cornerRadiusRatio * c);
}

export interface PlanCellSpec {
  readonly color: ColorCode;
  readonly mode?: DrawMode;
  /**
   * Build-front state (K-34, R-01; ART §4 "+%15 açıklık"): the FILL is mixed with `plan.frontLighten` white while the
   * symbol keeps its 100 % ink. ART's measured front contrasts (W 4,3 · R 3,2 · P 4,1 · B 5,8; colour-blind lowest
   * R 3,5) only hold in this model — a white veil over the whole cell would also lighten the dark ink (B 3,7).
   */
  readonly front?: boolean;
}

/**
 * Colour plan cell (D-013): opaque composite of the chalk underlay `board.planUnderlay` and `block.X` at
 * `alpha.planFill` (colour-blind: `a11y.colorBlindPlanFill`), dashed `plan.strokePx` outline in composite ×
 * `plan.strokeFactor`, symbol at 100 % in `color.planInk.X`. No bevel, gloss or shadow (ART §4). `front` bakes the
 * build-front variant `plan_<c>_front`; the solid contour and glow come from `plan_front` on top.
 */
export function drawPlanCell(ctx: DrawContext, spec: PlanCellSpec, tokens: Tokens): void {
  const mode = spec.mode ?? DEFAULT_MODE;
  const c = tokens.layout.grid.cellPx;
  const pal = planPalette(tokens, spec.color, mode);
  const fill = spec.front === true ? lighten(pal.fill, tokens.plan.frontLighten) : pal.fill;
  const stroke = spec.front === true ? shade(fill, tokens.plan.strokeFactor) : pal.stroke;
  ctx.save();
  planRect(ctx, tokens);
  ctx.fillStyle = css(fill);
  ctx.fill();
  ctx.setLineDash([...tokens.plan.dash]);
  ctx.lineWidth = tokens.plan.strokePx;
  ctx.strokeStyle = css(stroke);
  ctx.stroke();
  ctx.restore();
  const size = tokens.block.symbolSizeRatio * c * (mode.colorBlind ? tokens.a11y.colorBlindSymbolScale : 1);
  drawSymbol(ctx, spec.color, c / 2, c / 2, size, pal.ink, fill);
}

export interface PlanDotsSpec {
  /** Plan height h (frame = `cols × rows` cells, like the blueprint grid overlay). */
  readonly rows: number;
  readonly cols: number;
  /** `.` cells in plan-local coordinates (x = site column 0–1, y = plan row, 0 at the bottom). */
  readonly dots: readonly { readonly x: number; readonly y: number }[];
}

/**
 * `.` cells of one plan (S2, ART §4), drawn as one transparent overlay per plan: every 4-connected group of `.` cells is
 * one shape (`plan.insetPx` inside its outline, outer corners `plan.cornerRadiusRatio`) filled with a 45° white hatch
 * (`plan.hatchWidthPx` every `plan.hatchSpacingPx`, `alpha.planEmptyHatch`). A single cell gets a dashed white outline
 * at `alpha.planEmptyStroke`; a group (window, door, arch) gets one solid outer frame line instead ("birleşik").
 */
export function drawPlanDots(ctx: DrawContext, spec: PlanDotsSpec, tokens: Tokens): void {
  const c = tokens.layout.grid.cellPx;
  const white = parseHex(tokens.color.board.planEmptyHatch);
  const { h } = blueprintGridSize(spec, tokens);
  for (const group of connectedGroups(spec.dots)) {
    const canvas = group.map((p) => ({ x: p.x, y: spec.rows - 1 - p.y }));
    const outline = insetOutline(polyominoOutline(canvas, c), tokens.plan.insetPx);
    const trace = (): void => traceRoundedOutline(ctx, outline, tokens.plan.cornerRadiusRatio * c, 0);
    ctx.save();
    trace();
    ctx.clip();
    hatch45(ctx, spec.cols * c, h, tokens.plan.hatchSpacingPx * Math.SQRT2);
    ctx.lineCap = 'butt';
    ctx.lineWidth = tokens.plan.hatchWidthPx;
    ctx.strokeStyle = css(white, tokens.alpha.planEmptyHatch);
    ctx.stroke();
    ctx.restore();

    ctx.save();
    trace();
    if (group.length === 1) {
      ctx.setLineDash([...tokens.plan.dash]);
      ctx.lineWidth = ART.emptyStrokePx;
      ctx.strokeStyle = css(white, tokens.alpha.planEmptyStroke);
    } else {
      ctx.lineJoin = 'miter';
      ctx.lineWidth = ART.emptyFramePx;
      ctx.strokeStyle = css(white, ART.emptyFrameAlpha);
    }
    ctx.stroke();
    ctx.restore();
  }
}

/** 4-connected groups, each sorted by (y, x); groups ordered by their first cell (deterministic). */
export function connectedGroups<P extends { readonly x: number; readonly y: number }>(
  cells: readonly P[],
): P[][] {
  const sorted = [...cells].sort((a, b) => a.y - b.y || a.x - b.x);
  const seen = new Set<P>();
  const groups: P[][] = [];
  for (const start of sorted) {
    if (seen.has(start)) continue;
    const group: P[] = [];
    const stack = [start];
    seen.add(start);
    while (stack.length > 0) {
      const p = stack.pop() as P;
      group.push(p);
      for (const q of sorted) {
        if (!seen.has(q) && Math.abs(q.x - p.x) + Math.abs(q.y - p.y) === 1) {
          seen.add(q);
          stack.push(q);
        }
      }
    }
    groups.push(group.sort((a, b) => a.y - b.y || a.x - b.x));
  }
  return groups;
}

/**
 * `?` cell (S7, ART §4; Phase 3 mechanic, the frame is ready): white 10 % fill, dashed white 60 % outline, centred
 * cream paper tag (`plan.hiddenTagPx`, `ui.panel`) with a string hole and a "?" glyph (Baloo 2 800, `ui.ink`).
 * The glyph is a symbol, not i18n text (ASSET §3 `plan_hidden_tag`).
 */
export function drawHiddenCell(ctx: DrawContext, tokens: Tokens): void {
  const c = tokens.layout.grid.cellPx;
  const tag = tokens.plan.hiddenTagPx;
  ctx.save();
  planRect(ctx, tokens);
  ctx.fillStyle = css(WHITE, ART.hiddenFillAlpha);
  ctx.fill();
  ctx.setLineDash([...tokens.plan.dash]);
  ctx.lineWidth = tokens.plan.strokePx;
  ctx.strokeStyle = css(WHITE, ART.hiddenStrokeAlpha);
  ctx.stroke();
  ctx.restore();

  ctx.save();
  const x = (c - tag) / 2;
  roundRectPath(ctx, x, x, tag, tag, ART.hiddenTagRadiusPx);
  ctx.fillStyle = tokens.color.ui.panel;
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(c / 2 + ART.hiddenHolePx / 2, x + ART.hiddenTagRadiusPx);
  ctx.arc(c / 2, x + ART.hiddenTagRadiusPx, ART.hiddenHolePx / 2, 0, Math.PI * 2);
  ctx.fillStyle = tokens.color.board.blueprint;
  ctx.fill();
  const family = [`"${tokens.font.family}"`, ...tokens.font.fallback].join(', ');
  ctx.font = `${ART.hiddenGlyphWeight} ${ART.hiddenGlyphPx}px ${family}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = tokens.color.ui.ink;
  ctx.fillText('?', c / 2, c / 2 + ART.hiddenHolePx / 2);
  ctx.restore();
}

/**
 * Build-front contour `plan_front` (K-34, R-01; ART §4 layer "inşa cephesi konturu"): drawn over the front plan cell
 * (`plan_<c>_front`, which carries the +15 % lightening under an unchanged symbol) or over a `?` cell ("etiketi aynı
 * düz konturla çerçevelenir"). A solid `plan.frontStrokePx` outline in `board.buildFront` that covers the dashed one,
 * and an outer glow at `alpha.buildFrontGlow`. Nothing is painted over the symbol.
 */
export function drawBuildFront(ctx: DrawContext, tokens: Tokens): void {
  const front = parseHex(tokens.color.board.buildFront);
  ctx.save();
  planRect(ctx, tokens);
  ctx.shadowColor = css(front, tokens.alpha.buildFrontGlow);
  ctx.shadowBlur = ART.frontGlowPx;
  ctx.lineJoin = 'round';
  ctx.lineWidth = tokens.plan.frontStrokePx;
  ctx.strokeStyle = css(front);
  ctx.stroke();
  ctx.restore();
}

/**
 * Missing-support hatch `plan_support_hatch` (K-34; ART §4, UX §5.4): HORIZONTAL lines (`plan.supportHatchWidthPx`,
 * colour-blind `a11y.colorBlindSupportHatchPx`) every `plan.supportHatchSpacingPx`, `color.ghost.support` at
 * `alpha.supportHatch`, inside the cell outline — a different pattern from the 45° colour hatch.
 */
export function drawSupportHatch(ctx: DrawContext, spec: { readonly mode?: DrawMode }, tokens: Tokens): void {
  const mode = spec.mode ?? DEFAULT_MODE;
  const c = tokens.layout.grid.cellPx;
  const ins = tokens.plan.insetPx;
  const step = tokens.plan.supportHatchSpacingPx;
  const lines = Math.floor((c - 2 * ins) / step);
  ctx.save();
  planRect(ctx, tokens);
  ctx.clip();
  ctx.beginPath();
  for (let k = 0; k < lines; k++) {
    const y = c / 2 + (k - (lines - 1) / 2) * step;
    ctx.moveTo(0, y);
    ctx.lineTo(c, y);
  }
  ctx.lineCap = 'butt';
  ctx.lineWidth = mode.colorBlind ? tokens.a11y.colorBlindSupportHatchPx : tokens.plan.supportHatchWidthPx;
  ctx.strokeStyle = css(parseHex(tokens.color.ghost.support), tokens.alpha.supportHatch);
  ctx.stroke();
  ctx.restore();
}

export interface BlueprintGridSpec {
  /** Plan height h (1–8): the overlay covers plan rows only; outside the plan there is no grid (ART §4). */
  readonly rows: number;
  /** Site columns (`layout.grid.buildCols`). */
  readonly cols: number;
}

export function blueprintGridSize(spec: BlueprintGridSpec, tokens: Tokens): Size {
  const c = tokens.layout.grid.cellPx;
  return { w: spec.cols * c, h: spec.rows * c };
}

/**
 * Blueprint grid overlay (one transparent texture per plan height, ART §4 "ozalit ızgara katmanı"): thin white lines on
 * every cell edge at `alpha.blueprintLine`, major lines every 2 cells at `alpha.blueprintLineMajor`, counted from the
 * plan's bottom row and left column. Drawn OVER plan cells and UNDER blocks (TECH §10.3).
 */
export function drawBlueprintGrid(ctx: DrawContext, spec: BlueprintGridSpec, tokens: Tokens): void {
  const c = tokens.layout.grid.cellPx;
  const { w, h } = blueprintGridSize(spec, tokens);
  const line = parseHex(tokens.color.board.blueprintLine);
  const pass = (major: boolean): void => {
    ctx.beginPath();
    for (let col = 0; col <= spec.cols; col++) {
      if ((col % 2 === 0) !== major) continue;
      ctx.moveTo(col * c, 0);
      ctx.lineTo(col * c, h);
    }
    for (let row = 0; row <= spec.rows; row++) {
      if ((row % 2 === 0) !== major) continue;
      const y = h - row * c;
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
    }
    ctx.lineWidth = major ? ART.blueprintLineMajorPx : ART.blueprintLinePx;
    ctx.strokeStyle = css(line, major ? tokens.alpha.blueprintLineMajor : tokens.alpha.blueprintLine);
    ctx.stroke();
  };
  ctx.save();
  ctx.lineCap = 'butt';
  pass(false);
  pass(true);
  ctx.restore();
}

export interface BlueprintFloorSpec {
  readonly w: number;
  readonly h: number;
  /** Speckle seed (fixed per frame name, so every bake is identical). */
  readonly seed: number;
}

/**
 * Blueprint paper `board.blueprint` with seeded 2 px white speckle; specks near an edge are repeated on the opposite
 * edge so the tile repeats seamlessly (ASSET `board_blueprint` 240 × 240 tile).
 */
export function drawBlueprintFloor(ctx: DrawContext, spec: BlueprintFloorSpec, tokens: Tokens): void {
  ctx.save();
  ctx.fillStyle = tokens.color.board.blueprint;
  ctx.fillRect(0, 0, spec.w, spec.h);
  const rng = mulberry32(spec.seed);
  const count = Math.round((spec.w * spec.h) / ART.speckAreaPx);
  const s = ART.speckPx;
  ctx.fillStyle = css(WHITE, ART.speckAlpha);
  for (let i = 0; i < count; i++) {
    const x = Math.floor(rng.next() * spec.w);
    const y = Math.floor(rng.next() * spec.h);
    for (const dx of x + s > spec.w ? [0, -spec.w] : [0]) {
      for (const dy of y + s > spec.h ? [0, -spec.h] : [0]) ctx.fillRect(x + dx, y + dy, s, s);
    }
  }
  ctx.restore();
}

/** Outside-the-plan site cell: flat `board.blueprintDeep`, no grid (ART §4 "Plan dışı"). */
export function drawBlueprintDeep(ctx: DrawContext, size: Size, tokens: Tokens): void {
  ctx.fillStyle = tokens.color.board.blueprintDeep;
  ctx.fillRect(0, 0, size.w, size.h);
}

/** Size of the "pafta" corner bracket frame (0,6c). */
export function blueprintCornerSize(tokens: Tokens): Size {
  const s = Math.round(ART.blueprintCornerRatio * tokens.layout.grid.cellPx);
  return { w: s, h: s };
}

/** "Pafta" corner bracket at the site's bottom-left (ART §4): white 30 % L line along the left and bottom edges. */
export function drawBlueprintCorner(ctx: DrawContext, tokens: Tokens): void {
  const { w, h } = blueprintCornerSize(tokens);
  const half = ART.blueprintCornerPx / 2;
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(half, 0);
  ctx.lineTo(half, h - half);
  ctx.lineTo(w, h - half);
  ctx.lineCap = 'butt';
  ctx.lineJoin = 'miter';
  ctx.lineWidth = ART.blueprintCornerPx;
  ctx.strokeStyle = css(parseHex(tokens.color.board.blueprintLine), ART.blueprintCornerAlpha);
  ctx.stroke();
  ctx.restore();
}
