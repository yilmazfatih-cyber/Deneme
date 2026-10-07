/**
 * PieceView tap feedback (UX_FLOWS §5.3 "Tıklama"; JUICE §0 rule 8; review Faz 2 tur 2 #13) on a recording fake scene.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';

vi.mock('phaser', () => ({ default: { TintModes: { FILL: 1 }, BlendModes: { ADD: 1, NORMAL: 0 } } }));

import { shapeByIndex } from '../../src/core/shapes.ts';
import { PieceView } from '../../src/scenes/level/PieceView.ts';
import { VIEW } from '../../src/scenes/level/viewConstants.ts';
import { createLayout } from '../../src/theme/layout.ts';
import type { FrameRef } from '../../src/theme/textures.ts';
import { TOKENS } from '../../src/theme/tokens.ts';

type Rec = Record<string, unknown>;

function fakeImage(rec: Rec[]): unknown {
  const o: Rec = { x: 0, y: 0, scaleX: 1, scaleY: 1, frame: { realWidth: 1, realHeight: 1 } };
  const proxy: unknown = new Proxy(o, {
    get(target, key: string) {
      if (key in target) return target[key];
      return (...args: unknown[]) => {
        if (key === 'setPosition') [target['x'], target['y']] = args;
        if (key === 'setScale') [target['scaleX'], target['scaleY']] = [args[0], args[1] ?? args[0]];
        return proxy;
      };
    },
  });
  rec.push(o);
  return proxy;
}

function view(): { pv: PieceView; image: Rec } {
  const rec: Rec[] = [];
  const pv = new PieceView({ add: { image: () => fakeImage(rec) } } as never);
  const ref = (name: string): FrameRef => ({
    key: 'atlas',
    frame: name,
    w: 240,
    h: 120,
    anchorX: 0,
    anchorY: 0,
  });
  pv.bind(0, shapeByIndex(1), 'blk', { ref } as never);
  pv.pose = { ax: 2, ay: 3, scale: 1, alpha: 1 };
  const image = rec[1];
  if (!image) throw new Error('no image');
  return { pv, image };
}

describe('UX 5.3 tap feedback', () => {
  const layout = createLayout(TOKENS, 1920);

  it('UX 5.3 a tap hops the block one cell; with reduced motion it only pulses ≤ 3 % (JUICE 0 rule 8), never moves', () => {
    const full = view();
    full.pv.render(layout, 0);
    const y0 = full.image['y'] as number;
    full.pv.startHop(0, false);
    full.pv.render(layout, VIEW.tapHopMs / 2);
    expect(y0 - (full.image['y'] as number)).toBeCloseTo(VIEW.tapHopCells * layout.grid.cellPx, 6);

    const reduced = view();
    reduced.pv.render(layout, 0);
    const ry0 = reduced.image['y'] as number;
    const rx0 = reduced.image['x'] as number;
    reduced.pv.startHop(0, true);
    for (const t of [10, VIEW.tapHopMs / 2, VIEW.tapHopMs - 10]) {
      reduced.pv.render(layout, t);
      expect(reduced.image['y']).toBe(ry0);
      expect(reduced.image['x']).toBe(rx0);
      expect(reduced.image['scaleX'] as number).toBeLessThanOrEqual(1.03 + 1e-9);
    }
    reduced.pv.render(layout, VIEW.tapHopMs + 1);
    expect(reduced.image['scaleX']).toBe(1);
  });

  it('UX 5.3 the tap goes through the EventPlayer: hop or pulse by reduced motion, and the light haptic in both modes', () => {
    const src = (p: string): string => readFileSync(new URL(`../../src/${p}`, import.meta.url), 'utf8');
    const level = src('scenes/level/LevelScene.ts');
    expect(level).toMatch(/tapped: \(id\) => \{\s*this\.player\.tapped\(id\);/);
    expect(level).not.toMatch(/startHop\(/);
    const player = src('scenes/level/EventPlayer.ts');
    const tapped = player.slice(player.indexOf('  tapped(id: PieceId): void {'));
    expect(tapped.slice(0, 300)).toMatch(/startHop\(this\.now, this\.reduced\)/);
    expect(tapped.slice(0, 300)).toMatch(/this\.haptic\('light'\)/);
  });
});
