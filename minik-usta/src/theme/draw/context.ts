/**
 * The Canvas2D surface the drawers use (TECH_DESIGN §10.2: drawers are pure `(ctx, spec, tokens) => void`).
 *
 * A real `CanvasRenderingContext2D` (Phaser `CanvasTexture.context`, or a Chromium canvas in tools/level-preview.ts)
 * satisfies this type; tests use a recording mock. Drawers never create DOM objects (no `Path2D`, no `document`):
 * SVG path data is parsed into plain commands (draw/path.ts), so the same code runs in Node.
 */
export type DrawContext = Pick<
  CanvasRenderingContext2D,
  | 'save'
  | 'restore'
  | 'beginPath'
  | 'closePath'
  | 'moveTo'
  | 'lineTo'
  | 'arcTo'
  | 'arc'
  | 'ellipse'
  | 'bezierCurveTo'
  | 'quadraticCurveTo'
  | 'rect'
  | 'fill'
  | 'stroke'
  | 'clip'
  | 'fillRect'
  | 'clearRect'
  | 'translate'
  | 'scale'
  | 'rotate'
  | 'setLineDash'
  | 'fillText'
  | 'fillStyle'
  | 'strokeStyle'
  | 'lineWidth'
  | 'lineCap'
  | 'lineJoin'
  | 'lineDashOffset'
  | 'globalAlpha'
  | 'shadowColor'
  | 'shadowBlur'
  | 'shadowOffsetX'
  | 'shadowOffsetY'
  | 'font'
  | 'textAlign'
  | 'textBaseline'
>;

/** Size of a drawn frame in design px. */
export interface Size {
  readonly w: number;
  readonly h: number;
}

/** Draws `draw` with its origin at (x, y), clipped to the `w × h` frame (atlas frames never bleed into neighbours). */
export function drawInFrame(ctx: DrawContext, x: number, y: number, size: Size, draw: () => void): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.beginPath();
  ctx.rect(0, 0, size.w, size.h);
  ctx.clip();
  draw();
  ctx.restore();
}
