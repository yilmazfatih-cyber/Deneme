/**
 * Hand-solution golden replays (docs/TECH_DESIGN.md §9.5, §14.1 #9; D-059): the LEVELS §2 solutions of levels 1–5,
 * transcribed into the move record (TECH §6.1 `SessionAction[]`, the same log the save stores as `inLevel.actions`,
 * §11.1) and played through `GameSession`.
 *
 * Transcription rule (TECH §9.5): "lift → over the wall above x = c → release" = FREE node (c, 8) on the crane row;
 * "slide right through the gap → release at (x, y)" = RAIL node (x, y, mode = 1 + gap). Piece ids: batch 0 in table
 * order (`piece:<i>`), truck batches `piece:k<batch>_<i>` — resolved through `CompiledLevel.tutorialPieceIds`.
 *
 * Triage when a golden fails (assertion messages name the level, step and LEVELS piece letter):
 * - transcription test red → the golden file disagrees with the level JSON (ref / shape / colour / budget): compare the
 *   golden with LEVELS §2, then the level JSON with LEVELS §2 (level data belongs to product-lead);
 * - start cell, landing cell or verdict wrong while the transcription is green → core rule question (GDD wins);
 * - only `eventLogHash` changed → an intended event-log change: check the new log, then update the hash consciously.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import * as z from 'zod/mini';
import { GameSession } from '../../src/core/session.ts';
import { ArraySink, eventLogHash } from '../../src/core/moves.ts';
import { toAscii } from '../../src/core/ascii.ts';
import { stateInvariantErrors } from '../../src/core/grid.ts';
import { H, hdr, pieceX, pieceY, pieceZone, queueIds } from '../../src/core/state.ts';
import type { GameState } from '../../src/core/state.ts';
import type { CompiledLevel } from '../../src/core/level/compile.ts';
import { COLOR_CODES, Zone } from '../../src/core/types.ts';
import type { GameEvent, GameEventType, Move, PieceId, SessionAction } from '../../src/core/types.ts';
import { SessionActionSchema, asSessionActions } from '../../src/services/save.ts';
import { levelFile } from '../core/moves.fixtures.ts';

const GOLDEN_DIR = dirname(fileURLToPath(import.meta.url));
/** Phase 2 scope (D-059): levels 1–5; 6–10 follow in Phase 3. */
const GOLDEN_LEVELS = [1, 2, 3, 4, 5] as const;
/** K-46: at least 60 % of the solution's correct site placements come over the wall. */
const YAO_MIN = 0.6;

const XY = z.tuple([z.int(), z.int()]);
const StepSchema = z.object({
  /** LEVELS §2 letter (messages only). */
  piece: z.string(),
  /** `piece:<i>` / `piece:k<batch>_<i>` (TECH §9.5 id rule). */
  ref: z.string(),
  shape: z.string(),
  color: z.enum(COLOR_CODES),
  /** Yard anchor before the move ("(x,y)'den kaldır"). */
  from: XY,
  entry: z.enum(['overWall', 'gap']),
  gap: z.optional(z.int()),
  /** Site anchor after the move ("(x,y)'ye iner" / "(x,y)'de bırak"), visible segment. */
  lands: XY,
  segmentCompleted: z.optional(z.int()),
  /** Truck pieces that land in this move's step 9, in FIFO order: `[ref, x, y]`. */
  delivered: z.optional(z.array(z.tuple([z.string(), z.int(), z.int()]))),
  /** Queue after the move ("Kamyonda: N"), FIFO order. */
  queue: z.optional(z.array(z.string())),
});
const GoldenSchema = z.object({
  level: z.int(),
  source: z.string(),
  /** LEVELS "Hamle bütçesi". */
  budget: z.int(),
  /** LEVELS "Minimum hamle (el çözümü)". */
  minMoves: z.int(),
  movesLeft: z.int(),
  /** LEVELS "YAO (çözüm)". */
  yao: z.object({ overWall: z.int(), rail: z.int() }),
  steps: z.array(StepSchema),
  log: z.array(SessionActionSchema),
  eventLogHash: z.string().check(z.regex(/^[0-9a-f]{16}$/)),
  finalAscii: z.array(z.string()),
});
type Golden = z.output<typeof GoldenSchema>;
type GoldenStep = Golden['steps'][number];

function loadGolden(n: number): { golden: Golden; log: SessionAction[] } {
  const file = join(GOLDEN_DIR, `level_${String(n).padStart(3, '0')}.hand.json`);
  const parsed = GoldenSchema.safeParse(JSON.parse(readFileSync(file, 'utf8')));
  if (!parsed.success) throw new Error(`${file}: ${JSON.stringify(parsed.error.issues)}`);
  return { golden: parsed.data, log: asSessionActions(parsed.data.log) };
}

function idOf(lvl: CompiledLevel, ref: string): PieceId {
  const id = lvl.tutorialPieceIds.get(ref);
  if (id === undefined) throw new Error(`level ${lvl.id}: no piece ${ref}`);
  return id;
}

function ofType<T extends GameEventType>(ev: readonly GameEvent[], t: T): Extract<GameEvent, { t: T }>[] {
  return ev.filter((e): e is Extract<GameEvent, { t: T }> => e.t === t);
}

/** Bottom-left of the cells' bounding box = the piece anchor. */
function anchorOf(cells: readonly { readonly x: number; readonly y: number }[]): [number, number] {
  return [Math.min(...cells.map((c) => c.x)), Math.min(...cells.map((c) => c.y))];
}

function yardSpot(s: GameState, id: PieceId): [number, number, number] {
  return [pieceZone(s, id), pieceX(s, id), pieceY(s, id)];
}

/** Events that mean "not the documented solution": none may appear in a golden replay. */
const FORBIDDEN: readonly GameEventType[] = [
  'moveCancelled',
  'placementWrong',
  'pieceBounced',
  'mortarStuck',
  'glassBroke',
  'pieceReturned',
  'outOfMoves',
  'deadlockDetected',
  'truckHelp',
];

interface Played {
  readonly session: GameSession;
  readonly events: GameEvent[];
}

/** Plays the golden log move by move and checks every step against LEVELS §2. */
function playGolden(lvl: CompiledLevel, golden: Golden, log: readonly SessionAction[]): Played {
  const sink = new ArraySink();
  const session = GameSession.start(lvl, {}, { strict: true }, sink);
  const moves = log.slice(1) as Move[];
  moves.forEach((move, i) => {
    const step = golden.steps[i] as GoldenStep;
    const where = `L${golden.level} step ${i + 1} (${step.piece})`;
    if (move.kind !== 'drag') throw new Error(`${where}: hand solutions are drag moves only`);
    const s = session.state;
    expect(yardSpot(s, move.pieceId), `${where}: start cell`).toEqual([Zone.yard, ...step.from]);

    const first = sink.events.length;
    const res = session.commit(move, sink);
    const ev = sink.events.slice(first);
    const last = i === moves.length - 1;
    expect(res, `${where}: result`).toEqual({
      status: 'applied',
      reason: null,
      won: last,
      outOfMoves: false,
    });
    expect(
      ev.filter((e) => FORBIDDEN.includes(e.t)),
      `${where}: no cancel / wrong placement`,
    ).toEqual([]);

    const moved = ofType(ev, 'pieceMoved');
    expect(
      moved.map((e) => [e.pieceId, e.entry, e.gap]),
      `${where}: entry`,
    ).toEqual([[move.pieceId, step.entry, step.gap]]);
    const correct = ofType(ev, 'placementCorrect');
    expect(correct.length, `${where}: one correct placement`).toBe(1);
    const placed = correct[0] as Extract<GameEvent, { t: 'placementCorrect' }>;
    expect(placed.pieceId, `${where}: placed piece`).toBe(move.pieceId);
    expect(anchorOf(placed.cells), `${where}: landing cell`).toEqual(step.lands);
    expect(placed.overWall, `${where}: over the wall (K-46)`).toBe(step.entry === 'overWall');

    expect(
      ofType(ev, 'segmentCompleted').map((e) => e.seg),
      `${where}: segment completion (K-22)`,
    ).toEqual(step.segmentCompleted === undefined ? [] : [step.segmentCompleted]);

    const delivered = step.delivered ?? [];
    const arrived = ofType(ev, 'deliveryArrived').flatMap((e) => e.pieces);
    expect(arrived, `${where}: FIFO delivery order (K-25, K-26)`).toEqual(
      delivered.map(([ref]) => idOf(lvl, ref)),
    );
    for (const [ref, x, y] of delivered)
      expect(yardSpot(s, idOf(lvl, ref)), `${where}: ${ref} delivered`).toEqual([Zone.yard, x, y]);
    if (step.queue !== undefined)
      expect(queueIds(s), `${where}: truck queue (K-26)`).toEqual(step.queue.map((ref) => idOf(lvl, ref)));
    expect(stateInvariantErrors(s), `${where}: state invariants`).toEqual([]);
  });
  return { session, events: sink.events };
}

describe.each(GOLDEN_LEVELS)('golden level %i: LEVELS §2 hand solution', (n) => {
  const lvl = levelFile(n);
  const { golden, log } = loadGolden(n);

  it(`golden level ${n} transcription: piece refs, shapes, colours and budget match the level data`, () => {
    expect(golden.level).toBe(n);
    expect(lvl.moves, 'LEVELS "Hamle bütçesi"').toBe(golden.budget);
    expect(golden.movesLeft).toBe(golden.budget - golden.minMoves);
    expect(log[0]).toEqual({ kind: 'start', preBoosters: [], streakTier: 0 });
    expect(log.slice(1).every((a) => a.kind === 'drag')).toBe(true);
    expect(golden.steps.length).toBe(golden.minMoves);
    expect(log.length).toBe(golden.minMoves + 1);
    golden.steps.forEach((step, i) => {
      const where = `L${n} step ${i + 1} (${step.piece})`;
      const id = idOf(lvl, step.ref);
      const action = log[i + 1];
      expect(action?.kind === 'drag' ? action.pieceId : null, `${where}: pieceId`).toBe(id);
      const piece = lvl.pieces[id];
      expect([piece?.dataShape, COLOR_CODES[piece?.colorIndex ?? -1]], `${where}: shape, colour`).toEqual([
        step.shape,
        step.color,
      ]);
    });
  });

  it(`K-28 K-46 level ${n}: the hand solution wins in the documented minimum with the documented YAO, no wrong placement`, () => {
    const { session, events } = playGolden(lvl, golden, log);
    expect(session.outcome).toBe('won');
    expect(session.movesMade).toBe(golden.minMoves);
    expect(session.movesLeft).toBe(golden.movesLeft);
    expect(ofType(events, 'levelWon').map((e) => e.movesLeft)).toEqual([golden.movesLeft]);
    expect(hdr(session.state, H.wrongCount)).toBe(0);
    const yao = session.yao();
    expect({ overWall: yao.overWall, rail: yao.rail }).toEqual(golden.yao);
    expect(yao.yao).toBe(golden.yao.overWall / (golden.yao.overWall + golden.yao.rail));
    expect(yao.yao ?? 0).toBeGreaterThanOrEqual(YAO_MIN);
    expect(toAscii(session.state)).toBe(golden.finalAscii.join('\n'));
    expect(
      eventLogHash(events),
      `L${n} eventLogHash changed (everything else green): check the log, then update tests/golden/level_00${n}.hand.json`,
    ).toBe(golden.eventLogHash);
  });

  it(`K-43 level ${n}: the golden log replays bit for bit (replay = live state, same log)`, () => {
    const { session } = playGolden(lvl, golden, log);
    const replayed = GameSession.replay(lvl, log);
    expect(replayed.resumed).toBe(true);
    expect(replayed.outcome).toBe('won');
    expect(replayed.state.buf).toEqual(session.state.buf);
    expect(session.log).toEqual(log);
    expect(replayed.log).toEqual(log);
  });
});
