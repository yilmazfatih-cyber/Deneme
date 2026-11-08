/**
 * Shared helpers for level tools (validate, solve, bot, preview): file discovery, project paths, i18n keys,
 * economy booster unlock levels and the issue table format.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Issue } from '../../src/core/level/logic.ts';

/** Project root (`minik-usta/`). */
export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

export interface LevelFile {
  /** Number in the file name `level_NNN.json`. */
  readonly fileId: number;
  readonly name: string;
  readonly path: string;
}

/** `level_NNN.json` files of a directory, ascending by number. Other files are ignored. */
export function listLevelFiles(dir: string): LevelFile[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .flatMap((name) => {
      const m = /^level_(\d{3})\.json$/.exec(name);
      return m ? [{ fileId: Number(m[1]), name, path: join(dir, name) }] : [];
    })
    .sort((a, b) => a.fileId - b.fileId);
}

/** Flattens a nested i18n object to dotted keys; flat dotted keys are kept as they are. */
export function flattenKeys(value: unknown, prefix = '', out: Set<string> = new Set()): Set<string> {
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      flattenKeys(v, prefix === '' ? k : `${prefix}.${k}`, out);
    }
  } else if (prefix !== '') {
    out.add(prefix);
  }
  return out;
}

/** i18n keys of `src/i18n/tr.json` and `en.json`; null when either file is missing. */
export function loadI18nKeys(root: string = ROOT): { tr: Set<string>; en: Set<string> } | null {
  const tr = join(root, 'src', 'i18n', 'tr.json');
  const en = join(root, 'src', 'i18n', 'en.json');
  if (!existsSync(tr) || !existsSync(en)) return null;
  return {
    tr: flattenKeys(JSON.parse(readFileSync(tr, 'utf8'))),
    en: flattenKeys(JSON.parse(readFileSync(en, 'utf8'))),
  };
}

/** `config/economy.json → boosters.<name>.unlockLevel`; null when the file is missing. */
export function loadBoosterUnlock(root: string = ROOT): Record<string, number> | null {
  const path = join(root, 'config', 'economy.json');
  if (!existsSync(path)) return null;
  const boosters =
    (JSON.parse(readFileSync(path, 'utf8')) as { boosters?: Record<string, unknown> }).boosters ?? {};
  const out: Record<string, number> = {};
  for (const [name, value] of Object.entries(boosters)) {
    const unlock = (value as { unlockLevel?: unknown } | null)?.unlockLevel;
    if (typeof unlock === 'number') out[name] = unlock;
  }
  return out;
}

/** One table line per issue: severity, rule, code, check, path, message. */
export function formatIssue(issue: Issue): string {
  return `  ${issue.severity.padEnd(5)}  ${issue.rule.padEnd(8)}  ${issue.code.padEnd(22)}  ${issue.check}  ${issue.path}: ${issue.message}`;
}
