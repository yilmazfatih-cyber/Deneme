import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, expectTypeOf, it } from 'vitest';
import economy from '../../config/economy.json' with { type: 'json' };
import {
  ANALYTICS_EVENTS,
  Analytics,
  BOOSTER_IDS,
  COMMON_PARAMS,
  RingBuffer,
  SessionTracker,
  validateEvent,
} from '../../src/services/analytics.ts';
import type {
  AnalyticsEvent,
  AnalyticsEventOf,
  CommonParams,
  ParamSpec,
} from '../../src/services/analytics.ts';
import { FakeClock } from '../../src/services/clock.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const ANALYTICS_MD = readFileSync(join(ROOT, 'docs/ANALYTICS.md'), 'utf8');

/** Normalised parameter description, the same shape for the table and the code. */
interface Param {
  readonly kind: 'int' | 'str' | 'bool' | 'enum';
  readonly values?: readonly string[];
  readonly min?: number;
  readonly max?: number;
  readonly nullable: boolean;
}
type Params = Record<string, Param>;

const ECONOMY_BOOSTERS = 'economy.json güçlendirici kimlikleri';

/**
 * Parses one "Parametreler (tip)" cell: "`name` type" items where type = int | str | bool | enum(a, b),
 * optionally followed by "(range or note)" and "\| null". `enum(economy.json güçlendirici kimlikleri)` → the booster
 * ids of config/economy.json.
 */
function parseParams(cell: string): Params {
  const out: Params = {};
  const re = /`(\w+)` (int|str|bool|enum\(([^)]*)\))( \(([^)]*)\))?( \\\| null)?/g;
  for (const m of cell.matchAll(re)) {
    const name = m[1] as string;
    const type = m[2] as string;
    const nullable = m[6] !== undefined;
    if (type.startsWith('enum(')) {
      const inner = (m[3] as string).trim();
      const values =
        inner === ECONOMY_BOOSTERS
          ? Object.keys(economy.boosters).filter((k) => !k.startsWith('_'))
          : inner.split(',').map((v) => v.trim());
      out[name] = { kind: 'enum', values, nullable };
    } else if (type === 'int') {
      const range = /^(\d+)–(\d+)$/.exec((m[5] ?? '').trim());
      out[name] = range
        ? { kind: 'int', min: Number(range[1]), max: Number(range[2]), nullable }
        : { kind: 'int', nullable };
    } else {
      out[name] = { kind: type as 'str' | 'bool', nullable };
    }
  }
  return out;
}

/** ANALYTICS §2 table → event name → params (`offer_shown` alanları + … is expanded). */
function parseTable(): Map<string, Params> {
  const section = ANALYTICS_MD.split('## §2 Olay tablosu')[1]?.split('**Değer tanımları')[0] ?? '';
  const rows = section.split('\n').filter((l) => l.startsWith('| `'));
  const events = new Map<string, Params>();
  for (const row of rows) {
    const cells = row
      .slice(1, -1)
      .split(/(?<!\\)\|/)
      .map((c) => c.trim());
    const name = /^`(\w+)`$/.exec(cells[0] ?? '')?.[1];
    if (name === undefined) throw new Error(`bad event cell: ${cells[0]}`);
    const cell = cells[1] ?? '';
    let params: Params = cell === '—' ? {} : parseParams(cell);
    const base = /^`(\w+)` alanları \+/.exec(cell)?.[1];
    if (base !== undefined) {
      const inherited = events.get(base);
      if (inherited === undefined) throw new Error(`${name} extends unknown ${base}`);
      params = { ...inherited, ...params };
    }
    events.set(name, params);
  }
  return events;
}

/** ANALYTICS §3 first paragraph → common params. */
function parseCommon(): Params {
  const section = ANALYTICS_MD.split('## §3 Ortak parametreler')[1] ?? '';
  const paragraph = section.trim().split('. ')[0] ?? '';
  return parseParams(paragraph.replace(/\n/g, ' '));
}

function normalise(spec: ParamSpec): Param {
  const nullable = spec.nullable === true;
  if (spec.kind === 'enum') return { kind: 'enum', values: [...spec.values], nullable };
  if (spec.kind === 'int') {
    return spec.min === undefined && spec.max === undefined
      ? { kind: 'int', nullable }
      : { kind: 'int', min: spec.min as number, max: spec.max as number, nullable };
  }
  return { kind: spec.kind, nullable };
}

const codeParams = (specs: Readonly<Record<string, ParamSpec>>): Params =>
  Object.fromEntries(Object.entries(specs).map(([k, v]) => [k, normalise(v)]));

describe('ANALYTICS §2 ↔ TECH 11.4 union', () => {
  const table = parseTable();

  it('ANALYTICS §2 table parses into the expected 28 events', () => {
    expect(table.size).toBe(28);
    expect(table.get('offer_result')).toHaveProperty('placement');
    expect(table.get('level_end')?.['yao']).toEqual({ kind: 'int', min: 0, max: 100, nullable: false });
    expect(table.get('offer_shown')?.['offerIndex']).toEqual({ kind: 'int', min: 1, max: 3, nullable: true });
  });

  it('ANALYTICS §2 every table event and parameter is in ANALYTICS_EVENTS (table → code)', () => {
    for (const [name, params] of table) {
      expect(Object.hasOwn(ANALYTICS_EVENTS, name), `event ${name} missing in code`).toBe(true);
      const code = codeParams(ANALYTICS_EVENTS[name as keyof typeof ANALYTICS_EVENTS]);
      for (const [p, spec] of Object.entries(params)) {
        expect(code[p], `${name}.${p} missing in code`).toBeDefined();
        expect(code[p], `${name}.${p}`).toEqual(spec);
      }
    }
  });

  it('ANALYTICS §2 every ANALYTICS_EVENTS event and parameter is in the table (code → table)', () => {
    for (const [name, specs] of Object.entries(ANALYTICS_EVENTS)) {
      const params = table.get(name);
      expect(params, `event ${name} is not in ANALYTICS §2`).toBeDefined();
      for (const p of Object.keys(specs))
        expect(params?.[p], `${name}.${p} not in ANALYTICS §2`).toBeDefined();
      expect(Object.keys(codeParams(specs)).sort(), name).toEqual(Object.keys(params ?? {}).sort());
    }
  });

  it('ANALYTICS §3 common parameters equal COMMON_PARAMS both ways', () => {
    expect(codeParams(COMMON_PARAMS)).toEqual(parseCommon());
  });

  it('ANALYTICS booster_used enum equals config/economy.json booster ids', () => {
    expect([...BOOSTER_IDS]).toEqual(Object.keys(economy.boosters).filter((k) => !k.startsWith('_')));
  });

  it('TECH 11.4 derived union types follow the table', () => {
    expectTypeOf<AnalyticsEventOf<'app_open'>>().toEqualTypeOf<{ name: 'app_open' }>();
    expectTypeOf<AnalyticsEventOf<'save_corrupt'>>().toEqualTypeOf<{
      name: 'save_corrupt';
      stage: 'parse' | 'migrate' | 'validate';
      recovered: 'backup' | 'defaults';
    }>();
    expectTypeOf<AnalyticsEventOf<'level_load_failed'>['code']>().toEqualTypeOf<string | null>();
    expectTypeOf<AnalyticsEventOf<'event_end'>['rank']>().toEqualTypeOf<number | null>();
    expectTypeOf<AnalyticsEventOf<'level_end'>['mode']>().toEqualTypeOf<'story' | 'master' | 'replay'>();
    expectTypeOf<AnalyticsEventOf<'booster_used'>['booster']>().toEqualTypeOf<(typeof BOOSTER_IDS)[number]>();
    expectTypeOf<CommonParams['platform']>().toEqualTypeOf<'web' | 'android' | 'ios'>();
    expectTypeOf<AnalyticsEvent['name']>().toEqualTypeOf<keyof typeof ANALYTICS_EVENTS>();
  });
});

const COMMON: CommonParams = {
  sessionId: 's1',
  appVersion: 'dev',
  platform: 'web',
  lang: 'tr',
  coins: 500,
  lives: 5,
  highestLevel: 0,
  payer: false,
};

describe('Analytics service (TECH 11.4)', () => {
  it('TECH 11.4 validateEvent rejects unknown events, extra or missing params, bad enums, ranges and nulls', () => {
    expect(validateEvent({ name: 'level_resume', level: 3, movesMade: 2 })).toEqual([]);
    expect(validateEvent({ name: 'nope' })).toHaveLength(1);
    expect(validateEvent({ name: 'level_resume', level: 3 })).toEqual(['level_resume.movesMade: missing']);
    expect(validateEvent({ name: 'level_resume', level: 3, movesMade: 2, extra: 1 })).toEqual([
      'level_resume.extra: not in ANALYTICS §2',
    ]);
    expect(validateEvent({ name: 'save_corrupt', stage: 'disk', recovered: 'backup' })).toHaveLength(1);
    expect(
      validateEvent({
        name: 'offer_shown',
        offer: 'continue',
        placement: 'out_of_moves',
        offerIndex: 4,
        priceCoins: null,
      }),
    ).toHaveLength(1);
    expect(validateEvent({ name: 'level_resume', level: 1.5, movesMade: null })).toHaveLength(2);
    expect(
      validateEvent({
        name: 'offer_shown',
        offer: 'daily_double',
        placement: 'daily_double',
        offerIndex: null,
        priceCoins: null,
      }),
    ).toEqual([]);
  });

  it('TECH 11.4 track stamps common params at call time, keeps a 500-entry ring and feeds sinks', () => {
    const clock = new FakeClock(1000);
    let coins = 500;
    const seen: string[] = [];
    const a = new Analytics({ clock, common: () => ({ ...COMMON, coins }) });
    a.addSink((r) => seen.push(r.event.name));
    a.track({ name: 'app_open' });
    coins = 1850;
    clock.advance(5);
    a.track({ name: 'coin_source', amount: 1350, reason: 'refund', balanceAfter: 1850 });
    const rec = a.recent();
    expect(rec.map((r) => [r.seq, r.at, r.common.coins])).toEqual([
      [0, 1000, 500],
      [1, 1005, 1850],
    ]);
    expect(seen).toEqual(['app_open', 'coin_source']);
    for (let i = 0; i < 600; i++) a.track({ name: 'tutorial_step', level: 1, step: i });
    expect(a.recent()).toHaveLength(500);
    expect(a.recent()[0]?.seq).toBe(102);
  });

  it('TECH 11.4 invalid events are dropped and reported, never thrown', () => {
    const issues: string[][] = [];
    const a = new Analytics({
      clock: new FakeClock(),
      common: () => COMMON,
      onInvalid: (i) => issues.push([...i]),
    });
    a.track({ name: 'level_resume', level: 1, movesMade: -0.5 } as AnalyticsEvent);
    expect(a.recent()).toHaveLength(0);
    expect(issues).toHaveLength(1);
    const bad = new Analytics({
      clock: new FakeClock(),
      common: () => ({ ...COMMON, lang: 'de' }) as unknown as CommonParams,
      onInvalid: (i) => issues.push([...i]),
    });
    bad.track({ name: 'app_open' });
    expect(issues[1]).toEqual(['common.lang: "de" not in enum(tr, en)']);
  });

  it('TECH 11.4 RingBuffer keeps the newest items', () => {
    const r = new RingBuffer<number>(3);
    for (let i = 1; i <= 5; i++) r.push(i);
    expect(r.toArray()).toEqual([3, 4, 5]);
    expect(r.size).toBe(3);
  });
});

describe('ANALYTICS session (§2 session_end, §3 sessionId)', () => {
  it('ANALYTICS session_end once per background with duration and level starts; a new session after the foreground', () => {
    const clock = new FakeClock(1_000);
    const sent: AnalyticsEvent[] = [];
    let n = 0;
    const s = new SessionTracker({ clock, track: (e) => sent.push(e), newId: () => `s${n++}` });
    expect(s.id).toBe('s0');
    s.observe({ name: 'level_start', level: 1, attempt: 1, mode: 'story', preBoosters: 0 });
    s.observe({ name: 'level_resume', level: 1, movesMade: 2 }); // a resume is not a new level
    s.observe({ name: 'level_start', level: 2, attempt: 1, mode: 'story', preBoosters: 0 });
    clock.advance(65_000);
    s.hidden();
    s.hidden(); // pagehide after visibilitychange: still one event
    expect(sent).toEqual([{ name: 'session_end', durationMs: 65_000, levelsPlayed: 2 }]);
    expect(validateEvent(sent[0])).toEqual([]);
    s.visible();
    expect([s.id, s.open]).toEqual(['s1', true]);
    s.visible();
    expect(s.id).toBe('s1');
    clock.advance(5_000);
    s.hidden();
    expect(sent.at(-1)).toEqual({ name: 'session_end', durationMs: 5_000, levelsPlayed: 0 });
  });
});
