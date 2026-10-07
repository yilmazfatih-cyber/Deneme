/**
 * `npm run test:rules` — rule coverage gate (docs/TECH_DESIGN.md §12.2, §12.4, §14.1; CLAUDE.md "Her K-xx kuralının en
 * az bir testi vardır").
 *
 * Test names: `vitest list --json` (full names, describe titles included). Rule ids come from the documents only (no
 * list in code):
 * - K-xx: every rule heading of docs/GDD.md; phase = first digit of the §12.4 table's F column (a K-xx without a row
 *   is an error);
 * - obstacles: the docs/OBSTACLES.md signature table (`| W1 | … | 3 |`, "İlk bölüm"); S7-R / S7-M count as S7; phase 2
 *   when the first level is ≤ 5 (the vertical slice), else 3;
 * - `[kural]` N-notes (OBSTACLES "Notlar"): phase from the interaction matrix — a cell's phase is the larger phase of
 *   its two obstacles, a note's phase the smallest phase of the cells it appears in, never below the F of a K-xx it
 *   names; a note in no cell is phase 3;
 * - E-xx (GDD §13): phase = the largest phase of the K-xx and obstacle ids of the row (rule column + text); a row that
 *   names Sallanan Köprü / Usta Ligi or whose rule column has META is phase 4 (§14.3).
 * `--phase N` checks the ids of phase ≤ N; without it every id. Exit 1 when an id has no test whose name contains it
 * (`(^|[^\w-])ID(?!\d)`), 2 on a document or argument error.
 *
 * Options: `--list <file>` reads a saved `vitest list --json` instead of running vitest; `--print` lists the required
 * ids per kind.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const doc = (name: string): string => readFileSync(`${ROOT}docs/${name}`, 'utf8');

export type IdKind = 'K' | 'E' | 'obstacle' | 'N';

export interface RuleId {
  readonly id: string;
  readonly kind: IdKind;
  readonly phase: number;
}

export class CoverageError extends Error {}

/** K-xx → first phase of the TECH §12.4 F column. */
export function kPhases(tech: string): Map<string, number> {
  const out = new Map<string, number>();
  for (const line of tech.split('\n')) {
    if (!line.startsWith('| K-')) continue;
    const cells = line.split('|').map((c) => c.trim());
    for (let i = 1; i + 2 < cells.length; i++) {
      const id = /^K-\d\d$/.exec(cells[i] ?? '')?.[0];
      if (!id) continue;
      const f = /\d/.exec(cells[i + 2] ?? '')?.[0];
      if (f !== undefined) out.set(id, Number(f));
    }
  }
  return out;
}

/** K-xx ids defined by docs/GDD.md headings (`### K-01 …`, `## 12. K-35 …`). */
export function gddRuleIds(gdd: string): string[] {
  const ids = new Set<string>();
  for (const m of gdd.matchAll(/^#{2,4} (?:\d+\. )?(K-\d\d)\b/gm)) ids.add(m[1] ?? '');
  return [...ids].sort();
}

/** Obstacle id → first level (OBSTACLES signature table; S7-R / S7-M → S7, the earlier one). */
export function obstacleFirstLevels(obstacles: string): Map<string, number> {
  const out = new Map<string, number>();
  for (const m of obstacles.matchAll(/^\| (W\d|Y\d|S\d(?:-[RM])?|G-[HL]) \| [^|]*\| (\d+) \|$/gm)) {
    const id = (m[1] ?? '').replace(/-[RM]$/, '');
    const level = Number(m[2]);
    out.set(id, Math.min(out.get(id) ?? Infinity, level));
  }
  return out;
}

/** Phase of an obstacle: the vertical slice (levels 1–5) is phase 2, the rest phase 3 (TECH §12.2). */
export const obstaclePhase = (firstLevel: number): number => (firstLevel <= 5 ? 2 : 3);

/** `[kural]` N-notes of OBSTACLES "Notlar": id → note text. */
export function ruleNotes(obstacles: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const m of obstacles.matchAll(/^- \*\*(N\d+)\*\* \[kural\] — (.*)$/gm))
    out.set(m[1] ?? '', m[2] ?? '');
  return out;
}

/** The interaction matrix: for every note, the obstacle pairs of the cells it appears in. */
export function matrixCells(obstacles: string): Map<string, [string, string][]> {
  const lines = obstacles.split('\n');
  const head = lines.findIndex((l) => /^\| \| W1 \| W2 \|/.test(l));
  if (head < 0) throw new CoverageError('OBSTACLES: interaction matrix header not found');
  const cols = (lines[head] ?? '')
    .split('|')
    .map((c) => c.trim())
    .slice(2, -1);
  const out = new Map<string, [string, string][]>();
  for (let i = head + 2; i < lines.length; i++) {
    const line = lines[i] ?? '';
    if (!line.startsWith('| **')) break;
    const cells = line.split('|').map((c) => c.trim());
    const row = /\*\*(.+)\*\*/.exec(cells[1] ?? '')?.[1];
    if (!row) continue;
    cells.slice(2, -1).forEach((cell, j) => {
      const col = cols[j];
      if (!col) return;
      for (const n of cell.matchAll(/N\d+/g)) {
        const list = out.get(n[0]) ?? [];
        list.push([row, col]);
        out.set(n[0], list);
      }
    });
  }
  return out;
}

/** GDD §13 rows: id → { rules column, whole row text }. */
export function edgeRows(gdd: string): Map<string, { rules: string; text: string }> {
  const out = new Map<string, { rules: string; text: string }>();
  for (const m of gdd.matchAll(/^\| (E-\d\d) \|(.*)$/gm)) {
    const cells = (m[2] ?? '').split('|').map((c) => c.trim());
    const rules = cells[cells.length - 2] ?? '';
    out.set(m[1] ?? '', { rules, text: m[2] ?? '' });
  }
  return out;
}

const BRIDGE_OR_LEAGUE = /Sallanan Köprü|Köprü|Usta Ligi|\bLig\b/;

/** Every rule id with its phase, read from the documents. */
export function ruleIds(docs: { gdd: string; tech: string; obstacles: string }): RuleId[] {
  const kp = kPhases(docs.tech);
  const out: RuleId[] = [];
  for (const id of gddRuleIds(docs.gdd)) {
    const phase = kp.get(id);
    if (phase === undefined) throw new CoverageError(`${id} has no row in TECH §12.4`);
    out.push({ id, kind: 'K', phase });
  }
  const firsts = obstacleFirstLevels(docs.obstacles);
  if (firsts.size === 0) throw new CoverageError('OBSTACLES: signature table not found');
  const op = new Map([...firsts].map(([id, lvl]) => [id, obstaclePhase(lvl)] as const));
  for (const [id, phase] of op) out.push({ id, kind: 'obstacle', phase });

  const cells = matrixCells(docs.obstacles);
  for (const [id, text] of ruleNotes(docs.obstacles)) {
    const ks = [...text.matchAll(/K-\d\d/g)].map((m) => kp.get(m[0]) ?? 2);
    const cellPhases = (cells.get(id) ?? []).map(([a, b]) => Math.max(op.get(a) ?? 3, op.get(b) ?? 3));
    const fromCells = cellPhases.length > 0 ? Math.min(...cellPhases) : 3;
    out.push({ id, kind: 'N', phase: Math.max(fromCells, ...ks) });
  }

  for (const [id, row] of edgeRows(docs.gdd)) {
    if (BRIDGE_OR_LEAGUE.test(row.text) || /\bMETA\b/.test(row.rules)) {
      out.push({ id, kind: 'E', phase: 4 });
      continue;
    }
    const phases = [
      ...[...row.text.matchAll(/K-\d\d/g)].map((m) => kp.get(m[0]) ?? 2),
      ...[...row.text.matchAll(/\b(W\d|Y\d|S\d|G-[HL])\b/g)].map((m) => op.get(m[1] ?? '') ?? 3),
    ];
    out.push({ id, kind: 'E', phase: phases.length > 0 ? Math.max(...phases) : 2 });
  }
  return out;
}

/** A test name names `id` (not as a prefix of a longer id: K-1 ≠ K-10, S1 ≠ S10). */
export function names(title: string, id: string): boolean {
  return new RegExp(`(^|[^\\w-])${id.replace(/[-]/g, '\\-')}(?!\\d)`).test(title);
}

/** Required ids of `phase` (null = all) that no test name contains. */
export function missingIds(
  ids: readonly RuleId[],
  titles: readonly string[],
  phase: number | null,
): RuleId[] {
  return ids.filter((r) => (phase === null || r.phase <= phase) && !titles.some((t) => names(t, r.id)));
}

function vitestTitles(listFile: string | null): string[] {
  let json: string;
  if (listFile) json = readFileSync(listFile, 'utf8');
  else {
    const bin = `${ROOT}node_modules/vitest/vitest.mjs`;
    if (!existsSync(bin)) throw new CoverageError('vitest is not installed (node_modules/vitest)');
    const r = spawnSync(process.execPath, [bin, 'list', '--json'], {
      cwd: ROOT,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    });
    if (r.status !== 0) throw new CoverageError(`vitest list failed:\n${r.stderr}`);
    json = r.stdout.slice(r.stdout.indexOf('['));
  }
  const list = JSON.parse(json) as { name: string }[];
  return list.map((t) => t.name);
}

function arg(argv: readonly string[], name: string): string | null {
  const i = argv.indexOf(name);
  return i < 0 ? null : (argv[i + 1] ?? null);
}

function main(argv: readonly string[]): number {
  const p = arg(argv, '--phase');
  const phase = p === null ? null : Number(p);
  if (phase !== null && (!Number.isInteger(phase) || phase < 1)) {
    process.stderr.write('rule-coverage: --phase needs a positive integer\n');
    return 2;
  }
  try {
    const ids = ruleIds({ gdd: doc('GDD.md'), tech: doc('TECH_DESIGN.md'), obstacles: doc('OBSTACLES.md') });
    const required = ids.filter((r) => phase === null || r.phase <= phase);
    if (argv.includes('--print')) {
      for (const kind of ['K', 'obstacle', 'E', 'N'] as const)
        process.stdout.write(
          `${kind}: ${required
            .filter((r) => r.kind === kind)
            .map((r) => r.id)
            .join(', ')}\n`,
        );
    }
    const titles = vitestTitles(arg(argv, '--list'));
    const missing = missingIds(ids, titles, phase);
    const scope = phase === null ? 'all phases' : `phase ≤ ${phase}`;
    const count = (k: IdKind): number => required.filter((r) => r.kind === k).length;
    if (missing.length > 0) {
      process.stderr.write(
        `rule-coverage (${scope}): ${missing.length} rule id(s) without a test name: ${missing
          .map((r) => r.id)
          .join(', ')}\n`,
      );
      return 1;
    }
    process.stdout.write(
      `rule-coverage (${scope}): ${required.length} ids covered by ${titles.length} tests ` +
        `(K ${count('K')}, obstacles ${count('obstacle')}, E ${count('E')}, N-notes ${count('N')}).\n`,
    );
    return 0;
  } catch (e) {
    if (e instanceof CoverageError) {
      process.stderr.write(`rule-coverage: ${e.message}\n`);
      return 2;
    }
    throw e;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1])
  process.exit(main(process.argv.slice(2)));
