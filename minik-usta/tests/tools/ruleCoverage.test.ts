/**
 * `npm run test:rules` (tools/rule-coverage.ts; TECH_DESIGN §12.2, §14.1): rule ids and phases are read from the real
 * documents, and a missing id fails the gate.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { missingIds, names, ruleIds } from '../../tools/rule-coverage.ts';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const docs = {
  gdd: readFileSync(join(ROOT, 'docs/GDD.md'), 'utf8'),
  tech: readFileSync(join(ROOT, 'docs/TECH_DESIGN.md'), 'utf8'),
  obstacles: readFileSync(join(ROOT, 'docs/OBSTACLES.md'), 'utf8'),
};

describe('test:rules (TECH 12.2)', () => {
  const ids = ruleIds(docs);
  const phase = (n: number, kind: string): string[] =>
    ids.filter((r) => r.kind === kind && r.phase <= n).map((r) => r.id);

  it('test:rules phase 2 requires no N-note and no bridge E row', () => {
    expect(phase(2, 'N')).toEqual([]);
    expect(phase(2, 'E')).toEqual(['E-01', 'E-03', 'E-06', 'E-21', 'E-27', 'E-28', 'E-30', 'E-34', 'E-38']);
    expect(phase(2, 'obstacle').sort()).toEqual(['S1', 'S2', 'W1']);
    expect(phase(3, 'E')).not.toContain('E-22');
    expect(phase(3, 'E')).not.toContain('E-45');
    expect(phase(4, 'E')).toEqual(expect.arrayContaining(['E-22', 'E-45']));
    expect(phase(3, 'N')).toHaveLength(38);
  });

  it('test:rules phase 2 K set = TECH 12.4 F ≤ 2 (K-20, K-30 later; every GDD K-xx has a row)', () => {
    const k = phase(2, 'K');
    expect(k).toEqual(expect.arrayContaining(['K-01', 'K-19', 'K-29', 'K-34', 'K-35', 'K-43', 'K-46']));
    expect(k).not.toContain('K-20');
    expect(k).not.toContain('K-30');
    expect(ids.filter((r) => r.kind === 'K')).toHaveLength(46);
  });

  it('test:rules id match: K-1 is not K-10, S1 is not S10, "K-17 …" and "(K-17)" count', () => {
    expect(names('K-17 wrong placement bounces', 'K-17')).toBe(true);
    expect(names('bounce (K-17)', 'K-17')).toBe(true);
    expect(names('K-170 x', 'K-17')).toBe(false);
    expect(names('S10 x', 'S1')).toBe(false);
    expect(missingIds(ids, ['K-01'], 2).length).toBeGreaterThan(0);
  });

  it('test:rules exits 1 when a phase 2 id has no test, 0 with every id named', { timeout: 30_000 }, () => {
    const dir = mkdtempSync(join(tmpdir(), 'rules-'));
    const required = ids.filter((r) => r.phase <= 2).map((r) => r.id);
    const all = join(dir, 'all.json');
    writeFileSync(all, JSON.stringify(required.map((id) => ({ name: `${id} covered`, file: 'x' }))));
    const short = join(dir, 'short.json');
    writeFileSync(
      short,
      JSON.stringify(required.slice(1).map((id) => ({ name: `${id} covered`, file: 'x' }))),
    );
    const run = (file: string) =>
      spawnSync(process.execPath, [join(ROOT, 'tools/rule-coverage.ts'), '--phase', '2', '--list', file], {
        cwd: ROOT,
        encoding: 'utf8',
      });
    expect(run(all).status).toBe(0);
    const r = run(short);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain(required[0]);
  });
});
