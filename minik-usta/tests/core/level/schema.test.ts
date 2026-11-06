import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  HIGHLIGHT_PATTERNS,
  HIGHLIGHT_REGEX,
  LevelSchema,
  MECHANIC_IDS,
  TUT_EVENTS,
  TutCond,
} from '../../../src/core/level/schema.ts';
import type { LevelInput } from '../../../src/core/level/schema.ts';
import { levelJson, loadFixture } from '../../fixtures/builders.ts';

const DOCS = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'docs');
const doc = (name: string): string => readFileSync(join(DOCS, name), 'utf8');

type Step = NonNullable<LevelInput['tutorial']>[number];
const ok = (v: unknown): boolean => LevelSchema.safeParse(v).success;
const withTutorial = (steps: Step[]): unknown => ({
  ...levelJson({ pieces: [['B1_0', 'W', 0, 0]] }),
  tutorial: steps,
});
const step = (done: unknown, extra: Record<string, unknown> = {}): Step =>
  ({ step: 1, mode: 'soft', highlight: ['build'], textKey: 'tut.l1.lift', done, ...extra }) as Step;
const condOk = (cond: unknown): boolean => TutCond.safeParse(cond).success;

describe('K-45/1 level schema (TECH §8.2)', () => {
  it('K-45/1 base fixture passes and unknown keys are rejected (strictObject)', () => {
    expect(ok(loadFixture('valid', 'base'))).toBe(true);
    expect(ok({ ...(loadFixture('valid', 'base') as object), elevatorRange: [0, 1] })).toBe(false);
  });

  it('K-45/1 defaults: shutter phase 0, slider dir 1; schemaVersion and seed optional', () => {
    const json = levelJson({
      id: 16,
      wall: {
        height: 8,
        gaps: [
          { type: 'shutter', y: 0, size: 1, period: 2 },
          { type: 'slider', y: 3, size: 1, range: [2, 4] },
        ],
      },
      pieces: [['B1_0', 'W', 0, 0]],
    });
    const parsed = LevelSchema.parse(json);
    const [shutter, slider] = parsed.wall.gaps;
    expect(shutter?.type === 'shutter' && shutter.phase).toBe(0);
    expect(slider?.type === 'slider' && slider.dir).toBe(1);
    const noVersion: Record<string, unknown> = { ...json };
    delete noVersion.schemaVersion;
    expect(ok(noVersion)).toBe(true);
    expect(parsed.seed).toBeUndefined();
  });

  it('K-24 elevator start and dir are required (GDD §14)', () => {
    const json = levelJson({ pieces: [['B1_0', 'W', 0, 0]] });
    const withElevator = (elevator: unknown): unknown => ({ ...json, build: { ...json.build, elevator } });
    expect(ok(withElevator({ range: [0, 2], start: 0, dir: 1 }))).toBe(true);
    expect(ok(withElevator({ range: [0, 2], dir: 1 }))).toBe(false);
    expect(ok(withElevator({ range: [0, 2], start: 0 }))).toBe(false);
  });

  it('K-45/1 ranges follow GDD/OBSTACLES (segments 1–5, carouselEvery 2–6, wetMoves 1–5, period 1–4)', () => {
    const json = levelJson({ pieces: [['B1_0', 'W', 0, 0]] });
    expect(ok({ ...json, build: { ...json.build, carouselEvery: 7 } })).toBe(false);
    expect(ok({ ...json, build: { ...json.build, segments: [] } })).toBe(false);
    expect(ok(levelJson({ pieces: [['B1_0', 'W', 0, 0, ['wet'], 6]] }))).toBe(false);
    expect(ok(levelJson({ pieces: [['B1_0', 'W', 0, 0, ['wet'], 5]] }))).toBe(true);
    expect(
      ok(levelJson({ wall: { height: 4, gaps: [{ type: 'shutter', y: 0, size: 1, period: 5 }] } })),
    ).toBe(false);
  });

  it('K-44 shape ids: all 52 accepted by the schema, others rejected', () => {
    expect(ok(levelJson({ pieces: [['O4_270', 'W', 0, 0]] }))).toBe(true);
    const bad = levelJson({ pieces: [['B1_0', 'W', 0, 0]] });
    const piece = bad.yard.batches[0]?.pieces[0];
    if (piece) (piece as { shape: string }).shape = 'B1_45';
    expect(ok(bad)).toBe(false);
  });

  it('K-45/9 teaches accepts the 27 mechanic ids of OBSTACLES', () => {
    expect(MECHANIC_IDS).toHaveLength(27);
    expect(ok(levelJson({ teaches: 'S7-R', pieces: [['B1_0', 'W', 0, 0]] }))).toBe(true);
    expect(ok({ ...levelJson({ pieces: [['B1_0', 'W', 0, 0]] }), teaches: 'S7' })).toBe(false);
  });
});

describe('GDD 14.1 tutorial schema', () => {
  it('tutorial done vocabulary equals GDD 14.1 list', () => {
    const gdd = doc('GDD.md');
    const start = gdd.indexOf('3. **`done` olay sözlüğü**');
    const end = gdd.indexOf('- **Süzgeçler**', start);
    expect(start).toBeGreaterThan(0);
    const section = gdd.slice(start, end);
    const names = new Set(
      [...section.matchAll(/(?<!olay yerine )`([a-z][A-Za-z]+)`(?= —| \(|; olay yerine)/g)].map((m) => m[1]),
    );
    expect([...names].sort()).toEqual([...TUT_EVENTS].sort());
    for (const event of TUT_EVENTS) {
      const minimal =
        event === 'holdOverBuild'
          ? { event, minMs: 500 }
          : event === 'obstacleHit'
            ? { event, type: 'crate' }
            : event === 'itemCollected'
              ? { event, type: 'screw' }
              : { event };
      expect(condOk(minimal), event).toBe(true);
    }
    expect(condOk({ event: 'pieceMoved' })).toBe(false);
  });

  it('tutorial highlight vocabulary equals UX 13.1 list', () => {
    const ux = doc('UX_FLOWS.md');
    const start = ux.indexOf('**Vurgu kimlikleri**');
    const end = ux.indexOf('### 13.2', start);
    const section = ux.slice(start, end);
    const items = [...section.matchAll(/`([a-z]+(?::(?:<[^`]*>|x,y|k<[^`]*>_<i>))?)`/g)]
      .map((m) => m[1] ?? '')
      .filter((s) => s !== 'highlight');
    const kind = (s: string): string => s.split(':')[0] ?? s;
    const uxKinds = new Set(items.map(kind));
    const schemaKinds = new Set(HIGHLIGHT_PATTERNS.map(kind));
    expect([...uxKinds].sort()).toEqual([...schemaKinds].sort());
    // every UX form has a concrete sample accepted by the schema regex
    const samples = items.flatMap((s) => {
      const alt = /<([a-z|]+)>/.exec(s);
      if (alt && alt[1]?.includes('|')) return alt[1].split('|').map((a) => s.replace(/<[^>]+>/, a));
      return [s.replace('k<parti>_<i>', 'k1_0').replace('<i>', '0').replace('x,y', '6,1')];
    });
    for (const sample of samples) expect(HIGHLIGHT_REGEX.test(sample), sample).toBe(true);
    expect(HIGHLIGHT_REGEX.test('piece:k1_0')).toBe(true);
    expect(HIGHLIGHT_REGEX.test('booster:paintBrush')).toBe(false);
    expect(HIGHLIGHT_REGEX.test('gap')).toBe(false);
  });

  it('tutorial holdOverBuild needs minMs', () => {
    expect(condOk({ event: 'holdOverBuild' })).toBe(false);
    expect(condOk({ event: 'holdOverBuild', minMs: 500 })).toBe(true);
    expect(condOk({ event: 'overWall', minMs: 500 })).toBe(false);
  });

  it('tutorial at only on yardMove and placementCorrect', () => {
    expect(condOk({ event: 'yardMove', count: 1, at: [0, 6] })).toBe(true);
    expect(condOk({ event: 'placementCorrect', at: [6, 0] })).toBe(true);
    expect(condOk({ event: 'landed', at: [6, 0] })).toBe(false);
    expect(condOk({ event: 'gapPass', at: [6, 0] })).toBe(false);
  });

  it('tutorial filter only on its event', () => {
    expect(condOk({ event: 'landed', flag: 'glass', wind: true })).toBe(true);
    expect(condOk({ event: 'deliveryDone', flag: 'mortar' })).toBe(true);
    expect(condOk({ event: 'placementCorrect', hidden: true })).toBe(true);
    expect(condOk({ event: 'yardMove', painted: true })).toBe(true);
    expect(condOk({ event: 'landed', type: 'crate' })).toBe(false);
    expect(condOk({ event: 'yardMove', hidden: true })).toBe(false);
    expect(condOk({ event: 'deliveryDone', wind: true })).toBe(false);
    expect(condOk({ event: 'landed', flag: 'chained' })).toBe(false);
  });

  it('tutorial obstacleHit and itemCollected need type', () => {
    expect(condOk({ event: 'obstacleHit' })).toBe(false);
    expect(condOk({ event: 'itemCollected' })).toBe(false);
    expect(condOk({ event: 'obstacleHit', type: 'chain' })).toBe(true);
    expect(condOk({ event: 'itemCollected', type: 'key' })).toBe(true);
    expect(condOk({ event: 'itemCollected', type: 'crate' })).toBe(false);
  });

  it('tutorial startOn cannot be timeoutMs', () => {
    expect(
      ok(withTutorial([step({ timeoutMs: 2500 }, { startOn: { event: 'deliveryDone', flag: 'mortar' } })])),
    ).toBe(true);
    expect(ok(withTutorial([step({ timeoutMs: 2500 }, { startOn: { timeoutMs: 1000 } })]))).toBe(false);
  });

  it('GDD 14.1/1 textKey accepts tut.l{n}.{topic} and tut.ctx.{topic}', () => {
    expect(ok(withTutorial([step({ timeoutMs: 1000 }, { textKey: 'tut.ctx.support' })]))).toBe(true);
    expect(ok(withTutorial([step({ timeoutMs: 1000 }, { textKey: 'tut.l12.clear' })]))).toBe(true);
    expect(ok(withTutorial([step({ timeoutMs: 1000 }, { textKey: 'tut.meta.bridge' })]))).toBe(false);
    expect(ok(withTutorial([step({ timeoutMs: 1000 }, { textKey: 'tut.L1.lift' })]))).toBe(false);
  });

  it('K-45/1 LEVELS level 1-10 tutorial data passes schema', () => {
    // LEVELS §2 "Öğretici adımları", transcribed step by step (Bölüm 7 done.at included).
    const s = (
      n: number,
      mode: 'required' | 'soft',
      highlight: string[],
      textKey: string,
      done: unknown,
    ): Step => ({ step: n, mode, highlight, textKey, done }) as Step;
    const levels: Step[][] = [
      [
        s(1, 'required', ['piece:0', 'crane'], 'tut.l1.lift', { event: 'overWall', count: 1 }),
        s(2, 'soft', ['piece:0', 'build'], 'tut.l1.drop', { event: 'placementCorrect', count: 1 }),
        s(3, 'soft', ['piece:1', 'cell:6,1', 'cell:6,2'], 'tut.l1.match', {
          event: 'placementCorrect',
          count: 1,
        }),
      ],
      [
        s(1, 'soft', ['panorama', 'build'], 'tut.l2.pattern', { event: 'placementCorrect', count: 1 }),
        s(2, 'soft', ['piece:2', 'build'], 'tut.l2.shadow', { event: 'holdOverBuild', count: 1, minMs: 500 }),
        s(3, 'soft', ['piece:1', 'build'], 'tut.l1.match', { event: 'placementCorrect', count: 1 }),
      ],
      [
        s(1, 'soft', ['piece:0', 'cell:6,0', 'cell:7,1'], 'tut.l1.match', {
          event: 'placementCorrect',
          count: 1,
        }),
        s(2, 'required', ['gap:0', 'piece:1'], 'tut.l3.gap', { event: 'gapPass', count: 1 }),
        s(3, 'soft', ['piece:1'], 'tut.l3.rail', { event: 'placementCorrect', count: 1 }),
      ],
      [
        s(1, 'soft', ['cell:7,2'], 'tut.l4.window', { timeoutMs: 2500 }),
        s(2, 'soft', ['front'], 'tut.ctx.support', { event: 'placementCorrect', count: 2 }),
        s(3, 'required', ['gap:0', 'piece:2', 'cell:6,3', 'cell:7,3'], 'tut.l4.above', {
          event: 'gapPass',
          count: 1,
        }),
      ],
      [
        s(1, 'soft', ['panorama'], 'tut.l5.segments', { event: 'segmentDone', count: 1 }),
        s(2, 'soft', ['truck'], 'tut.l5.truck', { event: 'deliveryDone', count: 1 }),
      ],
      [s(1, 'required', ['piece:0', 'crane', 'wall'], 'tut.l6.crane', { event: 'overWall', count: 1 })],
      [
        s(1, 'required', ['piece:0', 'piece:3', 'cell:0,6'], 'tut.l7.dig', {
          event: 'yardMove',
          count: 1,
          at: [0, 6],
        }),
        s(2, 'soft', ['piece:3'], 'tut.l7.free', { timeoutMs: 2000 }),
      ],
      [
        s(1, 'soft', ['piece:0'], 'tut.l8.heavy', { timeoutMs: 2500 }),
        s(2, 'soft', ['booster:hammer', 'piece:0'], 'tut.l8.hammer', { timeoutMs: 4000 }),
      ],
      [
        s(1, 'soft', ['piece:3', 'build'], 'tut.l1.match', { event: 'placementCorrect', count: 1 }),
        s(2, 'required', ['gap:0', 'piece:5'], 'tut.l9.narrow', { event: 'gapPass', count: 1 }),
      ],
      [s(1, 'soft', ['booster:crane'], 'tut.l10.crane', { timeoutMs: 3000 })],
    ];
    levels.forEach((steps, i) => expect(ok(withTutorial(steps)), `level ${i + 1}`).toBe(true));
  });

  it('K-45/1 LEVELS level 11-38 tutorial done data passes schema', () => {
    const levels = doc('LEVELS.md');
    const start = levels.indexOf('**11–38 `tutorial[]` `done` eşlemesi**');
    const end = levels.indexOf('\n\n', levels.indexOf('| 38 ·', start));
    const rows = levels
      .slice(start, end)
      .split('\n')
      .filter((l) => /^\| \d+ · \d+ \|/.test(l));
    expect(rows.length).toBe(30);
    const toJson = (pseudo: string): unknown =>
      JSON.parse(
        pseudo
          .replace(/(\w+):/g, '"$1":')
          .replace(/: ([A-Za-z_]\w*)/g, (_m, word: string) => (word === 'true' ? ': true' : `: "${word}"`)),
      );
    let startOns = 0;
    for (const row of rows) {
      const cell = row.split('|')[3] ?? '';
      const startOn = /`startOn: (\{[^`]*\})`/.exec(cell);
      const done = [...cell.matchAll(/`(\{[^`]*\})`/g)].map((m) => m[1] ?? '');
      const doneJson = toJson(done[done.length - 1] ?? '{}');
      const extra = startOn ? { startOn: toJson(startOn[1] ?? '{}') } : {};
      if (startOn) startOns++;
      expect(ok(withTutorial([step(doneJson, extra)])), row).toBe(true);
    }
    expect(startOns).toBe(1); // Bölüm 35
  });
});
