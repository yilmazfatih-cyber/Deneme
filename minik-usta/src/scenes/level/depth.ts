/**
 * Display depths of the level screen (docs/TECH_DESIGN.md §10.3; ART_DIRECTION §4 "Katman sırası").
 *
 * Board part, bottom → top, exactly as ART §4: blueprint floor → plan cells → blueprint grid overlay → build-front
 * contour → placed blocks → ceiling beam → fall shadow → dragged block. Around it: background below, effects and HUD
 * above. Pure data (no Phaser): tests/scenes/depth.test.ts checks the order.
 */
export const DEPTH = Object.freeze({
  /** Sky (chapter colours). */
  background: 0,
  /** Crane-area band and line, yard floor and frame, wall, blueprint floor, `board_blueprint_deep`, scaffold. */
  boardGround: 10,
  /** Plan cells (`plan_<c>`, `plan_<c>_front`, `plan_hidden`). */
  planCells: 20,
  /**
   * Blueprint grid overlay (`grid_h<rows>`, over the plan cells, under the blocks), the `.` overlay (+1), the W1 rails
   * (+2, ART §5 Faz 2 tur 2) and their JUICE #22 glow (+3).
   */
  planOverlay: 30,
  /** Build-front contour `plan_front` (K-34, R-01). */
  buildFront: 40,
  /** Contact silhouettes of the resting blocks (ART §3 layer 8). */
  contactShadow: 45,
  /** Placed blocks (yard and site). */
  placedBlocks: 50,
  /** Ceiling beam `board_ceiling_beam` + clamps (S8; in front of the blocks). */
  ceilingBeam: 60,
  /** Fall shadow: ghost body, outline, support hatch, badges (UX §5.4). */
  fallShadow: 70,
  /** Lifted / crane silhouette of the dragged block. */
  draggedShadow: 80,
  /** The dragged block (always on top of the board). */
  draggedBlock: 90,
  /** Cancel badge on the dragged block, particles, flashes. */
  effects: 100,
  /** HUD (`ui/`: panorama …). */
  hud: 200,
  /** Tutorial spotlight, glove and Usta Dede bubble (UX §13.1): over the HUD and the JUICE banners (hud + 10). */
  tutorial: 260,
  /** Windows (pause, exit confirm, out of moves, win; UX §0.3 "Pencere"): over everything else. */
  windows: 300,
});

export type DepthLayer = keyof typeof DEPTH;

/**
 * During a drag (UX §13.1 "Sürüklenen blok … karartmanın üstünde", review Faz 2 tur 2 #1) the dragged block and its whole
 * shadow look (ghost body, outline, badge, hatches, fall path, cancel badge, tether) are drawn ABOVE the tutorial
 * spotlight: a depth of that stack (`fallShadow` … `effects` + 2) maps into `tutorial` + 5 … + 8, order kept — over the
 * glove and the Usta Dede bubble (`tutorial` + 3 / + 4), under the windows. Restored on release.
 */
export function overTutorial(depth: number): number {
  return DEPTH.tutorial + 5 + (depth - DEPTH.fallShadow) / 10;
}

/** TECH §10.3 order of the layers, bottom → top (the test asserts strictly increasing depths). */
export const DEPTH_ORDER: readonly DepthLayer[] = Object.freeze([
  'background',
  'boardGround',
  'planCells',
  'planOverlay',
  'buildFront',
  'contactShadow',
  'placedBlocks',
  'ceilingBeam',
  'fallShadow',
  'draggedShadow',
  'draggedBlock',
  'effects',
  'hud',
  'tutorial',
  'windows',
]);
