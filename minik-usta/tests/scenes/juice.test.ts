/**
 * JUICE Phase 2 P0 EventPlayer (docs/TECH_DESIGN.md §6.3, §14.1 #11; JUICE.md §0 rules 3, 4, 8, 10, 12): the P0
 * catalogue against JUICE.md, one handler per P0 event, the K-35 cue order, input during animations (R-12 / D-021),
 * reduced-motion variants and the particle budget. Pure modules only (no Phaser): handlers run against a recording
 * fake `JuiceStage`.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ArraySink } from '../../src/core/moves.ts';
import { GameSession } from '../../src/core/session.ts';
import { pieceShape, queueIds } from '../../src/core/state.ts';
import { shapeByIndex } from '../../src/core/shapes.ts';
import type { At, GameEvent, GameEventBody } from '../../src/core/types.ts';
import { TOKENS } from '../../src/theme/tokens.ts';
import { resolveSound } from '../../src/services/audio.ts';
import { HAPTIC_NAMES } from '../../src/services/haptics.ts';
import {
  JUICE,
  JUICE_P0_IDS,
  comboRate,
  isP0,
  juiceMs,
  juiceParticles,
  reducedScale,
} from '../../src/scenes/level/juice/catalog.ts';
import type { JuiceId } from '../../src/scenes/level/juice/catalog.ts';
import { DragFeel } from '../../src/scenes/level/juice/dragFeel.ts';
import { FxRunner, popCurve, pulse01 } from '../../src/scenes/level/juice/fx.ts';
import { JUICE_HANDLERS, handlerEntries } from '../../src/scenes/level/juice/handlers.ts';
import { ParticleField } from '../../src/scenes/level/juice/particles.ts';
import { planMove, releaseFallMs } from '../../src/scenes/level/juice/plan.ts';
import type { MoveCue, PlanContext } from '../../src/scenes/level/juice/plan.ts';
import { LOCK_SPEEDUP, Playback } from '../../src/scenes/level/juice/playback.ts';
import type { JuiceCue, JuiceStage, Tweenable } from '../../src/scenes/level/juice/stage.ts';
import { JUICE_VIEW } from '../../src/scenes/level/viewConstants.ts';
import { HAND, levelFile } from '../core/moves.fixtures.ts';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const JUICE_MD = readFileSync(join(ROOT, 'docs/JUICE.md'), 'utf8');

// --- JUICE.md rows ------------------------------------------------------------------------------------------------------

interface DocRow {
  readonly id: number;
  readonly cells: readonly string[];
}

/** Table rows of JUICE.md (`| # | Olay | Görsel | Süre ms | Easing | Parçacık | Ses | Haptik | Azaltılmış hareket |`). */
function docRows(): Map<number, DocRow> {
  const out = new Map<number, DocRow>();
  for (const line of JUICE_MD.split('\n')) {
    const m = /^\|\s*(\d+)\s*\|/.exec(line);
    if (!m) continue;
    const cells = line
      .split('|')
      .slice(1, -1)
      .map((c) => c.trim());
    out.set(Number(m[1]), { id: Number(m[1]), cells });
  }
  return out;
}

/** JUICE §0 rule 12 "**Faz 2 P0** = #1–13, 15–20, …" expanded. */
function docP0List(): number[] {
  const m = /\*\*Faz 2 P0\*\* = ([^(]+)\(/.exec(JUICE_MD.replace(/\n\s*/g, ' '));
  if (!m) throw new Error('JUICE §0 rule 12 P0 list not found');
  const out: number[] = [];
  for (const part of (m[1] ?? '').replace(/#/g, '').split(',')) {
    const [a, b] = part.trim().split('–').map(Number);
    if (a === undefined || Number.isNaN(a)) continue;
    for (let i = a; i <= (b ?? a); i++) out.push(i);
  }
  return out;
}

const HAPTIC_TR: readonly (readonly [string, string])[] = [
  ['çift hafif', 'doubleLight'],
  ['zafer deseni', 'win'],
  ['başarı', 'success'],
  ['güçlü', 'heavy'],
  ['orta', 'medium'],
  ['hafif', 'light'],
];

function docHaptic(cell: string): string | null {
  const c = cell.toLocaleLowerCase('tr-TR');
  if (c.startsWith('yok')) return null;
  for (const [tr, name] of HAPTIC_TR) if (c.startsWith(tr)) return name;
  throw new Error(`unknown haptic "${cell}"`);
}

// --- recording stage ----------------------------------------------------------------------------------------------------

interface Call {
  readonly name: string;
  readonly args: readonly unknown[];
}

const RECT = { x: 100, y: 200, w: 240, h: 120 };
const PT = { x: 50, y: 60 };

function tweenable(): Tweenable & {
  lips: number[];
  drains: number[];
  setLip(px: number): void;
  setDrain(k: number): void;
} {
  return {
    x: 10,
    y: 20,
    scaleX: 1,
    scaleY: 1,
    alpha: 1,
    lips: [],
    drains: [],
    setLip(px: number) {
      this.lips.push(px);
    },
    setDrain(k: number) {
      this.drains.push(k);
    },
  };
}

function recorder(): { stage: JuiceStage; calls: Call[] } {
  const calls: Call[] = [];
  const answers: Partial<Record<keyof JuiceStage, unknown>> = {
    ease: (u: number) => u,
    boardRect: RECT,
    screenRect: { x: 0, y: 0, w: 1080, h: 1920 },
    restAnchor: { ax: 1, ay: 2 },
    pieceAnchor: { ax: 3, ay: 4 },
    anchorAt: { ax: 5, ay: 6 },
    pieceBox: RECT,
    boxAt: RECT,
    cellRect: RECT,
    pieceColor: 0xff0000,
    colorOf: 0x00ff00,
    siteColors: [0x0000ff],
    queueCount: 2,
    chipPoint: PT,
    trowelPoint: PT,
    beadPoint: PT,
    movesPoint: PT,
    levelNumber: 3,
  };
  const stage = new Proxy({} as JuiceStage, {
    get(_t, prop: string) {
      return (...args: unknown[]) => {
        calls.push({ name: prop, args });
        const a = answers[prop as keyof JuiceStage];
        if (prop === 'ease') return (u: number) => u;
        if (prop === 'drive') {
          // run the animation to its end so end-of-animation work is recorded too
          const apply = args[3] as (k: number, u: number) => void;
          apply(0, 0);
          apply(1, 1);
        }
        return a;
      };
    },
  });
  return { stage, calls };
}

const ev = <T extends GameEventBody>(body: T, step: number): GameEvent =>
  ({ seq: 0, step, ...body }) as GameEvent;
const yardAt = (x: number, y: number): At => ({ zone: 'yard', x, y });
const siteAt = (x: number, y: number): At => ({ zone: 'site', x, y, seg: 0 });

/** Every branch of a handler: the cues each P0 id is tried with. */
function variants(id: JuiceId): Partial<JuiceCue>[] {
  const piece = { piece: 4 };
  switch (id) {
    case 2:
      return [{ ...piece, pieces: [7] }];
    case 3:
      return [{ ...piece, dx: 20, dy: 20 }];
    case 4:
      return [{ ...piece, first: true, flag: true, dx: 1, dy: 0, from: PT }];
    case 5:
      return [{ ...piece, flag: true }];
    case 7:
      return [{ ...piece, flag: true }];
    case 8:
      return [{ ...piece }, { ...piece, flag: true }];
    case 9:
      return [
        {
          ...piece,
          ev: ev({ t: 'pieceMoved', pieceId: 4, from: yardAt(0, 0), to: yardAt(2, 0), entry: 'yard' }, 1),
        },
      ];
    case 23:
      return [
        {
          ...piece,
          ev: ev(
            { t: 'pieceMoved', pieceId: 4, from: yardAt(0, 2), to: siteAt(6, 2), entry: 'gap', gap: 0 },
            1,
          ),
        },
      ];
    case 10:
    case 11:
      return [
        {
          ...piece,
          gravity: 'normal',
          ev: ev(
            { t: 'pieceFell', pieceId: 4, from: siteAt(6, 8), to: siteAt(6, 0), rows: 8, cause: 'release' },
            2,
          ),
        },
      ];
    case 12:
      return [
        {
          ...piece,
          n: 3,
          ev: ev({ t: 'placementCorrect', pieceId: 4, cells: [siteAt(6, 0)], overWall: true }, 3),
        },
      ];
    case 13: {
      const bounce = (to: At | 'queue', viaDrop: boolean): Partial<JuiceCue> => ({
        ...piece,
        n: 3,
        flag: to === 'queue',
        ev: ev(
          {
            t: 'pieceBounced',
            pieceId: 4,
            from: siteAt(6, 0),
            to,
            viaDrop,
            reason: 'color',
            missingSupport: [],
          },
          3,
        ),
      });
      return [bounce(yardAt(1, 0), false), bounce(yardAt(1, 0), true), bounce('queue', false)];
    }
    case 15:
      return [{ n: 2 }];
    case 16:
      return [{ n: 1 }];
    case 17:
      return [
        {
          ev: ev(
            {
              t: 'boosterApplied',
              booster: 'trowel',
              detail: { cell: siteAt(6, 1), color: 'R', trowels: 0 },
            },
            1,
          ),
        },
      ];
    case 18:
      return [{ toSeg: 1, ev: ev({ t: 'segmentCompleted', seg: 0 }, 8) }];
    case 19:
    case 20:
      return [
        {
          n: 1,
          drops: [{ pieceId: 9, from: yardAt(0, 8), to: yardAt(0, 0), rows: 8, delay: 300, ms: 400 }],
        },
      ];
    case 22:
      return [{ ...piece, n: 0 }];
    case 50:
    case 51:
      return [{ n: 5, first: true }];
    case 53:
      return [{ n: 5, from: PT }];
    case 55:
      return [{ n: 7 }];
    case 56:
      // the plan gives the bonus its whole duration: 7 counted moves × duration.bonusPerMove
      return [{ n: 7, ms: 7 * TOKENS.duration.bonusPerMove }];
    case 52:
    case 70:
    case 71:
      return [
        { window: { dim: tweenable(), panel: tweenable(), options: [tweenable()], chip: tweenable() } },
      ];
    case 58:
      return [{ heart: tweenable() }];
    case 69:
      return [
        { button: tweenable(), variant: 'press' },
        { button: tweenable(), variant: 'release' },
      ];
    case 84:
      return [{ cells: [siteAt(6, 0), siteAt(7, 0)] }];
    case 87:
      return [
        { variant: 'pause' },
        { variant: 'pause', window: { dim: tweenable(), panel: tweenable() } },
        { variant: 'offer', window: { dim: tweenable(), panel: tweenable() } },
        { variant: 'void', n: 120 },
      ];
    case 88:
      return [{ ...piece }];
    default:
      return [{ ...piece }];
  }
}

function runHandler(id: JuiceId, extra: Partial<JuiceCue>, reduced: boolean): Call[] {
  const { stage, calls } = recorder();
  const cue: JuiceCue = {
    id,
    time: 1000,
    ms: juiceMs(id, reduced),
    reduced,
    instant: false,
    ev: null,
    piece: null,
    ...extra,
  };
  JUICE_HANDLERS[id](cue, stage);
  return calls;
}

// --- tests --------------------------------------------------------------------------------------------------------------

describe('JUICE Phase 2 P0 catalogue (JUICE 0 rule 12, TECH 14.1 #11)', () => {
  it('JUICE 0 rule 12 the P0 list is the 36 events of JUICE.md and of TECH 14.1', () => {
    expect([...JUICE_P0_IDS]).toEqual(docP0List());
    expect(JUICE_P0_IDS).toHaveLength(36);
    expect(isP0(14)).toBe(false);
    expect(isP0(88)).toBe(true);
  });

  it('JUICE 0 rule 12 every P0 event id has a handler (and nothing else does)', () => {
    const handled = Object.keys(JUICE_HANDLERS)
      .map(Number)
      .sort((a, b) => a - b);
    expect(handled).toEqual([...JUICE_P0_IDS]);
    for (const [id, handler] of handlerEntries()) {
      expect(typeof handler, `#${id}`).toBe('function');
      expect(JUICE[id].id).toBe(id);
    }
  });

  it('JUICE rows: every sound of a P0 row is in the catalogue and in tokens (audio.sfx / audio.seq), and only those', () => {
    const rows = docRows();
    for (const id of JUICE_P0_IDS) {
      const row = rows.get(id);
      expect(row, `JUICE row #${id}`).toBeDefined();
      const sounds = new Set(
        [...(row?.cells[6] ?? '').matchAll(/`((?:sfx|music)_[a-z_]+)`/g)].map((m) => m[1]),
      );
      expect(new Set(JUICE[id].sounds), `#${id} sounds`).toEqual(sounds);
      for (const s of JUICE[id].sounds) expect(resolveSound(s), `#${id} ${s} in tokens`).not.toBeNull();
    }
  });

  it('JUICE rows: haptic, duration and ease of every P0 row come from tokens with the row values', () => {
    const rows = docRows();
    for (const id of JUICE_P0_IDS) {
      const cells = rows.get(id)?.cells ?? [];
      const spec = JUICE[id];
      expect(spec.haptic, `#${id} haptic`).toBe(docHaptic(cells[7] ?? ''));
      if (spec.haptic) expect(HAPTIC_NAMES).toContain(spec.haptic);
      const ms = /^(\d+)/.exec(cells[3] ?? '');
      if (ms) expect(spec.ms, `#${id} duration`).toBe(Number(ms[1]));
      else expect(spec.ms, `#${id} computed / continuous duration`).toBe(0);
      const ease = /`([A-Z][a-z]+(?:\.ease[A-Za-z]+)?)`/.exec(cells[4] ?? '');
      if (ease) expect(spec.ease, `#${id} ease`).toBe(ease[1]);
    }
  });

  it('JUICE rows: particle counts of the P0 rows (MVP-lite #16: icon glow only, no spark rain)', () => {
    const rows = docRows();
    for (const id of JUICE_P0_IDS) {
      const cell = rows.get(id)?.cells[5] ?? '';
      const spec = JUICE[id].particles;
      if (id === 16 || cell.startsWith('yok')) {
        expect(spec, `#${id}`).toBeNull();
        continue;
      }
      if (id === 55) {
        expect(spec?.count).toBe(TOKENS.particles.win);
        expect(spec?.waves).toBe(TOKENS.particles.winWaves);
        continue;
      }
      const n = /(\d+)/.exec(cell);
      expect(spec?.count, `#${id} particles "${cell}"`).toBe(Number(n?.[1]));
      expect(spec?.count ?? 0).toBeLessThanOrEqual(TOKENS.particles.maxPerBurst);
    }
  });

  it('JUICE 0 rule 3 only the segment slide, the truck and the level end lock input', () => {
    const locked = JUICE_P0_IDS.filter((id) => JUICE[id].lock);
    expect(locked).toEqual([18, 19, 55, 56, 57]);
    expect(Math.max(...locked.filter((id) => id < 50).map((id) => JUICE[id].ms))).toBeLessThanOrEqual(900);
  });

  it('JUICE 0 rule 8 reduced variants: fades of duration.reducedFade, scale ≤ a11y.reducedScaleMax, ≤ 20 % particles', () => {
    const fade = TOKENS.duration.reducedFade;
    for (const id of [8, 12, 17, 18, 52, 53, 57, 70, 88] as const)
      expect(juiceMs(id, true), `#${id}`).toBe(fade);
    expect(juiceMs(13, true)).toBe(TOKENS.duration.cancel); // "parlama + düz yol 220 ms"
    expect(juiceMs(50, true)).toBe(0); // "anında"
    expect(juiceMs(84, true)).toBe(TOKENS.duration.supportFlash); // information: the hatch stays 600 ms
    expect(reducedScale(TOKENS.drag.liftScale, true)).toBeLessThanOrEqual(TOKENS.a11y.reducedScaleMax);
    expect(reducedScale(1.4, true)).toBe(TOKENS.a11y.reducedScaleMax);
    for (const id of JUICE_P0_IDS) {
      const p = JUICE[id].particles;
      if (!p) continue;
      // JUICE row values (#11: 2, #12: 4) are the stated exceptions to 20 %
      if (id !== 12)
        expect(p.reduced, `#${id}`).toBeLessThanOrEqual(Math.ceil(p.count * TOKENS.particles.reducedFactor));
    }
  });
});

describe('JUICE P0 handlers against a recording stage', () => {
  it('every handler plays exactly its catalogue sounds and haptic over its variants', () => {
    for (const id of JUICE_P0_IDS) {
      const sounds = new Set<string>();
      const haptics = new Set<string>();
      for (const v of variants(id)) {
        for (const c of runHandler(id, v, false)) {
          if (c.name === 'sound') sounds.add(String(c.args[0]));
          if (c.name === 'haptic') haptics.add(String(c.args[0]));
        }
      }
      expect(sounds, `#${id} sounds`).toEqual(new Set(JUICE[id].sounds));
      const h = JUICE[id].haptic;
      expect(haptics, `#${id} haptic`).toEqual(new Set(h ? [h] : []));
    }
  });

  it('JUICE 0 rule 8 haptics do not depend on reduced motion; sounds stay', () => {
    for (const id of JUICE_P0_IDS) {
      for (const v of variants(id)) {
        const full = runHandler(id, v, false).filter((c) => c.name === 'haptic' || c.name === 'sound');
        const reduced = runHandler(id, v, true).filter((c) => c.name === 'haptic' || c.name === 'sound');
        expect(new Set(reduced.map((c) => c.name + c.args[0])), `#${id}`).toEqual(
          new Set(full.map((c) => c.name + c.args[0])),
        );
      }
    }
  });

  it('JUICE 0 rule 4 / 8 bursts stay within the row count, the reduced count, maxPerBurst', () => {
    for (const id of JUICE_P0_IDS) {
      for (const reduced of [false, true]) {
        for (const v of variants(id)) {
          for (const c of runHandler(id, v, reduced)) {
            if (c.name !== 'burst') continue;
            const n = c.args[1] as number;
            expect(n, `#${id}`).toBeLessThanOrEqual(TOKENS.particles.maxPerBurst);
            const spec = JUICE[id].particles;
            if (spec && c.args[0] === spec.family && id !== 12)
              expect(n, `#${id} reduced=${reduced}`).toBeLessThanOrEqual(juiceParticles(id, reduced));
          }
        }
      }
    }
  });

  it('JUICE 0 rule 8 reduced: no screen shake, no block shake, no trail, scale peaks ≤ 1,03', () => {
    const max = TOKENS.a11y.reducedScaleMax;
    for (const id of JUICE_P0_IDS) {
      for (const v of variants(id)) {
        const calls = runHandler(id, v, true);
        for (const c of calls) {
          expect(['shake', 'pieceShake', 'trail', 'pieceNudge'], `#${id} ${c.name}`).not.toContain(c.name);
          if (c.name === 'beginLift') expect(c.args[2]).toBeLessThanOrEqual(max);
          if (c.name === 'pieceSquash')
            expect(Math.max(c.args[2] as number, c.args[3] as number)).toBeLessThanOrEqual(max);
          if (c.name === 'streakPip') expect(c.args[3]).toBeLessThanOrEqual(max);
          if (c.name === 'trowelPop' || c.name === 'chipBump' || c.name === 'movesBump')
            expect(c.args[1]).toBeLessThanOrEqual(max);
          if (c.name === 'banner') expect(c.args[3]).toBe('fade');
        }
      }
    }
  });

  it('JUICE 0 rule 8 reduced: no confetti burst (#18, #55)', () => {
    // "konfeti yok (sabit pankart)": no handler bursts the confetti family when reduced, and both confetti rows say 0
    const confettiIds = JUICE_P0_IDS.filter((id) => JUICE[id].particles?.family === 'confetti');
    expect(confettiIds).toEqual([18, 55]);
    for (const id of confettiIds) expect(juiceParticles(id, true), `#${id}`).toBe(0);
    let fullConfetti = 0;
    for (const id of JUICE_P0_IDS) {
      for (const v of variants(id)) {
        const bursts = (reduced: boolean): number =>
          runHandler(id, v, reduced).filter((c) => c.name === 'burst' && c.args[0] === 'confetti').length;
        expect(bursts(true), `#${id} reduced`).toBe(0);
        fullConfetti += bursts(false);
      }
    }
    expect(fullConfetti).toBeGreaterThan(0); // the full variants still celebrate (#18 and #55)
  });

  it('JUICE #12 / #15 the placement and streak sounds follow the streak pitch (audio.comboSemitones)', () => {
    const calls = runHandler(12, variants(12)[0] ?? {}, false);
    const place = calls.find((c) => c.name === 'sound' && c.args[0] === 'sfx_place_ok');
    expect((place?.args[1] as { rate: number }).rate).toBeCloseTo(comboRate(3), 9);
    expect(comboRate(1)).toBe(1);
    expect(comboRate(4)).toBeCloseTo(2 ** ((TOKENS.audio.comboSemitones[3] ?? 0) / 12), 9);
  });

  it('JUICE #51 sound and haptic only when the counter reaches 5; #7 chime only when the shadow turns ✓', () => {
    const quiet = runHandler(51, { n: 4, first: false }, false);
    expect(quiet.some((c) => c.name === 'sound' || c.name === 'haptic')).toBe(false);
    expect(runHandler(7, { flag: false }, false).some((c) => c.name === 'sound')).toBe(false);
  });

  it('JUICE #13 wrong placement bounces on an arc to the K-17 target; into the queue the flight is #88', () => {
    const [toYard, viaDrop, toQueue] = variants(13);
    const arc = runHandler(13, toYard ?? {}, false).find((c) => c.name === 'pieceTrack');
    const legs = arc?.args[2] as { ax: number; ay: number; arc?: number }[];
    expect(legs[0]?.arc).toBe(1.5);
    expect(legs.at(-1)).toMatchObject({ ax: 1, ay: 0 });
    const drop = runHandler(13, viaDrop ?? {}, false).find((c) => c.name === 'pieceTrack');
    expect((drop?.args[2] as unknown[]).length).toBe(2); // over the yard, then down (K-17 step 2)
    expect(runHandler(13, toQueue ?? {}, false).some((c) => c.name === 'pieceTrack')).toBe(false);
    const q = runHandler(88, { piece: 4 }, false).find((c) => c.name === 'pieceTrack');
    expect(q?.args[3]).toMatchObject({ hideAtEnd: true });
  });

  it('JUICE #69 / #70 / #71 / #58 drive their targets (lip, scale, dim, heart)', () => {
    const b = tweenable();
    runHandler(69, { button: b, variant: 'press' }, false);
    expect(b.lips.at(-1)).toBe(TOKENS.shadow.buttonPressedLipPx);
    runHandler(69, { button: b, variant: 'release' }, false);
    expect(b.lips.at(-1)).toBe(TOKENS.shadow.buttonLipPx);
    expect(b.scaleX).toBe(1);
    const panel = tweenable();
    runHandler(70, { window: { dim: null, panel } }, false);
    expect(panel.scaleX).toBe(1);
    const heart = tweenable();
    runHandler(58, { heart }, false);
    expect(heart.drains.at(-1)).toBe(1);
  });
});

// --- plan (K-35 order) ----------------------------------------------------------------------------------------------------

function playHand(level: 1 | 2 | 3 | 4 | 5, reduced = false): { plans: MoveCue[][]; ctxs: PlanContext[] } {
  const lvl = levelFile(level);
  const session = GameSession.start(lvl);
  const plans: MoveCue[][] = [];
  const ctxs: PlanContext[] = [];
  for (const move of HAND[level]) {
    const s = session.state;
    const ctx: PlanContext = {
      reduced,
      gravity: lvl.gravity.build,
      queuedBefore: queueIds(s),
      movesBefore: session.movesLeft,
      pieceHeight: (id) => shapeByIndex(pieceShape(s, id)).h,
    };
    const sink = new ArraySink();
    expect(session.commit(move, sink).status).toBe('applied');
    plans.push([...planMove(sink.events, ctx, 10).cues]);
    ctxs.push(ctx);
  }
  return { plans, ctxs };
}

const kinds = (cues: readonly MoveCue[]): string[] => cues.map((c) => String(c.kind));
const startOf = (cues: readonly MoveCue[], kind: MoveCue['kind']): number =>
  cues.find((c) => c.kind === kind)?.at ?? Number.NaN;

describe('EventPlayer schedule (JUICE 0 rule 10, TECH 6.3)', () => {
  it('K-35 step order: release fall (#10) → landing (#11) → correct (#12, #83, #15) → counter (#50); end last', () => {
    const { plans } = playHand(1);
    const first = plans[0] ?? [];
    expect(kinds(first)).toEqual(['10', '11', '12', '83', '15', '50', 'end']);
    const fall = first[0] as MoveCue;
    expect(fall.ms).toBeCloseTo(releaseFallMs((fall.ev as { rows: number }).rows, 'normal'), 9);
    expect(startOf(first, 11)).toBe(fall.ms);
    expect(startOf(first, 12)).toBe(fall.ms);
    expect(startOf(first, 50)).toBe(fall.ms + TOKENS.duration.placeOk);
    expect(first.every((c) => !c.lock)).toBe(true);
  });

  it('W1 rail park (#23) precedes the validation (level 3 move 2)', () => {
    const { plans } = playHand(3);
    expect(kinds(plans[1] ?? []).slice(0, 2)).toEqual(['23', '12']);
    expect(startOf(plans[1] ?? [], 12)).toBe(TOKENS.duration.clamp);
  });

  it('K-22 / K-28 last move: segment slide (#18) then win (#55) and bonus (#56), all locked and last', () => {
    const { plans } = playHand(1);
    const last = plans.at(-1) ?? [];
    const k = kinds(last);
    expect(k.indexOf('18')).toBeGreaterThan(k.indexOf('50'));
    expect(k.indexOf('55')).toBeGreaterThan(k.indexOf('18'));
    expect(k.indexOf('56')).toBe(k.indexOf('55') + 1);
    for (const c of last) if (c.kind === 18 || c.kind === 55 || c.kind === 56) expect(c.lock).toBe(true);
    expect(startOf(last, 55)).toBe(startOf(last, 18) + TOKENS.duration.segment);
    const bonus = last.find((c) => c.kind === 56);
    expect(bonus?.ms).toBeLessThanOrEqual(TOKENS.duration.bonusMax);
  });

  it('K-25 / K-26 level 5: truck (#19, locked) after the slide, the queue chip (#20) after the truck; later the chip delivers', () => {
    const { plans } = playHand(5);
    const third = plans[2] ?? [];
    const k = kinds(third);
    expect(k.indexOf('19')).toBeGreaterThan(k.indexOf('18'));
    expect(k.indexOf('20')).toBeGreaterThan(k.indexOf('19'));
    const truck = third.find((c) => c.kind === 19);
    expect(truck?.lock).toBe(true);
    expect(truck?.ms).toBeGreaterThanOrEqual(TOKENS.duration.truck);
    const drops = truck?.drops ?? [];
    drops.forEach((d, i) =>
      expect(d.delay).toBe(JUICE_VIEW.truckEnterMs + i * TOKENS.physics.truckDropStaggerMs),
    );
    expect(third.find((c) => c.kind === 20)?.n).toBe(1);
    const fourth = plans[3] ?? [];
    const chip = fourth.find((c) => c.kind === 20);
    expect(chip?.drops?.length).toBe(1); // the queued block leaves through the chip (FIFO)
    expect(chip?.lock).toBe(false);
  });

  it('K-17 wrong placement: #13 then #88 into the queue and #84 for the missing support after the flight', () => {
    const bounce = ev(
      {
        t: 'pieceBounced',
        pieceId: 2,
        from: siteAt(6, 1),
        to: 'queue',
        viaDrop: false,
        reason: 'support',
        missingSupport: [siteAt(6, 0)],
      },
      3,
    );
    const events: GameEvent[] = [
      ev({ t: 'pieceMoved', pieceId: 2, from: yardAt(0, 0), to: siteAt(6, 8), entry: 'overWall' }, 1),
      ev({ t: 'pieceFell', pieceId: 2, from: siteAt(6, 8), to: siteAt(6, 1), rows: 7, cause: 'release' }, 2),
      ev({ t: 'placementWrong', pieceId: 2, reasons: ['support'], missingSupport: [siteAt(6, 0)] }, 3),
      bounce,
      ev({ t: 'movesChanged', movesLeft: 3, delta: -1, reason: 'move', cost: { base: 1, glass: 0 } }, 4),
      ev({ t: 'deliveryQueued', queued: 1 }, 9),
    ];
    const ctx: PlanContext = {
      reduced: false,
      gravity: 'normal',
      queuedBefore: [],
      movesBefore: 4,
      pieceHeight: () => 1,
    };
    const cues = planMove(events, ctx, 10).cues;
    expect(kinds(cues)).toEqual(['10', '11', '13', '88', '84', '50', '51', '20', 'end']);
    const t13 = startOf(cues, 13);
    expect(startOf(cues, 88)).toBe(t13 + JUICE_VIEW.wrongShakeMs);
    expect(startOf(cues, 84)).toBe(t13 + JUICE_VIEW.wrongShakeMs + TOKENS.duration.bounceToQueue);
    expect(cues.find((c) => c.kind === 51)?.first).toBe(false); // already under 5 before the move: no second sound
  });

  it('JUICE 0 rule 8 reduced schedule: fades replace slides, the order stays', () => {
    const full = playHand(1).plans.at(-1) ?? [];
    const reduced = playHand(1, true).plans.at(-1) ?? [];
    expect(kinds(reduced)).toEqual(kinds(full));
    expect(reduced.find((c) => c.kind === 18)?.ms).toBe(TOKENS.duration.reducedFade);
    expect(reduced.find((c) => c.kind === 50)?.ms).toBe(0);
  });
});

// --- playback: input during animations (R-12, D-021) --------------------------------------------------------------------

function cueAt(kind: MoveCue['kind'], at: number, ms: number, lock = false): MoveCue {
  return { kind, at, ms, lock, ev: null, piece: null };
}

describe('input during animations (JUICE 0 rule 3, R-12, D-021)', () => {
  it('R-12 grab during landing completes board tweens first; the next locked sequence starts at once', () => {
    const ran: { kind: MoveCue['kind']; time: number; instant: boolean }[] = [];
    const pb = new Playback<MoveCue>((cue, time, instant) => ran.push({ kind: cue.kind, time, instant }));
    pb.schedule(
      [
        cueAt(10, 0, 400),
        cueAt(11, 400, 120),
        cueAt(12, 400, 200),
        cueAt(18, 700, 600, true),
        cueAt('end', 1300, 0),
      ],
      1000,
    );
    pb.advance(1000);
    expect(ran.map((r) => r.kind)).toEqual([10]);
    expect(pb.locked(1100)).toBe(false);
    pb.fastForward(1100); // the player grabs during the fall
    expect(ran.map((r) => [r.kind, r.instant])).toEqual([
      [10, false],
      [11, true],
      [12, true],
    ]);
    expect(pb.locked(1100)).toBe(true); // the segment slide starts now and locks the board
    pb.advance(1100);
    expect(ran.at(-1)).toMatchObject({ kind: 18, time: 1100, instant: false });
    pb.fastForward(1200); // locked: nothing is skipped
    expect(ran).toHaveLength(4);
    pb.advance(1700);
    expect(ran.at(-1)?.kind).toBe('end');
    expect(pb.locked(1700)).toBe(false);
  });

  it('JUICE 0 rule 3 a touch during a locked sequence plays it 3× faster, then the clock is back to 1×', () => {
    const pb = new Playback<MoveCue>(() => undefined);
    pb.schedule([cueAt(19, 0, 700, true)], 0);
    pb.advance(0);
    expect(pb.rate(10)).toBe(1);
    pb.speedUp(100);
    expect(pb.rate(100)).toBe(LOCK_SPEEDUP);
    expect(pb.rate(800)).toBe(1);
    pb.speedUp(900); // not locked: no effect
    expect(pb.rate(900)).toBe(1);
  });

  it('FxRunner: a grab finishes board animations only; channels replace; instant mode completes board work', () => {
    const fx = new FxRunner();
    const log: string[] = [];
    const owner = {};
    fx.add({ start: 0, ms: 100, cls: 'board', owner, channel: 'squash', apply: (k) => log.push(`a${k}`) });
    fx.add({ start: 0, ms: 100, cls: 'free', apply: () => undefined, end: () => log.push('free-end') });
    fx.run(50);
    fx.add({ start: 50, ms: 100, cls: 'board', owner, channel: 'squash', apply: (k) => log.push(`b${k}`) });
    expect(log).toContain('a1'); // replaced: the old one got its last frame
    fx.finishBoard();
    expect(log.at(-1)).toBe('b1');
    expect(fx.size).toBe(1); // the free one keeps running
    fx.instantBoard = true;
    fx.add({ start: 500, ms: 100, cls: 'board', apply: (k) => log.push(`c${k}`) });
    expect(log.at(-1)).toBe('c1');
    fx.instantBoard = false;
    fx.run(1000);
    expect(log.at(-1)).toBe('free-end');
    expect(fx.size).toBe(0);
  });

  it('JUICE #4 drag feel: one contact per press, haptic at most every 400 ms, tether after 150 ms', () => {
    const feel = new DragFeel();
    feel.reset(0, 2, 3);
    expect(feel.step(16, 2, 3, 2, 3).contact).toBe(false);
    const hit = feel.step(32, 2, 3, 2.8, 3);
    expect(hit.contact).toBe(true);
    expect(hit.haptic).toBe(true);
    expect(hit.dirX).toBeCloseTo(1, 9);
    expect(feel.step(48, 2, 3, 2.9, 3).contact).toBe(false);
    expect(feel.step(200, 2, 3, 2.9, 3).tether).toBe(true);
    feel.step(216, 2, 3, 2, 3); // released the pressure
    const again = feel.step(232, 2, 3, 2.8, 3);
    expect(again.contact).toBe(true);
    expect(again.haptic).toBe(false); // < 400 ms after the last one
  });
});

describe('particle pool and budget (JUICE 0 rule 4, TECH 10.4)', () => {
  it('JUICE 0 rule 4 never more than particles.maxOnScreen alive; a burst holds ≤ maxPerBurst; the oldest burst dies first', () => {
    let seed = 1;
    const random = (): number => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    const field = new ParticleField({ random });
    expect(field.capacity).toBe(TOKENS.particles.maxOnScreen);
    expect(field.emit({ family: 'confetti', count: 100, x: 0, y: 0 }, 0)).toBe(TOKENS.particles.maxPerBurst);
    field.emit({ family: 'spark', count: 40, x: 0, y: 0 }, 0);
    field.emit({ family: 'dust', count: 40, x: 0, y: 0 }, 0);
    expect(field.count).toBe(120);
    expect(field.bursts).toBe(3);
    field.emit({ family: 'gold', count: 10, x: 0, y: 0 }, 0);
    expect(field.count).toBe(90); // the 40 confetti of the oldest burst went first
    expect(field.bursts).toBe(3);
    for (let i = 0; i < 200; i++) field.update(16);
    expect(field.count).toBe(0);
  });

  it('particles move by family: sparks rise, wind streaks fly flat, alpha fades out', () => {
    const field = new ParticleField({ random: () => 0.5 });
    field.emit({ family: 'spark', count: 1, x: 0, y: 0 }, 0);
    field.emit({ family: 'wind', count: 1, x: 0, y: 0, dir: 1 }, 0);
    field.update(100);
    const seen: { x: number; y: number; a: number }[] = [];
    field.forEach((_i, x, y, _s, _asp, _r, _c, a) => seen.push({ x, y, a }));
    expect(seen[0]?.y).toBeLessThan(0);
    expect(seen[1]?.x).toBeGreaterThan(0);
    expect(Math.abs(seen[1]?.y ?? 1)).toBeLessThan(1);
  });

  it('pop and pulse curves used by the handlers hit their keyframes', () => {
    expect(popCurve(0, 0.6, 1.2, 1, 0.5)).toBe(0.6);
    expect(popCurve(0.5, 0.6, 1.2, 1, 0.5)).toBeCloseTo(1.2, 9);
    expect(popCurve(1, 0.6, 1.2, 1, 0.5)).toBe(1);
    expect(pulse01(0.5)).toBeCloseTo(1, 9);
    expect(pulse01(1)).toBe(0);
  });
});
