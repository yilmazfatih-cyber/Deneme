/**
 * Tutorial `done` / `startOn` event matching (docs/GDD.md §14.1/3 closed vocabulary; TECH_DESIGN §8.2 "Tamam olayları"
 * table). Pure: reads a committed move's `GameEvent` list (K-35 steps) and, for the flag filters, the state after it.
 *
 * Three classes (GDD §14.1/3):
 * - drag signals `overWall`, `gapPass`, `holdOverBuild` come from the scene during the drag (never from move events);
 * - move-end events are read from the move's events and count AT MOST ONCE per move (a drag or a booster use): several
 *   matching core events in one move (two crates, three falling blocks) are one count;
 * - `tap`, `boosterUsed` (+ `timeoutMs`, which is not an event).
 */
import { FLAG_BIT, pieceFlags } from '../../../core/state.ts';
import type { GameState } from '../../../core/state.ts';
import type { TutCondition } from '../../../core/level/schema.ts';
import type { GameEvent, PieceId } from '../../../core/types.ts';

export type TutEventName = TutCondition['event'];

/** Drag-time signals (TECH §8.2: scene signals, not core events). */
export const DRAG_SIGNAL_EVENTS = ['overWall', 'gapPass', 'holdOverBuild'] as const;
export type DragSignalEvent = (typeof DRAG_SIGNAL_EVENTS)[number];

export function isDragSignal(event: TutEventName): event is DragSignalEvent {
  return (DRAG_SIGNAL_EVENTS as readonly string[]).includes(event);
}

type FlagName = 'glass' | 'balloon' | 'mortar';

function hasFlag(s: GameState | null, id: PieceId, flag: FlagName): boolean {
  if (!s) return false;
  return (pieceFlags(s, id) & FLAG_BIT[flag]) !== 0;
}

/** Anchor (box origin) of a block from its cells (shapes are normalised: min x, min y = anchor). */
function anchorOf(cells: readonly { readonly x: number; readonly y: number }[]): [number, number] | null {
  if (cells.length === 0) return null;
  let x = Infinity;
  let y = Infinity;
  for (const c of cells) {
    x = Math.min(x, c.x);
    y = Math.min(y, c.y);
  }
  return [x, y];
}

const atMatches = (at: readonly [number, number] | undefined, x: number, y: number): boolean =>
  at === undefined || (at[0] === x && at[1] === y);

/**
 * True when one committed move matches a move-end condition (filters included). `s` is the state after the move (piece
 * flags for `flag`). Drag signals, `tap` never match here.
 */
export function moveMatches(cond: TutCondition, events: readonly GameEvent[], s: GameState | null): boolean {
  switch (cond.event) {
    case 'turnEnd':
      return events.some((e) => e.t === 'movesChanged' && e.reason === 'move');
    case 'placementCorrect': {
      const hit = events.find((e) => e.t === 'placementCorrect' && e.step === 3);
      if (!hit || hit.t !== 'placementCorrect') return false;
      const a = anchorOf(hit.cells);
      if (cond.at !== undefined && (!a || !atMatches(cond.at, a[0], a[1]))) return false;
      if (cond.hidden === true)
        return events.some((e) => e.t === 'cellsRevealed' && e.step === 3 && e.cells.length > 0);
      return true;
    }
    case 'yardMove': {
      const hit = events.find((e) => e.t === 'pieceMoved' && e.step === 1 && e.to.zone === 'yard');
      if (!hit || hit.t !== 'pieceMoved') return false;
      if (!atMatches(cond.at, hit.to.x, hit.to.y)) return false;
      if (cond.painted === true) return events.some((e) => e.t === 'piecePainted' && e.step === 1);
      return true;
    }
    case 'landed': {
      if (events.some((e) => e.t === 'glassBroke')) return false;
      const hit = events.find(
        (e) =>
          e.step === 2 &&
          ((e.t === 'pieceFell' && e.cause === 'release') || (e.t === 'balloonRose' && e.to.zone === 'site')),
      );
      if (!hit || (hit.t !== 'pieceFell' && hit.t !== 'balloonRose')) return false;
      if (cond.flag !== undefined && !hasFlag(s, hit.pieceId, cond.flag)) return false;
      if (cond.wind === true) return events.some((e) => e.t === 'windDrift' && e.pieceId === hit.pieceId);
      return true;
    }
    case 'steered':
      return events.some((e) => e.t === 'steered' && e.step === 2);
    case 'obstacleHit': {
      const hammer = events.some((e) => e.t === 'boosterApplied' && e.booster === 'hammer');
      const stepOk = (step: number): boolean => step === 5 || step === 6 || (hammer && step === 1);
      return events.some((e) => {
        if (!stepOk(e.step)) return false;
        if (cond.type === 'crate') return e.t === 'crateDamaged' || e.t === 'crateBroken';
        if (cond.type === 'cement_bag') return e.t === 'bagTorn';
        return e.t === 'chainReleased';
      });
    }
    case 'itemCollected':
      return events.some(
        (e) =>
          (e.step === 5 || e.step === 6) &&
          (cond.type === 'screw' ? e.t === 'screwCollected' : e.t === 'keyCollected'),
      );
    case 'yardFall':
      return events.some((e) => e.t === 'pieceFell' && e.cause === 'yardGravity' && e.step === 6);
    case 'segmentDone':
      return events.some((e) => e.t === 'segmentCompleted' && e.step === 8);
    case 'deliveryDone': {
      const flag = cond.flag;
      return events.some(
        (e) =>
          e.t === 'pieceFell' &&
          e.cause === 'delivery' &&
          e.step === 9 &&
          (flag === undefined || hasFlag(s, e.pieceId, flag)),
      );
    }
    case 'carouselTurn':
      return events.some((e) => e.t === 'carouselRotated' && (e.step === 8 || e.step === 10));
    case 'boosterUsed':
      return events.some((e) => e.t === 'boosterApplied');
    case 'overWall':
    case 'gapPass':
    case 'holdOverBuild':
    case 'tap':
      return false;
  }
}
