/**
 * UI numbers that have NO token in src/theme/tokens.json (R-04: values come from tokens). Collected here with the
 * document they come from (like scenes/level/viewConstants.ts), so the day design-lead adds the keys only this file
 * changes. "→ key" is the token name proposed to design-lead. Values already in tokens are never copied here.
 */
export const UI = Object.freeze({
  /** UX §0.3 "Pencere": panel edge 12 px (`ui.panelEdge`). → `stroke.panelEdgePx` */
  panelEdgePx: 12,
  /** Window panel width: the option column (`layout.popup.optionW` 920) plus 40 px each side (UX §7 wireframe). */
  panelSidePadPx: 40,
  /** Space between the panel top and the title, and between content rows (UX §7 wireframe ≈ 40 px). */
  panelTopPadPx: 56,
  contentGapPx: 32,
  /** Gap between the content and the option stack (UX §7: "Teklif 1/3" at 976, first option at 1056). */
  contentToOptionsPx: 40,
  /** UX §0.3 "Kapat (×)": Ø 112 px visual (+16 px pad = 144 px target), 40 px over the panel's top-right corner. */
  closeVisualPx: 112,
  closeOverhangPx: 40,
  /** UX §0.3 "Eşit çift düğme": 440 × 152 with a 40 px gap (total 920 = `layout.popup.optionW`). */
  pairW: 440,
  pairGapPx: 40,
  /** UX §5.1 Pause window: one switch row per setting (128 px target, UX §0.1 "açık/kapalı anahtarları"). */
  toggleRowH: 128,
  togglePillW: 200,
  togglePillH: 88,
  /** UX §7 window 1 info box ("kalan hedef" 596–896 = 300 px high). */
  loseInfoH: 300,
  /** UX §7 window 2 heart (`icon_life` placeholder) diameter. */
  heartPx: 120,
  /** UX §6 win screen (H = 1920 wireframe): "Devam" 640 × 176, centre (540, 1688) → bottom edge 144 px above H. */
  winButtonW: 640,
  winButtonH: 176,
  winButtonBottomPx: 144,
  /** UX §6 lines at y 1140 / 1200 / 1260 (60 px apart) → the line block sits 300 px above the button. */
  winLineStepPx: 60,
  winLinesAboveButtonPx: 340,
  /**
   * Review Faz 2 tur 1 #6: the win panel sits between the status strip (16 px under it) and the button (8 px above it:
   * at 390 × 844 the band is 185 px); the reward row (h2 64 px) takes 72 px, the panel pads 20 px (≥ 8 px) and the line
   * step tightens 60 → ≥ 44 px (body 44 px).
   */
  winPanelGapPx: 16,
  winPanelButtonGapPx: 8,
  winRewardRowPx: 72,
  winPanelPadPx: 20,
  winPanelPadMinPx: 8,
  winLineStepMinPx: 44,
  /** Inline icon size (`{coin}`, `{ok}`): 1 em of the text (UX §0.3 PriceLabel "1 em"). */
  inlineIconEm: 1,
  /** UX §5.1 goals panel: build icon 72 px, inner pad 24 px. */
  goalIconPx: 72,
  goalPadPx: 24,
  /** UX §5.1 pause button: 128 × 128 (`layout.top.pause*`), two bars 20 × 56 px. */
  pauseBarW: 20,
  pauseBarH: 56,
  pauseBarGap: 20,
  /** UX §13.1 tutorial: glove 140 × 160 px; Dede bust 200 px; bubble at most 760 × 280; hole pad 12 px, edge 6 px. */
  gloveW: 140,
  gloveH: 160,
  dedeBustPx: 200,
  bubbleMaxW: 760,
  /** Review Faz 2 tur 1 #3: gap between the HUD group bottom (`top.groupBottomY`) and the Usta Dede bubble. */
  bubbleHudGapPx: 16,
  bubbleMaxH: 280,
  bubblePadPx: 32,
  spotPadPx: 12,
  spotEdgePx: 6,
  /** UX §13.1 `tap`: the glove presses to 0.9× and back. */
  glovePressScale: 0.9,
  /** UX §13.1 `drag`: dotted trail of the glove path, white at 60 %. */
  gloveTrailAlpha: 0.6,
  gloveTrailDots: 10,
  /** UX §13.1 `hold`: pressed for 0.6 s. */
  gloveHoldMs: 600,
  /** UX §2.1 intro: panel → board transition 0.4 s. */
  introToBoardMs: 400,
  /** UX §1 / §6 minimal home: the game name at 0.6× of `font.size.display`. */
  homeTitleScale: 0.6,
  /** UX §6 home band `home.moreSoon`: 96 px high band above the level button. */
  homeBandH: 96,
  homeBandGapPx: 32,
  /** UX §2.2 step 11: "Bölüm 2" pulse 1.0 ↔ 1.06 (same pulse as JUICE #51). */
  homePulsePeak: 1.06,
  /** Reduced motion (JUICE §0 rule 8, review Faz 2 tur 1 #18): steady `ui.gold` edge around "BÖLÜM 2" instead of the pulse. */
  homeEdgePx: 8,
});
