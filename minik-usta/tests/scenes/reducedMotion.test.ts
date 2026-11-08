/**
 * JUICE §0 rule 8 outside the EventPlayer (review Faz 2 tur 1 #18): every idle loop of the level and home screens stops
 * with reduced motion, and switching the setting in a level stops the moves counter's #51 loop at once. The loops live
 * in Phaser classes, so this guard reads their sources (the EventPlayer's own variants are tested in juice.test.ts).
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const src = (path: string): string => readFileSync(new URL(`../../src/${path}`, import.meta.url), 'utf8');

describe('JUICE 0 rule 8 reduced motion stops the idle loops', () => {
  it('JUICE 0 rule 8 home "BÖLÜM 2" pulse, spotlight edge, glove loop and trowel cells read reduced motion', () => {
    const home = src('scenes/HomeScene.ts');
    expect(home).toMatch(/reducedMotion\(\)/);
    expect(home).toMatch(/!this\.target\.pulse \|\| this\.reduced\) return;/);
    const overlay = src('scenes/level/TutorialOverlay.ts');
    expect(overlay).toMatch(/const k = this\.reduced\s*\?\s*1\s*:/);
    expect(overlay).toMatch(/if \(this\.reduced && now - this\.handSince >= move\)/);
    const picker = src('scenes/level/TrowelPicker.ts');
    expect(picker).toMatch(/if \(this\.host\.reduced\(\)\)/);
  });

  it('JUICE 51 switching reduced motion in a level stops the moves counter loop at once', () => {
    const level = src('scenes/level/LevelScene.ts');
    expect(level).toMatch(/this\.moves\.setPulse\(!reduced, this\.animNow\)/);
    expect(level).toMatch(/this\.overlay\.setReduced\(reduced\)/);
  });

  it('UX 2.2 step 11 reduced motion: BÖLÜM 2 shows the steady gold edge on the first entry (the setting is read before the first build)', () => {
    const home = src('scenes/HomeScene.ts');
    const create = home.slice(home.indexOf('  create(): void {'), home.indexOf('  update(time: number)'));
    const read = create.indexOf('this.reduced = reducedMotion();');
    const build = create.indexOf('this.build();');
    expect(read).toBeGreaterThan(0);
    expect(build).toBeGreaterThan(0);
    expect(read).toBeLessThan(build); // review Faz 2 tur 2 #3: the edge is created with `setVisible(this.reduced)`
    expect(home).toMatch(/\.setVisible\(this\.reduced\)/);
  });
});
