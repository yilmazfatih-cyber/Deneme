/**
 * Tutorial highlight ids → screen rectangles (UX_FLOWS §13.1 "Vurgu kimlikleri"; TECH_DESIGN §8.2) and the spotlight
 * hole geometry (UX §13.1 "Spot ışığı": rounded holes with a 12 px pad; JUICE §0 rule 11: no mask, no filter — the dark
 * layer is rectangles around the holes). Pure: layout geometry + state reads, no Phaser.
 */
import { SITE_X } from '../../../core/coords.ts';
import { visibleSegment } from '../../../core/grid.ts';
import { buildFront } from '../../../core/placement.ts';
import { shapeByIndex } from '../../../core/shapes.ts';
import { GF, H, gapField, hdr, pieceShape } from '../../../core/state.ts';
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
 * Where the Usta Dede bubble goes (UX §13.1: upper half, never over what it explains): the first candidate band that
 * overlaps neither a hole, an avoided area nor a penalty area (the HUD the player reads: pause, goals, moves — review
 * Faz 2 tur 1 #3); else the one with the least overlap, a hole or an avoided area (`bubbleAvoid`: the plan the step
 * builds on, the lower half — review Faz 2 tur 2 #15) counting `HOLE_WEIGHT` times a penalty area.
 */
export function bubbleSpot(
  candidates: readonly Rect[],
  holes: readonly Rect[],
  penalties: readonly Rect[] = [],
  avoid: readonly Rect[] = [],
): Rect | null {
  let best: Rect | null = null;
  let bestScore = Infinity;
  for (const c of candidates) {
    const score = HOLE_WEIGHT * (overlapArea(c, holes) + overlapArea(c, avoid)) + overlapArea(c, penalties);
    if (score === 0) return c;
    if (score < bestScore) {
      bestScore = score;
      best = c;
    }
  }
  return best;
}

/** A hole is what the step explains: covering it is worse than covering a HUD part. */
export const HOLE_WEIGHT = 4;

function overlapArea(c: Rect, rects: readonly Rect[]): number {
  let area = 0;
  for (const h of rects) {
    const w = Math.min(rectRight(c), rectRight(h)) - Math.max(c.x, h.x);
    const hh = Math.min(rectBottom(c), rectBottom(h)) - Math.max(c.y, h.y);
    if (w > 0 && hh > 0) area += w * hh;
  }
  return area;
}

/**
 * Candidate bands of the bubble (`w × h`), in order (review Faz 2 tur 1 #3, tur 2 #15): (1) the band between the HUD
 * group and the crane area (`top.groupBottomY + gap` … `board.crane.y`, EXPAND: 216 px at 390 × 844, 248 px at
 * 360 × 800), at its top (clear of a crane-area hole's 12 px pad) — only when the bubble fits; (2) the crane band;
 * (3) under the holes of the upper half (`gap` below the lowest bottom of the holes that start above `H / 2`): on a
 * short screen (390 × 763, 360 × 740, 375 × 667) the band (1) is too low and the crane band is the level 1 step 1
 * hole, so the bubble goes over the yard rows under it, still in the upper half; (4) above the status strip; (5) the
 * top margin, last.
 */
export function bubbleCandidates(
  layout: Layout,
  w: number,
  h: number,
  margin: number,
  gap: number,
  holes: readonly Rect[] = [],
): Rect[] {
  const x = margin;
  const out: Rect[] = [];
  const bandTop = layout.top.groupBottomY + gap;
  const band = layout.board.crane.y - bandTop;
  if (h <= band) out.push({ x, y: bandTop, w, h });
  out.push({ x, y: layout.board.crane.y, w, h });
  const upper = holes.filter((r) => r.y < layout.H / 2);
  if (upper.length > 0) {
    const y = Math.max(...upper.map(rectBottom)) + gap;
    if (y + h <= layout.board.status.y) out.push({ x, y, w, h });
  }
  out.push({ x, y: layout.board.status.y - h - margin, w, h });
  out.push({ x, y: margin, w, h });
  return out;
}

/** HUD parts the bubble should not cover (penalty areas of `bubbleSpot`). */
export function hudPenalties(layout: Layout): Rect[] {
  return [layout.top.pause, layout.top.goals, layout.top.moves];
}

/**
 * Areas the bubble avoids like a hole (rules review Faz 2 tur 2 #15, UX §13.1 "ekranın üst yarısında (hedefi
 * kapatmayacak yerde)"): the plan of the segment on the site (where every step's block lands) and the lower half.
 */
export function bubbleAvoid(layout: Layout, s: GameState): Rect[] {
  const half: Rect = { x: 0, y: layout.H / 2, w: layout.W, h: layout.H / 2 };
  const seg = s.lvl.segments[visibleSegment(s)];
  if (!seg) return [half];
  const elev = hdr(s, H.elev);
  const g = layout.grid;
  const top = g.cellRect(SITE_X, elev + seg.height - 1);
  const bottom = g.cellRect(SITE_X, elev);
  const site = layout.board.site;
  return [half, { x: site.x, y: top.y, w: site.w, h: rectBottom(bottom) - top.y }];
}
