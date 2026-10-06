/**
 * Shapes (GDD K-44, D-051; TECH_DESIGN §3).
 *
 * Single source: the 0° cells of BRIEF §5. The other orientations are generated at module load: one 90° step is a
 * CLOCKWISE turn on screen with y pointing up, `(x, y) → (y, −x)`, followed by normalising to the bottom-left corner
 * (`x −= min x`, `y −= min y`) and sorting the cells by (y, x). 180° and 270° apply the step repeatedly.
 */
import { SHAPE_KINDS, ROTATIONS } from './types.ts';
import type { Rotation, ShapeId, ShapeKind } from './types.ts';

export interface Cell {
  readonly x: number;
  readonly y: number;
}

export interface ShapeDef {
  /** 0..51 = kindIndex * 4 + rotationIndex. */
  readonly index: number;
  readonly id: ShapeId;
  readonly kind: ShapeKind;
  readonly rotation: Rotation;
  /** Normalised cells sorted by (y, x). */
  readonly cells: readonly Cell[];
  readonly w: number;
  readonly h: number;
  readonly cellCount: number;
  /** `rows[r]`: bit mask of the x offsets occupied in row r (collision). */
  readonly rows: readonly number[];
  /** `colRows[c]`: bit mask of the y offsets occupied in column c (boundary crossing, TECH §2.2). */
  readonly colRows: readonly number[];
  /** Lowest / highest occupied y offset of column c (open sky and falling, K-11). */
  readonly colBottom: readonly number[];
  readonly colTop: readonly number[];
  /** Y5: `w ≥ 3` or kind I5/Q9 (GDD K-44). Heavy pieces never cross the boundary. */
  readonly heavy: boolean;
  /** First id (in rotation order 0, 90, 180, 270) with the same cell set, e.g. `O4_90 → O4_0`. */
  readonly canonical: ShapeId;
  readonly canonicalIndex: number;
}

/** BRIEF §5: cells at 0°, bottom-left origin. */
export const BASE_CELLS: Readonly<Record<ShapeKind, readonly (readonly [number, number])[]>> = {
  B1: [[0, 0]],
  D2: [
    [0, 0],
    [0, 1],
  ],
  I3: [
    [0, 0],
    [0, 1],
    [0, 2],
  ],
  I4: [
    [0, 0],
    [0, 1],
    [0, 2],
    [0, 3],
  ],
  O4: [
    [0, 0],
    [1, 0],
    [0, 1],
    [1, 1],
  ],
  C3: [
    [0, 0],
    [1, 0],
    [0, 1],
  ],
  L4: [
    [0, 0],
    [1, 0],
    [0, 1],
    [0, 2],
  ],
  J4: [
    [0, 0],
    [1, 0],
    [1, 1],
    [1, 2],
  ],
  T4: [
    [0, 0],
    [0, 1],
    [0, 2],
    [1, 1],
  ],
  S4: [
    [0, 0],
    [0, 1],
    [1, 1],
    [1, 2],
  ],
  Z4: [
    [1, 0],
    [1, 1],
    [0, 1],
    [0, 2],
  ],
  I5: [
    [0, 0],
    [1, 0],
    [2, 0],
    [3, 0],
    [4, 0],
  ],
  Q9: [
    [0, 0],
    [1, 0],
    [2, 0],
    [0, 1],
    [1, 1],
    [2, 1],
    [0, 2],
    [1, 2],
    [2, 2],
  ],
};

/** Always heavy, whatever the orientation (GDD K-44; a crane turn keeps the weight, K-37). */
export const ALWAYS_HEAVY: ReadonlySet<ShapeKind> = new Set<ShapeKind>(['I5', 'Q9']);

/** Forbidden in level data (GDD K-44, K-45/5 `shape_forbidden`). */
export const FORBIDDEN_SHAPES: ReadonlySet<ShapeId> = new Set<ShapeId>(['I5_90', 'I5_270']);

/** Kinds unlocked per story chapter (GDD K-44): 1 → B1 D2 O4 C3; 2 → + I3 L4 J4; 3 → + T4 S4 Z4; 4–5 → + I4. */
export const KIND_FIRST_CHAPTER: Readonly<Record<ShapeKind, number>> = {
  B1: 1,
  D2: 1,
  O4: 1,
  C3: 1,
  I3: 2,
  L4: 2,
  J4: 2,
  T4: 3,
  S4: 3,
  Z4: 3,
  I4: 4,
  I5: 1,
  Q9: 1,
};

/** Heavy shapes (I5, Q9 and every w ≥ 3 orientation) are allowed only from this level id (GDD K-44 "8. bölüm"). */
export const HEAVY_MIN_LEVEL_ID = 8;

function normalise(cells: readonly (readonly [number, number])[]): Cell[] {
  const minX = Math.min(...cells.map((c) => c[0]));
  const minY = Math.min(...cells.map((c) => c[1]));
  return cells.map(([x, y]) => ({ x: x - minX, y: y - minY })).sort((a, b) => a.y - b.y || a.x - b.x);
}

/** One clockwise 90° step: `(x, y) → (y, −x)`, then normalise. */
export function rotateClockwise(cells: readonly Cell[]): Cell[] {
  return normalise(cells.map((c) => [c.y, -c.x] as const));
}

function cellKey(cells: readonly Cell[]): string {
  return cells.map((c) => `${c.x},${c.y}`).join(';');
}

function buildShapes(): ShapeDef[] {
  const out: ShapeDef[] = [];
  SHAPE_KINDS.forEach((kind, kindIndex) => {
    let cells = normalise(BASE_CELLS[kind]);
    const firstByKey = new Map<string, number>();
    ROTATIONS.forEach((rotation, rotIndex) => {
      if (rotIndex > 0) cells = rotateClockwise(cells);
      const w = Math.max(...cells.map((c) => c.x)) + 1;
      const h = Math.max(...cells.map((c) => c.y)) + 1;
      const rows = Array.from({ length: h }, () => 0);
      const colRows = Array.from({ length: w }, () => 0);
      const colBottom = Array.from({ length: w }, () => h);
      const colTop = Array.from({ length: w }, () => -1);
      for (const c of cells) {
        rows[c.y] = (rows[c.y] ?? 0) | (1 << c.x);
        colRows[c.x] = (colRows[c.x] ?? 0) | (1 << c.y);
        colBottom[c.x] = Math.min(colBottom[c.x] ?? h, c.y);
        colTop[c.x] = Math.max(colTop[c.x] ?? -1, c.y);
      }
      const index = kindIndex * 4 + rotIndex;
      const key = cellKey(cells);
      const canonicalIndex = firstByKey.get(key) ?? index;
      if (!firstByKey.has(key)) firstByKey.set(key, index);
      const canonicalRotation = ROTATIONS[canonicalIndex - kindIndex * 4] ?? 0;
      out.push(
        Object.freeze({
          index,
          id: `${kind}_${rotation}` as ShapeId,
          kind,
          rotation,
          cells: Object.freeze(cells.map((c) => Object.freeze({ ...c }))),
          w,
          h,
          cellCount: cells.length,
          rows: Object.freeze(rows),
          colRows: Object.freeze(colRows),
          colBottom: Object.freeze(colBottom),
          colTop: Object.freeze(colTop),
          heavy: w >= 3 || ALWAYS_HEAVY.has(kind),
          canonical: `${kind}_${canonicalRotation}` as ShapeId,
          canonicalIndex,
        }),
      );
    });
  });
  return out;
}

/** All 52 shapes, indexed by `ShapeDef.index`. */
export const SHAPES: readonly ShapeDef[] = Object.freeze(buildShapes());

const SHAPE_BY_ID: ReadonlyMap<string, ShapeDef> = new Map(SHAPES.map((s) => [s.id, s]));

/** All 52 ids in index order. */
export const SHAPE_IDS: readonly ShapeId[] = Object.freeze(SHAPES.map((s) => s.id));

export function isShapeId(value: string): value is ShapeId {
  return SHAPE_BY_ID.has(value);
}

/** Shape by id; throws on an unknown id (level data is validated before compile). */
export function shapeById(id: ShapeId): ShapeDef {
  const s = SHAPE_BY_ID.get(id);
  if (!s) throw new RangeError(`unknown shape id ${id}`);
  return s;
}

/** Shape by index 0..51; throws when out of range. */
export function shapeByIndex(index: number): ShapeDef {
  const s = SHAPES[index];
  if (!s) throw new RangeError(`unknown shape index ${index}`);
  return s;
}

/** The orientation reached by turning `id` clockwise by `quarterTurns` × 90° (crane booster, K-37). */
export function rotateShapeId(id: ShapeId, quarterTurns: number): ShapeId {
  const s = shapeById(id);
  const rotIndex = (((ROTATIONS.indexOf(s.rotation) + quarterTurns) % 4) + 4) % 4;
  return `${s.kind}_${ROTATIONS[rotIndex] ?? 0}` as ShapeId;
}
