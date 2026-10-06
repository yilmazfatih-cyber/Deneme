/**
 * Screen layout from `tokens.layout.*` (docs/TECH_DESIGN.md §2.2 "Ekran eşlemesi", §10.1 "Çapa sözleşmesi";
 * UX_FLOWS §0.1, §5.1; D-011, D-015, R-04, R-06).
 *
 * The design width is fixed at `meta.designWidth` (1080). The design height `H` is 1920 in FIT and 1920…2400 in
 * EXPAND. The anchor group of an element comes from its TOKEN GROUP, never from its y value:
 * - `layout.grid.*`  x values and cell sizes, independent of H;
 * - `layout.top.*`   y measured from the top, used as is;
 * - `layout.bottom.*` `*BottomPx` = distance from the element's BOTTOM edge to the screen bottom → `y = H − bottomPx − h`;
 * - `layout.board.*` y values are for H = 1920 and shift by `(H − 1920) × board.expandShare` (crane area, board,
 *   status strip, "Yapı tamam!" ribbon; ribbon x/w/h/tilt/notch do not depend on H);
 * - `layout.popup.*` anchored to the bottom: panel bottom `y = H − panelBottomPx`, options stacked bottom → top,
 *   never vertically centred.
 * In FIT, H = 1920 and every formula is the identity, so the same code serves both modes.
 *
 * TECH §10.1 names this `Layout.recompute(H)`: here a layout is an immutable value, so a resize (Phaser
 * `scale.on('resize')`) simply calls `createLayout(tokens, H)` again. Pure: no Phaser, no DOM.
 */
import type { Tokens } from './tokens.ts';

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export type ScaleMode = 'fit' | 'expand';

export interface Viewport {
  /** CSS px of the game container (inside the safe area, TECH §10.1). */
  readonly width: number;
  readonly height: number;
}

/** Booster slots on the level screen (UX §5.1: hammer, crane, brush, undo). */
export const BOOSTER_SLOTS = 4;
/** Bottom navigation tabs on the home screen (UX §3: shop, league, home, team, album). */
export const NAV_TABS = 5;

export const rectBottom = (r: Rect): number => r.y + r.h;
export const rectRight = (r: Rect): number => r.x + r.w;

/** Vertical union of rects. */
export function boundsOf(rects: readonly Rect[]): Rect {
  if (rects.length === 0) throw new RangeError('boundsOf: no rects');
  const x = Math.min(...rects.map((r) => r.x));
  const y = Math.min(...rects.map((r) => r.y));
  return { x, y, w: Math.max(...rects.map(rectRight)) - x, h: Math.max(...rects.map(rectBottom)) - y };
}

export function rectsOverlap(a: Rect, b: Rect): boolean {
  return a.x < rectRight(b) && b.x < rectRight(a) && a.y < rectBottom(b) && b.y < rectBottom(a);
}

/**
 * UX §0.3 "Görsel + pay": every side shorter than `minPx` is padded equally on both sides up to `minPx`
 * (`touch.minTargetPx`). Sides already long enough are unchanged.
 */
export function hitArea(r: Rect, minPx: number): Rect {
  const padX = Math.max(0, (minPx - r.w) / 2);
  const padY = Math.max(0, (minPx - r.h) / 2);
  return { x: r.x - padX, y: r.y - padY, w: r.w + 2 * padX, h: r.h + 2 * padY };
}

/**
 * Design height for a viewport (R-06). FIT: always `meta.scale.fitHeight`. EXPAND: the width stays
 * `meta.designWidth` and the height follows the viewport aspect, clamped to `[expandMinHeight, expandMaxHeight]`
 * (Phaser `Scale.EXPAND`; taller viewports letterbox the rest, wider ones pillarbox).
 */
export function designHeight(mode: ScaleMode, viewport: Viewport, tokens: Tokens): number {
  const s = tokens.meta.scale;
  if (mode === 'fit') return s.fitHeight;
  const natural = Math.round((tokens.meta.designWidth * viewport.height) / viewport.width);
  return Math.min(s.expandMaxHeight, Math.max(s.expandMinHeight, natural));
}

/** How the design canvas maps onto the viewport (CSS px). */
export interface ViewportFit {
  readonly H: number;
  /** CSS px per design px. */
  readonly scale: number;
  /** Letterbox (top + bottom) and pillarbox (left + right) bands in CSS px. */
  readonly letterboxPx: number;
  readonly pillarboxPx: number;
}

export function fitViewport(mode: ScaleMode, viewport: Viewport, tokens: Tokens): ViewportFit {
  const H = designHeight(mode, viewport, tokens);
  const W = tokens.meta.designWidth;
  const scale = Math.min(viewport.width / W, viewport.height / H);
  return { H, scale, letterboxPx: viewport.height - H * scale, pillarboxPx: viewport.width - W * scale };
}

/** Board geometry (TECH §2.2 "Ekran eşlemesi"); all y values already shifted for H. Global coordinates: x 0–7, y 0–9. */
export interface BoardGeometry {
  readonly cellPx: number;
  readonly wallW: number;
  /** `layout.grid` x values. */
  readonly yardX: number;
  readonly wallX: number;
  readonly buildX: number;
  /** Shifted y of the board edges and of the crane area top. */
  readonly craneTopY: number;
  readonly boardTopY: number;
  readonly boardBottomY: number;
  /** Left edge of global column x (x ≤ 5 yard, x ≥ 6 site). */
  colLeft(x: number): number;
  /** Top edge of global row y (y 0–7 board, 8–9 crane area). */
  rowTop(y: number): number;
  cellRect(x: number, y: number): Rect;
  /**
   * Screen x of the left edge of a dragged piece with CONTINUOUS anchor `ax` and box width `w`:
   * `yardX + ax·cellPx + s·wallW`, `s = clamp((ax − (6 − w)) / w, 0, 1)` — 0 while the box is fully in the yard,
   * 1 when fully in the site; a straddling box slides symmetrically over the wall (TECH §2.2).
   */
  pieceX(ax: number, w: number): number;
  /** Screen y of the top edge of a piece box with continuous anchor row `ay` and box height `h`. */
  pieceY(ay: number, h: number): number;
  pieceRect(ax: number, ay: number, w: number, h: number): Rect;
  /** Inverse of `pieceX` (monotonic, piecewise linear). */
  anchorXAt(screenX: number, w: number): number;
  /** Inverse of `pieceY`. */
  anchorYAt(screenY: number, h: number): number;
  /** Global cell under a screen point; null over the wall strip or outside the 8 × 10 grid. */
  cellAt(px: number, py: number): { readonly x: number; readonly y: number } | null;
  /** Wall strip rows `[0, height)`; the zero-width boundary is drawn as this 60 px strip (R-03). */
  wallRect(height: number): Rect;
  /** Opening of a gap with rows `[y, y + size)` on the wall strip. */
  gapRect(y: number, size: number): Rect;
}

export interface Layout {
  readonly H: number;
  readonly W: number;
  /** `(H − 1920) × board.expandShare`; 0 in FIT. */
  readonly boardShift: number;
  readonly grid: BoardGeometry;
  readonly top: {
    readonly pause: Rect;
    readonly panorama: Rect;
    readonly goals: Rect;
    readonly moves: Rect;
    /** Home screen top bar band (full width). */
    readonly topBar: Rect;
    readonly groupBottomY: number;
  };
  readonly board: {
    /** Crane area, rows 8–9 over the full board width. */
    readonly crane: Rect;
    /** Rows 0–7 over the full board width (yard + wall + site). */
    readonly board: Rect;
    readonly yard: Rect;
    readonly site: Rect;
    /** Status strip (streak beads, truck chip), board group (UX §5.1). */
    readonly status: Rect;
    /** "Yapı tamam!" ribbon (UX §5.1, ASSET `ui_site_ribbon`); tilt and V notch from tokens. */
    readonly siteRibbon: Rect & { readonly tiltDeg: number; readonly notchPx: number };
  };
  readonly bottom: {
    readonly character: Rect;
    /** `BOOSTER_SLOTS` slots, left → right. */
    readonly boosters: readonly Rect[];
    /** Home screen. */
    readonly nav: Rect;
    readonly navTabs: readonly Rect[];
    readonly playButton: Rect;
    /** Top edge of the level screen bottom group: `H − bottom.groupTopFromBottomPx`. */
    readonly groupTopY: number;
  };
  readonly popup: {
    /** `H − popup.panelBottomPx`. */
    readonly panelBottomY: number;
    /** Bottom edge of the lowest option: panel bottom − `optionsBottomInsetPx`. */
    readonly optionsBottomY: number;
    /**
     * `n` equal options (`optionW × optionH`, gap `optionGap`), stacked bottom → top from `optionsBottomY` and
     * returned top → bottom (index 0 = topmost = first in reading order). Horizontally centred.
     */
    options(n: number): readonly Rect[];
  };
}

/** Builds the layout for design height `H` (FIT: 1920; EXPAND: 1920…2400). */
export function createLayout(tokens: Tokens, H: number): Layout {
  const s = tokens.meta.scale;
  if (!(H >= s.fitHeight && H <= s.expandMaxHeight)) {
    throw new RangeError(`createLayout: H ${H} outside [${s.fitHeight}, ${s.expandMaxHeight}]`);
  }
  const W = tokens.meta.designWidth;
  const { grid: g, top: t, board: b, bottom: bt, popup: p } = tokens.layout;
  const base = tokens.meta.designHeight;
  const boardShift = (H - base) * b.expandShare;
  const by = (y: number): number => y + boardShift;
  const fromBottom = (bottomPx: number, h: number): number => H - bottomPx - h;

  const c = g.cellPx;
  const boardBottomY = by(b.boardBottomY);
  const boardTopY = by(b.boardTopY);
  const craneTopY = by(b.craneTopY);
  const siteRight = g.buildX + g.buildCols * c;
  const boardW = siteRight - g.yardX;
  const gridRows = g.rows + g.craneRows;

  const colLeft = (x: number): number => (x < g.yardCols ? g.yardX + x * c : g.buildX + (x - g.yardCols) * c);
  const rowTop = (y: number): number => boardBottomY - (y + 1) * c;
  const wallStart = (w: number): number => g.yardCols - w;
  const pieceX = (ax: number, w: number): number => {
    const sFrac = Math.min(1, Math.max(0, (ax - wallStart(w)) / w));
    return g.yardX + ax * c + sFrac * g.wallW;
  };
  const pieceY = (ay: number, h: number): number => boardBottomY - (ay + h) * c;

  const grid: BoardGeometry = {
    cellPx: c,
    wallW: g.wallW,
    yardX: g.yardX,
    wallX: g.wallX,
    buildX: g.buildX,
    craneTopY,
    boardTopY,
    boardBottomY,
    colLeft,
    rowTop,
    cellRect: (x, y) => ({ x: colLeft(x), y: rowTop(y), w: c, h: c }),
    pieceX,
    pieceY,
    pieceRect: (ax, ay, w, h) => ({ x: pieceX(ax, w), y: pieceY(ay, h), w: w * c, h: h * c }),
    anchorXAt: (screenX, w) => {
      const start = wallStart(w);
      const x0 = g.yardX + start * c; // s = 0 up to here
      const x1 = g.yardX + g.yardCols * c + g.wallW; // s = 1 from here (ax = 6)
      if (screenX <= x0) return (screenX - g.yardX) / c;
      if (screenX >= x1) return (screenX - g.yardX - g.wallW) / c;
      return start + (screenX - x0) / (c + g.wallW / w);
    },
    anchorYAt: (screenY, h) => (boardBottomY - screenY) / c - h,
    cellAt: (px, py) => {
      const y = Math.floor((boardBottomY - py) / c);
      if (y < 0 || y >= gridRows) return null;
      if (px >= g.yardX && px < g.wallX) return { x: Math.floor((px - g.yardX) / c), y };
      if (px >= g.buildX && px < siteRight) return { x: g.yardCols + Math.floor((px - g.buildX) / c), y };
      return null;
    },
    wallRect: (height) => ({ x: g.wallX, y: boardBottomY - height * c, w: g.wallW, h: height * c }),
    gapRect: (y, size) => ({ x: g.wallX, y: boardBottomY - (y + size) * c, w: g.wallW, h: size * c }),
  };

  const boosters = Array.from({ length: BOOSTER_SLOTS }, (_, i) => ({
    x: bt.boosterX + i * (bt.boosterSize + bt.boosterGap),
    y: fromBottom(bt.boosterBottomPx, bt.boosterSize),
    w: bt.boosterSize,
    h: bt.boosterSize,
  }));
  const nav = { x: 0, y: fromBottom(bt.navBottomPx, bt.navH), w: W, h: bt.navH };
  const tabW = W / NAV_TABS;
  const navTabs = Array.from({ length: NAV_TABS }, (_, i) => ({ x: i * tabW, y: nav.y, w: tabW, h: nav.h }));

  const panelBottomY = H - p.panelBottomPx;
  const optionsBottomY = panelBottomY - p.optionsBottomInsetPx;

  const layout: Layout = {
    H,
    W,
    boardShift,
    grid,
    top: {
      pause: { x: t.pauseX, y: t.pauseY, w: t.pauseSize, h: t.pauseSize },
      panorama: { x: t.panoramaX, y: t.panoramaY, w: t.panoramaW, h: t.panoramaH },
      goals: { x: t.goalsX, y: t.goalsY, w: t.goalsW, h: t.goalsH },
      moves: { x: t.movesX, y: t.movesY, w: t.movesW, h: t.movesH },
      topBar: { x: 0, y: t.topBarY, w: W, h: t.topBarH },
      groupBottomY: t.groupBottomY,
    },
    board: {
      crane: { x: g.yardX, y: craneTopY, w: boardW, h: boardTopY - craneTopY },
      board: { x: g.yardX, y: boardTopY, w: boardW, h: boardBottomY - boardTopY },
      yard: { x: g.yardX, y: boardTopY, w: g.yardCols * c, h: g.rows * c },
      site: { x: g.buildX, y: boardTopY, w: g.buildCols * c, h: g.rows * c },
      status: { x: g.yardX, y: by(b.statusY), w: boardW, h: b.statusH },
      siteRibbon: {
        x: b.siteRibbonX,
        y: by(b.siteRibbonY),
        w: b.siteRibbonW,
        h: b.siteRibbonH,
        tiltDeg: b.siteRibbonTiltDeg,
        notchPx: b.siteRibbonNotchPx,
      },
    },
    bottom: {
      character: {
        x: bt.characterX,
        y: fromBottom(bt.characterBottomPx, bt.characterH),
        w: bt.characterW,
        h: bt.characterH,
      },
      boosters,
      nav,
      navTabs,
      playButton: {
        x: (W - bt.playButtonW) / 2,
        y: fromBottom(bt.playButtonBottomPx, bt.playButtonH),
        w: bt.playButtonW,
        h: bt.playButtonH,
      },
      groupTopY: H - bt.groupTopFromBottomPx,
    },
    popup: {
      panelBottomY,
      optionsBottomY,
      options: (n) => {
        if (!Number.isInteger(n) || n < 1) throw new RangeError(`popup.options: bad count ${n}`);
        const x = (W - p.optionW) / 2;
        const top = optionsBottomY - n * p.optionH - (n - 1) * p.optionGap;
        return Array.from({ length: n }, (_, i) => ({
          x,
          y: top + i * (p.optionH + p.optionGap),
          w: p.optionW,
          h: p.optionH,
        }));
      },
    },
  };
  return deepFreeze(layout);
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const v of Object.values(value)) deepFreeze(v);
  }
  return value;
}
