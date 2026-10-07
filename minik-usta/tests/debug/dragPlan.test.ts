/**
 * Golden replay finger path (TECH_DESIGN §12.3 "her adım sürükleme animasyonuyla", §4.4 sticky follow, UX_FLOWS §5.3
 * finger offset; R-20). The plan is checked offline against the level screen's own drag math (scenes/level/dragMath.ts,
 * the functions DragController uses) and the core's K-08 follow: replaying every LEVELS §2 hand solution of levels
 * 1–5 finger point by finger point must end on the logged release node, on both phone profiles.
 */
import { describe, expect, it } from 'vitest';
import { tryBeginDrag } from '../../src/core/movement.ts';
import { GameSession } from '../../src/core/session.ts';
import type { DragNode } from '../../src/core/types.ts';
import { fingerForNode, planDrag, toPage } from '../../src/debug/dragPlan.ts';
import type { DragMove } from '../../src/debug/dragPlan.ts';
import { grabAt, targetAnchor } from '../../src/scenes/level/dragMath.ts';
import { pieceAtPoint } from '../../src/scenes/level/hitTest.ts';
import { createLayout, designHeight } from '../../src/theme/layout.ts';
import { TOKENS } from '../../src/theme/tokens.ts';
import { HAND, levelFile } from '../core/moves.fixtures.ts';

const OFFSET = TOKENS.drag.fingerOffsetCells;
const PHONES = [
  { name: '390x844', width: 390, height: 844 },
  { name: '360x800', width: 360, height: 800 },
] as const;

const node = (n: DragNode): string => `(${n.ix},${n.iy},${n.mode})`;

describe.each(PHONES)('debug golden replay finger path on $name (TECH 12.3)', (phone) => {
  const layout = createLayout(TOKENS, designHeight('expand', phone, TOKENS));

  it.each([1, 2, 3, 4, 5] as const)(
    'TECH 12.3 level %i: press picks the block, the follow ends on every logged release node',
    (id) => {
      const lvl = levelFile(id);
      const session = GameSession.start(lvl);
      HAND[id].forEach((move, i) => {
        if (move.kind !== 'drag') throw new Error('hand solutions are drags');
        const where = `L${id} move ${i + 1}`;
        const s = session.state;
        const res = planDrag(s, layout.grid, {}, move as DragMove, OFFSET, 3);
        if (!res.ok) throw new Error(`${where}: ${res.reason}`);
        const plan = res.plan;
        // the press lands on this block (hit test of the scene)
        expect(pieceAtPoint(s, layout.grid, plan.press.x, plan.press.y, layout.touch.hitSlopPx), where).toBe(
          move.pieceId,
        );
        // DragController: grab at the press, finger-offset glide with the finger still (t 0 → 1), then the path
        const begun = tryBeginDrag(s, move.pieceId, {});
        if (!begun.ok) throw new Error(`${where}: not pickable`);
        const drag = begun.session;
        const grab = grabAt(layout.grid, plan.press.x, plan.press.y, drag.start, drag.shape.cells);
        expect(grab.cell, `${where}: grabbed cell`).toEqual(plan.cell);
        expect(
          [grab.dx0, grab.dy0].map((v) => Math.abs(v) < 1e-9),
          `${where}: no pick-time jump`,
        ).toEqual([true, true]);
        for (const t of [0, 0.25, 0.5, 0.75, 1]) {
          const p = targetAnchor(layout.grid, grab, plan.press.x, plan.press.y, t, OFFSET);
          drag.follow(p.px, p.py);
        }
        for (const f of plan.path) {
          const p = targetAnchor(layout.grid, grab, f.x, f.y, 1, OFFSET);
          drag.follow(p.px, p.py);
        }
        expect(node(drag.current), `${where}: release node`).toBe(node(move.to));
        expect(session.commit(move).status, `${where}: commit`).toBe('applied');
      });
      expect(session.outcome).toBe('won');
    },
  );
});

describe('debug golden replay geometry (TECH 12.3)', () => {
  const layout = createLayout(TOKENS, 1920);

  it('UX 5.3 the finger point of a node puts the follow target exactly on it after the glide', () => {
    const grab = { cell: { x: 1, y: 0 }, dx0: 0, dy0: 0 };
    for (const n of [
      { ix: 0, iy: 0, mode: 0 },
      { ix: 4, iy: 6, mode: 0 },
      { ix: 6, iy: 8, mode: 0 },
      { ix: 6, iy: 2, mode: 1 },
    ]) {
      const f = fingerForNode(layout.grid, n, grab.cell, OFFSET);
      const p = targetAnchor(layout.grid, grab, f.x, f.y, 1, OFFSET);
      expect(p.px).toBeCloseTo(n.ix, 9);
      expect(p.py).toBeCloseTo(n.iy, 9);
    }
  });

  it('TECH 12.3 an unreachable release node or a locked block is reported, not forced', () => {
    const session = GameSession.start(levelFile(1));
    const bad = planDrag(
      session.state,
      layout.grid,
      {},
      { kind: 'drag', pieceId: 0, to: { ix: 7, iy: 0, mode: 0 } },
      OFFSET,
    );
    expect(bad).toMatchObject({ ok: false });
    const same = planDrag(
      session.state,
      layout.grid,
      {},
      { kind: 'drag', pieceId: 0, to: { ix: 0, iy: 6, mode: 0 } },
      OFFSET,
    );
    expect(same.ok).toBe(false);
  });

  it('TECH 12.3 page point = inverse of Phaser ScaleManager.transformX/Y', () => {
    const m = { left: 10, top: 20, scaleX: 2.5, scaleY: 2.5 };
    const page = toPage({ x: 540, y: 960 }, m);
    expect(page).toEqual({ x: 10 + 540 / 2.5, y: 20 + 960 / 2.5 });
    expect((page.x - m.left) * m.scaleX).toBeCloseTo(540, 9);
  });
});
