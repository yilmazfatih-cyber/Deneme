/**
 * Debug event log and FPS meter (TECH_DESIGN §12.3 "son 50 olay, adım numaralarıyla", "FPS ve kare süresi grafiği",
 * §10.6 frame budget; R-20).
 */
import { describe, expect, it } from 'vitest';
import { ArraySink } from '../../src/core/moves.ts';
import { GameSession } from '../../src/core/session.ts';
import {
  ENTRY_TEXT_MAX,
  EVENT_LOG_CAPACITY,
  EventLog,
  describeAction,
  describeEvent,
  formatEntry,
} from '../../src/debug/eventLog.ts';
import { FPS_WINDOW, FrameStats, MAX_FRAME_MS } from '../../src/debug/frameStats.ts';
import { HAND, levelFile } from '../core/moves.fixtures.ts';

describe('debug event log (TECH 12.3)', () => {
  it('TECH 12.3 one line per event with its K-35 step and seq', () => {
    const session = GameSession.start(levelFile(1));
    const sink = new ArraySink();
    const move = HAND[1][0];
    if (!move) throw new Error('no hand move');
    session.commit(move, sink);
    const log = new EventLog();
    log.action(1, move, 'applied');
    log.events(1, sink.events);
    const lines = log.entries().map(formatEntry);
    expect(lines[0]).toBe('#1 · drag p0 → (6,8) FREE · applied');
    const moves = sink.events.find((e) => e.t === 'movesChanged');
    if (!moves) throw new Error('no movesChanged');
    expect(lines).toContain(
      `#1 s4.${moves.seq} movesChanged movesLeft=10 delta=-1 reason=move cost={base:1,glass:0}`,
    );
    expect(
      log
        .entries()
        .slice(1)
        .map((e) => e.step),
    ).toEqual(sink.events.map((e) => e.step));
  });

  it(`TECH 12.3 keeps the last ${EVENT_LOG_CAPACITY} entries, oldest first`, () => {
    const log = new EventLog();
    for (let i = 0; i < 70; i++) log.note(i, `line ${i}`);
    const entries = log.entries();
    expect(entries).toHaveLength(EVENT_LOG_CAPACITY);
    expect(entries[0]?.text).toBe('line 20');
    expect(entries.at(-1)?.n).toBe(69);
    log.clear();
    expect(log.entries()).toEqual([]);
  });

  it('TECH 12.3 action descriptions: rail, trowel, offer, undo; long texts are clipped', () => {
    expect(describeAction({ kind: 'drag', pieceId: 1, to: { ix: 6, iy: 2, mode: 1 } })).toBe(
      'drag p1 → (6,2) RAIL0',
    );
    expect(describeAction({ kind: 'trowel', seg: 0, x: 1, y: 3 })).toBe('trowel seg0 (1,3)');
    expect(describeAction({ kind: 'addMoves', amount: 5, source: 'offerCoins' })).toBe('+5 offerCoins');
    expect(describeAction({ kind: 'undo' })).toBe('undo');
    expect(describeAction({ kind: 'exit' })).toBe('exit');
    expect(describeAction({ kind: 'paint', pieceId: 2, color: 'R' })).toBe('paint {pieceId:2,color:R}');
    const long = describeEvent({
      seq: 0,
      step: 9,
      t: 'deliveryArrived',
      seg: 0,
      pieces: Array.from({ length: 80 }, (_, i) => i),
    });
    expect(long.length).toBe(ENTRY_TEXT_MAX);
    expect(long.endsWith('…')).toBe(true);
  });
});

describe('debug FPS meter (TECH 12.3, 10.6)', () => {
  it('TECH 10.6 60 FPS frames: fps 60, no slow frame; a 50 ms frame is the worst and slow', () => {
    const stats = new FrameStats();
    for (let i = 0; i < FPS_WINDOW; i++) stats.push(1000 / 60);
    expect(stats.fps).toBeCloseTo(60, 6);
    expect(stats.slowFrames).toBe(0);
    stats.push(50);
    expect(stats.worstMs).toBe(50);
    expect(stats.slowFrames).toBe(1);
    expect(stats.fps).toBeLessThan(60);
  });

  it('TECH 12.3 pauses and invalid intervals are dropped; the history is capped', () => {
    const stats = new FrameStats(10);
    expect(stats.fps).toBe(0);
    stats.push(0);
    stats.push(-5);
    stats.push(MAX_FRAME_MS + 1);
    expect(stats.history()).toEqual([]);
    for (let i = 1; i <= 15; i++) stats.push(i);
    expect(stats.history()).toEqual([6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
  });
});
