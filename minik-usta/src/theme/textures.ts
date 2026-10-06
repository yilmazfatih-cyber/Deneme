/**
 * Procedural textures (docs/TECH_DESIGN.md §10.2, D-060, R-05).
 *
 * (a) Boot atlas `atlas` (≤ 2048 × 2048, once at boot): plan cells (8 colours, each also in its build-front variant
 *     `plan_<c>_front`), `?` cell, build-front contour, missing-support hatch, ghost badges, blueprint floor / deep /
 *     corner, yard floor, scaffold, ceiling beam, W1 rail, crane line and a white pixel.
 * (b) Level bake `level-<id>` (≤ 2048 × 1024 pages, at level start): one frame per (shape × colour × flag set) of the
 *     level's pieces, per shape the blurred silhouettes and fall-shadow ghosts, per plan height the blueprint grid
 *     overlay, per plan its `.` overlay, and the wall.
 * Colour-blind mode is a bake parameter (switching re-bakes both).
 *
 * Everything here is pure planning + Canvas2D drawing except `uploadAtlas`, the ONLY function that touches Phaser:
 * `textures.createCanvas` → draw every frame on its `CanvasTexture.context` → `add` the frames → ONE `refresh()` per
 * page (one GPU upload). `DynamicTexture` / `RenderTexture` are not used (Phaser 4 needs `render()` per draw).
 */
import type Phaser from 'phaser';
import { PLAN_DOT } from '../core/level/compile.ts';
import type { CompiledLevel } from '../core/level/compile.ts';
import { shapeByIndex } from '../core/shapes.ts';
import { FLAG_BIT } from '../core/state.ts';
import { COLOR_CODES } from '../core/types.ts';
import type { ColorCode, ShapeId } from '../core/types.ts';
import type { Tokens } from './tokens.ts';
import { ART } from './draw/art.ts';
import { BADGE_KINDS, badgeSize, drawGhostBadge } from './draw/badge.ts';
import type { BadgeKind } from './draw/badge.ts';
import {
  BAKED_FLAGS,
  GHOST_STYLES,
  blockSize,
  drawBlock,
  drawGhost,
  drawSilhouette,
  ghostPad,
  ghostSize,
  silhouettePad,
  silhouetteSize,
} from './draw/block.ts';
import type { BakedFlag, BlockSpec, GhostStyle, SilhouetteKind } from './draw/block.ts';
import {
  drawCeilingBeam,
  drawCraneLine,
  drawScaffoldClamp,
  drawScaffoldLedger,
  drawScaffoldPole,
  drawWhitePixel,
  drawYardFloor,
  scaffoldClampSize,
  yardFloorSize,
} from './draw/board.ts';
import { DEFAULT_MODE } from './draw/color.ts';
import type { DrawMode } from './draw/color.ts';
import { drawInFrame } from './draw/context.ts';
import type { DrawContext } from './draw/context.ts';
import {
  blueprintCornerSize,
  blueprintGridSize,
  cellSize,
  drawBlueprintCorner,
  drawBlueprintDeep,
  drawBlueprintFloor,
  drawBlueprintGrid,
  drawBuildFront,
  drawHiddenCell,
  drawPlanCell,
  drawPlanDots,
  drawSupportHatch,
} from './draw/plan.ts';
import { drawGapRail, drawWall, gapRailSize, wallFrameOffset, wallSize } from './draw/wall.ts';

/** A frame to bake. `anchorX/Y` = where the logical top-left (cell, block box, wall strip) sits inside the frame. */
export interface FrameSpec {
  readonly name: string;
  readonly w: number;
  readonly h: number;
  readonly anchorX: number;
  readonly anchorY: number;
  /** Extra names for the same pixels (e.g. crane silhouette = lifted silhouette when both blurs are equal). */
  readonly aliases: readonly string[];
  draw(ctx: DrawContext): void;
}

export interface PlacedFrame extends FrameSpec {
  readonly x: number;
  readonly y: number;
}

export interface AtlasPage {
  readonly width: number;
  readonly height: number;
  readonly frames: readonly PlacedFrame[];
}

export interface PageLimits {
  readonly maxWidth: number;
  readonly maxHeight: number;
  /** Transparent px around every frame (no bleeding under linear filtering). */
  readonly gutter: number;
}

/** TECH §10.2 (a): boot atlas page 2048 × 2048. */
export const BOOT_PAGE: PageLimits = Object.freeze({ maxWidth: 2048, maxHeight: 2048, gutter: 2 });
/** TECH §10.2 (b): level pages 2048 × 1024, more pages when needed. */
export const LEVEL_PAGE: PageLimits = Object.freeze({ maxWidth: 2048, maxHeight: 1024, gutter: 2 });

/** TECH §10.2: when the device's max texture size is below 2048, pages are split to that size. */
export function limitPage(limits: PageLimits, maxTextureSize: number): PageLimits {
  return {
    maxWidth: Math.min(limits.maxWidth, maxTextureSize),
    maxHeight: Math.min(limits.maxHeight, maxTextureSize),
    gutter: limits.gutter,
  };
}

const nextPow2 = (v: number): number => 2 ** Math.ceil(Math.log2(Math.max(1, v)));

interface SkylineSegment {
  x: number;
  y: number;
  w: number;
}

/** Skyline bottom-left packer for one page (y grows downward, so "bottom-left" = lowest y, then lowest x). */
class SkylinePage {
  readonly frames: PlacedFrame[] = [];
  usedW = 0;
  usedH = 0;
  private readonly sky: SkylineSegment[];
  private readonly limits: PageLimits;

  constructor(limits: PageLimits) {
    this.limits = limits;
    this.sky = [{ x: 0, y: 0, w: limits.maxWidth }];
  }

  /** Places a `w × h` cell (gutter included); false when it does not fit. */
  tryPlace(f: FrameSpec, w: number, h: number): boolean {
    let best: { i: number; x: number; y: number } | null = null;
    for (let i = 0; i < this.sky.length; i++) {
      const x = (this.sky[i] as SkylineSegment).x;
      if (x + w > this.limits.maxWidth) break;
      let y = 0;
      let covered = 0;
      for (let j = i; covered < w; j++) {
        const seg = this.sky[j] as SkylineSegment;
        y = Math.max(y, seg.y);
        covered += seg.x + seg.w - Math.max(x, seg.x);
      }
      if (y + h > this.limits.maxHeight) continue;
      if (best === null || y < best.y) best = { i, x, y };
    }
    if (best === null) return false;
    const g = this.limits.gutter;
    this.frames.push({ ...f, x: best.x + g, y: best.y + g });
    this.usedW = Math.max(this.usedW, best.x + w);
    this.usedH = Math.max(this.usedH, best.y + h);
    this.sky.splice(best.i, 0, { x: best.x, y: best.y + h, w });
    for (let j = best.i + 1; j < this.sky.length;) {
      const prev = this.sky[j - 1] as SkylineSegment;
      const seg = this.sky[j] as SkylineSegment;
      const overlap = prev.x + prev.w - seg.x;
      if (overlap <= 0) break;
      seg.x += overlap;
      seg.w -= overlap;
      if (seg.w > 0) break;
      this.sky.splice(j, 1);
    }
    for (let j = 1; j < this.sky.length;) {
      const prev = this.sky[j - 1] as SkylineSegment;
      const seg = this.sky[j] as SkylineSegment;
      if (prev.y === seg.y) {
        prev.w += seg.w;
        this.sky.splice(j, 1);
      } else j++;
    }
    return true;
  }
}

/**
 * Deterministic packing (skyline, bottom-left): frames sorted by height, width (descending) then name; each frame goes
 * to the first page where it fits, a new page otherwise. Page sizes shrink to the next power of two that holds the
 * content. Every frame keeps `gutter` transparent px on each side.
 */
export function packFrames(frames: readonly FrameSpec[], limits: PageLimits): AtlasPage[] {
  const g = limits.gutter;
  const names = new Set<string>();
  for (const f of frames) {
    for (const n of [f.name, ...f.aliases]) {
      if (names.has(n)) throw new Error(`packFrames: duplicate frame name ${n}`);
      names.add(n);
    }
    if (f.w + 2 * g > limits.maxWidth || f.h + 2 * g > limits.maxHeight) {
      throw new RangeError(`packFrames: frame ${f.name} (${f.w}×${f.h}) exceeds the page`);
    }
  }
  const sorted = [...frames].sort(
    (a, b) => b.h - a.h || b.w - a.w || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0),
  );
  const pages: SkylinePage[] = [];
  for (const f of sorted) {
    const w = f.w + 2 * g;
    const h = f.h + 2 * g;
    if (pages.some((p) => p.tryPlace(f, w, h))) continue;
    const page = new SkylinePage(limits);
    page.tryPlace(f, w, h);
    pages.push(page);
  }
  return pages.map((p) => ({
    width: Math.min(limits.maxWidth, nextPow2(p.usedW)),
    height: Math.min(limits.maxHeight, nextPow2(p.usedH)),
    frames: p.frames,
  }));
}

/** Clears the page and draws every frame clipped to its rectangle. */
export function renderPage(ctx: DrawContext, page: AtlasPage): void {
  ctx.clearRect(0, 0, page.width, page.height);
  for (const f of page.frames) drawInFrame(ctx, f.x, f.y, f, () => f.draw(ctx));
}

// ---------------------------------------------------------------------------------------------------------------
// Frame names (the scene looks frames up by these names through the TextureIndex).

/** Names follow TECH §10.2–10.3 and ASSET_LIST §3 (`board_*`, `plan_*`, `plan_<c>_front`, `board_blueprint_deep`). */
export const FRAME = Object.freeze({
  hidden: 'plan_hidden',
  front: 'plan_front',
  supportHatch: 'plan_support_hatch',
  blueprintFloor: 'board_blueprint',
  blueprintDeep: 'board_blueprint_deep',
  blueprintCorner: 'board_blueprint_corner',
  yardFloor: 'board_yard_floor',
  scaffoldPole: 'board_scaffold_pole',
  scaffoldLedger: 'board_scaffold_ledger',
  scaffoldClamp: 'board_scaffold_clamp',
  ceilingBeam: 'board_ceiling_beam',
  gapRail: 'gap_rail',
  craneLine: 'crane_line',
  whitePixel: 'px_white',
  wall: 'wall',
});

export const planFrameName = (color: ColorCode): string => `plan_${color}`;
/** Build-front variant of a plan cell (+`plan.frontLighten` fill, symbol unchanged); `plan_front` goes on top. */
export const planFrontFrameName = (color: ColorCode): string => `plan_${color}_front`;
export const badgeFrameName = (kind: BadgeKind): string => `ghost_badge_${kind}`;
/** `blk_<shape>_<colour>[_<flag>…]` (ASSET §2); flags in BAKED_FLAGS order. */
export function blockFrameName(shape: ShapeId, color: ColorCode, flags: readonly BakedFlag[] = []): string {
  const sorted = BAKED_FLAGS.filter((f) => flags.includes(f));
  return ['blk', shape, color, ...sorted].join('_');
}
/** `blk_sil_<shape>_<contact|lifted|crane>` (ASSET §2). Shape ids never read `sil`, so no clash with block frames. */
export const silhouetteFrameName = (shape: ShapeId, kind: SilhouetteKind): string =>
  `blk_sil_${shape}_${kind}`;
export const ghostFrameName = (shape: ShapeId, style: GhostStyle): string => `ghost_${shape}_${style}`;
/** Blueprint grid overlay for a plan of height `rows`. */
export const gridFrameName = (rows: number): string => `grid_h${rows}`;
/** `.` overlay of segment `seg`. */
export const dotsFrameName = (seg: number): string => `dots_s${seg}`;

const frame = (
  name: string,
  size: { readonly w: number; readonly h: number },
  draw: (ctx: DrawContext) => void,
  extra: Partial<Pick<FrameSpec, 'anchorX' | 'anchorY' | 'aliases'>> = {},
): FrameSpec => ({
  name,
  w: size.w,
  h: size.h,
  anchorX: extra.anchorX ?? 0,
  anchorY: extra.anchorY ?? 0,
  aliases: extra.aliases ?? [],
  draw,
});

/**
 * Length of the frames that are uniform along one axis (scaffold pole: vertical; ledger, ceiling beam, W1 rail:
 * horizontal). The scene stretches them with `setDisplaySize` (pole = site height, rail = `wallW + buildCols·cellPx`),
 * which keeps the boot atlas small.
 */
export const STRETCH_PX = 16;

/** Seed of the blueprint paper speckle: fixed, so every bake is identical (ART §4 "tohumlu gürültü, sabit"). */
export const BLUEPRINT_SEED = 0x6d75; // "mu"

/** TECH §10.2 (a): boot atlas frames. */
export function bootAtlasFrames(tokens: Tokens, mode: DrawMode = DEFAULT_MODE): FrameSpec[] {
  const g = tokens.layout.grid;
  const c = g.cellPx;
  const cell = cellSize(tokens);
  const siteW = g.buildCols * c;
  const boardW = g.buildX + siteW - g.yardX;
  return [
    ...COLOR_CODES.map((color) =>
      frame(planFrameName(color), cell, (ctx) => drawPlanCell(ctx, { color, mode }, tokens)),
    ),
    ...COLOR_CODES.map((color) =>
      frame(planFrontFrameName(color), cell, (ctx) =>
        drawPlanCell(ctx, { color, mode, front: true }, tokens),
      ),
    ),
    frame(FRAME.hidden, cell, (ctx) => drawHiddenCell(ctx, tokens)),
    frame(FRAME.front, cell, (ctx) => drawBuildFront(ctx, tokens)),
    frame(FRAME.supportHatch, cell, (ctx) => drawSupportHatch(ctx, { mode }, tokens)),
    ...BADGE_KINDS.map((kind) =>
      frame(badgeFrameName(kind), badgeSize({ kind, mode }, tokens), (ctx) =>
        drawGhostBadge(ctx, { kind, mode }, tokens),
      ),
    ),
    frame(FRAME.blueprintFloor, { w: siteW, h: siteW }, (ctx) =>
      drawBlueprintFloor(ctx, { w: siteW, h: siteW, seed: BLUEPRINT_SEED }, tokens),
    ),
    frame(FRAME.blueprintDeep, cell, (ctx) => drawBlueprintDeep(ctx, cell, tokens)),
    frame(FRAME.blueprintCorner, blueprintCornerSize(tokens), (ctx) => drawBlueprintCorner(ctx, tokens)),
    frame(FRAME.yardFloor, yardFloorSize(tokens), (ctx) => drawYardFloor(ctx, tokens)),
    frame(FRAME.scaffoldPole, { w: ART.scaffoldPolePx, h: STRETCH_PX }, (ctx) =>
      drawScaffoldPole(ctx, { length: STRETCH_PX }, tokens),
    ),
    frame(FRAME.scaffoldLedger, { w: STRETCH_PX, h: ART.scaffoldLedgerPx }, (ctx) =>
      drawScaffoldLedger(ctx, { length: STRETCH_PX }, tokens),
    ),
    frame(FRAME.scaffoldClamp, scaffoldClampSize(), (ctx) => drawScaffoldClamp(ctx, tokens)),
    frame(FRAME.ceilingBeam, { w: STRETCH_PX, h: tokens.plan.ceilingBeamPx }, (ctx) =>
      drawCeilingBeam(ctx, { length: STRETCH_PX }, tokens),
    ),
    frame(FRAME.gapRail, gapRailSize({ length: STRETCH_PX }), (ctx) =>
      drawGapRail(ctx, { length: STRETCH_PX }, tokens),
    ),
    frame(FRAME.craneLine, { w: boardW, h: ART.craneLinePx }, (ctx) =>
      drawCraneLine(ctx, { length: boardW }, tokens),
    ),
    frame(FRAME.whitePixel, { w: 4, h: 4 }, (ctx) => drawWhitePixel(ctx, { w: 4, h: 4 })),
  ];
}

/** Baked flags of a compiled piece's flag bits (state FLAG_BIT). */
export function bakedFlagsOf(bits: number): BakedFlag[] {
  return BAKED_FLAGS.filter((f) => (bits & FLAG_BIT[f]) !== 0);
}

/** Frames of one block combination (also used for on-demand bakes: paint booster / paint gate colours, K-38, W6). */
export function blockFrame(spec: BlockSpec, tokens: Tokens): FrameSpec {
  return frame(
    blockFrameName(spec.shape, spec.color, spec.flags ?? []),
    blockSize(spec.shape, tokens),
    (ctx) => drawBlock(ctx, spec, tokens),
  );
}

/** Silhouette and ghost frames of one shape (anchored at the block box). */
export function shapeFrames(shape: ShapeId, tokens: Tokens, mode: DrawMode = DEFAULT_MODE): FrameSpec[] {
  const out: FrameSpec[] = [];
  const sameBlur = tokens.shadow.crane.blur === tokens.shadow.lifted.blur;
  const kinds: SilhouetteKind[] = sameBlur ? ['contact', 'lifted'] : ['contact', 'lifted', 'crane'];
  for (const kind of kinds) {
    const pad = silhouettePad(kind, tokens);
    out.push(
      frame(
        silhouetteFrameName(shape, kind),
        silhouetteSize({ shape, kind }, tokens),
        (ctx) => drawSilhouette(ctx, { shape, kind }, tokens),
        {
          anchorX: pad,
          anchorY: pad,
          aliases: kind === 'lifted' && sameBlur ? [silhouetteFrameName(shape, 'crane')] : [],
        },
      ),
    );
  }
  const pad = ghostPad(tokens, mode);
  for (const style of GHOST_STYLES) {
    out.push(
      frame(
        ghostFrameName(shape, style),
        ghostSize({ shape, style, mode }, tokens),
        (ctx) => drawGhost(ctx, { shape, style, mode }, tokens),
        { anchorX: pad, anchorY: pad },
      ),
    );
  }
  return out;
}

/**
 * TECH §10.2 (b): level frames. Pieces of every batch (truck batches included, known from the level data) and debris;
 * D2 help slots are coloured at runtime and baked on demand with `blockFrame`. Shapes are the canonical ids the core
 * stores (K-44), so `O4_90` pieces share the `O4_0` frame.
 */
export function levelFrames(
  level: CompiledLevel,
  tokens: Tokens,
  mode: DrawMode = DEFAULT_MODE,
): FrameSpec[] {
  const combos = new Map<string, BlockSpec>();
  const shapes = new Set<ShapeId>();
  for (const p of level.pieces) {
    if (p.origin === 'help') continue;
    const shape = shapeByIndex(p.shapeIndex).id;
    const color = COLOR_CODES[p.colorIndex];
    if (color === undefined) throw new RangeError(`levelFrames: bad colour index ${p.colorIndex}`);
    const flags = bakedFlagsOf(p.flags);
    combos.set(blockFrameName(shape, color, flags), { shape, color, flags, mode });
    shapes.add(shape);
  }
  const out: FrameSpec[] = [];
  for (const spec of combos.values()) out.push(blockFrame(spec, tokens));
  for (const shape of shapes) out.push(...shapeFrames(shape, tokens, mode));

  const cols = tokens.layout.grid.buildCols;
  const heights = new Set(level.segments.map((s) => s.height));
  for (const rows of heights) {
    out.push(
      frame(gridFrameName(rows), blueprintGridSize({ rows, cols }, tokens), (ctx) =>
        drawBlueprintGrid(ctx, { rows, cols }, tokens),
      ),
    );
  }
  for (const seg of level.segments) {
    const dots: { x: number; y: number }[] = [];
    seg.planColors.forEach((v, i) => {
      if (v === PLAN_DOT) dots.push({ x: i % cols, y: Math.floor(i / cols) });
    });
    if (dots.length === 0) continue;
    const spec = { rows: seg.height, cols, dots };
    out.push(
      frame(dotsFrameName(seg.index), blueprintGridSize(spec, tokens), (ctx) =>
        drawPlanDots(ctx, spec, tokens),
      ),
    );
  }

  const wall = {
    height: level.wallHeight,
    gaps: level.gaps.map((g) => ({ y: g.y, size: g.size, type: g.type })),
  };
  const size = wallSize(wall, tokens);
  if (size.w > 0) {
    const off = wallFrameOffset(tokens);
    out.push(
      frame(FRAME.wall, size, (ctx) => drawWall(ctx, wall, tokens), { anchorX: -off.x, anchorY: -off.y }),
    );
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// Upload (Phaser)

/** Where a named frame lives after upload. Place an image at the logical top-left with origin (anchorX/w, anchorY/h). */
export interface FrameRef {
  readonly key: string;
  readonly frame: string;
  readonly w: number;
  readonly h: number;
  readonly anchorX: number;
  readonly anchorY: number;
}

export interface UploadedAtlas {
  /** Phaser texture keys, one per page (`key`, then `key#1`, `key#2` …). */
  readonly keys: readonly string[];
  readonly index: ReadonlyMap<string, FrameRef>;
  /** Re-uploads every page from its kept canvas (Phaser `RESTORE_WEBGL`, TECH §10.2). */
  refresh(): void;
}

export const pageKey = (key: string, page: number): string => (page === 0 ? key : `${key}#${page}`);

/**
 * The only Phaser-facing function of the theme layer: one `CanvasTexture` per page, frames drawn with Canvas2D,
 * frames (and aliases) registered, one `refresh()` per page. An existing texture with the same key is replaced
 * (colour-blind re-bake, level restart).
 */
export function uploadAtlas(
  textures: Phaser.Textures.TextureManager,
  key: string,
  pages: readonly AtlasPage[],
): UploadedAtlas {
  const index = new Map<string, FrameRef>();
  const uploaded: Phaser.Textures.CanvasTexture[] = [];
  const keys = pages.map((page, i) => {
    const k = pageKey(key, i);
    if (textures.exists(k)) textures.remove(k);
    const tex = textures.createCanvas(k, page.width, page.height);
    if (!tex) throw new Error(`uploadAtlas: could not create canvas texture ${k}`);
    renderPage(tex.context, page);
    for (const f of page.frames) {
      for (const name of [f.name, ...f.aliases]) {
        tex.add(name, 0, f.x, f.y, f.w, f.h);
        index.set(name, { key: k, frame: name, w: f.w, h: f.h, anchorX: f.anchorX, anchorY: f.anchorY });
      }
    }
    tex.refresh();
    uploaded.push(tex);
    return k;
  });
  return {
    keys,
    index,
    refresh: () => {
      for (const tex of uploaded) tex.refresh();
    },
  };
}

/** Looks a frame up; a missing frame is a programming error (boot / bake did not include it). */
export function frameRef(index: ReadonlyMap<string, FrameRef>, name: string): FrameRef {
  const ref = index.get(name);
  if (!ref) throw new Error(`texture frame ${name} was not baked`);
  return ref;
}
