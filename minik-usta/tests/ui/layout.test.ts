import { describe, expect, it } from 'vitest';
import { createLayout } from '../../src/theme/layout.ts';
import { TOKENS } from '../../src/theme/tokens.ts';
import { pairRects } from '../../src/ui/Popup.ts';
import { wrapWords } from '../../src/ui/SpeechBubble.ts';
import { UI } from '../../src/ui/uiConstants.ts';

const FREQUENT_MIN = 144; // UX 0.1 decision (b): frequent targets ≥ 144 px (48 dp at 360)

describe('UX 0.3 / 0.2 window geometry (TECH 10.1 popup anchor contract)', () => {
  for (const H of [1920, 2337, 2400]) {
    it(`UX 0.3 equal pair 440 × 152, 40 px apart, fills the option column at the lowest slot (H = ${H})`, () => {
      const L = createLayout(TOKENS, H);
      const [a, b] = pairRects(L);
      if (!a || !b) throw new Error('two rects');
      expect([a.w, b.w, a.h, b.h]).toEqual([440, 440, 152, 152]);
      expect(b.x - (a.x + a.w)).toBe(UI.pairGapPx);
      expect(b.x + b.w - a.x).toBe(TOKENS.layout.popup.optionW);
      expect(a.y + a.h).toBe(L.popup.optionsBottomY);
      expect(a.y).toBeGreaterThanOrEqual(1056); // comfortable zone (UX 0.2)
    });
  }

  it('UX 0.2 primary actions sit at y ≥ 1400 in FIT: single option, win "Devam", home level button', () => {
    const L = createLayout(TOKENS, 1920);
    const [only] = L.popup.options(1);
    expect(only?.y).toBeGreaterThanOrEqual(1400);
    const winTop = L.H - UI.winButtonBottomPx - UI.winButtonH;
    expect(winTop).toBeGreaterThanOrEqual(1400);
    expect(L.bottom.playButton.y).toBeGreaterThanOrEqual(1400);
  });

  it('UX 0.1 frequent targets are ≥ 144 px: options, pair buttons, win "Devam", level button', () => {
    expect(TOKENS.layout.popup.optionH).toBeGreaterThanOrEqual(FREQUENT_MIN);
    expect(UI.winButtonH).toBeGreaterThanOrEqual(FREQUENT_MIN);
    expect(TOKENS.layout.bottom.playButtonH).toBeGreaterThanOrEqual(FREQUENT_MIN);
    expect(UI.toggleRowH).toBeGreaterThanOrEqual(TOKENS.touch.minTargetPx);
    expect(UI.closeVisualPx + 32).toBeGreaterThanOrEqual(FREQUENT_MIN);
  });
});

describe('UX 13.1 Usta Dede bubble text', () => {
  it('UX 13.1 greedy word wrap counts inline icons as 1 em', () => {
    const measure = (w: string): number => w.length * 10;
    expect(wrapWords('aa bb cc', 50, measure, 20, 10)).toEqual(['aa bb', 'cc']);
    // "{ok}" is an icon (20 px), not 4 characters (40 px)
    expect(wrapWords('x {ok} y', 60, measure, 20, 10)).toEqual(['x {ok} y']);
    expect(wrapWords('x {ok} y', 59, measure, 20, 10)).toEqual(['x {ok}', 'y']);
    expect(wrapWords('', 50, measure, 20, 10)).toEqual([]);
  });
});
