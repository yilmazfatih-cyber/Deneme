/**
 * Pure part of `BakedGraphics` (docs/TECH_DESIGN.md §10.6 "her karede yeniden çizilen `Graphics` yok"): reads a Phaser
 * `Graphics` command buffer, measures what it draws and replays it into a Canvas 2D context once, so the shape can be
 * shown as one textured quad instead of being re-tessellated (paths through Earcut) on every WebGL frame.
 *
 * The replay follows Phaser 4.2.1's WebGL renderer (phaser/src/gameobjects/graphics/GraphicsWebGLRenderer.js), not the
 * Canvas one, so a baked shape looks like the live one: every sub-path of a fill or stroke is drawn on its own (no
 * even-odd / non-zero interaction between sub-paths), `CLOSE_PATH` closes the last sub-path only, `BEGIN_PATH` drops
 * the sub-paths. Transforms (`translateCanvas` …) and gradient styles are not replayed: such a buffer is reported as
 * `unsupported` and the caller keeps rendering it live.
 */

/** Command ids of Phaser 4.2.1 `Graphics` (phaser/src/gameobjects/graphics/Commands.js). */
export const GFX = {
  ARC: 0,
  BEGIN_PATH: 1,
  CLOSE_PATH: 2,
  FILL_RECT: 3,
  LINE_TO: 4,
  MOVE_TO: 5,
  LINE_STYLE: 6,
  FILL_STYLE: 7,
  FILL_PATH: 8,
  STROKE_PATH: 9,
  FILL_TRIANGLE: 10,
  STROKE_TRIANGLE: 11,
  SAVE: 14,
  RESTORE: 15,
  TRANSLATE: 16,
  SCALE: 17,
  ROTATE: 18,
  GRADIENT_FILL_STYLE: 21,
  GRADIENT_LINE_STYLE: 22,
} as const;

/** Values that follow each replayable command id in the buffer. */
const ARGS: Readonly<Record<number, number>> = {
  [GFX.ARC]: 7,
  [GFX.BEGIN_PATH]: 0,
  [GFX.CLOSE_PATH]: 0,
  [GFX.FILL_RECT]: 4,
  [GFX.LINE_TO]: 2,
  [GFX.MOVE_TO]: 2,
  [GFX.LINE_STYLE]: 3,
  [GFX.FILL_STYLE]: 2,
  [GFX.FILL_PATH]: 0,
  [GFX.STROKE_PATH]: 0,
  [GFX.FILL_TRIANGLE]: 6,
  [GFX.STROKE_TRIANGLE]: 6,
};

/** Extra pixels around the drawn area (Canvas 2D antialiasing). */
export const BAKE_PAD_PX = 2;

/** Integer pixel box in the Graphics' local space. */
export interface BakeBox {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

type Buffer = readonly unknown[];

const num = (buf: Buffer, i: number): number => Number(buf[i]);

/**
 * Local-space box that holds everything the buffer draws (strokes widened by half their line width, plus
 * `BAKE_PAD_PX`); `null` when nothing is drawn; `'unsupported'` when the buffer holds a command the replay does not
 * reproduce (transforms, gradients, an unknown id).
 */
export function commandBounds(buf: Buffer): BakeBox | null | 'unsupported' {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxLine = 0;
  let drawn = false;
  const add = (x: number, y: number, r = 0): void => {
    minX = Math.min(minX, x - r);
    minY = Math.min(minY, y - r);
    maxX = Math.max(maxX, x + r);
    maxY = Math.max(maxY, y + r);
  };
  for (let i = 0; i < buf.length; i++) {
    const id = num(buf, i);
    const args = ARGS[id];
    if (args === undefined) return 'unsupported';
    switch (id) {
      case GFX.ARC:
        add(num(buf, i + 1), num(buf, i + 2), Math.abs(num(buf, i + 3)));
        break;
      case GFX.FILL_RECT: {
        const x = num(buf, i + 1);
        const y = num(buf, i + 2);
        add(x, y);
        add(x + num(buf, i + 3), y + num(buf, i + 4));
        drawn = true;
        break;
      }
      case GFX.LINE_TO:
      case GFX.MOVE_TO:
        add(num(buf, i + 1), num(buf, i + 2));
        break;
      case GFX.FILL_TRIANGLE:
      case GFX.STROKE_TRIANGLE:
        for (let k = 0; k < 3; k++) add(num(buf, i + 1 + 2 * k), num(buf, i + 2 + 2 * k));
        drawn = true;
        break;
      case GFX.LINE_STYLE:
        maxLine = Math.max(maxLine, Math.abs(num(buf, i + 1)));
        break;
      case GFX.FILL_PATH:
      case GFX.STROKE_PATH:
        drawn = true;
        break;
      default:
        break;
    }
    i += args;
  }
  if (!drawn || !Number.isFinite(minX) || !Number.isFinite(minY)) return null;
  const pad = Math.ceil(maxLine / 2) + BAKE_PAD_PX;
  const x = Math.floor(minX) - pad;
  const y = Math.floor(minY) - pad;
  return { x, y, w: Math.ceil(maxX) + pad - x, h: Math.ceil(maxY) + pad - y };
}

/** The Canvas 2D calls the replay uses (a real context, or a recorder in tests). */
export interface BakeContext {
  fillStyle: string | CanvasGradient | CanvasPattern;
  strokeStyle: string | CanvasGradient | CanvasPattern;
  lineWidth: number;
  beginPath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  arc(x: number, y: number, radius: number, start: number, end: number, anticlockwise?: boolean): void;
  closePath(): void;
  fill(): void;
  stroke(): void;
  fillRect(x: number, y: number, w: number, h: number): void;
}

type Seg =
  | { readonly k: 'move' | 'line'; readonly x: number; readonly y: number }
  | {
      readonly k: 'arc';
      readonly x: number;
      readonly y: number;
      readonly r: number;
      readonly a0: number;
      readonly a1: number;
      readonly ccw: boolean;
    }
  | { readonly k: 'close' };

const rgba = (color: number, alpha: number): string =>
  `rgba(${(color >>> 16) & 0xff},${(color >>> 8) & 0xff},${color & 0xff},${alpha})`;

function trace(ctx: BakeContext, path: readonly Seg[], dx: number, dy: number): void {
  ctx.beginPath();
  for (const s of path) {
    if (s.k === 'move') ctx.moveTo(s.x - dx, s.y - dy);
    else if (s.k === 'line') ctx.lineTo(s.x - dx, s.y - dy);
    else if (s.k === 'arc') ctx.arc(s.x - dx, s.y - dy, s.r, s.a0, s.a1, s.ccw);
    else ctx.closePath();
  }
}

/**
 * Replays the buffer into `ctx` with local point (`box.x`, `box.y`) at the canvas origin. Style alphas are applied as
 * they are; the object's own alpha is left to the quad that shows the bake.
 */
export function replayCommands(ctx: BakeContext, buf: Buffer, box: BakeBox): void {
  const dx = box.x;
  const dy = box.y;
  let paths: Seg[][] = [];
  let last: Seg[] | null = null;
  const current = (): Seg[] => {
    if (!last) {
      last = [];
      paths.push(last);
    }
    return last;
  };
  for (let i = 0; i < buf.length; i++) {
    const id = num(buf, i);
    const args = ARGS[id];
    if (args === undefined) return;
    switch (id) {
      case GFX.BEGIN_PATH:
        paths = [];
        last = null;
        break;
      case GFX.CLOSE_PATH:
        if (last && last.length > 0) last.push({ k: 'close' });
        break;
      case GFX.MOVE_TO:
        last = [{ k: 'move', x: num(buf, i + 1), y: num(buf, i + 2) }];
        paths.push(last);
        break;
      case GFX.LINE_TO:
        current().push({ k: 'line', x: num(buf, i + 1), y: num(buf, i + 2) });
        break;
      case GFX.ARC:
        current().push({
          k: 'arc',
          x: num(buf, i + 1),
          y: num(buf, i + 2),
          r: Math.abs(num(buf, i + 3)),
          a0: num(buf, i + 4),
          a1: num(buf, i + 5),
          ccw: Boolean(buf[i + 6]),
        });
        break;
      case GFX.FILL_STYLE:
        ctx.fillStyle = rgba(num(buf, i + 1), num(buf, i + 2));
        break;
      case GFX.LINE_STYLE:
        ctx.lineWidth = num(buf, i + 1);
        ctx.strokeStyle = rgba(num(buf, i + 2), num(buf, i + 3));
        break;
      case GFX.FILL_PATH:
        for (const p of paths) {
          trace(ctx, p, dx, dy);
          ctx.fill();
        }
        break;
      case GFX.STROKE_PATH:
        for (const p of paths) {
          trace(ctx, p, dx, dy);
          ctx.stroke();
        }
        break;
      case GFX.FILL_RECT:
        ctx.fillRect(num(buf, i + 1) - dx, num(buf, i + 2) - dy, num(buf, i + 3), num(buf, i + 4));
        break;
      case GFX.FILL_TRIANGLE:
      case GFX.STROKE_TRIANGLE:
        ctx.beginPath();
        ctx.moveTo(num(buf, i + 1) - dx, num(buf, i + 2) - dy);
        ctx.lineTo(num(buf, i + 3) - dx, num(buf, i + 4) - dy);
        ctx.lineTo(num(buf, i + 5) - dx, num(buf, i + 6) - dy);
        ctx.closePath();
        if (id === GFX.FILL_TRIANGLE) ctx.fill();
        else ctx.stroke();
        break;
      default:
        break;
    }
    i += args;
  }
}
