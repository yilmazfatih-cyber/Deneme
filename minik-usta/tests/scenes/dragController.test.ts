/**
 * DragController per-frame follow (UX_FLOWS §5.3 "Parmak ofseti", "Yapışkan takip"; JUICE #1, #3, #4; review Faz 2 tur 2
 * #12) on a fake scene: a resting finger still finishes the glide and keeps the drag feel running.
 */
import { describe, expect, it } from 'vitest';
import { GameSession } from '../../src/core/session.ts';
import { DragController } from '../../src/scenes/level/DragController.ts';
import type { DragHost } from '../../src/scenes/level/DragController.ts';
import type { PieceView } from '../../src/scenes/level/PieceView.ts';
import { createLayout } from '../../src/theme/layout.ts';
import { TOKENS } from '../../src/theme/tokens.ts';
import { levelFile } from '../core/moves.fixtures.ts';

type Handler = (pointer: unknown, over?: unknown[]) => void;

describe('K-08 / UX 5.3 the lifted block is followed every frame', () => {
  it('UX 5.3 with a resting finger the finger-offset glide finishes and the drag feel gets a frame every update', () => {
    const handlers = new Map<string, Handler>();
    const scene = {
      input: { on: (n: string, fn: Handler) => void handlers.set(n, fn), off: () => undefined },
      game: { events: { emit: () => true } },
    };
    const game = GameSession.start(levelFile(1));
    const layout = createLayout(TOKENS, 1920);
    const clock = { now: 0 };
    const moved: { t: number; py: number }[] = [];
    const view = { pose: { ax: 0, ay: 0, scale: 1, alpha: 1 }, render: () => undefined };
    const host: DragHost = {
      boardState: () => game.state,
      mayPick: () => true,
      layout: () => layout,
      dragRules: () => ({}),
      view: () => view as unknown as PieceView,
      now: () => clock.now,
      fastForward: () => undefined,
      touched: () => undefined,
      pickFailed: () => undefined,
      tapped: () => undefined,
      lifted: () => undefined,
      nodeChanged: () => undefined,
      moved: (_s, _ax, _ay, _px, py) => void moved.push({ t: clock.now, py }),
      released: () => undefined,
      aborted: () => undefined,
      signal: () => undefined,
    };
    const ctl = new DragController(scene as never, host);
    // level 1 a = D2_90 Y at (4,7): free above
    const r = layout.grid.cellRect(4, 7);
    const x = r.x + r.w / 2;
    const y = r.y + r.h / 2;
    handlers.get('pointerdown')?.({ id: 1, worldX: x, worldY: y, wasCanceled: false }, []);
    clock.now = TOKENS.drag.holdMs; // hold-to-lift
    ctl.update(clock.now);
    expect(ctl.dragging).not.toBeNull();
    const frames = 20;
    for (let i = 1; i <= frames; i++) {
      clock.now = TOKENS.drag.holdMs + i * 16;
      ctl.update(clock.now); // no pointer event at all
    }
    // one `moved` per frame (the lift's own + every update), long after the 90 ms glide
    expect(moved.length).toBeGreaterThanOrEqual(frames + 1);
    const last = moved[moved.length - 1];
    const first = moved[0];
    if (!last || !first) throw new Error('no frames');
    expect(last.t - TOKENS.drag.holdMs).toBeGreaterThan(TOKENS.duration.fingerOffset * 3);
    // the target reached the full finger offset (t = 1): 1.2 cells above where the lift started
    expect(last.py - first.py).toBeCloseTo(TOKENS.drag.fingerOffsetCells, 6);
  });
});
