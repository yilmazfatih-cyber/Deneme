/**
 * Wall and W1 gap drawers (ART_DIRECTION §5; ASSET_LIST §4; GDD K-04, OBSTACLES W1; TECH_DESIGN §2.2 R-03).
 *
 * In the rules the wall is a ZERO-WIDTH boundary between x = 5 and x = 6; on screen it is a `layout.grid.wallW` strip.
 * One wall frame per level: concrete body for the closed rows `[0, height)`, transparent openings for gap rows, a 20 px
 * hazard cap on top (6 px overhang per side) and, for `static` gaps (W1), 14 px hazard bands on the wall just above and
 * below the opening. The two rails of a W1 gap are separate `gap_rail` frames placed by the scene.
 */
import type { Tokens } from '../tokens.ts';
import { ART } from './art.ts';
import { css, parseHex } from './color.ts';
import type { DrawContext, Size } from './context.ts';

export interface WallGapSpec {
  readonly y: number;
  readonly size: number;
  /** `static` (W1) in Phase 2; other types get their own overlay frames in Phase 3 (the opening is the same). */
  readonly type: string;
}

export interface WallSpec {
  /** `wall.height` (0–8). */
  readonly height: number;
  readonly gaps: readonly WallGapSpec[];
}

/** Frame size; `{0, 0}` for `height = 0` (no wall). The body starts `(ART.wallCapW − wallW) / 2` px from the left. */
export function wallSize(spec: WallSpec, tokens: Tokens): Size {
  if (spec.height <= 0) return { w: 0, h: 0 };
  return { w: ART.wallCapW, h: spec.height * tokens.layout.grid.cellPx + ART.wallCapPx };
}

/** Offset of the frame's top-left from the wall strip's top-left (x = wallX, y = top of row `height − 1`). */
export function wallFrameOffset(tokens: Tokens): { readonly x: number; readonly y: number } {
  return { x: -(ART.wallCapW - tokens.layout.grid.wallW) / 2, y: -ART.wallCapPx };
}

/** 45° yellow/black hazard stripes (`ui.hazardYellow` / `ui.hazardBlack`, ART §2.3: 24 px bands) in a rect. */
export function drawHazard(
  ctx: DrawContext,
  x: number,
  y: number,
  w: number,
  h: number,
  tokens: Tokens,
): void {
  const band = ART.hazardBandPx * Math.SQRT2; // horizontal width of a 24 px band at 45°
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.fillStyle = tokens.color.ui.hazardYellow;
  ctx.fillRect(x, y, w, h);
  ctx.beginPath();
  for (let s = 0; s - h <= w; s += 2 * band) {
    ctx.moveTo(x + s, y);
    ctx.lineTo(x + s + band, y);
    ctx.lineTo(x + s + band - h, y + h);
    ctx.lineTo(x + s - h, y + h);
    ctx.closePath();
  }
  ctx.fillStyle = tokens.color.ui.hazardBlack;
  ctx.fill();
  ctx.restore();
}

function innerStroke(ctx: DrawContext, x: number, y: number, w: number, h: number, tokens: Tokens): void {
  const half = ART.wallOutlinePx / 2;
  ctx.beginPath();
  ctx.rect(x + half, y + half, w - ART.wallOutlinePx, h - ART.wallOutlinePx);
  ctx.lineJoin = 'miter';
  ctx.lineWidth = ART.wallOutlinePx;
  ctx.strokeStyle = css(parseHex(tokens.color.board.wallOutline), ART.wallOutlineAlpha);
  ctx.stroke();
}

/** Closed row runs `[from, to]` (inclusive, bottom → top) of a wall with gaps. */
export function wallRuns(spec: WallSpec): { readonly from: number; readonly to: number }[] {
  const open = new Set<number>();
  for (const g of spec.gaps) for (let r = g.y; r < g.y + g.size; r++) open.add(r);
  const runs: { from: number; to: number }[] = [];
  for (let r = 0; r < spec.height; r++) {
    if (open.has(r)) continue;
    const last = runs[runs.length - 1];
    if (last && last.to === r - 1) last.to = r;
    else runs.push({ from: r, to: r });
  }
  return runs;
}

export function drawWall(ctx: DrawContext, spec: WallSpec, tokens: Tokens): void {
  if (spec.height <= 0) return;
  const c = tokens.layout.grid.cellPx;
  const wallW = tokens.layout.grid.wallW;
  const ox = (ART.wallCapW - wallW) / 2;
  const top = ART.wallCapPx;
  const rowTop = (r: number): number => top + (spec.height - 1 - r) * c;
  const board = tokens.color.board;

  ctx.save();
  for (const run of wallRuns(spec)) {
    const y = rowTop(run.to);
    const h = (run.to - run.from + 1) * c;
    ctx.fillStyle = board.wall;
    ctx.fillRect(ox, y, wallW, h);
    ctx.beginPath();
    for (let x = ART.wallFormworkSpacingPx; x < wallW; x += ART.wallFormworkSpacingPx) {
      ctx.moveTo(ox + x, y);
      ctx.lineTo(ox + x, y + h);
    }
    ctx.lineCap = 'butt';
    ctx.lineWidth = ART.wallFormworkPx;
    ctx.strokeStyle = css(parseHex(board.wallDark), ART.wallFormworkAlpha);
    ctx.stroke();
    ctx.fillStyle = board.wallLight;
    ctx.fillRect(ox, y, ART.wallEdgePx, h);
    ctx.fillStyle = board.wallDark;
    ctx.fillRect(ox + wallW - ART.wallEdgePx, y, ART.wallEdgePx, h);
    innerStroke(ctx, ox, y, wallW, h, tokens);
  }

  for (const g of spec.gaps) {
    if (g.type !== 'static') continue;
    // W1: hazard bands on the wall right above and right below the opening.
    drawHazard(ctx, 0, rowTop(g.y + g.size - 1) - ART.gapEdgePx, ART.wallCapW, ART.gapEdgePx, tokens);
    if (g.y > 0) drawHazard(ctx, 0, rowTop(g.y) + c, ART.wallCapW, ART.gapEdgePx, tokens);
  }

  drawHazard(ctx, 0, 0, ART.wallCapW, ART.wallCapPx, tokens);
  innerStroke(ctx, 0, 0, ART.wallCapW, ART.wallCapPx, tokens);
  ctx.restore();
}

export interface GapRailSpec {
  /** Through the opening and across the site: `wallW + buildCols·cellPx`. */
  readonly length: number;
}

export function gapRailSize(spec: GapRailSpec): Size {
  return { w: spec.length, h: ART.gapRailPx };
}

/** One W1 steel rail (ART §5: 6 px, `board.rail`), laid on the opening's top and bottom boundaries. */
export function drawGapRail(ctx: DrawContext, spec: GapRailSpec, tokens: Tokens): void {
  ctx.fillStyle = tokens.color.board.rail;
  ctx.fillRect(0, 0, spec.length, ART.gapRailPx);
}
