import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SHAPES, shapeById } from '../../src/core/shapes.ts';
import { COLOR_CODES } from '../../src/core/types.ts';
import type { ShapeId } from '../../src/core/types.ts';
import { TOKENS } from '../../src/theme/tokens.ts';
import { ART } from '../../src/theme/draw/art.ts';
import {
  blockOutline,
  blockSize,
  drawBlock,
  drawGhost,
  drawSilhouette,
  ghostPad,
  glossCell,
  silhouettePad,
  silhouetteSize,
} from '../../src/theme/draw/block.ts';
import {
  drawCeilingBeam,
  drawCraneLine,
  drawScaffoldClamp,
  drawScaffoldLedger,
  drawScaffoldPole,
  drawWhitePixel,
  drawYardFloor,
} from '../../src/theme/draw/board.ts';
import { blockPalette, css, parseHex, planPalette, symbolInk } from '../../src/theme/draw/color.ts';
import type { DrawContext } from '../../src/theme/draw/context.ts';
import { canvasCells, parseSvgPath, polyominoOutline } from '../../src/theme/draw/path.ts';
import {
  connectedGroups,
  drawBlueprintCorner,
  drawBlueprintDeep,
  drawBlueprintFloor,
  drawBlueprintGrid,
  drawBuildFront,
  drawHiddenCell,
  drawPlanCell,
  drawPlanDots,
  drawSupportHatch,
} from '../../src/theme/draw/plan.ts';
import { SYMBOLS } from '../../src/theme/draw/symbols.ts';
import { drawGapRail, drawWall, wallRuns, wallSize } from '../../src/theme/draw/wall.ts';
import { STICKY_KEYS, createRecorder, opsOf, record, styleAt } from './recordingContext.ts';
import type { Op } from './recordingContext.ts';

const C = TOKENS.layout.grid.cellPx;
const CB = { colorBlind: true } as const;
const GLOSS = css([255, 255, 255], TOKENS.alpha.gloss);

/** One entry per drawer and representative specs (TECH §10.2: every texture family of the Phase 2 atlas + bake). */
const CATALOGUE: readonly [string, (ctx: DrawContext) => void][] = [
  ...SHAPES.filter((s) => s.canonicalIndex === s.index).map((s): [string, (ctx: DrawContext) => void] => [
    `block ${s.id} ${COLOR_CODES[s.index % 8]}`,
    (ctx) => drawBlock(ctx, { shape: s.id, color: COLOR_CODES[s.index % 8] ?? 'W' }, TOKENS),
  ]),
  ['block C3_0 B colour-blind', (ctx) => drawBlock(ctx, { shape: 'C3_0', color: 'B', mode: CB }, TOKENS)],
  ...(['contact', 'lifted', 'crane'] as const).map((kind): [string, (ctx: DrawContext) => void] => [
    `silhouette T4_0 ${kind}`,
    (ctx) => drawSilhouette(ctx, { shape: 'T4_0', kind }, TOKENS),
  ]),
  ...(['body', 'valid', 'invalid', 'neutral'] as const).map((style): [string, (ctx: DrawContext) => void] => [
    `ghost L4_90 ${style}`,
    (ctx) => drawGhost(ctx, { shape: 'L4_90', style }, TOKENS),
  ]),
  ...COLOR_CODES.map((color): [string, (ctx: DrawContext) => void] => [
    `plan cell ${color}`,
    (ctx) => drawPlanCell(ctx, { color }, TOKENS),
  ]),
  ['plan cell R colour-blind', (ctx) => drawPlanCell(ctx, { color: 'R', mode: CB }, TOKENS)],
  [
    'plan dots (level 4 "W.")',
    (ctx) => drawPlanDots(ctx, { rows: 5, cols: 2, dots: [{ x: 1, y: 2 }] }, TOKENS),
  ],
  [
    'plan dots window group',
    (ctx) =>
      drawPlanDots(
        ctx,
        {
          rows: 4,
          cols: 2,
          dots: [
            { x: 0, y: 1 },
            { x: 1, y: 1 },
            { x: 0, y: 2 },
          ],
        },
        TOKENS,
      ),
  ],
  ['hidden cell', (ctx) => drawHiddenCell(ctx, TOKENS)],
  ['build front', (ctx) => drawBuildFront(ctx, TOKENS)],
  ['support hatch', (ctx) => drawSupportHatch(ctx, {}, TOKENS)],
  ['support hatch colour-blind', (ctx) => drawSupportHatch(ctx, { mode: CB }, TOKENS)],
  ...[1, 3, 5, 8].map((rows): [string, (ctx: DrawContext) => void] => [
    `blueprint grid h${rows}`,
    (ctx) => drawBlueprintGrid(ctx, { rows, cols: 2 }, TOKENS),
  ]),
  ['blueprint floor', (ctx) => drawBlueprintFloor(ctx, { w: 2 * C, h: 2 * C, seed: 7 }, TOKENS)],
  ['blueprint deep', (ctx) => drawBlueprintDeep(ctx, { w: C, h: C }, TOKENS)],
  ['blueprint corner', (ctx) => drawBlueprintCorner(ctx, TOKENS)],
  ['wall level 1', (ctx) => drawWall(ctx, { height: 2, gaps: [] }, TOKENS)],
  [
    'wall level 3 (W1)',
    (ctx) => drawWall(ctx, { height: 6, gaps: [{ y: 2, size: 2, type: 'static' }] }, TOKENS),
  ],
  [
    'wall gap at row 0',
    (ctx) => drawWall(ctx, { height: 5, gaps: [{ y: 0, size: 2, type: 'static' }] }, TOKENS),
  ],
  ['gap rail', (ctx) => drawGapRail(ctx, { length: 300 }, TOKENS)],
  ['yard floor', (ctx) => drawYardFloor(ctx, TOKENS)],
  ['scaffold pole', (ctx) => drawScaffoldPole(ctx, { length: 8 * C }, TOKENS)],
  ['scaffold ledger', (ctx) => drawScaffoldLedger(ctx, { length: 2 * C }, TOKENS)],
  ['scaffold clamp', (ctx) => drawScaffoldClamp(ctx, TOKENS)],
  ['ceiling beam', (ctx) => drawCeilingBeam(ctx, { length: 2 * C }, TOKENS)],
  ['crane line', (ctx) => drawCraneLine(ctx, { length: 1020 }, TOKENS)],
  ['white pixel', (ctx) => drawWhitePixel(ctx, { w: 4, h: 4 })],
];

describe('drawers are pure and deterministic (TECH 10.2, D-060)', () => {
  beforeEach(() => {
    vi.spyOn(Math, 'random').mockImplementation(() => {
      throw new Error('Math.random used in a drawer');
    });
  });
  afterEach(() => vi.restoreAllMocks());

  for (const [name, draw] of CATALOGUE) {
    it(`TECH 10.2 ${name}: same spec → identical Canvas2D call log, balanced save/restore, no leaked state`, () => {
      const a = createRecorder();
      draw(a.ctx);
      const b = record(draw);
      expect(a.ops.length).toBeGreaterThan(0);
      expect(b).toEqual(a.ops);
      expect(a.depth()).toBe(0);
      const fresh = createRecorder().state();
      for (const k of STICKY_KEYS) expect(a.state()[k], `${name}: ${k}`).toEqual(fresh[k]);
    });
  }

  it('TECH 10.2 a drawer does not depend on what was drawn before (shared context)', () => {
    const alone = record((ctx) => drawBlock(ctx, { shape: 'S4_0', color: 'O' }, TOKENS));
    const r = createRecorder();
    for (const [, draw] of CATALOGUE) draw(r.ctx);
    const before = r.ops.length;
    drawBlock(r.ctx, { shape: 'S4_0', color: 'O' }, TOKENS);
    expect(r.ops.slice(before)).toEqual(alone);
  });

  it('TECH 10.2 every op stays inside the DrawContext surface (the recorder rejects other members)', () => {
    const r = createRecorder();
    expect(() => (r.ctx as unknown as { roundRect: () => void }).roundRect()).toThrow(
      /not part of DrawContext/,
    );
  });
});

describe('block recipe (ART 3, D-012, D-013)', () => {
  it('ART gloss pill once per piece at top-left open cell', () => {
    // TECH 10.2 (b) example: L piece with one cell on top (x2) and three below (x0–x2) → gloss on the top cell.
    const l = shapeById('L4_270');
    expect(l.cells.map((c) => [c.x, c.y])).toEqual([
      [0, 0],
      [1, 0],
      [2, 0],
      [2, 1],
    ]);
    expect(glossCell(l)).toEqual({ x: 2, y: 0 });
    const ops = record((ctx) => drawBlock(ctx, { shape: 'L4_270', color: 'Y' }, TOKENS));
    const glossFills = styleAt(ops, 'fill', 'fillStyle').filter((s) => s === GLOSS);
    expect(glossFills).toHaveLength(1);
    const [gx, gy, , gh] = TOKENS.block.glossRect;
    const start = ops.findIndex(
      (o, i) => o[0] === 'moveTo' && ops[i - 1]?.[0] === 'beginPath' && o[2] === gy * C,
    );
    expect(ops[start]).toEqual(['moveTo', 2 * C + gx * C + (gh * C) / 2, gy * C]);
    for (const s of SHAPES) {
      const n = styleAt(
        record((ctx) => drawBlock(ctx, { shape: s.id, color: 'G' }, TOKENS)),
        'fill',
        'fillStyle',
      ).filter((f) => f === GLOSS).length;
      expect(n, s.id).toBe(1);
    }
  });

  it('ART 3 continuous outline: convex corners r 0.18c, concave (inner) corners r 0.06c', () => {
    const corners = (id: ShapeId) => polyominoOutline(canvasCells(shapeById(id).cells, shapeById(id).h), C);
    const concave = (id: ShapeId) => corners(id).filter((c) => !c.convex).length;
    expect([corners('O4_0').length, concave('O4_0')]).toEqual([4, 0]);
    expect([corners('Q9_0').length, concave('Q9_0')]).toEqual([4, 0]);
    expect([corners('C3_0').length, concave('C3_0')]).toEqual([6, 1]);
    expect([corners('L4_0').length, concave('L4_0')]).toEqual([6, 1]);
    expect([corners('T4_0').length, concave('T4_0')]).toEqual([8, 2]);
    expect([corners('S4_0').length, concave('S4_0')]).toEqual([8, 2]);
    const ops = record((ctx) => drawBlock(ctx, { shape: 'C3_0', color: 'R' }, TOKENS));
    const radii = opsOf(ops, 'arcTo').map((o) => o[5]);
    const outer = TOKENS.block.cornerRadiusRatio * C;
    const inner = TOKENS.block.innerCornerRadiusRatio * C;
    // Traced twice (fill + outline): 5 outer and 1 inner corner each.
    expect(radii.filter((r) => r === outer)).toHaveLength(10);
    expect(radii.filter((r) => r === inner)).toHaveLength(2);
  });

  it('ART 3 layer 0: block edges sit block.insetRatio·c inside the cell box', () => {
    const d = TOKENS.block.insetRatio * C;
    const o = blockOutline(shapeById('B1_0'), TOKENS);
    expect(o.map((p) => [p.x, p.y])).toEqual([
      [d, d],
      [C - d, d],
      [C - d, C - d],
      [d, C - d],
    ]);
    expect(blockSize('I3_0', TOKENS)).toEqual({ w: C, h: 3 * C });
  });

  it('ART 3 colours: base, bands, seams and the outline come from the D-012 palette by formula', () => {
    const pal = blockPalette(TOKENS, 'O');
    const ops = record((ctx) => drawBlock(ctx, { shape: 'O4_0', color: 'O' }, TOKENS));
    expect(styleAt(ops, 'fill', 'fillStyle')[0]).toBe(TOKENS.color.block.O);
    const rectStyles = new Set(styleAt(ops, 'fillRect', 'fillStyle'));
    expect(rectStyles).toEqual(new Set([css(pal.top), css(pal.left), css(pal.bottom), css(pal.right)]));
    const strokes = styleAt(ops, 'stroke', 'strokeStyle');
    expect(strokes).toContain(css(pal.seam, TOKENS.alpha.seam));
    expect(strokes).toContain(css(pal.outline));
    expect(styleAt(ops, 'stroke', 'lineWidth')).toContain(TOKENS.block.outlinePx * 2);
    // O4: two horizontal + two vertical neighbour pairs → 4 seam segments in one stroke.
    const seamStyle = css(pal.seam, TOKENS.alpha.seam);
    const strokeIdx = ops.findIndex(
      (o, i) =>
        o[0] === 'stroke' && styleAt(ops.slice(0, i + 1), 'stroke', 'strokeStyle').at(-1) === seamStyle,
    );
    let begin = strokeIdx;
    while (begin > 0 && ops[begin]?.[0] !== 'beginPath') begin--;
    expect(opsOf(ops.slice(begin, strokeIdx), 'moveTo')).toHaveLength(4);
    const b1 = record((ctx) => drawBlock(ctx, { shape: 'B1_0', color: 'O' }, TOKENS));
    expect(styleAt(b1, 'stroke', 'strokeStyle')).not.toContain(css(pal.seam, TOKENS.alpha.seam));
  });

  it('D-013 block symbol ink: dark ×0.40 on light colours, white 85 % on dark ones; ×1.2 symbols in colour-blind mode', () => {
    for (const color of COLOR_CODES) {
      const ink = symbolInk(TOKENS, color);
      const ops = record((ctx) => drawBlock(ctx, { shape: 'B1_0', color }, TOKENS));
      const styles = [...styleAt(ops, 'fill', 'fillStyle'), ...styleAt(ops, 'stroke', 'strokeStyle')];
      expect(styles, color).toContain(css(ink.rgb, ink.alpha));
    }
    const size = (mode?: { colorBlind: boolean }) =>
      opsOf(
        record((ctx) => drawBlock(ctx, { shape: 'B1_0', color: 'Y', ...(mode ? { mode } : {}) }, TOKENS)),
        'scale',
      )[0]?.[1] as number;
    expect(size()).toBeCloseTo((TOKENS.block.symbolSizeRatio * C) / 100, 12);
    expect(size(CB)).toBeCloseTo(
      (TOKENS.block.symbolSizeRatio * C * TOKENS.a11y.colorBlindSymbolScale) / 100,
      12,
    );
  });

  it('ART 3.1 each cell carries its colour symbol; G and P carve their lines in the base colour', () => {
    const ops = record((ctx) => drawBlock(ctx, { shape: 'I3_0', color: 'P' }, TOKENS));
    expect(opsOf(ops, 'scale')).toHaveLength(3);
    expect(styleAt(ops, 'stroke', 'strokeStyle')).toContain(TOKENS.color.block.P);
    expect(SYMBOLS.G.some((p) => p.color === 'carve')).toBe(true);
    expect(Object.keys(SYMBOLS)).toEqual([...COLOR_CODES]);
  });

  it('S3 flag layers are Phase 3: a flagged block spec fails loudly instead of baking a wrong look', () => {
    expect(() =>
      record((ctx) => drawBlock(ctx, { shape: 'B1_0', color: 'W', flags: ['glass'] }, TOKENS)),
    ).toThrow(/Phase 3/);
  });

  it('ART 3 layers 8–9: silhouettes are blurred with shadowBlur, the source fill is thrown off the frame', () => {
    for (const kind of ['contact', 'lifted', 'crane'] as const) {
      const ops = record((ctx) => drawSilhouette(ctx, { shape: 'D2_0', kind }, TOKENS));
      expect(opsOf(ops, '=shadowBlur')).toEqual([['=shadowBlur', TOKENS.shadow[kind].blur]]);
      const xs = [...opsOf(ops, 'moveTo'), ...opsOf(ops, 'arcTo')].map((o) => o[1] as number);
      expect(Math.max(...xs)).toBeLessThan(0);
      expect(silhouettePad(kind, TOKENS)).toBe(Math.ceil(TOKENS.shadow[kind].blur * 1.5));
    }
    const pad = silhouettePad('lifted', TOKENS);
    expect(pad).toBe(Math.ceil(TOKENS.shadow.lifted.blur * 1.5));
    expect(silhouetteSize({ shape: 'D2_0', kind: 'lifted' }, TOKENS)).toEqual({
      w: C + 2 * pad,
      h: 2 * C + 2 * pad,
    });
  });

  it('UX 5.4 ghost styles: valid solid + glow, invalid dashed red 8 px, neutral dashed white 60 %; +2 px colour-blind', () => {
    const g = TOKENS.color.ghost;
    const valid = record((ctx) => drawGhost(ctx, { shape: 'O4_0', style: 'valid' }, TOKENS));
    expect(opsOf(valid, 'setLineDash')).toHaveLength(0);
    expect(styleAt(valid, 'stroke', 'strokeStyle')).toEqual([g.valid]);
    expect(styleAt(valid, 'stroke', 'shadowColor')).toEqual([css(parseHex(g.valid), TOKENS.alpha.ghostGlow)]);
    const invalid = record((ctx) => drawGhost(ctx, { shape: 'O4_0', style: 'invalid' }, TOKENS));
    expect(opsOf(invalid, 'setLineDash')).toEqual([['setLineDash', [...ART.ghostDash]]]);
    expect(styleAt(invalid, 'stroke', 'lineWidth')).toEqual([TOKENS.stroke.ghostInvalidPx]);
    expect(styleAt(invalid, 'stroke', 'strokeStyle')).toEqual([g.invalid]);
    const neutral = record((ctx) => drawGhost(ctx, { shape: 'O4_0', style: 'neutral', mode: CB }, TOKENS));
    expect(styleAt(neutral, 'stroke', 'lineWidth')).toEqual([
      TOKENS.stroke.ghostNeutralPx + TOKENS.a11y.colorBlindGhostStrokeAddPx,
    ]);
    expect(styleAt(neutral, 'stroke', 'strokeStyle')).toEqual([
      css(parseHex(g.neutral), TOKENS.alpha.ghostNeutralStroke),
    ]);
    const body = record((ctx) => drawGhost(ctx, { shape: 'O4_0', style: 'body' }, TOKENS));
    expect(styleAt(body, 'fill', 'fillStyle')).toEqual(['#FFFFFF']);
    expect(ghostPad(TOKENS, CB)).toBeGreaterThan(ghostPad(TOKENS));
  });
});

describe('plan cells and build site (ART 4, D-013, K-15, S2, K-34)', () => {
  it('D-013 plan cell: chalk underlay + 80 % colour composite, dashed stroke ×0.65, 100 % plan ink', () => {
    for (const color of COLOR_CODES) {
      const pal = planPalette(TOKENS, color);
      const ops = record((ctx) => drawPlanCell(ctx, { color }, TOKENS));
      expect(styleAt(ops, 'fill', 'fillStyle')[0], color).toBe(css(pal.fill));
      expect(opsOf(ops, 'setLineDash')).toEqual([['setLineDash', [...TOKENS.plan.dash]]]);
      expect(styleAt(ops, 'stroke', 'strokeStyle')[0]).toBe(css(pal.stroke));
      expect(styleAt(ops, 'stroke', 'lineWidth')[0]).toBe(TOKENS.plan.strokePx);
      const styles = [...styleAt(ops, 'fill', 'fillStyle'), ...styleAt(ops, 'stroke', 'strokeStyle')];
      expect(styles).toContain(css(pal.ink.rgb, pal.ink.alpha));
      // ART 4: no bevel, gloss or shadow on plan cells.
      expect(opsOf(ops, 'fillRect')).toHaveLength(0);
      expect(opsOf(ops, '=shadowBlur')).toHaveLength(0);
    }
  });

  it('ART 10 colour-blind plan cell uses a11y.colorBlindPlanFill', () => {
    const def = record((ctx) => drawPlanCell(ctx, { color: 'C' }, TOKENS));
    const cb = record((ctx) => drawPlanCell(ctx, { color: 'C', mode: CB }, TOKENS));
    expect(styleAt(cb, 'fill', 'fillStyle')[0]).toBe(css(planPalette(TOKENS, 'C', CB).fill));
    expect(styleAt(cb, 'fill', 'fillStyle')[0]).not.toBe(styleAt(def, 'fill', 'fillStyle')[0]);
  });

  it('K-15 plan cells are inset plan.insetPx with corner radius plan.cornerRadiusRatio·c', () => {
    const ops = record((ctx) => drawPlanCell(ctx, { color: 'W' }, TOKENS));
    const i = TOKENS.plan.insetPx;
    expect(ops[2]).toEqual(['moveTo', i + TOKENS.plan.cornerRadiusRatio * C, i]);
  });

  it('S2 "." cells: isolated → dashed 3 px outline; a group is one hatched shape with one solid frame', () => {
    expect(
      connectedGroups([
        { x: 0, y: 0 },
        { x: 1, y: 1 },
      ]),
    ).toHaveLength(2);
    expect(
      connectedGroups([
        { x: 0, y: 1 },
        { x: 1, y: 1 },
        { x: 0, y: 2 },
      ]),
    ).toHaveLength(1);
    const single = record((ctx) => drawPlanDots(ctx, { rows: 5, cols: 2, dots: [{ x: 1, y: 2 }] }, TOKENS));
    expect(opsOf(single, 'setLineDash')).toEqual([['setLineDash', [...TOKENS.plan.dash]]]);
    expect(styleAt(single, 'stroke', 'lineWidth')).toEqual([TOKENS.plan.hatchWidthPx, ART.emptyStrokePx]);
    expect(styleAt(single, 'stroke', 'strokeStyle')).toEqual([
      css([255, 255, 255], TOKENS.alpha.planEmptyHatch),
      css([255, 255, 255], TOKENS.alpha.planEmptyStroke),
    ]);
    // Level 4 "W." at plan row 2 of 5: the cell's canvas top is (5 − 1 − 2)·c.
    expect(opsOf(single, 'moveTo')[0]).toEqual(['moveTo', C + TOKENS.plan.insetPx, 2.5 * C]);
    const group = record((ctx) =>
      drawPlanDots(
        ctx,
        {
          rows: 4,
          cols: 2,
          dots: [
            { x: 0, y: 1 },
            { x: 1, y: 1 },
            { x: 0, y: 2 },
          ],
        },
        TOKENS,
      ),
    );
    expect(opsOf(group, 'setLineDash')).toHaveLength(0);
    expect(styleAt(group, 'stroke', 'lineWidth')).toEqual([TOKENS.plan.hatchWidthPx, ART.emptyFramePx]);
    expect(opsOf(group, 'clip')).toHaveLength(1);
  });

  it('K-34 build front: solid plan.frontStrokePx in board.buildFront, +15 % veil, outer glow', () => {
    const ops = record((ctx) => drawBuildFront(ctx, TOKENS));
    expect(opsOf(ops, 'setLineDash')).toHaveLength(0);
    expect(styleAt(ops, 'fill', 'fillStyle')).toEqual([css([255, 255, 255], TOKENS.plan.frontLighten)]);
    expect(styleAt(ops, 'stroke', 'lineWidth')).toEqual([TOKENS.plan.frontStrokePx]);
    expect(styleAt(ops, 'stroke', 'strokeStyle')).toEqual([TOKENS.color.board.buildFront]);
    expect(styleAt(ops, 'stroke', 'shadowColor')).toEqual([
      css(parseHex(TOKENS.color.board.buildFront), TOKENS.alpha.buildFrontGlow),
    ]);
    expect(styleAt(ops, 'fill', 'shadowColor')).toEqual([undefined]);
  });

  it('K-34 missing-support hatch is horizontal (not 45°), ghost.support at alpha.supportHatch; 8 px colour-blind', () => {
    const ops = record((ctx) => drawSupportHatch(ctx, {}, TOKENS));
    const moves = opsOf(ops, 'moveTo').slice(1);
    const lines = opsOf(ops, 'lineTo').slice(-moves.length);
    expect(moves).toHaveLength(Math.floor((C - 2 * TOKENS.plan.insetPx) / TOKENS.plan.supportHatchSpacingPx));
    moves.forEach((m, i) => expect(lines[i]?.[2]).toBe(m[2]));
    expect(styleAt(ops, 'stroke', 'strokeStyle')).toEqual([
      css(parseHex(TOKENS.color.ghost.support), TOKENS.alpha.supportHatch),
    ]);
    expect(styleAt(ops, 'stroke', 'lineWidth')).toEqual([TOKENS.plan.supportHatchWidthPx]);
    const cb = record((ctx) => drawSupportHatch(ctx, { mode: CB }, TOKENS));
    expect(styleAt(cb, 'stroke', 'lineWidth')).toEqual([TOKENS.a11y.colorBlindSupportHatchPx]);
  });

  it('ART 4 blueprint grid: thin lines every cell, major lines every 2 cells from the plan bottom', () => {
    const ops = record((ctx) => drawBlueprintGrid(ctx, { rows: 5, cols: 2 }, TOKENS));
    expect(styleAt(ops, 'stroke', 'strokeStyle')).toEqual([
      css([255, 255, 255], TOKENS.alpha.blueprintLine),
      css([255, 255, 255], TOKENS.alpha.blueprintLineMajor),
    ]);
    const strokeAt = ops.findIndex((o) => o[0] === 'stroke');
    const rowsOf = (part: readonly Op[]): unknown[] =>
      part.flatMap((o, i) =>
        o[0] === 'moveTo' && part[i + 1]?.[0] === 'lineTo' && part[i + 1]?.[2] === o[2] ? [o[2]] : [],
      );
    expect(rowsOf(ops.slice(0, strokeAt))).toEqual([4 * C, 2 * C, 0]);
    expect(rowsOf(ops.slice(strokeAt))).toEqual([5 * C, 3 * C, C]);
  });

  it('ART 4 paper speckle is seeded: the same seed repeats, another seed differs', () => {
    const a = record((ctx) => drawBlueprintFloor(ctx, { w: 240, h: 240, seed: 1 }, TOKENS));
    const b = record((ctx) => drawBlueprintFloor(ctx, { w: 240, h: 240, seed: 1 }, TOKENS));
    const c = record((ctx) => drawBlueprintFloor(ctx, { w: 240, h: 240, seed: 2 }, TOKENS));
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
    expect(opsOf(a, 'fillRect')[0]).toEqual(['fillRect', 0, 0, 240, 240]);
    expect(styleAt(a, 'fillRect', 'fillStyle')[0]).toBe(TOKENS.color.board.blueprint);
  });

  it('S2 hidden "?" cell draws a paper tag and the glyph, no i18n text', () => {
    const ops = record((ctx) => drawHiddenCell(ctx, TOKENS));
    expect(opsOf(ops, 'fillText')).toEqual([['fillText', '?', C / 2, C / 2 + ART.hiddenHolePx / 2]]);
    expect(styleAt(ops, 'fillText', 'font')[0]).toBe(`800 52px "Baloo 2", Nunito, system-ui, sans-serif`);
    expect(styleAt(ops, 'fill', 'fillStyle')).toContain(TOKENS.color.ui.panel);
  });
});

describe('wall and gaps (K-04, W1, ART 5)', () => {
  it('K-04 wall frame covers rows [0, height) plus the 20 px cap; height 0 draws nothing', () => {
    expect(wallSize({ height: 6, gaps: [] }, TOKENS)).toEqual({ w: ART.wallCapW, h: 6 * C + ART.wallCapPx });
    expect(wallSize({ height: 0, gaps: [] }, TOKENS)).toEqual({ w: 0, h: 0 });
    expect(record((ctx) => drawWall(ctx, { height: 0, gaps: [] }, TOKENS))).toEqual([]);
  });

  it('W1 static gap: opening rows are transparent, hazard bands above and below the opening', () => {
    const spec = { height: 6, gaps: [{ y: 2, size: 2, type: 'static' }] };
    expect(wallRuns(spec)).toEqual([
      { from: 0, to: 1 },
      { from: 4, to: 5 },
    ]);
    const ops = record((ctx) => drawWall(ctx, spec, TOKENS));
    const rectStyles = styleAt(ops, 'fillRect', 'fillStyle');
    const bodies = opsOf(ops, 'fillRect').filter((_, i) => rectStyles[i] === TOKENS.color.board.wall);
    expect(bodies).toEqual([
      ['fillRect', 6, ART.wallCapPx + 4 * C, 60, 2 * C],
      ['fillRect', 6, ART.wallCapPx, 60, 2 * C],
    ]);
    const yellow = styleAt(ops, 'fillRect', 'fillStyle').filter((s) => s === TOKENS.color.ui.hazardYellow);
    expect(yellow).toHaveLength(3); // cap + 2 gap edges
    const bottomGap = record((ctx) =>
      drawWall(ctx, { height: 5, gaps: [{ y: 0, size: 2, type: 'static' }] }, TOKENS),
    );
    expect(
      styleAt(bottomGap, 'fillRect', 'fillStyle').filter((s) => s === TOKENS.color.ui.hazardYellow),
    ).toHaveLength(2);
  });

  it('W1 rails: 6 px board.rail bars', () => {
    const ops = record((ctx) => drawGapRail(ctx, { length: 300 }, TOKENS));
    expect(ops).toEqual([
      ['=fillStyle', TOKENS.color.board.rail],
      ['fillRect', 0, 0, 300, ART.gapRailPx],
    ]);
  });
});

describe('SVG subset parser (ART 3.1)', () => {
  it('ART 3.1 parses M, H, V, C, Q, Z and implicit repeats into absolute ops', () => {
    expect(parseSvgPath('M10 50 H90 M50 16 V50')).toEqual([
      ['M', 10, 50],
      ['L', 90, 50],
      ['M', 50, 16],
      ['L', 50, 50],
    ]);
    expect(parseSvgPath('M8 44 Q22 18 36 44 Q50 18 64 44')).toEqual([
      ['M', 8, 44],
      ['Q', 22, 18, 36, 44],
      ['Q', 50, 18, 64, 44],
    ]);
    expect(parseSvgPath('M0 0 1 1 Z')).toEqual([['M', 0, 0], ['L', 1, 1], ['Z']]);
    expect(() => parseSvgPath('M0 0 A 1 1 0 0 1 2 2')).toThrow(/unsupported/);
    expect(() => parseSvgPath('10 10')).toThrow(/command expected/);
  });
});
