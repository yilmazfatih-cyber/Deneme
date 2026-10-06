import { describe, expect, it } from 'vitest';
import { TOKENS } from '../../src/theme/tokens.ts';
import {
  BOOSTER_SLOTS,
  NAV_TABS,
  boundsOf,
  createLayout,
  designHeight,
  fitViewport,
  hitArea,
  rectBottom,
  rectRight,
  rectsOverlap,
} from '../../src/theme/layout.ts';
import type { Layout, Rect, ScaleMode } from '../../src/theme/layout.ts';

const L = TOKENS.layout;
const { grid: g, board: b, top: t, bottom: bt, popup: p } = L;
const W = TOKENS.meta.designWidth;
const MIN_TARGET = TOKENS.touch.minTargetPx;
/**
 * UX §0.1 decision (b) (2026-10-06): the frequent targets of the closed list are ≥ 144 px = 48 dp at 360 dp
 * (1080 / 360 × 48). An invariant of the tokens they are drawn from, not a token itself (tokens `touch._doc`).
 */
const FREQUENT_TARGET_PX = 144;
/** UX §0.2: comfort zone starts at y 1056 (bottom 45 %) of the 1920 design. */
const COMFORT_Y = 1056;

const PROFILES = [
  { name: '390×844', viewport: { width: 390, height: 844 } },
  { name: '360×800', viewport: { width: 360, height: 800 } },
] as const;
const MODES: readonly ScaleMode[] = ['fit', 'expand'];

const levelTop = (l: Layout): Rect[] => [l.top.pause, l.top.panorama, l.top.goals, l.top.moves];
const levelBoard = (l: Layout): Rect[] => [l.board.crane, l.board.board, l.board.status, l.board.siteRibbon];
const levelBottom = (l: Layout): Rect[] => [l.bottom.character, ...l.bottom.boosters];
/** Interactive level-screen and home-screen elements (UX §3, §5.1). */
const touchTargets = (l: Layout): [string, Rect][] => [
  ['pause', l.top.pause],
  ['panorama', l.top.panorama],
  ['status strip (streak)', l.board.status],
  ...l.bottom.boosters.map((r, i): [string, Rect] => [`booster ${i}`, r]),
  ['play button', l.bottom.playButton],
  ...l.bottom.navTabs.map((r, i): [string, Rect] => [`nav tab ${i}`, r]),
  ...l.popup.options(3).map((r, i): [string, Rect] => [`popup option ${i}`, r]),
];

describe('tokens layout._doc invariants (TECH 2.2, D-011)', () => {
  it('D-011 cell 120 px and wall 60 px (= 0.5 cell)', () => {
    expect(g.cellPx).toBe(120);
    expect(g.wallW).toBe(60);
    expect(g.wallW * 2).toBe(g.cellPx);
  });

  it('TECH 2.2 grid.yardX + grid.yardCols·grid.cellPx == grid.wallX', () => {
    expect(g.yardX + g.yardCols * g.cellPx).toBe(g.wallX);
  });

  it('TECH 2.2 grid.wallX + grid.wallW == grid.buildX', () => {
    expect(g.wallX + g.wallW).toBe(g.buildX);
  });

  it('TECH 2.2 grid.buildX + grid.buildCols·grid.cellPx + layout.marginPx ≤ 1080', () => {
    expect(g.buildX + g.buildCols * g.cellPx + L.marginPx).toBeLessThanOrEqual(W);
  });

  it('TECH 2.2 top.groupBottomY + board.minGapTopPx ≤ board.craneTopY (top group never covers the board)', () => {
    expect(t.groupBottomY + b.minGapTopPx).toBeLessThanOrEqual(b.craneTopY);
  });

  it('TECH 2.2 board.statusBottomY ≤ 1920 − bottom.groupTopFromBottomPx (status strip above the bottom group)', () => {
    expect(b.statusBottomY).toBeLessThanOrEqual(TOKENS.meta.designHeight - bt.groupTopFromBottomPx);
    expect(b.statusY + b.statusH).toBe(b.statusBottomY);
  });

  it('TECH 2.2 board rows and crane rows are whole cells', () => {
    expect(b.boardBottomY - b.boardTopY).toBe(g.rows * g.cellPx);
    expect(b.boardTopY - b.craneTopY).toBe(g.craneRows * g.cellPx);
  });

  it('TECH 10.1 top.groupBottomY is the bottom of the lowest top element', () => {
    const l = createLayout(TOKENS, 1920);
    expect(Math.max(...levelTop(l).map(rectBottom))).toBe(t.groupBottomY);
  });

  it('TECH 10.1 bottom.groupTopFromBottomPx bounds the highest level-screen bottom element', () => {
    const l = createLayout(TOKENS, 1920);
    expect(Math.min(...levelBottom(l).map((r) => r.y))).toBe(l.bottom.groupTopY);
  });

  it('UX 0.1 popup invariant: 1920 − panelBottomPx − optionsBottomInsetPx − 3·optionH − 2·optionGap ≥ 1056', () => {
    const v =
      TOKENS.meta.designHeight - p.panelBottomPx - p.optionsBottomInsetPx - 3 * p.optionH - 2 * p.optionGap;
    expect(v).toBeGreaterThanOrEqual(COMFORT_Y);
  });
});

describe('anchor groups (TECH 10.1, UX 0.1, D-015)', () => {
  it('UX 0.1 popup options anchored to bottom, never vertically centered', () => {
    const l = createLayout(TOKENS, 1920);
    for (const n of [1, 2, 3]) {
      const opts = l.popup.options(n);
      expect(opts).toHaveLength(n);
      expect(opts[0]?.y, `first option top, ${n} options`).toBeGreaterThanOrEqual(COMFORT_Y);
      expect(rectBottom(opts[n - 1] as Rect)).toBe(1920 - p.panelBottomPx - p.optionsBottomInsetPx);
      for (let i = 1; i < n; i++)
        expect((opts[i] as Rect).y - rectBottom(opts[i - 1] as Rect)).toBe(p.optionGap);
    }
    const single = l.popup.options(1)[0] as Rect;
    expect(single.y).toBe(1408);
    expect(single.y).not.toBe((1920 - p.optionH) / 2);
    expect(single.x).toBe((W - p.optionW) / 2);
  });

  it('UX 0.1 popup panel moves down with the screen bottom in EXPAND', () => {
    const fit = createLayout(TOKENS, 1920);
    const tall = createLayout(TOKENS, 2400);
    expect(tall.popup.panelBottomY - fit.popup.panelBottomY).toBe(480);
    expect((tall.popup.options(2)[0] as Rect).y - (fit.popup.options(2)[0] as Rect).y).toBe(480);
  });

  it('UX 5.1 status strip moves with board', () => {
    for (const H of [1920, 2337, 2400]) {
      const l = createLayout(TOKENS, H);
      expect(l.board.status.y - l.grid.boardBottomY).toBe(b.statusY - b.boardBottomY);
      expect(l.board.siteRibbon.y - l.grid.boardBottomY).toBe(b.siteRibbonY - b.boardBottomY);
    }
  });

  it('TECH 10.1 example: H = 2400, expandShare 0.5 → statusY 1504 → 1744 (not bottom-anchored 1984)', () => {
    const l = createLayout(TOKENS, 2400);
    expect(l.boardShift).toBe(240);
    expect(l.board.status.y).toBe(1744);
    expect(l.board.status.y).not.toBe(2400 - (1920 - b.statusY));
  });

  it('TECH 10.1 FIT is the identity: every y equals its token value', () => {
    const l = createLayout(TOKENS, 1920);
    expect(l.boardShift).toBe(0);
    expect([l.grid.craneTopY, l.grid.boardTopY, l.grid.boardBottomY]).toEqual([
      b.craneTopY,
      b.boardTopY,
      b.boardBottomY,
    ]);
    expect(l.board.status).toEqual({ x: g.yardX, y: b.statusY, w: 1020, h: b.statusH });
    expect(l.top.panorama).toEqual({ x: t.panoramaX, y: t.panoramaY, w: t.panoramaW, h: t.panoramaH });
    expect(l.bottom.character.y).toBe(1600);
    expect(l.bottom.boosters.map((r) => [r.x, r.y])).toEqual([
      [314, 1660],
      [504, 1660],
      [694, 1660],
      [884, 1660],
    ]);
    expect(l.bottom.playButton).toEqual({ x: 180, y: 1480, w: 720, h: 176 });
    expect(l.bottom.nav).toEqual({ x: 0, y: 1720, w: 1080, h: 176 });
    expect(l.board.siteRibbon).toMatchObject({ x: 750, y: 960, w: 306, h: 96, tiltDeg: -6, notchPx: 24 });
  });

  it('TECH 10.1 top group keeps its y in EXPAND; bottom group follows the bottom edge', () => {
    const fit = createLayout(TOKENS, 1920);
    const tall = createLayout(TOKENS, 2400);
    expect(tall.top).toEqual(fit.top);
    expect(tall.bottom.character.y - fit.bottom.character.y).toBe(480);
    expect(tall.bottom.boosters[0]?.y).toBe(2400 - bt.boosterBottomPx - bt.boosterSize);
  });

  it('createLayout rejects heights outside [fitHeight, expandMaxHeight]; the layout is frozen', () => {
    expect(() => createLayout(TOKENS, 1919)).toThrow(RangeError);
    expect(() => createLayout(TOKENS, 2401)).toThrow(RangeError);
    const l = createLayout(TOKENS, 2000);
    expect(Object.isFrozen(l)).toBe(true);
    expect(Object.isFrozen(l.bottom.boosters[0])).toBe(true);
  });
});

describe('phone profiles 390×844 and 360×800 in FIT and EXPAND (R-06, D-015)', () => {
  it('R-06 design heights: FIT 1920; EXPAND 2337 (390×844) and 2400 (360×800)', () => {
    expect(designHeight('fit', PROFILES[0].viewport, TOKENS)).toBe(1920);
    expect(designHeight('fit', PROFILES[1].viewport, TOKENS)).toBe(1920);
    expect(designHeight('expand', PROFILES[0].viewport, TOKENS)).toBe(2337);
    expect(designHeight('expand', PROFILES[1].viewport, TOKENS)).toBe(2400);
    expect(designHeight('expand', { width: 360, height: 900 }, TOKENS)).toBe(2400);
    expect(designHeight('expand', { width: 768, height: 1024 }, TOKENS)).toBe(1920);
  });

  it('UX 0.1 44 pt rule, decision (b): touch.minTargetPx is 128 px at every width — 44.4 pt at 375, 46.2 pt on 390×844, 42.7 dp on 360×800 (accepted)', () => {
    // UX §0.1: "en küçük dokunma hedefi her ekran genişliğinde 128 px … 360 dp'de 42,7 dp … bilerek kabul edilir"
    expect(MIN_TARGET).toBe(128);
    const units = (width: number, height: number, mode: ScaleMode): number =>
      Math.round(MIN_TARGET * fitViewport(mode, { width, height }, TOKENS).scale * 10) / 10;
    for (const mode of MODES) {
      expect(units(375, 812, mode)).toBe(44.4);
      expect(units(390, 844, mode)).toBe(46.2);
      expect(units(360, 800, mode)).toBe(42.7);
      // the layout reads the token: the same px on every profile, whatever H
      for (const prof of PROFILES) {
        const l = createLayout(TOKENS, designHeight(mode, prof.viewport, TOKENS));
        expect(l.touch.minTargetPx, `${prof.name} ${mode}`).toBe(MIN_TARGET);
        expect(l.touch.hitSlopPx, `${prof.name} ${mode}`).toBe(TOKENS.touch.hitSlopPx);
      }
    }
  });

  it('R-06 FIT letterboxes 151 pt on 390×844 and 160 px (20 %) on 360×800; EXPAND fills the screen', () => {
    expect(fitViewport('fit', PROFILES[0].viewport, TOKENS).letterboxPx).toBeCloseTo(150.67, 1);
    const fit360 = fitViewport('fit', PROFILES[1].viewport, TOKENS);
    expect(fit360.letterboxPx).toBeCloseTo(160, 6);
    expect(fit360.letterboxPx / 800).toBeCloseTo(0.2, 6);
    for (const prof of PROFILES) {
      const e = fitViewport('expand', prof.viewport, TOKENS);
      expect(e.letterboxPx).toBeLessThan(1);
      expect(e.pillarboxPx).toBeCloseTo(0, 6);
      expect(e.scale).toBeCloseTo(prof.viewport.width / W, 6);
    }
  });

  for (const prof of PROFILES) {
    for (const mode of MODES) {
      const H = designHeight(mode, prof.viewport, TOKENS);
      const l = createLayout(TOKENS, H);
      const label = `${prof.name} ${mode.toUpperCase()} (H ${H})`;

      it(`TECH 10.1 ${label}: top, board and bottom groups do not overlap`, () => {
        const top = boundsOf(levelTop(l));
        const board = boundsOf(levelBoard(l));
        const bottom = boundsOf(levelBottom(l));
        expect(rectBottom(top) + b.minGapTopPx).toBeLessThanOrEqual(board.y);
        expect(rectBottom(board)).toBeLessThanOrEqual(bottom.y);
        expect(rectBottom(board)).toBeLessThanOrEqual(l.bottom.groupTopY);
        expect(rectsOverlap(top, board) || rectsOverlap(board, bottom) || rectsOverlap(top, bottom)).toBe(
          false,
        );
        // Home screen: the play button sits above the navigation bar.
        expect(rectBottom(l.bottom.playButton)).toBeLessThanOrEqual(l.bottom.nav.y);
      });

      it(`TECH 10.1 ${label}: every element stays on the 1080 × H canvas (no horizontal overflow)`, () => {
        const all = [
          ...levelTop(l),
          ...levelBoard(l),
          ...levelBottom(l),
          ...touchTargets(l).map(([, r]) => r),
        ];
        for (const r of all) {
          expect(r.x).toBeGreaterThanOrEqual(0);
          expect(rectRight(r)).toBeLessThanOrEqual(W);
          expect(r.y).toBeGreaterThanOrEqual(0);
          expect(rectBottom(r)).toBeLessThanOrEqual(H);
        }
        expect(rectRight(l.bottom.boosters[BOOSTER_SLOTS - 1] as Rect) + L.marginPx).toBeLessThanOrEqual(W);
        expect(rectRight(l.board.site) + L.marginPx).toBeLessThanOrEqual(W);
      });

      it(`UX 0.3 ${label}: touch targets (visual + pad) are ≥ touch.minTargetPx and stay on screen`, () => {
        for (const [name, r] of touchTargets(l)) {
          const hit = l.touch.hit(r);
          expect(hit, name).toEqual(hitArea(r, MIN_TARGET));
          expect(Math.min(hit.w, hit.h), name).toBeGreaterThanOrEqual(MIN_TARGET);
          expect(hit.y, name).toBeGreaterThanOrEqual(0);
          expect(rectBottom(hit), name).toBeLessThanOrEqual(H);
        }
      });

      it(`UX 0.1 ${label}: frequent targets of the closed list (boosters, play button, nav tabs, popup options, block + pad) have a short side ≥ 144 px`, () => {
        const frequent: [string, Rect][] = [
          ...l.bottom.boosters.map((r, i): [string, Rect] => [`booster ${i}`, r]),
          ['play button', l.bottom.playButton],
          ...l.bottom.navTabs.map((r, i): [string, Rect] => [`nav tab ${i}`, r]),
          ...l.popup.options(3).map((r, i): [string, Rect] => [`popup option ${i}`, r]),
          ['block cell + pad', l.touch.blockHit(l.grid.cellRect(0, 0))],
        ];
        for (const [name, r] of frequent) {
          expect(Math.min(r.w, r.h), name).toBeGreaterThanOrEqual(FREQUENT_TARGET_PX);
        }
        // UX §0.1: "blok hücresi 120 px … touch.hitSlopPx = 30 … ile 180 px'e çıkar"
        const cell = l.grid.cellRect(2, 3);
        expect(l.touch.blockHit(cell)).toEqual({ x: cell.x - 30, y: cell.y - 30, w: 180, h: 180 });
      });

      it(`UX 0.1 ${label}: popup options stay in the bottom comfort zone`, () => {
        for (const n of [1, 2, 3]) {
          const first = l.popup.options(n)[0] as Rect;
          expect(first.y).toBeGreaterThanOrEqual(COMFORT_Y + (H - 1920));
        }
      });

      it(`K-01 ${label}: the 8 × 10 grid maps to whole cells; crane rows 8–9 sit above the board`, () => {
        const geo = l.grid;
        expect(geo.rowTop(0)).toBe(geo.boardBottomY - g.cellPx);
        expect(geo.rowTop(7)).toBe(geo.boardTopY);
        expect(geo.rowTop(9)).toBe(geo.craneTopY);
        expect(geo.colLeft(0)).toBe(g.yardX);
        expect(geo.colLeft(5)).toBe(g.wallX - g.cellPx);
        expect(geo.colLeft(6)).toBe(g.buildX);
        expect(geo.colLeft(7)).toBe(g.buildX + g.cellPx);
        expect(l.board.crane).toEqual({ x: g.yardX, y: geo.craneTopY, w: 1020, h: 2 * g.cellPx });
      });
    }
  }
});

describe('board geometry (TECH 2.2 "Ekran eşlemesi", R-03)', () => {
  const l = createLayout(TOKENS, 2337);
  const geo = l.grid;

  it('K-04 the zero-width wall boundary is drawn as the 60 px strip between yard and site; gaps cut whole rows', () => {
    expect(geo.wallRect(6)).toEqual({ x: g.wallX, y: geo.boardBottomY - 720, w: 60, h: 720 });
    expect(geo.gapRect(2, 2)).toEqual({ x: g.wallX, y: geo.rowTop(3), w: 60, h: 240 });
    expect(geo.cellAt(g.wallX + 30, geo.rowTop(0) + 60)).toBeNull();
  });

  it('R-03 a 2-wide dragged piece at ax = 5 covers the wall with two 30 px halves', () => {
    const x = geo.pieceX(5, 2);
    expect(x).toBe(g.yardX + 5 * 120 + 30);
    expect(g.wallX - x).toBe(120 - 30);
    expect(x + 2 * 120 - (g.wallX + g.wallW)).toBe(120 - 30);
  });

  it('R-03 pieceX: fully in the yard → no wall offset, fully in the site → + wallW, continuous in between', () => {
    for (const w of [1, 2, 3]) {
      expect(geo.pieceX(6 - w, w)).toBe(g.yardX + (6 - w) * 120);
      expect(geo.pieceX(6, w)).toBe(g.buildX);
      let prev = -Infinity;
      for (let ax = 0; ax <= 7 - w + 1e-9; ax += 0.05) {
        const x = geo.pieceX(ax, w);
        expect(x).toBeGreaterThan(prev);
        expect(geo.anchorXAt(x, w)).toBeCloseTo(ax, 9);
        prev = x;
      }
    }
  });

  it('K-01 cellAt inverts cellRect for all 80 cells; outside the grid is null', () => {
    for (let x = 0; x < 8; x++) {
      for (let y = 0; y < 10; y++) {
        const r = geo.cellRect(x, y);
        expect(geo.cellAt(r.x + r.w / 2, r.y + r.h / 2)).toEqual({ x, y });
        expect(geo.cellAt(r.x, r.y + r.h - 0.001)).toEqual({ x, y });
      }
    }
    expect(geo.cellAt(g.yardX - 1, geo.rowTop(0))).toBeNull();
    expect(geo.cellAt(g.yardX, geo.craneTopY - 1)).toBeNull();
    expect(geo.cellAt(g.yardX, geo.boardBottomY + 1)).toBeNull();
  });

  it('K-01 cellAt: every cell owns the half-open box [left, left + 120) × [top, top + 120), FIT and EXPAND', () => {
    for (const H of [1920, 2337, 2400]) {
      const gg = createLayout(TOKENS, H).grid;
      for (let x = 0; x < 8; x++) {
        for (let y = 0; y < 10; y++) {
          const r = gg.cellRect(x, y);
          expect(gg.cellAt(r.x, r.y)).toEqual({ x, y });
          expect(gg.cellAt(r.x + r.w - 0.5, r.y)).toEqual({ x, y });
          expect(gg.cellAt(r.x, r.y + r.h - 0.5)).toEqual({ x, y });
        }
      }
      // The board's bottom line is the first pixel BELOW row 0; the crane top line is row 9's first pixel.
      expect(gg.cellAt(g.yardX, gg.boardBottomY)).toBeNull();
      expect(gg.cellAt(g.yardX, gg.craneTopY)).toEqual({ x: 0, y: 9 });
      expect(gg.cellAt(g.yardX, gg.rowTop(0))).toEqual({ x: 0, y: 0 });
    }
  });

  it('TECH 2.2 pieceRect / anchorYAt: rows grow upward from boardBottomY', () => {
    const r = geo.pieceRect(6, 0, 2, 2);
    expect(r).toEqual({ x: g.buildX, y: geo.boardBottomY - 240, w: 240, h: 240 });
    expect(geo.anchorYAt(r.y, 2)).toBeCloseTo(0, 9);
    expect(geo.anchorYAt(geo.pieceY(8.25, 3), 3)).toBeCloseTo(8.25, 9);
  });

  it('UX 0.3 hitArea pads short sides equally (110 → 128: 9 px each side) and leaves long sides alone', () => {
    expect(hitArea({ x: 168, y: 40, w: 592, h: 110 }, 128)).toEqual({ x: 168, y: 31, w: 592, h: 128 });
    expect(hitArea({ x: 0, y: 0, w: 172, h: 172 }, 128)).toEqual({ x: 0, y: 0, w: 172, h: 172 });
    expect(l.bottom.navTabs).toHaveLength(NAV_TABS);
  });
});
