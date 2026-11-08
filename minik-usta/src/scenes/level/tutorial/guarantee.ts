/**
 * Never-lock guarantee of a required tutorial step (docs/GDD.md §14.1/4b; TECH_DESIGN §8.2 "Kilit güvencesi"): can one
 * of the highlighted `piece:` / `debris:` blocks still produce the step's `done` event in the current state? When none
 * can, the controller skips the step (it counts as done) and the player is never locked inside the spotlight.
 *
 * Every answer comes from the core (no rule here): the K-09 gate + BFS (`tryBeginDrag`), the reachable set `R` and its
 * signals (`canCrossWall`, `canEnterRail`), the K-07 release class (`classify`), `computeFall` (K-16 + K-34 verdict,
 * K-18), `isCorrectPlacement` for rail nodes, and for the other move-end events a simulation of the drag through the
 * K-35 pipeline (`applyMove` on a buffer copy, no truck help) read by the same matcher the controller counts with.
 */
import { computeFall } from '../../../core/gravity.ts';
import type { TutCondition } from '../../../core/level/schema.ts';
import { tryBeginDrag } from '../../../core/movement.ts';
import type { DragRules, DragSession } from '../../../core/movement.ts';
import { ArraySink, applyMove } from '../../../core/moves.ts';
import type { MoveHooks } from '../../../core/moves.ts';
import { isCorrectPlacement } from '../../../core/placement.ts';
import { FLAG_BIT, cloneState, pieceFlags } from '../../../core/state.ts';
import type { GameState } from '../../../core/state.ts';
import type { DragNode, PieceId } from '../../../core/types.ts';
import { moveMatches } from './tutorialEvents.ts';

export interface GuaranteeRules {
  readonly drag: DragRules;
  readonly hooks: MoveHooks;
}

/** `true` when at least one of `pieces` can produce `cond` now (GDD §14.1/4b). No pieces → false (step skipped). */
export function canProduce(
  s: GameState,
  cond: TutCondition,
  pieces: readonly PieceId[],
  rules: GuaranteeRules,
): boolean {
  for (const id of pieces) {
    const attempt = tryBeginDrag(s, id, rules.drag);
    if (!attempt.ok) continue; // K-09: not pickable now
    if (sessionCanProduce(s, cond, attempt.session, rules)) return true;
  }
  return false;
}

function sessionCanProduce(
  s: GameState,
  cond: TutCondition,
  session: DragSession,
  rules: GuaranteeRules,
): boolean {
  const id = session.pieceId;
  switch (cond.event) {
    case 'overWall':
      return session.canCrossWall;
    case 'gapPass':
      return session.canEnterRail;
    case 'turnEnd':
    case 'holdOverBuild':
    case 'tap':
    case 'boosterUsed':
      return true; // pickable is enough (GDD §14.1/4b)
    case 'placementCorrect':
      return session.reachableNodes().some((node) => correctAt(s, cond, session, node, rules));
    case 'yardMove':
      return session.reachableNodes().some((node) => {
        if (session.classify(node).kind !== 'yard') return false;
        if (cond.at !== undefined && (node.ix !== cond.at[0] || node.iy !== cond.at[1])) return false;
        return cond.painted !== true || node.mode > 0;
      });
    case 'steered':
      return session.reachableNodes().some((node) => session.classify(node).kind === 'siteFree');
    case 'landed':
      if (cond.flag !== undefined && (pieceFlags(s, id) & FLAG_BIT[cond.flag]) === 0) return false;
      return session.reachableNodes().some((node) => {
        if (session.classify(node).kind !== 'siteFree') return false;
        const fall = computeFall(s, id, node, { rules: rules.hooks.fall });
        return fall.effect.kind !== 'break' && (cond.wind !== true || fall.drift !== 0);
      });
    case 'obstacleHit':
    case 'itemCollected':
    case 'yardFall':
    case 'segmentDone':
    case 'deliveryDone':
    case 'carouselTurn':
      return session.reachableNodes().some((node) => simulated(s, cond, session, node, rules));
  }
}

function correctAt(
  s: GameState,
  cond: Extract<TutCondition, { event: 'placementCorrect' }>,
  session: DragSession,
  node: DragNode,
  rules: GuaranteeRules,
): boolean {
  const drop = session.classify(node);
  const id = session.pieceId;
  if (drop.kind === 'siteFree') {
    const fall = computeFall(s, id, node, { rules: rules.hooks.fall });
    if (!fall.verdict.ok) return false;
    if (cond.at !== undefined && (fall.landing.ix !== cond.at[0] || fall.landing.iy !== cond.at[1]))
      return false;
    return cond.hidden !== true || fall.touchesHidden;
  }
  if (drop.kind === 'siteRail') {
    if (cond.hidden === true) return false; // rail cells: hidden check needs the reveal set (Phase 3, K-32)
    if (cond.at !== undefined && (node.ix !== cond.at[0] || node.iy !== cond.at[1])) return false;
    return isCorrectPlacement(s, id, session.cells(node)).ok;
  }
  return false;
}

/** K-35 simulation of one release (TECH §8.2): a buffer copy, no truck help (step 12 produces none of these events). */
function simulated(
  s: GameState,
  cond: TutCondition,
  session: DragSession,
  node: DragNode,
  rules: GuaranteeRules,
): boolean {
  if (session.classify(node).kind === 'cancel') return false;
  const copy = cloneState(s);
  const sink = new ArraySink();
  const res = applyMove(copy, { kind: 'drag', pieceId: session.pieceId, to: node }, sink, {
    hooks: rules.hooks,
    noTruckHelp: true,
  });
  return res.status === 'applied' && moveMatches(cond, sink.events, copy);
}
