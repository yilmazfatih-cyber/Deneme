/**
 * UX §6 win panel placement (review Faz 2 tur 1 #6): between the status strip ("Usta Serisi") and the "Devam" button,
 * never over the board or the strip, at both phone profiles (EXPAND, D-015).
 */
import { describe, expect, it } from 'vitest';
import { createLayout, designHeight } from '../../src/theme/layout.ts';
import { TOKENS } from '../../src/theme/tokens.ts';
import { UI } from '../../src/ui/uiConstants.ts';
import { winPanelLayout } from '../../src/ui/WinScreen.ts';

describe('UX 6 win panel band (EXPAND 390×844, 360×800)', () => {
  for (const vp of [
    { width: 390, height: 844 },
    { width: 360, height: 800 },
  ]) {
    it(`UX 6 the win panel at ${vp.width}×${vp.height} sits under the status strip and above the button (1 and 2 lines)`, () => {
      const layout = createLayout(TOKENS, designHeight('expand', vp, TOKENS));
      const statusBottom = layout.board.status.y + layout.board.status.h;
      const btnTop = layout.H - UI.winButtonBottomPx - UI.winButtonH;
      for (const rows of [1, 2]) {
        const p = winPanelLayout(layout, rows);
        expect(p.inBand).toBe(true);
        expect(p.top).toBeGreaterThanOrEqual(statusBottom);
        expect(p.top + p.h).toBeLessThanOrEqual(btnTop);
        expect(p.step).toBeGreaterThanOrEqual(UI.winLineStepMinPx);
        expect(p.rewardY).toBeGreaterThan(p.firstY + (rows - 1) * p.step);
      }
    });
  }

  it('UX 6 FIT (H 1920) has no band under the strip: the panel stands above the button as in the wireframe', () => {
    const layout = createLayout(TOKENS, 1920);
    const p = winPanelLayout(layout, 1);
    expect(p.inBand).toBe(false);
    expect(p.top + p.h).toBeLessThanOrEqual(layout.H - UI.winButtonBottomPx - UI.winButtonH);
  });
});
