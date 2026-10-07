/**
 * Spotlight hole edges and dark corners from pre-drawn pieces (UX §13.1; TECH §10.6 "her karede yeniden çizilen
 * Graphics yok", review Faz 2 tur 1 #16): one small canvas texture (`tut_spot`, drawn once per game) holds a dark
 * corner (square minus a quarter circle) and a quarter-arc of the white edge; every hole is then 4 dark corners,
 * 4 edge arcs and 4 straight edge strips (the boot atlas white pixel, stretched). A spotlight change only moves images —
 * no bake, no texture upload (the baked Graphics it replaces re-uploaded a texture as large as all holes together on
 * every change, the longest frames of a drag at 4× CPU).
 */
import type Phaser from 'phaser';
import type { Rect } from '../../theme/layout.ts';
import { FRAME } from '../../theme/textures.ts';
import { TOKENS } from '../../theme/tokens.ts';
import { UI } from '../../ui/uiConstants.ts';
import { BOOT_ATLAS_KEY } from '../atlas.ts';

const KEY = 'tut_spot';
const R = TOKENS.radius.chip;
const E = UI.spotEdgePx;
/** Edge arc frame: the quarter arc of radius R, stroke E, centred at (R + E/2, R + E/2) — its top-left quadrant. */
const S = R + E / 2;

/** Corner radius of a hole (UX §13.1: `radius.chip`, smaller for a small hole). */
export const holeCorner = (h: Rect): number => Math.min(R, h.w / 2, h.h / 2);

function ensureTexture(scene: Phaser.Scene): void {
  if (scene.textures.exists(KEY)) return;
  const w = R + 2 + Math.ceil(S) + 2;
  const tex = scene.textures.createCanvas(KEY, w, Math.ceil(S));
  if (!tex) throw new Error('spotPieces: canvas texture');
  const ctx = tex.context;
  ctx.clearRect(0, 0, w, Math.ceil(S));
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, R, R);
  ctx.globalCompositeOperation = 'destination-out';
  ctx.beginPath();
  ctx.arc(R, R, R, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalCompositeOperation = 'source-over';
  const ox = R + 2;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = E;
  ctx.lineCap = 'butt';
  ctx.beginPath();
  ctx.arc(ox + S, S, R, Math.PI, Math.PI * 1.5);
  ctx.stroke();
  tex.add('dark', 0, 0, 0, R, R);
  tex.add('edge', 0, ox, 0, Math.ceil(S), Math.ceil(S));
  tex.refresh();
}

const inside = (r: Rect, outer: Rect): boolean =>
  r.x >= outer.x && r.y >= outer.y && r.x + r.w <= outer.x + outer.w && r.y + r.h <= outer.y + outer.h;

type Corner = readonly [flipX: boolean, flipY: boolean];
const CORNERS: readonly Corner[] = [
  [false, false],
  [true, false],
  [false, true],
  [true, true],
];

export class SpotPieces {
  private readonly scene: Phaser.Scene;
  private readonly darkDepth: number;
  private readonly edgeDepth: number;
  private readonly darks: Phaser.GameObjects.Image[] = [];
  private readonly edges: Phaser.GameObjects.Image[] = [];
  private nDark = 0;
  private nEdge = 0;

  constructor(scene: Phaser.Scene, darkDepth: number, edgeDepth: number) {
    this.scene = scene;
    this.darkDepth = darkDepth;
    this.edgeDepth = edgeDepth;
    ensureTexture(scene);
  }

  /**
   * Lays out the pieces of `holes`: dark corners in `color` at `alpha` (none when `dark` is null) and the edge. A corner
   * lying inside one of `fills` (the dark parts of a merged hole, UX §13.1) is dark already: no corner piece there.
   */
  show(
    holes: readonly Rect[],
    dark: { readonly color: number; readonly alpha: number } | null,
    fills: readonly Rect[] = [],
  ): void {
    this.nDark = 0;
    this.nEdge = 0;
    for (const h of holes) {
      const r = holeCorner(h);
      if (r <= 0) continue;
      const k = r / R;
      for (const [fx, fy] of CORNERS) {
        const sq: Rect = { x: fx ? h.x + h.w - r : h.x, y: fy ? h.y + h.h - r : h.y, w: r, h: r };
        if (dark && !fills.some((f) => inside(sq, f))) {
          const img = this.take(this.darks, this.nDark++, 'dark', this.darkDepth);
          img
            .setDisplaySize(r, r)
            .setFlip(fx, fy)
            .setPosition(fx ? h.x + h.w - r / 2 : h.x + r / 2, fy ? h.y + h.h - r / 2 : h.y + r / 2)
            .setTint(dark.color)
            .setAlpha(dark.alpha);
        }
        const s = S * k;
        const arc = this.take(this.edges, this.nEdge++, 'edge', this.edgeDepth);
        arc
          .setDisplaySize(s, s)
          .setFlip(fx, fy)
          .setPosition(
            fx ? h.x + h.w + E / 2 - s / 2 : h.x - E / 2 + s / 2,
            fy ? h.y + h.h + E / 2 - s / 2 : h.y - E / 2 + s / 2,
          );
      }
      // straight strips between the arcs: top, bottom, left, right
      const strips: Rect[] = [
        { x: h.x + r, y: h.y - E / 2, w: h.w - 2 * r, h: E },
        { x: h.x + r, y: h.y + h.h - E / 2, w: h.w - 2 * r, h: E },
        { x: h.x - E / 2, y: h.y + r, w: E, h: h.h - 2 * r },
        { x: h.x + h.w - E / 2, y: h.y + r, w: E, h: h.h - 2 * r },
      ];
      for (const st of strips) {
        if (st.w <= 0 || st.h <= 0) continue;
        const img = this.take(this.edges, this.nEdge++, FRAME.whitePixel, this.edgeDepth, BOOT_ATLAS_KEY);
        img.setOrigin(0, 0).setPosition(st.x, st.y).setDisplaySize(st.w, st.h).setFlip(false, false);
      }
    }
    for (let i = this.nDark; i < this.darks.length; i++) this.darks[i]?.setVisible(false);
    for (let i = this.nEdge; i < this.edges.length; i++) this.edges[i]?.setVisible(false);
  }

  hide(): void {
    this.show([], null);
  }

  /** The pulsing edge (UX §13.1: every `duration.spotlightPulse`). */
  setEdgeAlpha(a: number): void {
    for (let i = 0; i < this.nEdge; i++) this.edges[i]?.setAlpha(a);
  }

  destroy(): void {
    for (const o of [...this.darks, ...this.edges]) o.destroy();
    this.darks.length = 0;
    this.edges.length = 0;
  }

  private take(
    pool: Phaser.GameObjects.Image[],
    i: number,
    frame: string,
    depth: number,
    key: string = KEY,
  ): Phaser.GameObjects.Image {
    let img = pool[i];
    if (!img) {
      img = this.scene.add.image(0, 0, key, frame);
      pool[i] = img;
    }
    img.setTexture(key, frame).setOrigin(0.5, 0.5).setDepth(depth).setVisible(true).setAlpha(1);
    if (key === KEY && frame === 'edge') img.clearTint();
    if (key === BOOT_ATLAS_KEY) img.clearTint();
    return img;
  }
}
