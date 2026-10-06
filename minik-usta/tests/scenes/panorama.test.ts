import { describe, expect, it } from 'vitest';
import { TOKENS } from '../../src/theme/tokens.ts';
import { createLayout } from '../../src/theme/layout.ts';
import { panoramaView } from '../../src/core/panorama.ts';
import { GameSession } from '../../src/core/session.ts';
import { panoramaGeometry } from '../../src/ui/Panorama.ts';
import { VIEW } from '../../src/scenes/level/viewConstants.ts';
import { levelFile } from '../core/moves.fixtures.ts';

const style = {
  padPx: VIEW.panoramaPadPx,
  gapCells: VIEW.panoramaGapCells,
  refRows: TOKENS.layout.grid.rows,
};

describe('panorama strip geometry (K-06, UX 5.1)', () => {
  it('UX 5.1 the plan shows at one scale in every level: 12 px cells in the 110 px strip', () => {
    const rect = createLayout(TOKENS, 1920).top.panorama;
    for (const id of [1, 5]) {
      const segs = panoramaView(GameSession.start(levelFile(id)).state);
      expect(panoramaGeometry(rect, segs, style).cell).toBe(12);
    }
  });

  it('K-06 every segment column fits in layout.top.panorama, centred, bottom-aligned', () => {
    const rect = createLayout(TOKENS, 2337).top.panorama; // top group: no EXPAND shift
    const segs = panoramaView(GameSession.start(levelFile(5)).state);
    expect(segs.map((s) => s.status)).toEqual(['active', 'future']);
    const geo = panoramaGeometry(rect, segs, style);
    const right = geo.x0 + (segs.length - 1) * geo.step + geo.colW;
    expect(geo.x0).toBeGreaterThanOrEqual(rect.x);
    expect(right).toBeLessThanOrEqual(rect.x + rect.w);
    expect(geo.x0 - rect.x).toBeCloseTo(rect.x + rect.w - right, 6);
    expect(geo.bottom).toBe(rect.y + rect.h - VIEW.panoramaPadPx);
    for (const s of segs) expect(geo.bottom - s.rows.length * geo.cell).toBeGreaterThanOrEqual(rect.y);
  });
});
