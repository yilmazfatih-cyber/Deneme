import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DESIGN_HEIGHT, DESIGN_WIDTH, scaleMode } from '../src/config/display';

describe('display config', () => {
  it('uses a 1080x1920 portrait design resolution', () => {
    expect(DESIGN_WIDTH).toBe(1080);
    expect(DESIGN_HEIGHT).toBe(1920);
  });

  it('D-015 TECH 10.1 the single scale setting is EXPAND and the Phaser config reads it', () => {
    expect(scaleMode).toBe('expand');
    const main = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
    expect(main).toMatch(/mode:\s*scaleMode === 'fit' \? Phaser\.Scale\.FIT : Phaser\.Scale\.EXPAND/);
    // EXPAND keeps the width at 1080 and caps the height at meta.scale.expandMaxHeight (Phaser clamps to `max`).
    expect(main).toMatch(/max: \{ width: DESIGN_WIDTH, height: TOKENS\.meta\.scale\.expandMaxHeight \}/);
  });
});
