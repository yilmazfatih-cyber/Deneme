/**
 * What the fall shadow shows (GDD K-18, K-34 hook 2; UX_FLOWS §5.3–§5.4; D-014 double coding; TECH_DESIGN §5.1).
 * Pure: the scene's ShadowView draws exactly this. The core decides everything about the landing (`computeFall` →
 * landing, verdict, `touchesHidden`, glass effect) and what may be shown (`shadowInfo`); this module only maps it to
 * the design-lead's look:
 *
 * | case                         | outline  | badge             | pulse | missing-support hatch          |
 * | ---------------------------- | -------- | ----------------- | ----- | ------------------------------ |
 * | easy/normal, correct         | valid    | ✓ `ok`            | no    | —                              |
 * | easy/normal, wrong           | invalid  | ! `warn`, ↓ `support` when `reasons[0]` is `support` | 2 Hz | cells of `missingSupport` when `reasons[0]` is `support` |
 * | easy/normal, wrong, `reasons[0]` ∈ debris / outside / window / color | as above | ! `warn` | 2 Hz | — ; 45° hatch on the reason's cells (`mismatchCells`, core `reasonCells`) |
 * | hard/superhard               | neutral  | —                 | no    | — (UX §5.4: shown after the bounce only, §5.5) |
 * | touches an unrevealed `?`    | neutral  | —                 | no    | easy/normal: as above (support carries no hidden information, GDD K-34 hook 2) |
 * | glass will break (S3)        | as above | cracked glass (physics information, every difficulty) |
 *
 * Only the PRIMARY reason is shown (`reasons[0]`, UX §5.4). On the rail (K-12) there is no fall: the outline is drawn on
 * the block itself (`body: false`). A cancelling release (K-07 rows 3–5) shows no shadow; the dragged block turns
 * 60 % opaque with the ↩ badge instead (`cancelPreview`).
 */
import { shadowInfo } from '../../core/gravity.ts';
import type { FallResult } from '../../core/gravity.ts';
import type { CompiledLevel } from '../../core/level/compile.ts';
import type { BoardCell } from '../../core/grid.ts';
import type { DropClass } from '../../core/movement.ts';
import { reasonCells } from '../../core/placement.ts';
import type { GameState } from '../../core/state.ts';
import type { At, PieceId } from '../../core/types.ts';
import type { ShapeDef } from '../../core/shapes.ts';
import type { BadgeKind } from '../../theme/draw/badge.ts';
import type { Layout } from '../../theme/layout.ts';

export type GhostOutline = 'valid' | 'invalid' | 'neutral';

export interface ShadowLook {
  readonly outline: GhostOutline;
  /** Ghost body (block colour at `alpha.ghostFill`) at the landing; false on the rail (outline on the block). */
  readonly body: boolean;
  readonly badge: BadgeKind | null;
  /** UX §5.4: the wrong outline and the missing-support hatch pulse at 2 Hz. */
  readonly pulse: boolean;
  /** Plan cells under the K-34 horizontal hatch (`plan_support_hatch`). */
  readonly supportCells: readonly At[];
  /**
   * Landing cells under the 45° hatch (`ghost_hatch45`, UX §5.4): the cells of the primary reason when it is `debris`,
   * `outside`, `window` or `color` (easy / normal wrong shadow only; empty otherwise).
   */
  readonly mismatchCells: readonly BoardCell[];
  /** Equality key: a change replays the JUICE #7 switch (badge pop). */
  readonly key: string;
}

const NONE: readonly At[] = Object.freeze([]);
const NO_CELLS: readonly BoardCell[] = Object.freeze([]);

/**
 * UX §5.4 look of a release that falls (`siteFree`) or stays on the rail (`siteRail`). `of` (the state and the dragged
 * piece) lets the core name the cells of the primary reason for the 45° hatch; without it there is no hatch.
 */
export function shadowLook(
  fall: FallResult,
  difficulty: CompiledLevel['difficulty'],
  of?: { readonly state: GameState; readonly pieceId: PieceId },
): ShadowLook {
  const info = shadowInfo(fall, difficulty);
  const easy = difficulty === 'easy' || difficulty === 'normal';
  const primary = info.reasons[0] ?? null;
  let outline: GhostOutline;
  let badge: BadgeKind | null = null;
  let pulse = false;
  let supportCells: readonly At[] = NONE;
  let mismatchCells: readonly BoardCell[] = NO_CELLS;
  if (info.tone === 'correct') {
    outline = 'valid';
    badge = 'ok';
  } else if (info.tone === 'wrong') {
    outline = 'invalid';
    badge = primary === 'support' ? 'support' : 'warn';
    pulse = true;
    if (primary === 'support') supportCells = info.missingSupport;
    else if (primary && of) mismatchCells = reasonCells(of.state, of.pieceId, fall.cells, primary);
  } else {
    outline = 'neutral';
    if (easy && primary === 'support') supportCells = info.missingSupport;
  }
  if (info.breaks) badge = 'glass';
  const body = fall.mode === 'free';
  const key = [
    outline,
    badge ?? '-',
    body ? 'b' : 'r',
    supportCells.map((c) => `${c.x},${c.y}`).join(';'),
    mismatchCells.map((c) => `${c.x},${c.y}`).join(';'),
  ].join('|');
  return { outline, body, badge, pulse, supportCells, mismatchCells, key };
}

/** UX §5.3 cancel preview: rows 3 (crane area over the yard), 4 (straddling the wall) and 5 (site closed, E-27). */
export function cancelPreview(drop: DropClass): boolean {
  return (
    drop.kind === 'cancel' &&
    (drop.reason === 'craneOverYard' || drop.reason === 'straddle' || drop.reason === 'siteClosed')
  );
}

/** A release onto the site that the shadow shows (K-07 rows 6 and 7). */
export function showsShadow(drop: DropClass): boolean {
  return drop.kind === 'siteFree' || drop.kind === 'siteRail';
}

/** Top-right cell of a shape (highest row, then rightmost): where the badge sits (UX §5.4 "sağ üstte"). */
export function badgeCell(shape: ShapeDef): { x: number; y: number } {
  let best = shape.cells[0] ?? { x: 0, y: 0 };
  for (const c of shape.cells) if (c.y > best.y || (c.y === best.y && c.x > best.x)) best = c;
  return { x: best.x, y: best.y };
}

/** Centre of the badge on a box anchored at continuous `(ax, ay)`: inside the top-right cell's corner. */
export function badgeCentre(
  layout: Layout,
  shape: ShapeDef,
  ax: number,
  ay: number,
  diameter: number,
): { x: number; y: number } {
  const cell = badgeCell(shape);
  const g = layout.grid;
  const box = g.pieceRect(ax, ay, shape.w, shape.h);
  const right = box.x + (cell.x + 1) * g.cellPx;
  const top = box.y + (shape.h - 1 - cell.y) * g.cellPx;
  return { x: right - diameter / 2, y: top + diameter / 2 };
}
