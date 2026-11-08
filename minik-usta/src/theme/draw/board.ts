/**
 * Board ground drawers (ART_DIRECTION §2.4, §4, §5; ASSET_LIST §3): yard floor tile, scaffolding, ceiling beam,
 * crane-area line and a flat white pixel for tinted rectangles (keeps flat fills inside the atlas batch, §10.6).
 */
import type { Tokens } from '../tokens.ts';
import { ART } from './art.ts';
import { WHITE, css, parseHex } from './color.ts';
import type { DrawContext, Size } from './context.ts';

/** `board_yard_floor`: 2 × 2 cell checker tile (`yardFloor` / `yardFloorAlt`) with the 3 px `yardGrid` on cell edges. */
export function yardFloorSize(tokens: Tokens): Size {
  const c = tokens.layout.grid.cellPx;
  return { w: 2 * c, h: 2 * c };
}

export function drawYardFloor(ctx: DrawContext, tokens: Tokens): void {
  const c = tokens.layout.grid.cellPx;
  const b = tokens.color.board;
  ctx.save();
  for (let row = 0; row < 2; row++) {
    for (let col = 0; col < 2; col++) {
      ctx.fillStyle = (row + col) % 2 === 0 ? b.yardFloor : b.yardFloorAlt;
      ctx.fillRect(col * c, row * c, c, c);
    }
  }
  // Lines centred on the cell edges: the tile's outer half-lines join their neighbours' when tiled.
  ctx.beginPath();
  for (let k = 0; k <= 2; k++) {
    ctx.moveTo(k * c, 0);
    ctx.lineTo(k * c, 2 * c);
    ctx.moveTo(0, k * c);
    ctx.lineTo(2 * c, k * c);
  }
  ctx.lineCap = 'butt';
  ctx.lineWidth = ART.yardGridPx;
  ctx.strokeStyle = b.yardGrid;
  ctx.stroke();
  ctx.restore();
}

/** Scaffold pole (ART §4): `board.scaffold`, 16 px wide, 4 px light strip; `length` = site height. */
export function drawScaffoldPole(ctx: DrawContext, spec: { readonly length: number }, tokens: Tokens): void {
  ctx.fillStyle = tokens.color.board.scaffold;
  ctx.fillRect(0, 0, ART.scaffoldPolePx, spec.length);
  ctx.fillStyle = css(WHITE, ART.scaffoldLightAlpha);
  ctx.fillRect(0, 0, ART.scaffoldPoleLightPx, spec.length);
}

/** Scaffold ledger (ART §4): horizontal `board.scaffold` pipe, 10 px at 70 %, every 2 rows. */
export function drawScaffoldLedger(
  ctx: DrawContext,
  spec: { readonly length: number },
  tokens: Tokens,
): void {
  ctx.fillStyle = css(parseHex(tokens.color.board.scaffold), ART.scaffoldLedgerAlpha);
  ctx.fillRect(0, 0, spec.length, ART.scaffoldLedgerPx);
}

export function scaffoldClampSize(): Size {
  return { w: ART.scaffoldClampPx, h: ART.scaffoldClampPx };
}

/** Orange clamp `board.scaffoldClamp` 20 × 20 (ART §4; also the ends of the ceiling beam). */
export function drawScaffoldClamp(ctx: DrawContext, tokens: Tokens): void {
  ctx.fillStyle = tokens.color.board.scaffoldClamp;
  ctx.fillRect(0, 0, ART.scaffoldClampPx, ART.scaffoldClampPx);
}

/** Ceiling beam `board_ceiling_beam` (ART §4, S8): `plan.ceilingBeamPx` steel pipe across the site. */
export function drawCeilingBeam(ctx: DrawContext, spec: { readonly length: number }, tokens: Tokens): void {
  ctx.fillStyle = tokens.color.board.scaffold;
  ctx.fillRect(0, 0, spec.length, tokens.plan.ceilingBeamPx);
  ctx.fillStyle = css(WHITE, ART.scaffoldLightAlpha);
  ctx.fillRect(0, 0, spec.length, Math.min(ART.scaffoldPoleLightPx, tokens.plan.ceilingBeamPx / 3));
}

/** Crane area bottom line (ART §5): dashed `board.craneLine` at `alpha.craneLine`, 4 px, 16/12. */
export function drawCraneLine(ctx: DrawContext, spec: { readonly length: number }, tokens: Tokens): void {
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(0, ART.craneLinePx / 2);
  ctx.lineTo(spec.length, ART.craneLinePx / 2);
  ctx.setLineDash([...ART.craneDash]);
  ctx.lineCap = 'butt';
  ctx.lineWidth = ART.craneLinePx;
  ctx.strokeStyle = css(parseHex(tokens.color.board.craneLine), tokens.alpha.craneLine);
  ctx.stroke();
  ctx.restore();
}

/** Opaque white square; the scene scales and tints it for flat fills (crane sky band, overlays). */
export function drawWhitePixel(ctx: DrawContext, size: Size): void {
  ctx.fillStyle = css(WHITE);
  ctx.fillRect(0, 0, size.w, size.h);
}
