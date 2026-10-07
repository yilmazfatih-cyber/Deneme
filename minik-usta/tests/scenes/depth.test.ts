import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DEPTH, DEPTH_ORDER } from '../../src/scenes/level/depth.ts';

describe('level scene layers (TECH 10.3, ART 4 "Katman sırası")', () => {
  it('TECH 10.3 depths increase in the ART 4 order: floor < plan < grid < front < blocks < beam < shadow < dragged', () => {
    expect(new Set(DEPTH_ORDER)).toEqual(new Set(Object.keys(DEPTH)));
    const values = DEPTH_ORDER.map((k) => DEPTH[k]);
    for (let i = 1; i < values.length; i++) expect(values[i]).toBeGreaterThan(values[i - 1] as number);
    expect(DEPTH.planCells).toBeLessThan(DEPTH.planOverlay);
    expect(DEPTH.planOverlay).toBeLessThan(DEPTH.buildFront);
    expect(DEPTH.buildFront).toBeLessThan(DEPTH.placedBlocks);
    expect(DEPTH.placedBlocks).toBeLessThan(DEPTH.ceilingBeam);
    expect(DEPTH.ceilingBeam).toBeLessThan(DEPTH.fallShadow);
    expect(DEPTH.fallShadow).toBeLessThan(DEPTH.draggedBlock);
  });

  it('TECH 10.3 sub-layers used by the views (+1 … +4) never reach the next layer', () => {
    const src = ['BoardView', 'ShadowView', 'PieceView']
      .map((f) => readFileSync(new URL(`../../src/scenes/level/${f}.ts`, import.meta.url), 'utf8'))
      .join('\n');
    const offsets = [...src.matchAll(/DEPTH\.(\w+) \+ (\d+)/g)].map((m) => ({
      layer: m[1] as keyof typeof DEPTH,
      add: Number(m[2]),
    }));
    expect(offsets.length).toBeGreaterThan(0);
    for (const { layer, add } of offsets) {
      const i = DEPTH_ORDER.indexOf(layer);
      const next = DEPTH_ORDER[i + 1];
      expect(i).toBeGreaterThanOrEqual(0);
      if (next) expect(DEPTH[layer] + add).toBeLessThan(DEPTH[next]);
    }
  });
});
