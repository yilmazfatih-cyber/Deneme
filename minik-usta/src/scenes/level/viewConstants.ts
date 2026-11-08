/**
 * Level-screen numbers that have NO token in src/theme/tokens.json (R-04: values come from tokens). They are collected
 * here with the document they come from, like theme/draw/art.ts, so the day design-lead adds the keys only this file
 * changes. Do not add values here that tokens.json already has.
 */
export const VIEW = Object.freeze({
  /** TECH §4.4: a non-adjacent node change is followed along the BFS path at 12 ms per cell, at most 120 ms. */
  pathMsPerCell: 12,
  pathMaxMs: 120,
  /** UX §5.3 / §5.4 cancel preview: the dragged block is 60 % opaque (+ "↩" badge). → `alpha.cancelPreview` */
  cancelAlpha: 0.6,
  /** UX §5.3 immovable block: "2 px sağ-sol titreme (3 döngü, 180 ms)" (duration = `duration.blockedShake`). */
  shakePx: 2,
  shakeCycles: 3,
  /** UX §5.3 tap without drag: "1 hücrelik zıplama (120 ms)". → `drag.tapHopCells`, `duration.tapHop` */
  tapHopCells: 1,
  tapHopMs: 120,
  /** The same tap with reduced motion (JUICE §0 rule 8: no hop, scale ≤ 3 %): a 1 → 1.03 → 1 pulse over `tapHopMs`. */
  tapPulseScale: 1.03,
  /** JUICE #13: the wrong-placement bounce flies on an arc 1.5 cells high. → `drag.bounceArcCells` */
  bounceArcCells: 1.5,
  /** JUICE #8: the cancel return is "kavisli"; its height is not specified: 0.5 cell. → `drag.cancelArcCells` */
  cancelArcCells: 0.5,
  /** UX §5.4: the wrong outline and the missing-support hatch pulse at 2 Hz (alpha 1 → 0.55 → 1). */
  pulseHz: 2,
  pulseMinAlpha: 0.55,
  /** JUICE #7: the badge pops 0.8 → 1.0 when the shadow state changes (duration = `duration.ghostSwitch`). */
  badgePopFrom: 0.8,
  /** UX §5.1 panorama: inner padding of the strip and the gap between two segment columns (in panorama cells). */
  panoramaPadPx: 6,
  panoramaGapCells: 1,
  /** UX §5.1 (Faz 2 tur 2) panorama cell: `min(24, ⌊(110 − 2·pad) / rows⌋)`, at least 12 px. */
  panoramaMaxCellPx: 24,
  panoramaMinCellPx: 12,
  /** UX §13.2 level 5 row: the panorama arrow, 64 × 40 white with a 4 px `ui.ink` outline, sliding 16 px every 1.2 s. */
  panoramaArrowW: 64,
  panoramaArrowH: 40,
  panoramaArrowStrokePx: 4,
  panoramaArrowSlidePx: 16,
  panoramaArrowPeriodMs: 1200,
  /** UX §5.1 "aktif dilim beyaz çerçeveli": frame line width. → `stroke.panoramaActivePx` */
  panoramaFramePx: 3,
  /** ART §2.4 `board.yardFrame` "20 px tahta kenar" (`board_yard_frame` is a P0 placeholder asset; flat strips here). */
  yardFramePx: 20,
});

/** TECH §10.4: PieceView views created at scene start (a level holds ≤ 48 visible blocks). */
export const PIECE_POOL_PREWARM = 48;

/**
 * JUICE.md numbers of the Phase 2 P0 events (JUICE §0 rule 12) that have NO token yet (durations, easings, sounds,
 * haptics and the larger particle counts DO come from tokens: `duration.*`, `easing.*`, `audio.*`, `haptic.*`,
 * `particles.*`). Each entry names its JUICE row; "→ key" is the token name proposed to design-lead.
 */
export const JUICE_VIEW = Object.freeze({
  /** #87 / UX §1 `resume.strip` pill (review Faz 2 tur 1 #7): 96 px high, 32 px side pad. → `layout.toast*` */
  toastH: 96,
  toastPadPx: 32,
  /** #1 lift: "6 px yukarı zıplama". → `drag.liftHopPx` */
  liftHopPx: 6,
  /** #2 blocked: "engel 300 ms beyaz parlar"; 3 dust motes under the block. → `duration.blockedFlash` */
  blockedFlashMs: 300,
  blockedDust: 3,
  /** #2 / #12 / #18 white flash peak alpha ("alfa 0 → 0,6 → 0"; segment "beyaz %40 ×2"). */
  flashPeak: 0.6,
  segmentFlashPeak: 0.4,
  segmentFlashes: 2,
  /** #3 drag trail: "3 karelik soluk iz (%25)" over `drag.trailMinSpeedCells`. */
  dragTrailFrames: 3,
  dragTrailAlpha: 0.25,
  /** #4 bump: 2 dust motes at the contact; haptic at most once per 400 ms. */
  bumpDust: 2,
  bumpHapticMs: 400,
  /** #4 tether: dotted line of 8 dots (drag.tetherMinCells / tetherDelayMs from tokens). */
  tetherDots: 8,
  tetherDotPx: 10,
  /** #6 wall pass: "3 hayalet, %30 → 0", 6 wind lines. */
  wallTrailFrames: 3,
  wallTrailAlpha: 0.3,
  windLines: 6,
  /** #9 yard drop: "squash (y 0,94)", 4 dust motes. */
  setYardSquashY: 0.94,
  setYardDust: 4,
  /** #10 fall: "2 karelik dikey iz (%20)"; `sfx_fall` only for falls of ≥ 3 cells. */
  fallTrailFrames: 2,
  fallTrailAlpha: 0.2,
  fallSoundMinRows: 3,
  /** #11 landing squash x 1,12 / y 0,86; dust spread ±60 px; `sfx_land` +0…+4 dB over the fall distance (8 rows). */
  landSquashX: 1.12,
  landSquashY: 0.86,
  landDustSpreadPx: 60,
  landMaxDb: 4,
  landRowsForMaxDb: 8,
  /** #12 four mortar dots on the corners; sparks rise 120–220 px. */
  mortarDots: 4,
  sparkRiseMinPx: 120,
  sparkRiseMaxPx: 220,
  /** #13 wrong: red tint (`color.ghost.invalid`) at 50 % for 100 ms, 2 px × 3 shake, then the bounce; 3 grey dust. */
  wrongTintAlpha: 0.5,
  wrongTintMs: 100,
  wrongShakeMs: 120,
  wrongDust: 3,
  /** #15 bead pop 0,6 → 1,2 → 1,0; 4 gold sparks. */
  pipFrom: 0.6,
  pipPeak: 1.2,
  pipSparks: 4,
  /** #16 trowel icon 1,0 → 1,4 → 1,1 (MVP-lite: icon glow + sound, no spark rain). */
  comboIconPeak: 1.4,
  comboIconRest: 1.1,
  /** #17 trowel: flight (arc 1,5 cells) then the plaster sweep (`setCrop`, 200 ms); 12 gold + colour sparks. */
  trowelSweepMs: 200,
  trowelArcCells: 1.5,
  trowelSparks: 12,
  /** #18 segment: screen shake 3 px; the outgoing segment flies to its panorama slot, the next one enters from the right. */
  segmentShakePx: 3,
  /** #19 truck: enter 300 ms, exit 200 ms, 4 dust per block; `sfx_land` −6 dB per block. */
  truckEnterMs: 300,
  truckExitMs: 200,
  truckDustPerBlock: 4,
  truckLandDb: -6,
  /** #20 chip bump 1,0 → 1,15 → 1,0. */
  chipPeak: 1.15,
  /** #88 "küçülerek" — the block shrinks to 30 % on its way into the chip (and grows back out of it, #20). */
  queueShrink: 0.3,
  /** #22 four sparks at the rail contact. */
  railSparks: 4,
  /** #13 / #44 yard cascade landings play `sfx_land` at −8 dB. */
  cascadeLandDb: -8,
  /** #51 last-moves pulse 1,0 ↔ 1,06; it starts at 5 moves left. */
  lastMovesAt: 5,
  lastMovesPulse: 1.06,
  /** #51 "her hamlede bir kez güçlü nabız": twice the loop amplitude (1,12) over half a period. */
  lastMovesStrong: 1.12,
  /** #50 the digit slides 48 px. */
  movesRollPx: 48,
  /** #53 five "+1" chips 60 ms apart, counter bump 1,2, 8 gold sparks. */
  movesAddChips: 5,
  movesAddStaggerMs: 60,
  movesAddBump: 1.2,
  movesAddSparks: 8,
  /** #55 title 0 → 1,1 → 1,0 in the first 500 ms of the confetti. */
  winTitlePeak: 1.1,
  winTitleMs: 500,
  /** #56 four gold sparks per coin; pitch +1 semitone every 3 coins, at most +12; haptic every 3rd. */
  bonusSparks: 4,
  bonusPitchEvery: 3,
  bonusPitchMax: 12,
  bonusReducedMs: 300,
  /** #56 one coin flies for three bonus steps (3 × `duration.bonusPerMove`). */
  bonusCoinFlyMs: 360,
  /** #57 board darkens 20 %. */
  loseDim: 0.2,
  /** #69 button press 0,94 / release 1,04 → 1,0. */
  buttonPressScale: 0.94,
  buttonReleasePeak: 1.04,
  /** #70 dim fades in over 180 ms; panel 0,85 → 1,03 → 1,0. #71 panel 1,0 → 0,9; reduced close 120 ms. */
  popupDimMs: 180,
  popupFrom: 0.85,
  popupPeak: 1.03,
  popupCloseTo: 0.9,
  popupCloseReducedMs: 120,
  /** #52 options enter 40 ms apart; the dim takes 200 ms. */
  offerStaggerMs: 40,
  offerDimMs: 200,
  /** #52 the window slides up 480 px from below; the "+5" chip hops 24 px once. */
  offerSlidePx: 480,
  offerChipHopPx: 24,
  /** #84 the support hatch blinks 3 times; `sfx_tick` × 2 at −14 dB (the token sound is −6 dB: −8 dB more). */
  supportBlinks: 3,
  supportTickDb: -8,
  /** Ease without a token (JUICE #17, #53, #88 `Quad.easeInOut`). → `easing.moveInOut` */
  easeMoveInOut: 'Quad.easeInOut',
});
