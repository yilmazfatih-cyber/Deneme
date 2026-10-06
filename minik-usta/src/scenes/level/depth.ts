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
  /** Crane-area band and line, yard floor and frame, wall, W1 rails, blueprint floor, `board_blueprint_deep`, scaffold. */
  boardGround: 10,
  /** Plan cells (`plan_<c>`, `plan_<c>_front`, `plan_hidden`). */
  planCells: 20,
  /** Blueprint grid overlay (`grid_h<rows>`, over the plan cells, under the blocks) and the `.` overlay. */
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
});

export type DepthLayer = keyof typeof DEPTH;

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
]);
