/**
 * Tutorial highlight ids → screen rectangles (UX_FLOWS §13.1 "Vurgu kimlikleri"; TECH_DESIGN §8.2) and the spotlight
 * hole geometry (UX §13.1 "Spot ışığı": rounded holes with a 12 px pad; JUICE §0 rule 11: no mask, no filter — the dark
 * layer is rectangles around the holes). Pure: layout geometry + state reads, no Phaser.
 */
import { SITE_X } from '../../../core/coords.ts';
import { buildFront } from '../../../core/placement.ts';
import { Zone } from '../../../core/types.ts';
import { shapeByIndex } from '../../../core/shapes.ts';
import { GF, gapField, pieceShape, pieceZone } from '../../../core/state.ts';
import type { GameState } from '../../../core/state.ts';
import type { CompiledLevel } from '../../../core/level/compile.ts';
import { rectBottom, rectRight, rectsOverlap } from '../../../theme/layout.ts';
import type { Layout, Rect } from '../../../theme/layout.ts';
import { statePose } from '../pieceState.ts';

/** HUD rectangles the level screen knows (status strip parts are drawn by `ui/StatusStrip`). */
export interface HudRects {
  readonly truck: Rect | null;
  readonly streak: Rect | null;
}

export interface HighlightInput {
  readonly layout: Layout;
  readonly state: GameState;
  readonly level: CompiledLevel;
  readonly hud: HudRects;
  /** The block being dragged and its current drag node: its `piece:` hole is there (review Faz 2 tur 1 #4). */
  readonly dragging?: { readonly pieceId: number; readonly ix: number; readonly iy: number } | null;
}

/** Rectangles of one highlight id (empty when the thing is not on screen, e.g. a booster slot in Phase 2). */
export function highlightRects(id: string, input: HighlightInput): Rect[] {
  const { layout, state: s, level } = input;
  const g = layout.grid;
  if (id.startsWith('piece:') || id.startsWith('debris:') || id.startsWith(PID_PREFIX)) {
    const pid = id.startsWith(PID_PREFIX) ? runtimePieceId(id, s) : level.tutorialPieceIds.get(id);
    if (pid === undefined) return [];
    const shape = shapeByIndex(pieceShape(s, pid));
    const drag = input.dragging;
    if (drag && drag.pieceId === pid) return [g.pieceRect(drag.ix, drag.iy, shape.w, shape.h)];
    const pose = statePose(s, pid);
    if (!pose) return [];
    return [g.pieceRect(pose.ax, pose.ay, shape.w, shape.h)];
  }
  if (id.startsWith('cell:')) {
    const [x, y] = id
      .slice(5)
      .split(',')
      .map((v) => Number(v));
    if (x === undefined || y === undefined || !Number.isFinite(x) || !Number.isFinite(y)) return [];
    return [g.cellRect(x, y)];
  }
  if (id.startsWith('gap:')) {
    const i = Number(id.slice(4));
    const gap = level.gaps[i];
    if (!gap) return [];
    return [g.gapRect(gapField(s, i, GF.y), gap.size)];
  }
  switch (id) {
    case 'crane':
      return [layout.board.crane];
    case 'build':
      return [layout.board.site];
    case 'wall':
      return [g.wallRect(level.wallHeight)];
    case 'front':
      return buildFront(s).map((c) => g.cellRect(c.x, c.y));
    case 'panorama':
      return [layout.top.panorama];
    case 'goals':
      return [layout.top.goals];
    case 'moves':
      return [layout.top.moves];
    case 'truck':
      return input.hud.truck ? [input.hud.truck] : [];
    case 'streak':
      return input.hud.streak ? [input.hud.streak] : [];
    default:
      return []; // booster:*, pre:*, obstacle:*, fan: not on the Phase 2 screen
  }
}

/**
 * Runtime highlight id of one block by its `PieceId` (contextual tips light the block of their trigger — the bounced or
 * the blocked block, review Faz 2 tur 2 #18 — which need not have a `piece:<i>` tutorial id). Not a level-data id.
 */
export const PID_PREFIX = 'pid:';
export const pidHighlight = (id: number): string => `${PID_PREFIX}${id}`;

function runtimePieceId(id: string, s: GameState): number | undefined {
  const n = Number(id.slice(PID_PREFIX.length));
  return Number.isInteger(n) && n >= 0 && n < s.lvl.layout.counts.pieces ? n : undefined;
}

export function highlightAll(ids: readonly string[], input: HighlightInput): Rect[] {
  return ids.flatMap((id) => highlightRects(id, input));
}

export function padRect(r: Rect, pad: number): Rect {
  return { x: r.x - pad, y: r.y - pad, w: r.w + 2 * pad, h: r.h + 2 * pad };
}

function union(a: Rect, b: Rect): Rect {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, w: Math.max(rectRight(a), rectRight(b)) - x, h: Math.max(rectBottom(a), rectBottom(b)) - y };
}

/**
 * Spotlight holes: every rect padded by `pad`, then overlapping holes merged into their bounding box until no two
 * overlap (the corner pieces of a rounded hole then never fall into another hole).
 */
export function spotlightHoles(rects: readonly Rect[], pad: number): Rect[] {
  const holes = rects.map((r) => padRect(r, pad));
  let merged = true;
  while (merged) {
    merged = false;
    outer: for (let i = 0; i < holes.length; i++) {
      for (let j = i + 1; j < holes.length; j++) {
        const a = holes[i] as Rect;
        const b = holes[j] as Rect;
        if (rectsOverlap(a, b)) {
          holes[i] = union(a, b);
          holes.splice(j, 1);
          merged = true;
          break outer;
        }
      }
    }
  }
  return holes;
}

export interface Spotlight {
  /** Rounded holes (merged boxes). */
  readonly holes: Rect[];
  /**
   * The parts of merged holes that belong to no highlight (UX §13.1 "Birleşen delik", review Faz 2 tur 2 #0): dark at
   * the same alpha as the layer around, cornerless rectangles — only the highlighted things are lit.
   */
  readonly fills: Rect[];
}

/** Holes of `rects` (padded by `pad`, merged) and the unlit parts of every merged hole. */
export function spotlight(rects: readonly Rect[], pad: number): Spotlight {
  const padded = rects.map((r) => padRect(r, pad));
  const holes = spotlightHoles(rects, pad);
  const fills = holes.flatMap((h) => {
    const members = padded.filter((p) => containsRect(h, p));
    return members.length > 1 ? darkRects(h, members) : [];
  });
  return { holes, fills };
}

function containsRect(outer: Rect, r: Rect): boolean {
  return (
    r.x >= outer.x && r.y >= outer.y && rectRight(r) <= rectRight(outer) && rectBottom(r) <= rectBottom(outer)
  );
}

/**
 * Required step (UX §13.1): the invisible zones that swallow touches — the dark layer and the fills — minus `open`, the
 * hit rects that stay touchable through the spotlight (the pause button, review Faz 2 tur 2 #9: the Pause window, its
 * settings and "Bölümden çık" are reachable at every step).
 */
export function blockerRects(screen: Rect, sp: Spotlight, open: readonly Rect[]): Rect[] {
  return [...darkRects(screen, [...sp.holes, ...open]), ...sp.fills.flatMap((f) => darkRects(f, open))];
}

/**
 * The dark layer around the holes as non-overlapping rectangles covering `screen` minus the holes (horizontal bands
 * between the holes' y edges; in each band the x intervals outside every hole).
 */
export function darkRects(screen: Rect, holes: readonly Rect[]): Rect[] {
  const ys = new Set<number>([screen.y, rectBottom(screen)]);
  for (const h of holes) {
    ys.add(Math.min(Math.max(h.y, screen.y), rectBottom(screen)));
    ys.add(Math.min(Math.max(rectBottom(h), screen.y), rectBottom(screen)));
  }
  const edges = [...ys].sort((a, b) => a - b);
  const out: Rect[] = [];
  for (let i = 0; i + 1 < edges.length; i++) {
    const y0 = edges[i] as number;
    const y1 = edges[i + 1] as number;
    if (y1 <= y0) continue;
    const spans = holes
      .filter((h) => h.y < y1 && rectBottom(h) > y0)
      .map((h) => [Math.max(h.x, screen.x), Math.min(rectRight(h), rectRight(screen))] as const)
      .filter(([a, b]) => b > a)
      .sort((a, b) => a[0] - b[0]);
    let x = screen.x;
    for (const [a, b] of spans) {
      if (a > x) out.push({ x, y: y0, w: a - x, h: y1 - y0 });
      x = Math.max(x, b);
    }
    if (x < rectRight(screen)) out.push({ x, y: y0, w: rectRight(screen) - x, h: y1 - y0 });
  }
  return out;
}

/** Point inside any hole (required steps ignore touches outside the holes, UX §13.1). */
export function insideAny(holes: readonly Rect[], x: number, y: number): boolean {
  return holes.some((h) => x >= h.x && x < rectRight(h) && y >= h.y && y < rectBottom(h));
}

/**
 * Usta Dede bubble placement (UX §13.1 "Usta Dede balonu", Faz 2 tur 2b; review Faz 2 tur 2 #15). The bubble is bust +
 * 16 px + box at the left margin; it is placed at the step's start and on a resize (not when a hole follows its block).
 *
 * - Forbidden (the bubble never touches): the lit spotlight rects (12 px pad), the glove's path (the cell strips joining
 *   its points; a tap: its cell), the site column (`grid.wallX` → right, crane area top → row 0 bottom), the pause hit
 *   area, the lower half, and — in a soft step or a contextual tip — the yard's blocks (they are touchable; in a required
 *   step the non-highlighted blocks are dark and inert, so the bubble may sit on them).
 * - Penalties (touched only as a last resort): the goals panel, the moves counter, the panorama when it is not lit.
 * - Boxes: wide ≤ 760 px; narrow: right edge 16 px left of the wall (494 px at the 24 px margin). A text that needs more
 *   than 3 lines in a candidate's box makes that candidate invalid.
 * - Candidates in order: (1) under the HUD group, wide, only when it fits above the crane area; (2) the yard band, narrow,
 *   from row 7's top down past every forbidden area it touches (+16), none when it would cross `H / 2`; (3) the crane
 *   band, narrow; (4) the band over the HUD, wide, its bottom 16 px above the crane area (beside the pause button when it
 *   would touch it: x = pause right + 16, the box narrowed to the right margin); (5) above the status strip, narrow, 24 px
 *   over it.
 * - Choice: lexicographic — least forbidden overlap, then least penalty overlap, then the earlier candidate (a forbidden
 *   area always outweighs a penalty).
 */
export interface BubbleSize {
  /** Bust + 16 + box (design px). */
  readonly w: number;
  readonly h: number;
  /** Lines of the text in this box. */
  readonly lines: number;
}

export interface BubbleQuery {
  readonly layout: Layout;
  /** The lit spotlight rects, 12 px pad included (the highlight rects padded; merged-box fills are dark, not lit). */
  readonly lit: readonly Rect[];
  /** The glove's path in global cells (`hand.path`; a tap: its target cell); empty without a glove. */
  readonly handPath: readonly (readonly [number, number])[];
  /** Soft step or contextual tip: the yard's blocks (`yardBlockRects`); empty in a required step. */
  readonly yardBlocks: readonly Rect[];
  /** `panorama` is highlighted (then it is a lit rect, not a penalty). */
  readonly panoramaLit: boolean;
  /** Bubble size when its box is at most `boxMaxW` wide. */
  size(boxMaxW: number): BubbleSize;
}

export type BubbleCandidate = 1 | 2 | 3 | 4 | 5;

export interface BubblePlace {
  readonly candidate: BubbleCandidate;
  /** Box width limit of the chosen bubble variant. */
  readonly boxMaxW: number;
  /** Bust + bubble at its place. */
  readonly rect: Rect;
}

/** UX §13.1: the bubble's text needs at most this many lines in a candidate's box. */
export const BUBBLE_MAX_LINES = 3;
/** UX §13.1: gap under a forbidden area (yard band), under the HUD group and over the crane area. */
const BUBBLE_GAP_PX = 16;
/** UX §13.1 candidate 5: gap over the status strip. */
const BUBBLE_STATUS_GAP_PX = 24;

/** Box width limits of the three bubble variants (UX §13.1 "Kutu genişliği"). */
export function bubbleBoxWidths(
  layout: Layout,
  bustPx: number,
  wideMaxW: number,
  margin: number,
  pause: Rect,
): { readonly wide: number; readonly narrow: number; readonly besidePause: number } {
  const lead = bustPx + BUBBLE_GAP_PX; // bust + 16 before the box
  return {
    wide: wideMaxW,
    narrow: layout.grid.wallX - BUBBLE_GAP_PX - (margin + lead),
    besidePause: Math.min(wideMaxW, layout.W - margin - (rectRight(pause) + BUBBLE_GAP_PX + lead)),
  };
}

/**
 * Rects of the yard's blocks (soft steps and tips keep the bubble off them; UX §13.1); `dragged`, the block in the
 * player's hand, is not where its state says.
 */
export function yardBlockRects(layout: Layout, s: GameState, dragged: number | null = null): Rect[] {
  const out: Rect[] = [];
  for (let id = 0; id < s.lvl.layout.counts.pieces; id++) {
    if (id === dragged || pieceZone(s, id) !== Zone.yard) continue;
    const pose = statePose(s, id);
    if (!pose) continue;
    const shape = shapeByIndex(pieceShape(s, id));
    out.push(layout.grid.pieceRect(pose.ax, pose.ay, shape.w, shape.h));
  }
  return out;
}

/** The glove's path as cell strips: the box of every two consecutive points' cells; one point: its cell. */
export function handStrips(layout: Layout, path: readonly (readonly [number, number])[]): Rect[] {
  const cells = path.map(([x, y]) => layout.grid.cellRect(x, y));
  if (cells.length === 1) return [cells[0] as Rect];
  const out: Rect[] = [];
  for (let i = 1; i < cells.length; i++) out.push(union(cells[i - 1] as Rect, cells[i] as Rect));
  return out;
}

/** The site column: from the wall's left edge to the right, from the crane area's top to row 0's bottom. */
export function siteColumn(layout: Layout): Rect {
  const top = layout.board.crane.y;
  const bottom = rectBottom(layout.grid.cellRect(SITE_X, 0));
  return { x: layout.grid.wallX, y: top, w: layout.W - layout.grid.wallX, h: bottom - top };
}

/** Forbidden areas of a query (see `placeBubble`). */
export function bubbleForbidden(q: BubbleQuery, pause: Rect): Rect[] {
  const { layout } = q;
  return [
    ...q.lit,
    ...handStrips(layout, q.handPath),
    siteColumn(layout),
    pause,
    { x: 0, y: layout.H / 2, w: layout.W, h: layout.H / 2 },
    ...q.yardBlocks,
  ];
}

/** Penalty areas (the HUD the player reads; the panorama only when it is not lit). */
export function bubblePenalties(layout: Layout, panoramaLit: boolean): Rect[] {
  const out = [layout.top.goals, layout.top.moves];
  if (!panoramaLit) out.push(layout.top.panorama);
  return out;
}

export interface Scored extends BubblePlace {
  readonly lines: number;
}

/** UX §13.1 candidates 1–5 that exist on this layout (candidate 2 can be missing; see `placeBubble`). */
export function bubbleCandidates(
  q: BubbleQuery,
  margin: number,
  bustPx: number,
  wideMaxW: number,
  pause: Rect,
): Scored[] {
  return [...candidatesInOrder(q, margin, bustPx, wideMaxW, pause)];
}

/** The candidates one by one: a later one (and its box variant) is only sized when an earlier one is not free. */
function* candidatesInOrder(
  q: BubbleQuery,
  margin: number,
  bustPx: number,
  wideMaxW: number,
  pause: Rect,
): Generator<Scored> {
  const { layout } = q;
  const widths = bubbleBoxWidths(layout, bustPx, wideMaxW, margin, pause);
  const forbidden = bubbleForbidden(q, pause);
  const craneY = layout.board.crane.y;
  const at = (candidate: BubbleCandidate, boxMaxW: number, x: number, y: number, sz: BubbleSize): Scored => ({
    candidate,
    boxMaxW,
    rect: { x, y, w: sz.w, h: sz.h },
    lines: sz.lines,
  });

  // (1) under the HUD group, wide, only when it fits above the crane area
  const wide = q.size(widths.wide);
  const y1 = layout.top.groupBottomY + BUBBLE_GAP_PX;
  if (y1 + wide.h <= craneY) yield at(1, widths.wide, margin, y1, wide);

  // (2) the yard band, narrow: from row 7's top down past every forbidden area it touches
  const narrow = q.size(widths.narrow);
  let y2 = layout.grid.cellRect(0, 7).y;
  const half = layout.H / 2;
  for (;;) {
    const r = { x: margin, y: y2, w: narrow.w, h: narrow.h };
    if (rectBottom(r) > half) break;
    const hit = forbidden.filter((f) => overlapArea(r, [f]) > 0);
    if (hit.length === 0) {
      yield at(2, widths.narrow, margin, y2, narrow);
      break;
    }
    const next = Math.max(...hit.map(rectBottom)) + BUBBLE_GAP_PX;
    if (next <= y2) break;
    y2 = next;
  }

  // (3) the crane band, narrow
  yield at(3, widths.narrow, margin, craneY, narrow);

  // (4) over the HUD, wide, 16 px over the crane area; beside the pause button when it would touch it
  const r4 = { x: margin, y: craneY - BUBBLE_GAP_PX - wide.h, w: wide.w, h: wide.h };
  if (overlapArea(r4, [pause]) > 0) {
    const x = rectRight(pause) + BUBBLE_GAP_PX;
    const sz = q.size(widths.besidePause);
    yield at(4, widths.besidePause, x, craneY - BUBBLE_GAP_PX - sz.h, sz);
  } else yield at(4, widths.wide, margin, r4.y, wide);

  // (5) above the status strip, narrow (lower half: last resort)
  yield at(5, widths.narrow, margin, layout.board.status.y - BUBBLE_STATUS_GAP_PX - narrow.h, narrow);
}

/** The bubble's place (UX §13.1 "Seçim"): see the comment above `BubbleSize`. */
export function placeBubble(
  q: BubbleQuery,
  margin: number,
  bustPx: number,
  wideMaxW: number,
  pause: Rect,
): BubblePlace {
  const forbidden = bubbleForbidden(q, pause);
  const penalties = bubblePenalties(q.layout, q.panoramaLit);
  const seen: Scored[] = [];
  let best: Scored | null = null;
  let bestF = Infinity;
  let bestP = Infinity;
  for (const c of candidatesInOrder(q, margin, bustPx, wideMaxW, pause)) {
    seen.push(c);
    if (c.lines > BUBBLE_MAX_LINES) continue;
    const f = overlapArea(c.rect, forbidden);
    const p = overlapArea(c.rect, penalties);
    if (f === 0 && p === 0) return pick(c); // the first free candidate: the later ones are never sized
    if (f < bestF || (f === bestF && p < bestP)) {
      best = c;
      bestF = f;
      bestP = p;
    }
  }
  // no candidate fits its text in 3 lines: the first one anyway
  return pick(best ?? (seen[0] as Scored));
}

const pick = (c: Scored): BubblePlace => ({ candidate: c.candidate, boxMaxW: c.boxMaxW, rect: c.rect });

/** Area of `c` covered by `rects` (overlaps between `rects` counted once per rect). */
export function overlapArea(c: Rect, rects: readonly Rect[]): number {
  let area = 0;
  for (const h of rects) {
    const w = Math.min(rectRight(c), rectRight(h)) - Math.max(c.x, h.x);
    const hh = Math.min(rectBottom(c), rectBottom(h)) - Math.max(c.y, h.y);
    if (w > 0 && hh > 0) area += w * hh;
  }
  return area;
}
