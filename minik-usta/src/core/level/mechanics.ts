/**
 * Mechanic data signatures (GDD K-45/9, R-21; TECH_DESIGN §8.3): the code twin of the OBSTACLES "Veri imzası" table.
 * A level's mechanic set is derived ONLY from its data; `teaches` adds nothing (it is checked by L-16).
 */
import { shapeById } from '../shapes.ts';
import { MECHANIC_IDS } from './schema.ts';
import type { LevelData, MechanicId, PieceData } from './schema.ts';

export interface MechanicSignature {
  readonly id: MechanicId;
  /** OBSTACLES "İlk bölüm" column (design data; the derivation never uses it). */
  readonly firstLevel: number;
  readonly detect: (level: LevelData) => boolean;
}

function allPieces(level: LevelData): PieceData[] {
  return level.yard.batches.flatMap((b) => b.pieces);
}
function anyFlag(level: LevelData, flag: NonNullable<PieceData['flags']>[number]): boolean {
  return allPieces(level).some((p) => p.flags?.includes(flag) ?? false);
}
function anyGap(level: LevelData, type: LevelData['wall']['gaps'][number]['type']): boolean {
  return level.wall.gaps.some((g) => g.type === type);
}
function anyObstacle(level: LevelData, type: LevelData['obstacles'][number]['type']): boolean {
  return level.obstacles.some((o) => o.type === type);
}

/** One row per OBSTACLES "Veri imzası" line, same order. */
export const MECHANICS: readonly MechanicSignature[] = [
  { id: 'W1', firstLevel: 3, detect: (l) => anyGap(l, 'static') },
  { id: 'W2', firstLevel: 6, detect: (l) => l.wall.height === 8 },
  // N2: W3 is a size, not a type.
  { id: 'W3', firstLevel: 9, detect: (l) => l.wall.gaps.some((g) => g.size === 1) },
  { id: 'W4', firstLevel: 13, detect: (l) => anyGap(l, 'shutter') },
  { id: 'W5', firstLevel: 16, detect: (l) => anyGap(l, 'slider') },
  { id: 'W6', firstLevel: 22, detect: (l) => anyGap(l, 'paint') },
  { id: 'W7', firstLevel: 26, detect: (l) => anyGap(l, 'locked') },
  { id: 'W8', firstLevel: 32, detect: (l) => l.wall.fan !== undefined },
  { id: 'Y1', firstLevel: 11, detect: (l) => anyObstacle(l, 'crate') },
  { id: 'Y2', firstLevel: 18, detect: (l) => anyObstacle(l, 'cement_bag') },
  { id: 'Y3', firstLevel: 24, detect: (l) => anyFlag(l, 'chained') },
  { id: 'Y4', firstLevel: 28, detect: (l) => anyFlag(l, 'wet') },
  { id: 'Y5', firstLevel: 8, detect: (l) => allPieces(l).some((p) => shapeById(p.shape).heavy) },
  { id: 'Y6', firstLevel: 14, detect: (l) => l.gravity.yard },
  { id: 'Y7', firstLevel: 19, detect: (l) => anyObstacle(l, 'screw') },
  { id: 'Y8', firstLevel: 35, detect: (l) => anyFlag(l, 'mortar') },
  { id: 'S1', firstLevel: 5, detect: (l) => l.build.mode === 'segments' && l.build.segments.length >= 2 },
  {
    id: 'S2',
    firstLevel: 4,
    detect: (l) => l.build.segments.some((s) => s.rows.some((r) => r.includes('.'))),
  },
  { id: 'S3', firstLevel: 21, detect: (l) => anyFlag(l, 'glass') },
  { id: 'S4', firstLevel: 17, detect: (l) => (l.build.debris?.length ?? 0) > 0 },
  { id: 'S5', firstLevel: 31, detect: (l) => l.build.mode === 'carousel' },
  { id: 'S6', firstLevel: 37, detect: (l) => l.build.elevator !== undefined },
  { id: 'S7-R', firstLevel: 27, detect: (l) => l.build.segments.some((s) => s.hidden?.kind === 'repeat') },
  { id: 'S7-M', firstLevel: 29, detect: (l) => l.build.segments.some((s) => s.hidden?.kind === 'mirrorOf') },
  { id: 'S8', firstLevel: 38, detect: (l) => anyFlag(l, 'balloon') },
  { id: 'G-H', firstLevel: 15, detect: (l) => l.gravity.build === 'high' },
  { id: 'G-L', firstLevel: 23, detect: (l) => l.gravity.build === 'low' },
];

if (MECHANICS.length !== MECHANIC_IDS.length)
  throw new Error('mechanics table out of sync with MECHANIC_IDS');

/** The level's mechanic set, in table order. */
export function deriveMechanics(level: LevelData): MechanicId[] {
  return MECHANICS.filter((m) => m.detect(level)).map((m) => m.id);
}

/** Mechanics of `level` that are not in `previous` (the union of earlier levels' sets), in table order. */
export function newMechanics(level: LevelData, previous: ReadonlySet<MechanicId>): MechanicId[] {
  return deriveMechanics(level).filter((id) => !previous.has(id));
}
