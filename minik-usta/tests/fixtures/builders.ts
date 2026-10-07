/**
 * Test fixture builders (TECH_DESIGN §12.4): `level({...})` returns a real, schema-parsed LevelData;
 * `compiledLevel` / `initialState` go one step further; `expectAscii` compares a state with Appendix A text.
 * Builders only run the zod schema, not the logic checks, so small hand-made boards (e.g. a nearly empty yard)
 * are allowed for rule tests.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect } from 'vitest';
import * as z from 'zod/mini';
import { LevelSchema } from '../../src/core/level/schema.ts';
import type { LevelData, LevelInput } from '../../src/core/level/schema.ts';
import { compile } from '../../src/core/level/compile.ts';
import type { CompiledLevel } from '../../src/core/level/compile.ts';
import { createInitialState } from '../../src/core/state.ts';
import type { GameState } from '../../src/core/state.ts';
import { toAscii } from '../../src/core/ascii.ts';
import type { AsciiOptions } from '../../src/core/ascii.ts';
import type { ColorCode, DataPieceFlag, ShapeId } from '../../src/core/types.ts';

/** `[shape, colour, x, y, flags?, wetMoves?]` — anchor = bottom-left of the bounding box. */
export type PieceSpec = readonly [ShapeId, ColorCode, number, number, (readonly DataPieceFlag[])?, number?];
/** `[shape, colour, x (6–7), plan row, segment?]`. */
export type DebrisSpec = readonly [ShapeId, ColorCode, number, number, number?];

export interface LevelSpec {
  readonly id?: number;
  readonly chapter?: number;
  readonly moves?: number;
  readonly difficulty?: LevelInput['difficulty'];
  readonly seed?: number;
  readonly teaches?: LevelInput['teaches'];
  readonly wall?: {
    readonly height?: number;
    readonly gaps?: LevelInput['wall']['gaps'];
    readonly fan?: 'left' | 'right';
  };
  /** Rows of one segment (top → bottom), or one row list per segment. */
  readonly plan?: readonly string[] | readonly (readonly string[])[];
  readonly hidden?: readonly (NonNullable<LevelInput['build']['segments'][number]['hidden']> | undefined)[];
  /** Batch 0 (start yard). */
  readonly pieces?: readonly PieceSpec[];
  /** Truck batches k ≥ 1 (y is written as 8). */
  readonly batches?: readonly {
    readonly forSegment: number;
    readonly pieces: readonly PieceSpec[];
    readonly dropColumns?: readonly number[];
  }[];
  readonly debris?: readonly DebrisSpec[];
  readonly obstacles?: readonly LevelInput['obstacles'][number][];
  readonly gravity?: Partial<LevelInput['gravity']>;
  readonly mode?: LevelInput['build']['mode'];
  readonly carouselEvery?: number;
  readonly elevator?: LevelInput['build']['elevator'];
  readonly goals?: readonly LevelInput['goals'][number][];
  readonly tutorial?: readonly NonNullable<LevelInput['tutorial']>[number][];
}

function piece([
  shape,
  color,
  x,
  y,
  flags,
  wetMoves,
]: PieceSpec): LevelInput['yard']['batches'][number]['pieces'][number] {
  return {
    shape,
    color,
    x,
    y,
    ...(flags && flags.length > 0 ? { flags: [...flags] } : {}),
    ...(wetMoves !== undefined ? { wetMoves } : {}),
  };
}

/** Level JSON as it would be written in levels/ (unparsed). */
export function levelJson(spec: LevelSpec = {}): LevelInput {
  const id = spec.id ?? 1;
  const planInput = spec.plan ?? ['WW'];
  const segments: readonly (readonly string[])[] =
    typeof planInput[0] === 'string'
      ? [planInput as readonly string[]]
      : (planInput as readonly (readonly string[])[]);
  return {
    schemaVersion: 1,
    id,
    chapter: spec.chapter ?? Math.ceil(id / 10),
    name: { tr: 'Test', en: 'Test' },
    difficulty: spec.difficulty ?? 'easy',
    moves: spec.moves ?? 20,
    ...(spec.teaches ? { teaches: spec.teaches } : {}),
    ...(spec.seed !== undefined ? { seed: spec.seed } : {}),
    goals: spec.goals ? [...spec.goals] : [{ type: 'build' }],
    gravity: { build: spec.gravity?.build ?? 'normal', yard: spec.gravity?.yard ?? false },
    wall: {
      height: spec.wall?.height ?? 0,
      gaps: spec.wall?.gaps ?? [],
      ...(spec.wall?.fan ? { fan: { dir: spec.wall.fan } } : {}),
    },
    build: {
      mode: spec.mode ?? 'segments',
      ...(spec.carouselEvery !== undefined ? { carouselEvery: spec.carouselEvery } : {}),
      ...(spec.elevator ? { elevator: spec.elevator } : {}),
      segments: segments.map((rows, i) => {
        const hidden = spec.hidden?.[i];
        return { name: { tr: `D${i}`, en: `S${i}` }, rows: [...rows], ...(hidden ? { hidden } : {}) };
      }),
      ...(spec.debris
        ? {
            debris: spec.debris.map(([shape, color, x, y, segment]) => ({
              shape,
              color,
              x,
              y,
              ...(segment !== undefined ? { segment } : {}),
            })),
          }
        : {}),
    },
    yard: {
      batches: [
        { forSegment: 0, pieces: (spec.pieces ?? []).map(piece) },
        ...(spec.batches ?? []).map((b) => ({
          forSegment: b.forSegment,
          ...(b.dropColumns ? { dropColumns: [...b.dropColumns] } : {}),
          pieces: b.pieces.map((p) => piece([p[0], p[1], p[2], 8, p[4], p[5]])),
        })),
      ],
    },
    obstacles: [...(spec.obstacles ?? [])],
    ...(spec.tutorial ? { tutorial: [...spec.tutorial] } : {}),
  };
}

/** Schema-parsed LevelData; throws with a readable message when the spec breaks the schema. */
export function level(spec: LevelSpec = {}): LevelData {
  const parsed = LevelSchema.safeParse(levelJson(spec));
  if (!parsed.success) throw new Error(`fixture breaks the level schema:\n${z.prettifyError(parsed.error)}`);
  return parsed.data;
}

export function compiledLevel(spec: LevelSpec = {}): CompiledLevel {
  return compile(level(spec));
}

export function initialState(spec: LevelSpec = {}): GameState {
  return createInitialState(compiledLevel(spec));
}

/** Removes the common indentation and blank first/last lines of a template literal. */
export function dedent(text: string): string {
  const lines = text
    .replace(/^\n/, '')
    .replace(/\n\s*$/, '')
    .split('\n');
  const indent = Math.min(...lines.filter((l) => l.trim() !== '').map((l) => /^ */.exec(l)?.[0].length ?? 0));
  return lines.map((l) => l.slice(indent)).join('\n');
}

/** Snapshot comparison against Appendix A text (indentation-insensitive, trailing spaces ignored). */
export function expectAscii(s: GameState, expected: string, opts: AsciiOptions = {}): void {
  const norm = (t: string): string =>
    t
      .split('\n')
      .map((l) => l.replace(/\s+$/, ''))
      .join('\n');
  expect(norm(toAscii(s, opts))).toBe(norm(dedent(expected)));
}

const FIXTURE_DIR = join(dirname(fileURLToPath(import.meta.url)), 'levels');

/** Reads `tests/fixtures/levels/<group>/<name>.json`. */
export function loadFixture(group: string, name: string): unknown {
  return JSON.parse(readFileSync(join(FIXTURE_DIR, group, `${name}.json`), 'utf8'));
}

export function fixturePath(...parts: string[]): string {
  return join(FIXTURE_DIR, ...parts);
}
