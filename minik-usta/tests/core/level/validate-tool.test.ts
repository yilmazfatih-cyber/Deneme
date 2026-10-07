import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { flattenKeys, listLevelFiles } from '../../../tools/lib/levels.ts';
import { fixturePath } from '../../fixtures/builders.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const run = (...args: string[]): { code: number | null; out: string } => {
  const r = spawnSync(process.execPath, [join(ROOT, 'tools', 'validate-levels.ts'), ...args], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  return { code: r.status, out: `${r.stdout}${r.stderr}` };
};

describe('levels:validate tool (TECH §8.3, §12.2)', () => {
  it('K-45 valid directory exits 0 and prints one line per level', () => {
    const r = run('--dir', fixturePath('cli-valid'));
    expect(r.code).toBe(0);
    expect(r.out).toContain('level_001.json  OK');
    expect(r.out).toContain('level_002.json  OK');
    expect(r.out).toContain('2 file(s), 0 error(s)');
  });

  it('K-45/3 invalid directory exits 1 and prints code + rule', () => {
    const r = run('--dir', fixturePath('cli-invalid'));
    expect(r.code).toBe(1);
    expect(r.out).toContain('level_001.json  FAIL');
    expect(r.out).toMatch(/error\s+K-45\/3\s+gap_touches_top\s+L-09\s+wall\.gaps\[0\]/);
  });

  it('K-45 empty directory says so and exits 0', () => {
    const r = run('--dir', fixturePath('valid'));
    expect(r.code).toBe(0);
    expect(r.out).toContain('no level files');
  });

  it('K-45 only level_NNN.json names are level files, sorted by number', () => {
    expect(listLevelFiles(fixturePath('cli-invalid')).map((f) => f.name)).toEqual(['level_001.json']);
    expect(listLevelFiles(fixturePath('cli-valid')).map((f) => f.fileId)).toEqual([1, 2]);
    expect(listLevelFiles(fixturePath('does-not-exist'))).toEqual([]);
  });

  it('GDD 14.1 i18n keys are read nested or flat', () => {
    expect([...flattenKeys({ tut: { l1: { lift: 'x' } }, 'tut.ctx.support': 'y' })].sort()).toEqual([
      'tut.ctx.support',
      'tut.l1.lift',
    ]);
  });
});
