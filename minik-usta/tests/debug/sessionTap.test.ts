/**
 * Debug panel rule switches and session tap (TECH_DESIGN §12.3, §7.1 `disabledRules`; R-20). The tap wraps
 * `GameSession.start` / `replay` while installed; every expectation runs the real core on the real level files.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { levelHooks } from '../../src/core/obstacles/registry.ts';
import { ArraySink, NO_HOOKS } from '../../src/core/moves.ts';
import { GameSession } from '../../src/core/session.ts';
import type { GameEvent, Move } from '../../src/core/types.ts';
import {
  NO_DEBUG_RULES,
  ruleHasHooks,
  ruleSwitches,
  rulesActive,
  sessionHooks,
} from '../../src/debug/rules.ts';
import type { DebugRules } from '../../src/debug/rules.ts';
import { installSessionTap } from '../../src/debug/sessionTap.ts';
import type { SessionTap, TappedAction } from '../../src/debug/sessionTap.ts';
import { HAND, levelFile } from '../core/moves.fixtures.ts';

const ORIGINAL_START = GameSession.start;
const ORIGINAL_REPLAY = GameSession.replay;

let tap: SessionTap | null = null;
afterEach(() => {
  tap?.uninstall();
  tap = null;
});

interface Seen {
  readonly started: string[];
  readonly actions: { readonly action: TappedAction; readonly events: readonly GameEvent[] }[];
}

function install(rules: () => DebugRules): Seen {
  const seen: Seen = { started: [], actions: [] };
  tap = installSessionTap({
    hooks: (lvl, base) => sessionHooks(lvl, rules(), base),
    listener: {
      sessionStarted: (_s, kind) => seen.started.push(kind),
      action: (_s, action, events) => seen.actions.push({ action, events }),
    },
  });
  return seen;
}

const unlimited: DebugRules = { ...NO_DEBUG_RULES, unlimitedMoves: true };

describe('debug rule switches (TECH 12.3)', () => {
  it('TECH 12.3 an idle panel keeps the caller hooks (no session-level switch on)', () => {
    const lvl = levelFile(1);
    expect(sessionHooks(lvl, NO_DEBUG_RULES, NO_HOOKS)).toBeUndefined();
    expect(rulesActive(NO_DEBUG_RULES)).toBe(false);
    expect(rulesActive(unlimited)).toBe(true);
    expect(rulesActive({ ...NO_DEBUG_RULES, yardGravity: true })).toBe(true);
  });

  it('TECH 12.3 unlimited moves = K-35 step 4 base cost 0 on top of the level hooks', () => {
    const lvl = levelFile(3);
    const hooks = sessionHooks(lvl, unlimited, levelHooks(lvl));
    expect(hooks?.moveCost?.({} as never, 0)).toBe(0);
  });

  it('TECH 7.1 Phase 2 rules (W1, S1, S2) are core models without hooks: their switches are not switchable', () => {
    expect(ruleSwitches(levelFile(3)).map((r) => r.id)).toContain('W1');
    expect(ruleSwitches(levelFile(5)).every((r) => !r.switchable)).toBe(true);
    expect(ruleHasHooks({ id: 'W4', zone: 'wall', order: 140, infoKeys: [], appliesTo: () => true })).toBe(
      false,
    );
    expect(
      ruleHasHooks({
        id: 'W4',
        zone: 'wall',
        order: 140,
        infoKeys: [],
        appliesTo: () => true,
        canPassGap: () => true,
      }),
    ).toBe(true);
  });
});

describe('debug session tap (TECH 12.3)', () => {
  it('TECH 12.3 unlimited moves: movesLeft never drops, movesChanged is still emitted, the golden still wins', () => {
    install(() => unlimited);
    const lvl = levelFile(1);
    const session = GameSession.start(lvl);
    for (const move of HAND[1]) {
      const sink = new ArraySink();
      const res = session.commit(move, sink);
      expect(res.status).toBe('applied');
      const changed = sink.events.filter((e) => e.t === 'movesChanged');
      expect(changed).toHaveLength(1);
      expect(changed[0]).toMatchObject({ movesLeft: lvl.moves, reason: 'move' });
      expect(Math.abs((changed[0] as { delta: number }).delta)).toBe(0);
    }
    expect(session.movesLeft).toBe(lvl.moves);
    expect(session.movesMade).toBe(HAND[1].length);
    expect(session.outcome).toBe('won');
  });

  it('TECH 12.3 without switches the tapped session plays exactly like the plain core (same log, state, events)', () => {
    const lvl = levelFile(5);
    const plainSink = new ArraySink();
    const plain = GameSession.start(lvl);
    for (const move of HAND[5]) plain.commit(move, plainSink);

    const seen = install(() => NO_DEBUG_RULES);
    const tappedSink = new ArraySink();
    const tapped = GameSession.start(lvl);
    for (const move of HAND[5]) tapped.commit(move, tappedSink);

    expect(tapped.log).toEqual(plain.log);
    expect(Array.from(tapped.state.buf)).toEqual(Array.from(plain.state.buf));
    // the caller's sink gets every event, and the tap gets the same events
    expect(tappedSink.events).toEqual(plainSink.events);
    expect(seen.actions.flatMap((a) => a.events)).toEqual(plainSink.events);
    expect(seen.actions.map((a) => a.action)).toEqual(HAND[5]);
    expect(seen.started).toEqual(['start']);
  });

  it('TECH 12.3 a caller without a sink still feeds the event log (events built for the tap only)', () => {
    const seen = install(() => NO_DEBUG_RULES);
    const session = GameSession.start(levelFile(2));
    session.commit(HAND[2][0] as Move);
    expect(seen.actions[0]?.events.map((e) => e.t)).toContain('placementCorrect');
  });

  it('TECH 12.3 K-43 replay goes through the tap with the same hooks; undo / exit are reported', () => {
    const lvl = levelFile(4);
    const seen = install(() => unlimited);
    const first = GameSession.start(lvl);
    first.commit(HAND[4][0] as Move);
    first.commit(HAND[4][1] as Move);
    expect(first.undo()).toBe(true);
    const resumed = GameSession.replay(lvl, first.log);
    expect(resumed.movesMade).toBe(1);
    expect(resumed.movesLeft).toBe(lvl.moves);
    expect(resumed.exit().kind).toBe('loss');
    expect(seen.started).toEqual(['start', 'replay']);
    expect(seen.actions.map((a) => a.action.kind)).toEqual(['drag', 'drag', 'undo', 'exit']);
  });

  it('TECH 12.3 uninstall restores GameSession.start and replay', () => {
    install(() => unlimited);
    expect(GameSession.start).not.toBe(ORIGINAL_START);
    tap?.uninstall();
    tap = null;
    expect(GameSession.start).toBe(ORIGINAL_START);
    expect(GameSession.replay).toBe(ORIGINAL_REPLAY);
    const session = GameSession.start(levelFile(1));
    session.commit(HAND[1][0] as Move);
    expect(session.movesLeft).toBe(levelFile(1).moves - 1);
  });
});
