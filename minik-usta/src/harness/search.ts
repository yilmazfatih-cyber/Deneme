/**
 * Drag search for the harness (docs/TECH_DESIGN.md §12.2 screens, §10.7 perf): finds a drag of the running level that
 * shows a given fall shadow or spends a move without placing. Pure, read-only core queries (`tryBeginDrag`,
 * `DragSession.classify`, `computeFall`, `shadowInfo`): the same answers the scene's shadow shows (shadowLook.ts), so a
 * screen shot of "the wrong shadow" does not depend on hand-picked coordinates that a level edit would break.
 *
 * Order is deterministic: pieces by id, nodes by node code (`reachableNodes`), then the kind's preference score.
 */
import { computeFall, shadowInfo } from '../core/gravity.ts';
import { tryBeginDrag } from '../core/movement.ts';
import type { MoveHooks } from '../core/moves.ts';
import type { GameState } from '../core/state.ts';
import type { PieceId } from '../core/types.ts';
import type { DragCandidate, DragKind } from './api.ts';

interface Scored {
  readonly cand: DragCandidate;
  readonly score: number;
}

/**
 * The best drag of `kind` on `s`, or null. `allowed`: only these pieces (a required tutorial step lets only its
 * highlighted blocks be pressed, UX §13.1).
 */
export function findDragOn(
  s: GameState,
  hooks: MoveHooks,
  kind: DragKind,
  allowed: ReadonlySet<PieceId> | null = null,
): DragCandidate | null {
  let best: Scored | null = null;
  const count = s.lvl.layout.counts.pieces;
  for (let id = 0; id < count; id++) {
    if (allowed && !allowed.has(id)) continue;
    const attempt = tryBeginDrag(s, id, hooks.drag);
    if (!attempt.ok) continue;
    const session = attempt.session;
    for (const node of session.reachableNodes()) {
      const drop = session.classify(node);
      const steps = session.distanceFromStart(node);
      let scored: Scored | null = null;
      if (drop.kind === 'yard') {
        if (kind === 'yard')
          scored = { cand: { kind, pieceId: id, to: node, tone: null, reasons: [], steps }, score: steps };
      } else if (drop.kind === 'cancel') {
        if (kind === 'cancel' && (drop.reason === 'craneOverYard' || drop.reason === 'straddle'))
          scored = { cand: { kind, pieceId: id, to: node, tone: null, reasons: [], steps }, score: steps };
      } else if (drop.kind === 'siteFree' || drop.kind === 'siteRail') {
        const fall = computeFall(s, id, node, { rules: hooks.fall });
        const info = shadowInfo(fall, s.lvl.difficulty);
        const primary = info.reasons[0] ?? null;
        const rail = drop.kind === 'siteRail';
        const cand: DragCandidate = {
          kind,
          pieceId: id,
          to: node,
          tone: info.tone,
          reasons: [...info.reasons],
          steps,
        };
        // FREE releases: the crane row first (the fall shadow is longest), then the shortest path
        const freeScore = (10 - node.iy) * 1000 + steps;
        if (kind === 'correct' && !rail && info.tone === 'correct') scored = { cand, score: freeScore };
        else if (kind === 'wrong' && !rail && info.tone === 'wrong' && primary !== 'support')
          scored = { cand, score: freeScore };
        else if (kind === 'support' && primary === 'support')
          scored = { cand, score: (rail ? 0 : 100_000) + freeScore };
        else if (kind === 'rail' && rail)
          scored = { cand, score: (info.tone === 'correct' ? 0 : 100_000) + steps };
      }
      if (scored && (!best || scored.score < best.score)) best = scored;
    }
  }
  return best?.cand ?? null;
}
