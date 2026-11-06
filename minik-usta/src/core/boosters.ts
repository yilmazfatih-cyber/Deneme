/**
 * Booster preconditions (docs/GDD.md §10, K-39; TECH_DESIGN §6.4 `canUse*`). Phase 2 holds only what Undo needs; the
 * hammer (K-36), crane (K-37) and paint brush (K-38) come in Phase 3. The Golden Trowel precondition is
 * `trowelRejection` in core/combo.ts (K-33).
 *
 * K-39 Undo: allowed when the last action was a committed drag move (no booster, trowel or +5 offer in between), it was
 * not undone already (depth 1), the out-of-moves window is not open and the level is not over. The effect — restoring
 * the pre-move state snapshot — belongs to `GameSession` (core/session.ts).
 */

/** Session outcome as seen by booster preconditions (core/session.ts `SessionOutcome`). */
export type BoosterOutcome = 'playing' | 'outOfMoves' | 'won' | 'lost' | 'exited';

/** Why Undo is not available. */
export type UndoBlock = 'levelOver' | 'lossWindow' | 'noDragMove';

export interface UndoView {
  readonly outcome: BoosterOutcome;
  /** A pre-move snapshot of the last committed action exists: it was a drag and was not undone yet. */
  readonly lastDragUndoable: boolean;
}

/** `canUseUndo` (TECH §6.4): null when Undo may be used now, else the reason (the UI greys the slot). */
export function undoBlock(view: UndoView): UndoBlock | null {
  if (view.outcome === 'outOfMoves') return 'lossWindow';
  if (view.outcome !== 'playing') return 'levelOver';
  if (!view.lastDragUndoable) return 'noDragMove';
  return null;
}
