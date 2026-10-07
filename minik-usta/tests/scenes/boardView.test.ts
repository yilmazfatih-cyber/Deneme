/**
 * BoardView on a recording fake scene (UX_FLOWS §5.2 Golden Trowel pick; review Faz 2 tur 2 #5): `phaser` is mocked,
 * every image is a proxy that records depth, alpha and visibility.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('phaser', () => ({ default: { TintModes: { FILL: 1 }, BlendModes: { ADD: 1, NORMAL: 0 } } }));

import { eligibleTrowelCells } from '../../src/core/placement.ts';
import { GameSession } from '../../src/core/session.ts';
import { BoardView, PICK_DIM_ALPHA } from '../../src/scenes/level/BoardView.ts';
import { createLayout } from '../../src/theme/layout.ts';
import type { FrameRef } from '../../src/theme/textures.ts';
import { TOKENS } from '../../src/theme/tokens.ts';
import { levelFile } from '../core/moves.fixtures.ts';

function fakeImage(): unknown {
  const o: Record<string, unknown> = {
    depth: 0,
    alpha: 1,
    visible: true,
    frame: { realWidth: 1, realHeight: 1 },
  };
  const proxy: unknown = new Proxy(o, {
    get(target, key: string) {
      if (key in target) return target[key];
      return (...args: unknown[]) => {
        if (key === 'setDepth') target['depth'] = args[0];
        if (key === 'setAlpha') target['alpha'] = args[0];
        if (key === 'setVisible') target['visible'] = args[0];
        return proxy;
      };
    },
  });
  return proxy;
}

function board(): BoardView {
  const scene = { add: { image: fakeImage } };
  const ref = (name: string): FrameRef => ({
    key: 'atlas',
    frame: name,
    w: 120,
    h: 120,
    anchorX: 0,
    anchorY: 0,
  });
  const view = new BoardView(scene as never);
  const lvl = levelFile(4); // a `.` cell at (7,2)
  const game = GameSession.start(lvl);
  view.setLevel(lvl, { ref, has: () => true } as never, createLayout(TOKENS, 1920), game.state);
  return view;
}

describe('UX 5.2 Golden Trowel pick mode on the board', () => {
  it('UX 5.2 trowel pick dims non-front plan cells to 50 %', () => {
    const view = board();
    const { state } = GameSession.start(levelFile(4));
    const eligible = eligibleTrowelCells(state);
    expect(eligible.length).toBeGreaterThan(0);
    const lit = new Set(eligible.map((c) => `${c.x},${c.y}`));
    view.setPickDim(eligible);
    const alphas = view.planAlphas;
    expect(alphas.size).toBeGreaterThan(eligible.length);
    for (const [cell, a] of alphas) {
      if (lit.has(cell)) expect(a, cell).toBe(1);
      else expect(a, cell).toBe(PICK_DIM_ALPHA); // other plan cells and the `.` overlay
    }
    expect(alphas.get('.')).toBe(PICK_DIM_ALPHA);
    view.setPickDim(null);
    for (const [cell, a] of view.planAlphas) expect(a, cell).toBe(1);
  });
});
