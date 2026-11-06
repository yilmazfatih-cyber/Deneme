/**
 * Segment plans (GDD K-15, K-32). `rows` are written top → bottom; plan row r (from the bottom) is
 * `rows[h − 1 − r]`. Local index of a plan cell = `sy * 2 + sx` (sx 0 = board x 6, sx 1 = board x 7).
 */
import { COLOR_CODES } from '../types.ts';
import type { ColorCode } from '../types.ts';
import { SEGMENT_CELLS, SITE_COLS } from '../coords.ts';
import type { LevelData } from './schema.ts';

export type PlanChar = ColorCode | '.' | '?';
/** A resolved plan cell: colour, `.` (must stay empty), or null (outside the plan or unresolved `?`). */
export type PlanCell = ColorCode | '.' | null;

export interface SegmentPlan {
  readonly height: number;
  /** Raw characters by local index (`null` above the plan). */
  readonly raw: readonly (PlanChar | null)[];
  /** Resolved cells by local index; `?` replaced by its colour (null when it cannot be resolved). */
  readonly cells: readonly PlanCell[];
  /** Bits (local index) of `?` cells. */
  readonly hiddenMask: number;
  /** Per column: plan rows that are not `.` (bit = row). */
  readonly planMask: readonly [number, number];
  /** Per column: `.` rows. */
  readonly dotMask: readonly [number, number];
  /** Bits (local index) of every cell that must be filled (colour or `?`). */
  readonly targetMask: number;
}

export interface HiddenProblem {
  readonly seg: number;
  readonly sx: number;
  readonly sy: number;
  readonly message: string;
}

export function localIndex(sx: number, sy: number): number {
  return sy * SITE_COLS + sx;
}

function rawCells(rows: readonly string[]): (PlanChar | null)[] {
  const out: (PlanChar | null)[] = Array.from({ length: SEGMENT_CELLS }, () => null);
  const h = rows.length;
  rows.forEach((row, i) => {
    const sy = h - 1 - i;
    for (let sx = 0; sx < SITE_COLS; sx++) {
      const ch = row[sx];
      if (ch !== undefined) out[localIndex(sx, sy)] = ch as PlanChar;
    }
  });
  return out;
}

const isColor = (c: PlanChar | null): c is ColorCode =>
  c !== null && (COLOR_CODES as readonly string[]).includes(c);

/**
 * Builds every segment plan and resolves `?` cells (K-32): `repeat p` takes (c, r − p) of the same segment (chained),
 * `mirrorOf j` takes (1 − c, r) of segment j. Problems found on the way are L-08 `hidden_invalid` material.
 */
export function buildPlans(level: LevelData): { plans: SegmentPlan[]; problems: HiddenProblem[] } {
  const segs = level.build.segments;
  const raws = segs.map((s) => rawCells(s.rows));
  const problems: HiddenProblem[] = [];

  const resolve = (seg: number, sx: number, sy: number, depth: number): ColorCode | null => {
    const raw = raws[seg]?.[localIndex(sx, sy)] ?? null;
    if (raw === null || raw === '.') return null;
    if (isColor(raw)) return raw;
    // raw === '?'
    if (depth > 64) return null;
    const rule = segs[seg]?.hidden;
    if (!rule) return null;
    if (rule.kind === 'repeat') {
      if (sy - rule.period < 0) return null;
      return resolve(seg, sx, sy - rule.period, depth + 1);
    }
    const src = raws[rule.segment]?.[localIndex(1 - sx, sy)] ?? null;
    return isColor(src) ? src : null;
  };

  const plans = segs.map((s, seg): SegmentPlan => {
    const raw = raws[seg] ?? [];
    const h = s.rows.length;
    const cells: PlanCell[] = [];
    let hiddenMask = 0;
    let targetMask = 0;
    const planMask: [number, number] = [0, 0];
    const dotMask: [number, number] = [0, 0];
    for (let i = 0; i < SEGMENT_CELLS; i++) {
      const ch = raw[i] ?? null;
      const sx = i % SITE_COLS;
      const sy = Math.floor(i / SITE_COLS);
      if (ch === null) {
        cells.push(null);
        continue;
      }
      if (ch === '.') {
        cells.push('.');
        dotMask[sx] = (dotMask[sx] ?? 0) | (1 << sy);
        continue;
      }
      planMask[sx] = (planMask[sx] ?? 0) | (1 << sy);
      targetMask |= 1 << i;
      if (ch === '?') {
        hiddenMask |= 1 << i;
        const color = resolve(seg, sx, sy, 0);
        cells.push(color);
        const rule = s.hidden;
        if (!rule) problems.push({ seg, sx, sy, message: '`?` in a segment without a hidden rule' });
        else if (rule.kind === 'repeat' && sy < rule.period)
          problems.push({
            seg,
            sx,
            sy,
            message: `repeat ${rule.period}: \`?\` in the bottom ${rule.period} row(s)`,
          });
        else if (color === null)
          problems.push({ seg, sx, sy, message: '`?` resolves to `.` or cannot be resolved' });
      } else {
        cells.push(ch);
      }
    }
    return { height: h, raw, cells, hiddenMask, planMask, dotMask, targetMask };
  });

  segs.forEach((s, seg) => {
    const rule = s.hidden;
    if (rule?.kind !== 'mirrorOf') return;
    const j = rule.segment;
    const target = segs[j];
    if (j >= seg || !target)
      problems.push({ seg, sx: 0, sy: 0, message: `mirrorOf ${j}: target must be an earlier segment` });
    else if (target.rows.length !== s.rows.length)
      problems.push({ seg, sx: 0, sy: 0, message: `mirrorOf ${j}: target height differs` });
    else if (target.rows.some((r) => r.includes('?')))
      problems.push({ seg, sx: 0, sy: 0, message: `mirrorOf ${j}: target contains \`?\`` });
  });
  return { plans, problems };
}
