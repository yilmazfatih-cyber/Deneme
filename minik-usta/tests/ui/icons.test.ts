/** Placeholder icons (ASSET_LIST P0; review Faz 2 tur 1 #8): the life heart reads as a heart (two lobes, a top notch). */
import { describe, expect, it } from 'vitest';
import { heartSpans } from '../../src/ui/icons.ts';

describe('ART 9 icon_life heart shape', () => {
  it('UX 7 icon_life: two separate lobes at the top, a centre notch at least 0.12 d deep, one point at the bottom', () => {
    const d = 160;
    const rows: { y: number; spans: [number, number][] }[] = [];
    for (let y = -d / 2; y <= d / 2; y += 1) rows.push({ y, spans: heartSpans(y, d) });
    const filled = rows.filter((r) => r.spans.length > 0);
    const top = filled[0]?.y ?? 0;
    // the first rows hold two lobes, x = 0 empty
    expect(filled[1]?.spans).toHaveLength(2);
    const covers0 = (r: { spans: [number, number][] }): boolean => r.spans.some(([a, b]) => a <= 0 && b >= 0);
    const notchBottom = filled.find(covers0)?.y ?? top;
    expect(notchBottom - top).toBeGreaterThanOrEqual(0.12 * d);
    // below the notch one span; it narrows to the point
    const lower = filled.filter((r) => r.y > notchBottom);
    for (const r of lower) expect(r.spans).toHaveLength(1);
    const last = lower[lower.length - 1]?.spans[0] ?? [0, 0];
    expect(last[1] - last[0]).toBeLessThan(0.1 * d);
  });
});

/** WCAG 2 contrast of two `#RRGGBB` colours. */
function contrast(a: string, b: string): number {
  const lum = (hex: string): number => {
    const ch = [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16) / 255);
    const lin = ch.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * (lin[0] ?? 0) + 0.7152 * (lin[1] ?? 0) + 0.0722 * (lin[2] ?? 0);
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

describe('ART 2.3 / UX 14 small HUD texts on coloured grounds (review Faz 2 tur 1 #7, #9)', () => {
  it('UX 14 the truck chip (ui.ink on ui.secondary) and the resume strip (ui.ink on ui.panel) are ≥ 4.5:1', async () => {
    const { TOKENS } = await import('../../src/theme/tokens.ts');
    const { readFileSync } = await import('node:fs');
    const ui = TOKENS.color.ui;
    expect(contrast(ui.ink, ui.secondary)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(ui.ink, ui.panel)).toBeGreaterThanOrEqual(4.5);
    const strip = readFileSync(new URL('../../src/ui/StatusStrip.ts', import.meta.url), 'utf8');
    expect(strip).toMatch(/chipText = scene\.add\.text\(0, 0, '', textStyle\('small', C\.ink\)\)/);
  });
});
