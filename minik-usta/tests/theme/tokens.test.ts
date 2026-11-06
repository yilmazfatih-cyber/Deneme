import { describe, expect, it } from 'vitest';
import rawTokens from '../../src/theme/tokens.json' with { type: 'json' };
import { COLOR_CODES } from '../../src/core/types.ts';
import type { ColorCode } from '../../src/core/types.ts';
import { TOKENS, parseTokens } from '../../src/theme/tokens.ts';
import {
  blockPalette,
  css,
  lstar,
  parseHex,
  planPalette,
  symbolInk,
  toHex,
} from '../../src/theme/draw/color.ts';
import type { Rgb } from '../../src/theme/draw/color.ts';

type CheckGroup = 'blockTop' | 'blockBottom' | 'blockOutline' | 'symbolInk' | 'plan' | 'planStroke';
const check = (rawTokens as unknown as { check: Record<CheckGroup, Record<ColorCode, string>> }).check;

function expectWithinOne(actual: Rgb, expectedHex: string, label: string): void {
  const e = parseHex(expectedHex);
  const a = parseHex(toHex(actual));
  for (let i = 0; i < 3; i++) {
    expect(
      Math.abs((a[i] ?? 0) - (e[i] ?? 0)),
      `${label}: ${toHex(actual)} vs ${expectedHex}`,
    ).toBeLessThanOrEqual(1);
  }
}

const clone = (): Record<string, unknown> => JSON.parse(JSON.stringify(rawTokens)) as Record<string, unknown>;

describe('tokens loader (TECH 10.2, D-003)', () => {
  it('TECH 10.2 tokens.json parses; check.* and _doc keys are not part of the runtime tokens', () => {
    expect(TOKENS.layout.grid.cellPx).toBe(120);
    expect('check' in TOKENS).toBe(false);
    expect('_doc' in TOKENS.layout).toBe(false);
    expect('_doc' in TOKENS.audio).toBe(false);
    expect(Object.keys(TOKENS.color.block)).toEqual([...COLOR_CODES]);
  });

  it('TECH 10.2 runtime tokens are deeply frozen (read only)', () => {
    expect(Object.isFrozen(TOKENS)).toBe(true);
    expect(Object.isFrozen(TOKENS.layout.grid)).toBe(true);
    expect(Object.isFrozen(TOKENS.block.glossRect)).toBe(true);
    expect(Object.isFrozen(TOKENS.audio.seq.sfx_segment)).toBe(true);
  });

  it('TECH 10.2 a missing key is a boot error that names the path', () => {
    const t = clone();
    delete ((t.layout as Record<string, unknown>).grid as Record<string, unknown>).cellPx;
    expect(() => parseTokens(t)).toThrow(/layout\.grid\.cellPx/);
  });

  it('TECH 10.2 a malformed colour or a missing block colour is rejected', () => {
    const bad = clone();
    ((bad.color as Record<string, unknown>).block as Record<string, unknown>).W = 'brown';
    expect(() => parseTokens(bad)).toThrow(/color\.block\.W/);
    const missing = clone();
    delete ((missing.color as Record<string, unknown>).block as Record<string, unknown>).P;
    expect(() => parseTokens(missing)).toThrow(/color\.block\.P/);
  });

  it('TECH 10.2 every Phase 2 sound in audio.sfx / audio.seq is typed and present', () => {
    expect(TOKENS.audio.sfx.sfx_streak_pip.length).toBeGreaterThan(0);
    expect(TOKENS.audio.sfx.sfx_trowel.length).toBeGreaterThan(0);
    expect(TOKENS.audio.sfx.sfx_clamp.length).toBeGreaterThan(0);
    expect(TOKENS.audio.seq.sfx_gap_rail.length).toBeGreaterThan(0);
  });
});

describe('formula colours match check.* within ±1 (ART 3, ART 4, D-013; default mode only)', () => {
  for (const c of COLOR_CODES) {
    it(`ART 3 block layer colours of ${c} (top +20 % white, bottom ×0.75, outline ×0.55)`, () => {
      const p = blockPalette(TOKENS, c);
      expectWithinOne(p.top, check.blockTop[c], `blockTop ${c}`);
      expectWithinOne(p.bottom, check.blockBottom[c], `blockBottom ${c}`);
      expectWithinOne(p.outline, check.blockOutline[c], `blockOutline ${c}`);
    });

    it(`D-013 symbol ink of ${c} follows the L* rule`, () => {
      const ink = symbolInk(TOKENS, c);
      expectWithinOne(ink.rgb, check.symbolInk[c], `symbolInk ${c}`);
      const light = lstar(parseHex(TOKENS.color.block[c])) >= TOKENS.block.symbolLightThresholdLstar;
      expect(ink.alpha).toBe(light ? 1 : TOKENS.alpha.symbolWhite);
    });

    it(`D-013 plan composite and dashed stroke of ${c} (underlay + 80 % colour, stroke ×0.65)`, () => {
      const p = planPalette(TOKENS, c);
      expectWithinOne(p.fill, check.plan[c], `plan ${c}`);
      expectWithinOne(p.stroke, check.planStroke[c], `planStroke ${c}`);
    });
  }
});

describe('palette rules (ART 2.1, ART 2.2, ART 4, ART 10)', () => {
  it('ART 2.1 lightness ladder Y › C › G › O › B › R › P › W', () => {
    const order = (['Y', 'C', 'G', 'O', 'B', 'R', 'P', 'W'] as const).map((c) =>
      lstar(parseHex(TOKENS.color.block[c])),
    );
    for (let i = 1; i < order.length; i++) expect(order[i - 1]).toBeGreaterThan(order[i] ?? 0);
  });

  it('ART 2.2 dark ink exactly for Y, C, G, O (L* ≥ 60); white ink for W, R, B, P', () => {
    const dark = COLOR_CODES.filter((c) => symbolInk(TOKENS, c).alpha === 1);
    expect(dark.sort()).toEqual(['C', 'G', 'O', 'Y']);
  });

  it('ART 4 plan ink: dark #14233D on Y, G, O, C, B; white at alpha.planInkLight on W, R, P', () => {
    for (const c of COLOR_CODES) {
      const ink = planPalette(TOKENS, c).ink;
      if (['W', 'R', 'P'].includes(c))
        expect([toHex(ink.rgb), ink.alpha]).toEqual(['#FFFFFF', TOKENS.alpha.planInkLight]);
      else expect([toHex(ink.rgb), ink.alpha]).toEqual(['#14233D', 1]);
    }
  });

  it('ART 10 colour-blind mode: plan fill 90 %, dark ink ×0.34, white ink opacity ×1.15', () => {
    const mode = { colorBlind: true };
    const y = parseHex(TOKENS.color.block.Y);
    expect(toHex(symbolInk(TOKENS, 'Y', mode).rgb)).toBe(toHex([y[0] * 0.34, y[1] * 0.34, y[2] * 0.34]));
    expect(symbolInk(TOKENS, 'W', mode).alpha).toBeCloseTo(0.85 * 1.15, 10);
    const under = parseHex(TOKENS.color.board.planUnderlay);
    const b = parseHex(TOKENS.color.block.B);
    const expected: Rgb = [0, 1, 2].map((i) => (under[i] ?? 0) * 0.1 + (b[i] ?? 0) * 0.9) as unknown as Rgb;
    expect(toHex(planPalette(TOKENS, 'B', mode).fill)).toBe(toHex(expected));
  });

  it('css() renders opaque colours as hex and translucent ones as rgba with 4 decimals', () => {
    expect(css([255, 255, 255])).toBe('#FFFFFF');
    expect(css([255, 255, 255], 0.28)).toBe('rgba(255,255,255,0.28)');
    expect(css([1.4, 2.6, 300], 1 / 3)).toBe('rgba(1,3,255,0.3333)');
  });
});
