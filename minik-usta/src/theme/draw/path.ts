/**
 * Path geometry for the drawers: rounded rectangles, the continuous outline of a polyomino with rounded outer and
 * concave inner corners (ART_DIRECTION §3 layer 1/6), and a tiny SVG path parser for the symbol recipes (ART §3.1).
 * Canvas coordinates: origin top-left, y DOWN. Pure functions; no Path2D (see draw/context.ts).
 */
import type { Cell } from '../../core/shapes.ts';
import type { DrawContext } from './context.ts';

export interface Point {
  readonly x: number;
  readonly y: number;
}

/** A corner of a rectilinear outline; `convex` = turns towards the inside (clockwise traversal, interior on the right). */
export interface Corner extends Point {
  readonly convex: boolean;
}

/** `beginPath` + rounded rectangle (radius clamped to half the short side). Uses `arcTo` (works on iOS 15). */
export function roundRectPath(ctx: DrawContext, x: number, y: number, w: number, h: number, r: number): void {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/** Grid cells of a shape in canvas order: column = x, row = h − 1 − y (shape cells are y-up, K-01). */
export function canvasCells(cells: readonly Cell[], shapeH: number): Point[] {
  return cells.map((c) => ({ x: c.x, y: shapeH - 1 - c.y }));
}

const key = (x: number, y: number): string => `${x},${y}`;

/**
 * Outline of a hole-free polyomino given by canvas cells (column, row), in px (`cellPx` per cell), clockwise on screen,
 * collinear points merged, starting at the top-left-most corner. Throws for disconnected or pinched cell sets.
 */
export function polyominoOutline(cells: readonly Point[], cellPx: number): Corner[] {
  const set = new Set(cells.map((c) => key(c.x, c.y)));
  const has = (x: number, y: number): boolean => set.has(key(x, y));
  // Directed boundary edges, interior on the right-hand side (y down).
  const next = new Map<string, Point>();
  const add = (ax: number, ay: number, bx: number, by: number): void => {
    const k = key(ax, ay);
    if (next.has(k)) throw new RangeError('polyominoOutline: pinched or disconnected cell set');
    next.set(k, { x: bx, y: by });
  };
  for (const { x, y } of cells) {
    if (!has(x, y - 1)) add(x, y, x + 1, y);
    if (!has(x + 1, y)) add(x + 1, y, x + 1, y + 1);
    if (!has(x, y + 1)) add(x + 1, y + 1, x, y + 1);
    if (!has(x - 1, y)) add(x, y + 1, x, y);
  }
  let start: Point | null = null;
  for (const k of next.keys()) {
    const [sx, sy] = k.split(',').map(Number) as [number, number];
    if (start === null || sy < start.y || (sy === start.y && sx < start.x)) start = { x: sx, y: sy };
  }
  if (start === null) throw new RangeError('polyominoOutline: empty cell set');
  const loop: Point[] = [];
  let p: Point = start;
  do {
    loop.push(p);
    const q = next.get(key(p.x, p.y));
    if (!q) throw new RangeError('polyominoOutline: open boundary');
    p = q;
  } while ((p.x !== start.x || p.y !== start.y) && loop.length <= next.size);
  if (loop.length !== next.size) throw new RangeError('polyominoOutline: disconnected cell set');

  const corners: Corner[] = [];
  const n = loop.length;
  for (let i = 0; i < n; i++) {
    const a = loop[(i + n - 1) % n] as Point;
    const b = loop[i] as Point;
    const c = loop[(i + 1) % n] as Point;
    const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    if (cross !== 0) corners.push({ x: b.x * cellPx, y: b.y * cellPx, convex: cross > 0 });
  }
  return corners;
}

const unit = (from: Point, to: Point): Point => {
  const dx = Math.sign(to.x - from.x);
  const dy = Math.sign(to.y - from.y);
  return { x: dx, y: dy };
};

/** Offsets a clockwise rectilinear outline inward by `d` px (each edge moves along its inward normal). */
export function insetOutline(corners: readonly Corner[], d: number): Corner[] {
  const n = corners.length;
  return corners.map((v, i) => {
    const prev = corners[(i + n - 1) % n] as Corner;
    const nxt = corners[(i + 1) % n] as Corner;
    const a = unit(prev, v);
    const b = unit(v, nxt);
    // Inward normal of a direction (interior on the right, y down): (−dy, dx).
    return { x: v.x + d * (-a.y - b.y), y: v.y + d * (a.x + b.x), convex: v.convex };
  });
}

/** `beginPath` + the outline with `arcTo` corners: radius `rConvex` on outer corners, `rConcave` on inner ones. */
export function traceRoundedOutline(
  ctx: DrawContext,
  corners: readonly Corner[],
  rConvex: number,
  rConcave: number,
): void {
  const n = corners.length;
  const last = corners[n - 1] as Corner;
  const first = corners[0] as Corner;
  ctx.beginPath();
  ctx.moveTo((last.x + first.x) / 2, (last.y + first.y) / 2);
  for (let i = 0; i < n; i++) {
    const v = corners[i] as Corner;
    const nxt = corners[(i + 1) % n] as Corner;
    ctx.arcTo(v.x, v.y, nxt.x, nxt.y, v.convex ? rConvex : rConcave);
  }
  ctx.closePath();
}

/** Parsed SVG path command (absolute coordinates). */
export type PathOp =
  | readonly ['M', number, number]
  | readonly ['L', number, number]
  | readonly ['C', number, number, number, number, number, number]
  | readonly ['Q', number, number, number, number]
  | readonly ['Z'];

const ARITY: Readonly<Record<string, number>> = { M: 2, L: 2, H: 1, V: 1, C: 6, Q: 4, Z: 0 };

/**
 * Parses the absolute SVG path subset used by ART §3.1 (M, L, H, V, C, Q, Z; implicit repeats allowed, `M` repeats
 * as `L`). Throws on anything else, so a recipe typo fails loudly at module load.
 */
export function parseSvgPath(d: string): PathOp[] {
  const tokens = d.match(/[A-Za-z]|-?(?:\d+\.?\d*|\.\d+)(?:e-?\d+)?/g) ?? [];
  const ops: PathOp[] = [];
  let i = 0;
  let cmd = '';
  let cx = 0;
  let cy = 0;
  let sx = 0;
  let sy = 0;
  const num = (): number => {
    const t = tokens[i++];
    const v = Number(t);
    if (t === undefined || Number.isNaN(v)) throw new SyntaxError(`parseSvgPath: number expected in "${d}"`);
    return v;
  };
  while (i < tokens.length) {
    const t = tokens[i] as string;
    if (/[A-Za-z]/.test(t)) {
      if (!(t in ARITY)) throw new SyntaxError(`parseSvgPath: unsupported command ${t} in "${d}"`);
      cmd = t;
      i++;
      if (cmd === 'Z') {
        ops.push(['Z']);
        cx = sx;
        cy = sy;
        continue;
      }
    } else if (cmd === '' || cmd === 'Z') {
      throw new SyntaxError(`parseSvgPath: command expected in "${d}"`);
    }
    switch (cmd) {
      case 'M':
        cx = num();
        cy = num();
        sx = cx;
        sy = cy;
        ops.push(['M', cx, cy]);
        cmd = 'L';
        break;
      case 'L':
        cx = num();
        cy = num();
        ops.push(['L', cx, cy]);
        break;
      case 'H':
        cx = num();
        ops.push(['L', cx, cy]);
        break;
      case 'V':
        cy = num();
        ops.push(['L', cx, cy]);
        break;
      case 'C': {
        const x1 = num();
        const y1 = num();
        const x2 = num();
        const y2 = num();
        cx = num();
        cy = num();
        ops.push(['C', x1, y1, x2, y2, cx, cy]);
        break;
      }
      case 'Q': {
        const x1 = num();
        const y1 = num();
        cx = num();
        cy = num();
        ops.push(['Q', x1, y1, cx, cy]);
        break;
      }
    }
  }
  return ops;
}

/** Appends parsed ops to the current path (no `beginPath`). */
export function replayPath(ctx: DrawContext, ops: readonly PathOp[]): void {
  for (const op of ops) {
    switch (op[0]) {
      case 'M':
        ctx.moveTo(op[1], op[2]);
        break;
      case 'L':
        ctx.lineTo(op[1], op[2]);
        break;
      case 'C':
        ctx.bezierCurveTo(op[1], op[2], op[3], op[4], op[5], op[6]);
        break;
      case 'Q':
        ctx.quadraticCurveTo(op[1], op[2], op[3], op[4]);
        break;
      case 'Z':
        ctx.closePath();
        break;
    }
  }
}

/**
 * Parallel hatch lines `x + y = k·period` (45°, rising to the right on screen) covering the `w × h` box at the origin.
 */
export function hatch45(ctx: DrawContext, w: number, h: number, period: number): void {
  ctx.beginPath();
  for (let k = 0; k * period <= w + h; k++) {
    const s = k * period;
    ctx.moveTo(s, 0);
    ctx.lineTo(0, s);
  }
}
