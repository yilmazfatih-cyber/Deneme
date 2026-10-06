import { describe, expect, it } from 'vitest';
import {
  ALL_RULES,
  activeRuleIds,
  assertValidRules,
  infoKeysFor,
  levelHooks,
  ruleSet,
  validateRules,
} from '../../src/core/obstacles/registry.ts';
import { RULE_ORDER_BASE, ruleZone } from '../../src/core/obstacles/types.ts';
import type { ObstacleRule, RuleId } from '../../src/core/obstacles/types.ts';
import { NO_HOOKS } from '../../src/core/moves.ts';
import type { RuleContext } from '../../src/core/moves.ts';
import { tryBeginDrag, railMode } from '../../src/core/movement.ts';
import { NO_EFFECT, computeFall } from '../../src/core/gravity.ts';
import type { FallPlan } from '../../src/core/gravity.ts';
import { createInitialState, hasFlag, hiddenCollected, setHiddenCollected } from '../../src/core/state.ts';
import type { PieceId } from '../../src/core/types.ts';
import { compiledLevel, initialState } from '../fixtures/builders.ts';
import type { LevelSpec } from '../fixtures/builders.ts';
import { N, dragTo, find, levelFile, run } from '../core/moves.fixtures.ts';
import { ctxOf, fakeRule } from './obstacles.fixtures.ts';

const noop = (): void => undefined;

describe('obstacle registry table (TECH 7.1, 7.3)', () => {
  it('TECH 7.1 ALL_RULES is a valid table: W1, S1, S2, each in its zone hundred (W → Y → S → G)', () => {
    expect(validateRules(ALL_RULES)).toEqual([]);
    expect(ALL_RULES.map((r) => r.id)).toEqual(['W1', 'S1', 'S2']);
    for (const r of ALL_RULES) {
      expect(r.zone).toBe(ruleZone(r.id));
      const base = RULE_ORDER_BASE[r.zone];
      expect(r.order).toBeGreaterThan(base);
      expect(r.order).toBeLessThan(base + 100);
      expect(Object.isFrozen(r)).toBe(true);
    }
    expect(RULE_ORDER_BASE.wall).toBeLessThan(RULE_ORDER_BASE.yard);
    expect(RULE_ORDER_BASE.yard).toBeLessThan(RULE_ORDER_BASE.site);
    expect(RULE_ORDER_BASE.site).toBeLessThan(RULE_ORDER_BASE.gravity);
  });

  it('K-45 rule activation equals the OBSTACLES data signature of levels 1–5 (W1 from 3, S2 in 4, S1 in 5)', () => {
    const expected: Readonly<Record<number, readonly RuleId[]>> = {
      1: [],
      2: [],
      3: ['W1'],
      4: ['W1', 'S2'],
      5: ['S1'],
    };
    for (const id of [1, 2, 3, 4, 5]) {
      const lvl = levelFile(id);
      expect(activeRuleIds(lvl), `level ${id}`).toEqual(expected[id]);
      const ruleIds = new Set<string>(ALL_RULES.map((r) => r.id));
      expect(activeRuleIds(lvl)).toEqual(lvl.mechanics.filter((m) => ruleIds.has(m)));
    }
  });

  it('TECH 7.1 Phase 2 levels 1–5 get empty hooks: W1, S1 and S2 are core models', () => {
    for (const id of [1, 2, 3, 4, 5]) expect(levelHooks(levelFile(id)), `level ${id}`).toEqual({});
  });

  it('TECH 7.1 hooks are composed once per compiled level; the debug panel switch composes fresh ones', () => {
    const lvl = levelFile(4);
    expect(levelHooks(lvl)).toBe(levelHooks(lvl));
    const off = { disabled: new Set<RuleId>(['W1']) };
    expect(activeRuleIds(lvl, off)).toEqual(['S2']);
    expect(infoKeysFor(lvl, off)).toEqual(['obs.s2.desc']);
    expect(levelHooks(lvl, off)).not.toBe(levelHooks(lvl));
    const costly = [fakeRule('Y8', { moveCost: () => 2 })];
    expect(levelHooks(lvl, { rules: costly }).moveCost).toBeDefined();
    expect(levelHooks(lvl, { rules: costly, disabled: new Set<RuleId>(['Y8']) })).toEqual({});
  });

  it('TECH 7.1 info card keys follow the level mechanics (obs.{id}.desc, OBSTACLES R-08)', () => {
    expect(infoKeysFor(levelFile(1))).toEqual([]);
    expect(infoKeysFor(levelFile(3))).toEqual(['obs.w1.desc']);
    expect(infoKeysFor(levelFile(4))).toEqual(['obs.w1.desc', 'obs.s2.desc']);
    expect(infoKeysFor(levelFile(5))).toEqual(['obs.s1.desc']);
    // S7 covers two mechanics: only the card of the one the level uses is shown
    const s7 = fakeRule('S7', {
      infoKeys: ['obs.s7r.desc', 'obs.s7m.desc'],
      appliesTo: (l) => l.mechanics.includes('S7-R') || l.mechanics.includes('S7-M'),
    });
    const repeat = compiledLevel({
      plan: [['WY'], ['??']],
      hidden: [undefined, { kind: 'repeat', period: 1 }],
      pieces: [['B1_0', 'W', 0, 0]],
    });
    expect(infoKeysFor(repeat, { rules: [s7] })).toEqual(['obs.s7r.desc']);
  });
});

describe('rule table validation (TECH 7.1, 7.3)', () => {
  const errorsOf = (...rules: ObstacleRule[]): string => validateRules(rules).join('\n');

  it('K-35 step 10: onMoveEnd needs moveEndOrder equal to its STEP10_TIMERS position (TECH 7.3)', () => {
    expect(errorsOf(fakeRule('W4', { onMoveEnd: noop }))).toMatch(/onMoveEnd needs moveEndOrder/);
    expect(errorsOf(fakeRule('W4', { onMoveEnd: noop, moveEndOrder: 2 }))).toMatch(
      /moveEndOrder 2 ≠ K-35 step 10 position 1/,
    );
    expect(errorsOf(fakeRule('W4', { moveEndOrder: 1 }))).toMatch(/moveEndOrder without onMoveEnd/);
    expect(errorsOf(fakeRule('Y1', { onMoveEnd: noop, moveEndOrder: 5 }))).toMatch(/no rule timer/);
    // S5 / S6 ticks belong to the site strategy
    expect(errorsOf(fakeRule('S5', { onMoveEnd: noop, moveEndOrder: 3 }))).toMatch(/no rule timer/);
    expect(
      validateRules([
        fakeRule('W4', { onMoveEnd: noop, moveEndOrder: 1 }),
        fakeRule('W5', { onMoveEnd: noop, moveEndOrder: 2 }),
        fakeRule('Y4', { onMoveEnd: noop, moveEndOrder: 5 }),
      ]),
    ).toEqual([]);
  });

  it('TECH 7.3 ids, zones and orders: unique, known, inside the zone hundred', () => {
    expect(errorsOf(fakeRule('W1'), fakeRule('W1'))).toMatch(/duplicate id/);
    expect(errorsOf(fakeRule('W1'), fakeRule('W2', { order: 101 }))).toMatch(/order 101 is also used by W1/);
    expect(errorsOf(fakeRule('Y1', { order: 150 }))).toMatch(/outside 201…299/);
    expect(errorsOf(fakeRule('W1', { zone: 'site' }))).toMatch(/zone site ≠ wall/);
    expect(errorsOf({ ...fakeRule('W1'), id: 'X9' as RuleId })).toMatch(/unknown rule id/);
  });

  it('TECH 7.1 ownership: one owner per entity type; dispatched hooks need an owned type', () => {
    expect(
      errorsOf(
        fakeRule('W1', { owns: { gapType: 'static' } }),
        fakeRule('W4', { owns: { gapType: 'static' } }),
      ),
    ).toMatch(/gapType static is already owned by W1/);
    expect(errorsOf(fakeRule('W4', { canPassGap: () => true }))).toMatch(/need owns.gapType/);
    expect(errorsOf(fakeRule('W6', { onPassGap: noop }))).toMatch(/need owns.gapType/);
    expect(errorsOf(fakeRule('Y1', { onNeighborMoved: () => 'none' }))).toMatch(/needs owns.obstacle or/);
    expect(errorsOf(fakeRule('Y7', { onCellUncovered: noop, owns: { pieceFlag: 'glass' } }))).toMatch(
      /onCellUncovered needs owns.obstacle/,
    );
  });

  it('TECH 7.1 info card keys: at least one, obs.{id}….desc (OBSTACLES R-08)', () => {
    expect(errorsOf(fakeRule('W1', { infoKeys: [] }))).toMatch(/no info card key/);
    expect(errorsOf(fakeRule('W1', { infoKeys: ['obs.w2.desc'] }))).toMatch(/info card key obs.w2.desc/);
    expect(errorsOf(fakeRule('G-H'))).toBe('');
    expect(fakeRule('G-H').infoKeys).toEqual(['obs.gh.desc']);
  });

  it('TECH 7.1 a malformed rule table is refused before any hook is composed', () => {
    const bad = [fakeRule('W4', { onMoveEnd: noop })];
    expect(() => assertValidRules(bad)).toThrow(/obstacle registry/);
    expect(() => levelHooks(levelFile(1), { rules: bad })).toThrow(/moveEndOrder/);
  });
});

describe('hook composition through the pipeline (TECH 7.1)', () => {
  it('K-09 a block can be picked only when every active rule allows it (canPick)', () => {
    const lvl = compiledLevel({
      pieces: [
        ['B1_0', 'W', 0, 0, ['chained']],
        ['B1_0', 'W', 2, 0, ['glass']],
        ['B1_0', 'W', 4, 0],
      ],
    });
    const s = createInitialState(lvl);
    const rules = [
      fakeRule('Y3', { canPick: (st, id) => !hasFlag(st, id, 'chained') }),
      fakeRule('S3', { canPick: (st, id) => !hasFlag(st, id, 'glass') }),
    ];
    const { drag } = levelHooks(lvl, { rules });
    expect(tryBeginDrag(s, 0, drag)).toMatchObject({ ok: false, reason: 'rule' });
    expect(tryBeginDrag(s, 1, drag)).toMatchObject({ ok: false, reason: 'rule' });
    expect(tryBeginDrag(s, 2, drag).ok).toBe(true);
    expect(tryBeginDrag(s, 0, levelHooks(lvl).drag).ok).toBe(true);
    const r = run(s, dragTo(0, 3, 0), { hooks: levelHooks(lvl, { rules }), strict: false });
    expect(r.res).toMatchObject({ status: 'cancelled', reason: 'invalid' });
  });

  it('W1 static gaps stay passable when another gap rule gates its own type (ruleByGapType)', () => {
    const spec: LevelSpec = {
      wall: {
        height: 6,
        gaps: [
          { type: 'static', y: 1, size: 1 },
          { type: 'shutter', y: 3, size: 1, period: 2, phase: 0 },
        ],
      },
      plan: ['WW', 'WW', 'WW', 'WW'],
      pieces: [
        ['D2_90', 'W', 4, 1],
        ['D2_90', 'W', 4, 3],
      ],
    };
    const lvl = compiledLevel(spec);
    const s = createInitialState(lvl);
    const closedShutter = fakeRule('W4', { owns: { gapType: 'shutter' }, canPassGap: () => false });
    const set = ruleSet(lvl, { rules: [closedShutter] });
    expect(set.ruleByGapType.get('shutter')?.id).toBe('W4');
    const { drag } = levelHooks(lvl, { rules: [closedShutter] });
    expect(drag?.canPassGap?.(s, 0, 0)).toBe(true); // static: its open field (W1 has no gate)
    expect(drag?.canPassGap?.(s, 1, 1)).toBe(false); // shutter: its owner decides
    const railNodes = (id: PieceId, gap: number, rules: typeof drag): boolean => {
      const a = tryBeginDrag(s, id, rules);
      return a.ok && a.session.reachableNodes().some((n) => n.mode === railMode(gap));
    };
    expect(railNodes(0, 0, drag)).toBe(true);
    expect(railNodes(1, 1, drag)).toBe(false);
    expect(railNodes(1, 1, NO_HOOKS.drag)).toBe(true); // the open shutter without its rule
  });

  it('K-07 move cost: the largest rule base wins and the glass penalty of onLanded is added (Y8 + S3 = 3)', () => {
    const spec: LevelSpec = { plan: ['WW'], pieces: [['B1_0', 'W', 3, 0, ['glass']]] };
    const lvl = compiledLevel(spec);
    const order: string[] = [];
    const rules = [
      fakeRule('W8', {
        onLanded: () => {
          order.push('W8');
          return NO_EFFECT;
        },
      }),
      fakeRule('S3', {
        onLanded: (st, id, fall) => {
          order.push('S3');
          return hasFlag(st, id, 'glass') && fall.distance > st.lvl.gravity.glassThreshold
            ? { kind: 'break', penalty: 1 }
            : NO_EFFECT;
        },
      }),
      fakeRule('Y8', { moveCost: () => 2 }),
      fakeRule('Y4', { moveCost: () => undefined }),
    ];
    const s = createInitialState(lvl);
    const r = run(s, dragTo(0, 6, 8), { hooks: levelHooks(lvl, { rules }) });
    expect(order).toEqual(['W8', 'S3']);
    expect(find(r.ev, 'glassBroke').penalty).toBe(1);
    expect(find(r.ev, 'movesChanged')).toMatchObject({ delta: -3, cost: { base: 2, glass: 1 } });
  });

  it('K-35 step 2 modifyFall hooks chain in rule order: W8 before S8 (TECH 7.3)', () => {
    const lvl = compiledLevel({ plan: ['WW'], pieces: [['B1_0', 'W', 3, 0]] });
    const s = createInitialState(lvl);
    const calls: string[] = [];
    const tag =
      (id: string) =>
      (_s: unknown, _id: PieceId, plan: FallPlan): FallPlan => {
        calls.push(id);
        return id === 'W8' ? { ...plan, ix: plan.ix + 1, drift: 1 } : plan;
      };
    // table order S8, W8: the registry sorts by `order`
    const rules = [fakeRule('S8', { modifyFall: tag('S8') }), fakeRule('W8', { modifyFall: tag('W8') })];
    const fall = computeFall(s, 0, N(6, 8), { rules: levelHooks(lvl, { rules }).fall });
    expect(calls).toEqual(['W8', 'S8']);
    expect(fall.landing).toMatchObject({ ix: 7, iy: 0 });
  });

  it('K-35 step 3 onPlacement: a rule override (Y8 stick) is not masked by a default of another rule', () => {
    const lvl = compiledLevel({ plan: ['WW'], pieces: [['B1_0', 'Y', 3, 0, ['mortar']]] });
    const s = createInitialState(lvl);
    const rules = [
      fakeRule('S7', { onPlacement: () => ({ kind: 'default' }) }),
      fakeRule('Y8', {
        onPlacement: (st, id) => ({ kind: hasFlag(st, id, 'mortar') ? 'stick' : 'default' }),
      }),
    ];
    const r = run(s, dragTo(0, 6, 8), { hooks: levelHooks(lvl, { rules }) });
    expect(find(r.ev, 'mortarStuck')).toMatchObject({ pieceId: 0, reason: 'color' });
  });

  it('K-35 step 5 onNeighborMoved goes to the owner of the obstacle type or block flag only (Y1 crate, Y3 chain)', () => {
    // moved block M (1,1); crate under it (1,0); plain block P left (0,1); chained block C right (2,1)
    const lvl = compiledLevel({
      plan: ['WW'],
      pieces: [
        ['B1_0', 'W', 1, 1],
        ['B1_0', 'W', 0, 1],
        ['B1_0', 'W', 2, 1, ['chained']],
      ],
      obstacles: [{ type: 'crate', x: 1, y: 0, hp: 1 }],
    });
    const calls: string[] = [];
    const rules = [
      fakeRule('Y1', {
        owns: { obstacle: 'crate' },
        onNeighborMoved: (_ctx, e) => {
          calls.push(`Y1:${e.kind}`);
          return 'affected';
        },
      }),
      fakeRule('Y3', {
        owns: { pieceFlag: 'chained' },
        onNeighborMoved: (_ctx, e) => {
          calls.push(`Y3:${e.kind === 'piece' ? e.id : -1}`);
          return 'affected';
        },
      }),
      fakeRule('S3', {
        owns: { pieceFlag: 'glass' },
        onNeighborMoved: () => {
          calls.push('S3');
          return 'freed';
        },
      }),
    ];
    const s = createInitialState(lvl);
    run(s, dragTo(0, 4, 0), { hooks: levelHooks(lvl, { rules }) });
    expect(calls).toEqual(['Y1:obstacle', 'Y3:2']); // (y, x) order of the neighbour cells; P and glass untouched
  });

  it('K-42 onCellUncovered goes to the owner of the hidden item type (Y7 screw) at hidden item check #1', () => {
    const lvl = compiledLevel({
      plan: ['WW'],
      pieces: [['B1_0', 'W', 0, 0]],
      obstacles: [{ type: 'screw', x: 0, y: 0 }],
    });
    const rules = [
      fakeRule('Y7', {
        owns: { obstacle: 'screw' },
        onCellUncovered: (ctx: RuleContext, obstacle: number) => {
          const o = ctx.lvl.obstacles[obstacle];
          if (o?.type !== 'screw') return;
          setHiddenCollected(ctx.s, o.hiddenIndex, true);
          ctx.emit({ t: 'screwCollected', at: { zone: 'yard', x: o.x, y: o.y }, total: 1 });
        },
      }),
      fakeRule('W7', { owns: { obstacle: 'key' }, onCellUncovered: () => expect.fail('no key here') }),
    ];
    const s = createInitialState(lvl);
    const r = run(s, dragTo(0, 3, 0), { hooks: levelHooks(lvl, { rules }) });
    expect(find(r.ev, 'screwCollected').step).toBe(5);
    expect(r.ev.filter((e) => e.t === 'screwCollected')).toHaveLength(1);
    expect(hiddenCollected(s, 0)).toBe(true);
  });

  it('W6 onPassGap goes to the owner of the gap type (paint), never to the static gap of W1', () => {
    const lvl = compiledLevel({
      wall: {
        height: 6,
        gaps: [
          { type: 'static', y: 1, size: 1 },
          { type: 'paint', y: 3, size: 1, color: 'R' },
        ],
      },
      plan: ['WW'],
      pieces: [['B1_0', 'W', 0, 0]],
    });
    const passed: number[] = [];
    const rules = [
      ALL_RULES[0] as ObstacleRule,
      fakeRule('W6', { owns: { gapType: 'paint' }, onPassGap: (_ctx, gap) => passed.push(gap) }),
    ];
    const hooks = levelHooks(lvl, { rules });
    const { ctx } = ctxOf(createInitialState(lvl));
    hooks.onPassGap?.(ctx, 0, 0);
    hooks.onPassGap?.(ctx, 1, 0);
    expect(passed).toEqual([1]);
  });

  it('K-35 step 10 rule onMoveEnd hooks run as lvl.step10 timers: W5 before Y4 whatever the table order', () => {
    const lvl = compiledLevel({
      wall: { height: 6, gaps: [{ type: 'slider', y: 1, size: 1, range: [1, 3], dir: 1 }] },
      plan: ['WW'],
      pieces: [
        ['B1_0', 'W', 0, 0, ['wet'], 3],
        ['B1_0', 'W', 3, 0],
      ],
    });
    expect(lvl.step10.map((t) => t.id)).toEqual(['W5', 'Y4']);
    const rules = [
      fakeRule('Y4', {
        onMoveEnd: (ctx) => ctx.emit({ t: 'wetTick', pieceId: 0, left: 2 }),
        moveEndOrder: 5,
      }),
      fakeRule('W5', {
        onMoveEnd: (ctx) => ctx.emit({ t: 'gapChanged', gap: 0, open: true, y: 2 }),
        moveEndOrder: 2,
      }),
    ];
    const hooks = levelHooks(lvl, { rules });
    expect(Object.keys(hooks.timers ?? {}).sort()).toEqual(['W5', 'Y4']);
    const r = run(createInitialState(lvl), dragTo(1, 4, 0), { hooks });
    const timed = r.ev.filter((e) => e.step === 10).map((e) => e.t);
    expect(timed).toEqual(['gapChanged', 'wetTick']);
  });

  it('K-24 the S6 elevator tick of step 10 comes from the registry by default (site strategy stub until Phase 3)', () => {
    const spec: LevelSpec = {
      plan: ['WW', 'WW'],
      elevator: { range: [0, 2], start: 0, dir: 1 },
      pieces: [
        ['B1_0', 'W', 0, 0],
        ['B1_0', 'W', 3, 0],
      ],
    };
    expect(levelHooks(compiledLevel(spec)).timers?.S6).toBeDefined();
    // default hooks = registry: the site tick runs and its Phase 3 stub throws
    expect(() => run(initialState(spec), dragTo(1, 4, 0))).toThrow(/elevator scaffold tick/);
    // bare core: no timer hook at all
    expect(() => run(initialState(spec), dragTo(1, 4, 0), { hooks: NO_HOOKS })).toThrow(
      /step-10 timer S6 has no rule hook/,
    );
  });

  it('K-23 the S5 carousel tick is skipped in a move whose step 8 turned the platform (registry timer)', () => {
    const lvl = compiledLevel({
      plan: [['WW'], ['WW']],
      mode: 'carousel',
      carouselEvery: 2,
      pieces: [['B1_0', 'W', 0, 0]],
    });
    const tick = levelHooks(lvl).timers?.S5;
    expect(tick).toBeDefined();
    if (!tick) return;
    const turned = ctxOf(createInitialState(lvl), true);
    tick(turned.ctx);
    expect(turned.events).toEqual([]);
    const plain = ctxOf(createInitialState(lvl), false);
    expect(() => tick(plain.ctx)).toThrow(/Phase 3/); // core/site.ts carousel counter stub
  });
});
