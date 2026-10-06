/**
 * `npm run levels:validate` — zod schema + logic checks L-01…L-18, L-21…L-26 on levels/level_NNN.json
 * (TECH_DESIGN §8.3, §12.2; codes = GDD K-45). Prints a `code` + `rule` table; exit 1 when any error is found.
 *
 * Options: `--dir <path>` (default levels/), `--level <N>` (report one level; earlier levels still feed the
 * mechanic history of L-16/L-22).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as z from 'zod/mini';
import { en } from 'zod/locales';
import { validateLevelJson } from '../src/core/level/logic.ts';
import type { Issue } from '../src/core/level/logic.ts';
import { deriveMechanics } from '../src/core/level/mechanics.ts';
import type { MechanicId } from '../src/core/level/schema.ts';
import { ROOT, formatIssue, listLevelFiles, loadBoosterUnlock, loadI18nKeys } from './lib/levels.ts';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function main(): number {
  z.config(en());
  const dir = arg('--dir') ?? join(ROOT, 'levels');
  const only = arg('--level') !== undefined ? Number(arg('--level')) : undefined;
  const files = listLevelFiles(dir);
  if (files.length === 0) {
    process.stdout.write(
      `levels:validate: no level files (level_NNN.json) in ${dir}; nothing to validate.\n`,
    );
    return 0;
  }
  const i18nKeys = loadI18nKeys();
  const boosterUnlock = loadBoosterUnlock();
  const notes: string[] = [];
  if (!i18nKeys) notes.push('src/i18n/tr.json or en.json not found: tut_key_missing (L-17) skipped');
  if (!boosterUnlock) notes.push('config/economy.json not found: booster:/pre: unlock check (L-17) skipped');
  const ids = files.map((f) => f.fileId);
  const gaps = ids.filter((id, i) => i > 0 && id !== (ids[i - 1] ?? 0) + 1);
  if ((ids[0] ?? 1) !== 1 || gaps.length > 0)
    notes.push(
      `level numbers are not contiguous from 1 (${ids.join(', ')}): L-16/L-22 history uses the files present`,
    );

  const previous = new Set<MechanicId>();
  let errors = 0;
  let warnings = 0;
  let reported = 0;
  for (const file of files) {
    let issues: Issue[];
    let mechanics: MechanicId[] = [];
    try {
      const json: unknown = JSON.parse(readFileSync(file.path, 'utf8'));
      const res = validateLevelJson(json, {
        fileId: file.fileId,
        previousMechanics: new Set(previous),
        ...(i18nKeys ? { i18nKeys } : {}),
        ...(boosterUnlock ? { boosterUnlock } : {}),
      });
      issues = res.issues;
      if (res.level) mechanics = deriveMechanics(res.level);
    } catch (e) {
      issues = [
        {
          code: 'schema_invalid',
          rule: 'K-45/1',
          check: 'L-01',
          severity: 'error',
          path: '(file)',
          message: `cannot read JSON: ${e instanceof Error ? e.message : String(e)}`,
        },
      ];
    }
    for (const m of mechanics) previous.add(m);
    if (only !== undefined && file.fileId !== only) continue;
    reported++;
    const e = issues.filter((i) => i.severity === 'error').length;
    const w = issues.length - e;
    errors += e;
    warnings += w;
    const status = e > 0 ? 'FAIL' : w > 0 ? 'WARN' : 'OK';
    const mech = mechanics.length > 0 ? `  mechanics: ${mechanics.join(' ')}` : '';
    process.stdout.write(`${file.name}  ${status}${mech}\n`);
    for (const issue of issues) process.stdout.write(`${formatIssue(issue)}\n`);
  }
  for (const n of notes) process.stdout.write(`note: ${n}\n`);
  process.stdout.write(`levels:validate: ${reported} file(s), ${errors} error(s), ${warnings} warning(s)\n`);
  return errors > 0 ? 1 : 0;
}

process.exitCode = main();
