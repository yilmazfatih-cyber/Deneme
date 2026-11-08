/**
 * Harness gesture plan (src/harness/plan.ts; TECH_DESIGN §10.7 item 4, §12.4 "Sahne duman testi"). Offline check of the
 * finger path against the level screen's own drag math (scenes/level/dragMath.ts, as DragController runs it) and the
 * core's K-08 sticky follow: every LEVELS §2 hand solution of levels 1–5, finger point by finger point, must end on
 * the logged release node on both phone profiles — the browser runs (tests/e2e/smoke.spec.ts, tools/screens.ts,
 * tools/perf.ts) then only add Phaser's input manager on top.
 */
import { describe, expect, it } from 'vitest';
import { tryBeginDrag } from '../../src/core/movement.ts';
import { GameSession } from '../../src/core/session.ts';
import { planDragDesign } from '../../src/harness/plan.ts';
import { grabAt, targetAnchor } from '../../src/scenes/level/dragMath.ts';
import { pieceAtPoint } from '../../src/scenes/level/hitTest.ts';
import { createLayout, designHeight } from '../../src/theme/layout.ts';
import { TOKENS } from '../../src/theme/tokens.ts';
import { HAND, levelFile } from '../core/moves.fixtures.ts';

const PHONES = [
  { name: '390x844', width: 390, height: 844 },
  { name: '360x800', width: 360, height: 800 },
] as const;

const FEEL = {
  holdMs: TOKENS.drag.holdMs,
  fingerOffsetMs: TOKENS.duration.fingerOffset,
  fingerOffsetCells: TOKENS.drag.fingerOffsetCells,
  hitSlopPx: TOKENS.touch.hitSlopPx,
};

describe.each(PHONES)('harness gesture plan on $name (TECH 10.7, 12.4)', (phone) => {
  const layout = createLayout(TOKENS, designHeight('expand', phone, TOKENS));

  it.each([1, 2, 3, 4, 5] as const)(
    'TECH 12.4 level %i: the press picks the block and the sticky follow ends on every golden release node',
    (id) => {
      const session = GameSession.start(levelFile(id));
      HAND[id].forEach((move, i) => {
        if (move.kind !== 'drag') throw new Error('hand solutions are drags');
        const where = `L${id} move ${i + 1}`;
        const s = session.state;
        const plan = planDragDesign(s, move, {}, layout.grid, FEEL);
        expect(
          pieceAtPoint(s, layout.grid, plan.down.x, plan.down.y, layout.touch.hitSlopPx),
          `${where}: press`,
        ).toBe(move.pieceId);
        const begun = tryBeginDrag(s, move.pieceId, {});
        if (!begun.ok) throw new Error(`${where}: not pickable`);
        const drag = begun.session;
        const grab = grabAt(layout.grid, plan.down.x, plan.down.y, drag.start, drag.shape.cells);
        expect(grab.cell, `${where}: grabbed cell`).toEqual(plan.cell);
        // the finger rests during hold-to-lift and the offset glide (t 0 → 1) …
        for (const t of [0, 0.5, 1]) {
          const p = targetAnchor(layout.grid, grab, plan.down.x, plan.down.y, t, FEEL.fingerOffsetCells);
          drag.follow(p.px, p.py);
        }
        // … then every planned move is followed with the glide complete
        expect(plan.moves[0]?.atMs ?? 0, `${where}: moves start after hold + glide`).toBeGreaterThanOrEqual(
          FEEL.holdMs + FEEL.fingerOffsetMs,
        );
        for (const m of plan.moves) {
          const p = targetAnchor(layout.grid, grab, m.x, m.y, 1, FEEL.fingerOffsetCells);
          drag.follow(p.px, p.py);
        }
        expect(drag.current, `${where}: release node`).toEqual(move.to);
        expect(plan.upAtMs, `${where}: release after the last move`).toBeGreaterThan(
          plan.moves[plan.moves.length - 1]?.atMs ?? 0,
        );
        expect(session.commit(move).status, `${where}: commit`).toBe('applied');
      });
      expect(session.outcome).toBe('won');
    },
  );
});
