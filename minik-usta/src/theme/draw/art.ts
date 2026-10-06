/**
 * ART_DIRECTION / UX_FLOWS numbers that have NO token in src/theme/tokens.json yet (R-04: values come from tokens).
 *
 * They are collected here, in one place, with the document they come from, so the drawers stay token-driven and the
 * day design-lead adds the keys (requested in the code-lead report, proposed token path in each comment) only this
 * file changes. Do not add values here that tokens.json already has.
 */
export const ART = Object.freeze({
  /** ART §4 `.` cell: "3 px beyaz %40 kesik kontur" (alpha = `alpha.planEmptyStroke`). → `plan.emptyStrokePx` */
  emptyStrokePx: 3,
  /** ART §4 merged window frame: "dış hatta 4 px beyaz %55 düz çizgi". → `plan.emptyFramePx`, `alpha.planEmptyFrame` */
  emptyFramePx: 4,
  emptyFrameAlpha: 0.55,
  /** ART §4 `?` cell: "dolgu beyaz %10; 4 px beyaz %60 kesik kontur". → `alpha.planHiddenFill`, `alpha.planHiddenStroke` */
  hiddenFillAlpha: 0.1,
  hiddenStrokeAlpha: 0.6,
  /** ART §4 `?` label: "4 px ip deliği", glyph "Baloo 2 800, 52 px". → `plan.hiddenHolePx`, `plan.hiddenGlyphPx` */
  hiddenHolePx: 4,
  hiddenGlyphPx: 52,
  hiddenGlyphWeight: 800,
  /** Paper tag corner radius (no value in ART/ASSET; small rounding of the 64 px tag). → `plan.hiddenTagRadiusPx` */
  hiddenTagRadiusPx: 8,
  /** ART §4 build front "dış parlama" blur radius (alpha = `alpha.buildFrontGlow`). → `plan.frontGlowPx` */
  frontGlowPx: 8,
  /** ART §2.4 blueprint grid: thin "2 px, her hücre", major "3 px, her 2 hücre". → `plan.blueprintLinePx`, `…MajorPx` */
  blueprintLinePx: 2,
  blueprintLineMajorPx: 3,
  /** ART §4 "pafta" corner: 0,6c L line, white 30 %. → `plan.blueprintCornerRatio`, `alpha.blueprintCorner` */
  blueprintCornerRatio: 0.6,
  blueprintCornerAlpha: 0.3,
  blueprintCornerPx: 4,
  /** ART §4 paper speckle: "2 px'lik rastgele beyaz %4 benekler". Density is not specified: 1 per 20 × 20 px. */
  speckPx: 2,
  speckAlpha: 0.04,
  speckAreaPx: 400,
  /** ART §4 scaffold: pole 16 px (+ 4 px light), ledger 10 px at 70 % every 2 rows, clamp 20 × 20. */
  scaffoldPolePx: 16,
  scaffoldPoleLightPx: 4,
  /** "üstte ışık" colour is not specified: white 30 % over `board.scaffold`. → `alpha.scaffoldLight` */
  scaffoldLightAlpha: 0.3,
  scaffoldLedgerPx: 10,
  scaffoldLedgerAlpha: 0.7,
  scaffoldClampPx: 20,
  /** ART §5 wall: formwork lines 2 px, `wallDark` 40 %, every 20 px; side edges 6 px; outline 6 px #3B2A1A 80 %. */
  wallFormworkPx: 2,
  wallFormworkAlpha: 0.4,
  wallFormworkSpacingPx: 20,
  wallEdgePx: 6,
  wallOutlinePx: 6,
  wallOutlineAlpha: 0.8,
  /** ART §5 wall cap: 20 px hazard band + 6 px outline; ASSET `wall_cap` 72 px wide (6 px overhang per side). */
  wallCapPx: 20,
  wallCapW: 72,
  /** ART §2.3 hazard stripes: 45°, 24 px bands. */
  hazardBandPx: 24,
  /** ART §5 W1: "üst ve alt kenarda 14 px sarı-siyah ikaz bandı", ASSET `gap_static_edge` 72 × 14; rails 6 px. */
  gapEdgePx: 14,
  gapRailPx: 6,
  /** ART §5 crane area bottom line: "4 px kesik çizgi (16/12 px)". → `layout.board.craneLinePx`, `plan.craneDash` */
  craneLinePx: 4,
  craneDash: [16, 12] as readonly [number, number],
  /** UX §5.4 ghost dash "16/10" (invalid); the neutral ghost dash is not specified, the same pattern is used. */
  ghostDash: [16, 10] as readonly [number, number],
  /** ART §2.4 yard grid line "3 px". → `layout.grid.yardGridPx` */
  yardGridPx: 3,
});
