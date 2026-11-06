/**
 * Shared helpers of the obstacle plugin tests (registry, W1, S1, S2). Not a test file.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { RuleContext } from '../../src/core/moves.ts';
import { H } from '../../src/core/state.ts';
import type { GameState } from '../../src/core/state.ts';
import { bufferRng } from '../../src/core/rng.ts';
import type { GameEventBody } from '../../src/core/types.ts';
import { RULE_ORDER_BASE, defineRule, obstacleInfoKey, ruleZone } from '../../src/core/obstacles/types.ts';
import type { ObstacleRule, RuleId } from '../../src/core/obstacles/types.ts';

/** A rule context outside a move (direct hook calls); `events` collects what the hook emits. */
export function ctxOf(s: GameState, rotatedAtStep8 = false): { ctx: RuleContext; events: GameEventBody[] } {
  const events: GameEventBody[] = [];
  const ctx: RuleContext = {
    lvl: s.lvl,
    s,
    emit: (e) => events.push(e),
    rng: bufferRng(s.buf, H.rng),
    gravity: s.lvl.gravity,
    scratch: { wasStuck: false, rotatedAtStep8, affected: new Set() },
  };
  return { ctx, events };
}

/** TECH §7.3 rank of a rule id: W n → 100 + n, Y n → 200 + n, S n → 300 + n, G-H 401, G-L 402. */
export function rankOf(id: RuleId): number {
  const n = id === 'G-H' ? 1 : id === 'G-L' ? 2 : Number(id.slice(1));
  return RULE_ORDER_BASE[ruleZone(id)] + n;
}

/** A test rule that applies to every level; `extra` adds hooks or overrides fields. */
export function fakeRule(id: RuleId, extra: Partial<ObstacleRule> = {}): ObstacleRule {
  return defineRule({
    id,
    zone: ruleZone(id),
    order: rankOf(id),
    infoKeys: [obstacleInfoKey(id)],
    appliesTo: () => true,
    ...extra,
  });
}

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** The text of a dotted i18n key in `src/i18n/<locale>.json`, or undefined. */
export function i18nText(locale: 'tr' | 'en', key: string): unknown {
  const dict: unknown = JSON.parse(readFileSync(join(ROOT, 'src', 'i18n', `${locale}.json`), 'utf8'));
  return key
    .split('.')
    .reduce<unknown>(
      (node, part) =>
        node !== null && typeof node === 'object' ? (node as Record<string, unknown>)[part] : undefined,
      dict,
    );
}
