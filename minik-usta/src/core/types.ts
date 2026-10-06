/**
 * Cross-cutting core types (docs/TECH_DESIGN.md §2.1, §5.1, §6.1, §6.3). Rules: docs/GDD.md.
 * Pure data declarations: no runtime dependencies.
 */

/** Block colours (BRIEF §6). The array order is the internal index 0..7 and the D2 help colour order (TECH §9.7). */
export const COLOR_CODES = ['W', 'Y', 'G', 'R', 'O', 'C', 'B', 'P'] as const;
export type ColorCode = (typeof COLOR_CODES)[number];

/** Shape kinds (BRIEF §5). The array order fixes the shape index: `kindIndex * 4 + rotationIndex`. */
export const SHAPE_KINDS = [
  'B1',
  'D2',
  'I3',
  'I4',
  'O4',
  'C3',
  'L4',
  'J4',
  'T4',
  'S4',
  'Z4',
  'I5',
  'Q9',
] as const;
export type ShapeKind = (typeof SHAPE_KINDS)[number];

/** Clockwise rotation in degrees (GDD K-44, D-051). */
export const ROTATIONS = [0, 90, 180, 270] as const;
export type Rotation = (typeof ROTATIONS)[number];

/** `TÜR_AÇI`, e.g. `C3_90`; internal index 0..51 (core/shapes.ts). */
export type ShapeId = `${ShapeKind}_${Rotation}`;

/** Stable piece index inside one level (batch 0 in array order, then batches k ≥ 1, then debris; core/level/compile.ts). */
export type PieceId = number;

/** Grid cell index `iy * 8 + ix` on the 8 × 10 core grid (TECH §2.2). */
export type CellIndex = number;

/**
 * Where a piece is. Stored as an int in the state buffer. `pending` = truck block whose batch is not delivered yet
 * (TECH §2.1 lists 0–3; `pending` keeps undelivered supply apart from destroyed blocks, K-30 D2).
 */
export const Zone = { yard: 0, site: 1, queue: 2, gone: 3, pending: 4 } as const;
export type Zone = (typeof Zone)[keyof typeof Zone];
export type ZoneName = keyof typeof Zone;

/** Bottom-left corner of a piece's bounding box, global coordinates (internal = global, R-03). */
export interface Anchor {
  readonly ix: number;
  readonly iy: number;
}

/** 0 = FREE, 1 + gapIndex = RAIL(gap) (TECH §2.1, §4.2). */
export type DragMode = number;

/** A drag graph node. Integer code: `(mode * 10 + iy) * 8 + ix` (core/coords.ts `dragNodeCode`). */
export interface DragNode {
  readonly ix: number;
  readonly iy: number;
  readonly mode: DragMode;
}

/** Block flags written in level data (GDD K-21). */
export const DATA_PIECE_FLAGS = ['glass', 'mortar', 'balloon', 'chained', 'wet'] as const;
export type DataPieceFlag = (typeof DATA_PIECE_FLAGS)[number];

/** All runtime piece flags: data flags + `debris` (S4, added by compile) + `locked` (K-14) + `stuck` (Y8). */
export const PIECE_FLAGS = [
  'glass',
  'mortar',
  'balloon',
  'chained',
  'wet',
  'locked',
  'debris',
  'stuck',
] as const;
export type PieceFlag = (typeof PIECE_FLAGS)[number];

/** A position in events and views; GLOBAL coordinates (TECH §6.3). */
export interface At {
  readonly zone: 'yard' | 'site';
  readonly x: number;
  readonly y: number;
  readonly seg?: number;
}

/** GDD K-34 visibility hook 2: fixed order, `reasons[0]` is the primary reason. */
export const VERDICT_REASONS = ['debris', 'outside', 'window', 'color', 'support'] as const;
export type VerdictReason = (typeof VERDICT_REASONS)[number];

/** `ok ⇔ reasons.length === 0` (TECH §5.1). */
export interface Verdict {
  readonly ok: boolean;
  readonly reasons: readonly VerdictReason[];
  readonly missingSupport: readonly At[];
}

/** G-L steering input (GDD K-19, S-26 record format). */
export interface Steer {
  readonly dir: -1 | 1;
  readonly atRow: number;
}

/** A core move (TECH §6.1). The undo booster is a session action, not a core move (K-39). */
export type Move =
  | {
      readonly kind: 'drag';
      readonly pieceId: PieceId;
      readonly to: DragNode;
      readonly via?: number;
      readonly steer?: Steer;
    }
  | {
      readonly kind: 'hammer';
      readonly target: { readonly pieceId: PieceId } | { readonly obstacle: number };
    }
  | {
      readonly kind: 'crane';
      readonly pieceId: PieceId;
      readonly to: { readonly zone: 'yard' | 'site'; readonly x: number; readonly y: number };
      readonly rotation: Rotation;
    }
  | { readonly kind: 'paint'; readonly pieceId: PieceId; readonly color: ColorCode }
  | { readonly kind: 'trowel'; readonly seg: number; readonly x: 0 | 1; readonly y: number }
  | {
      readonly kind: 'addMoves';
      readonly amount: number;
      readonly source: 'offerCoins' | 'offerAd' | 'thermos' | 'streak';
    };

/** Pre-level boosters (META §4; economy.json keys). */
export type PreBooster = 'thermos' | 'trowelStart' | 'openShutter';

/** Move log entry (TECH §6.1, §11.1). */
export type SessionAction =
  | Move
  | { readonly kind: 'undo' }
  | {
      readonly kind: 'start';
      readonly preBoosters: readonly PreBooster[];
      readonly streakTier: 0 | 1 | 2 | 3;
    };

export type BoosterName = 'hammer' | 'crane' | 'paint' | 'trowel';

/** Event payloads (TECH §6.3). `seq` and `step` are added by the sink. */
export type GameEventBody =
  | {
      readonly t: 'moveCancelled';
      readonly pieceId: PieceId;
      readonly reason: 'sameSpot' | 'craneOverYard' | 'straddle' | 'siteClosed' | 'invalid';
    }
  | {
      readonly t: 'pieceMoved';
      readonly pieceId: PieceId;
      readonly from: At;
      readonly to: At;
      readonly entry: 'yard' | 'overWall' | 'gap';
      readonly gap?: number;
    }
  | {
      readonly t: 'piecePainted';
      readonly pieceId: PieceId;
      readonly from: ColorCode;
      readonly to: ColorCode;
      readonly gap: number;
    }
  | { readonly t: 'windDrift'; readonly pieceId: PieceId; readonly dx: -1 | 1 }
  | {
      readonly t: 'pieceFell';
      readonly pieceId: PieceId;
      readonly from: At;
      readonly to: At;
      readonly rows: number;
      readonly cause: 'release' | 'yardGravity' | 'delivery' | 'bounce';
    }
  | {
      readonly t: 'balloonRose';
      readonly pieceId: PieceId;
      readonly from: At;
      readonly to: At;
      readonly rows: number;
    }
  | { readonly t: 'steered'; readonly pieceId: PieceId; readonly atRow: number; readonly dx: -1 | 1 }
  | { readonly t: 'glassBroke'; readonly pieceId: PieceId; readonly at: At; readonly penalty: number }
  | { readonly t: 'pieceReturned'; readonly pieceId: PieceId; readonly from: At; readonly to: At | 'queue' }
  | {
      readonly t: 'placementCorrect';
      readonly pieceId: PieceId;
      readonly cells: readonly At[];
      readonly overWall: boolean;
    }
  | {
      readonly t: 'cellsRevealed';
      readonly seg: number;
      readonly cells: readonly { readonly x: number; readonly y: number; readonly color: ColorCode }[];
    }
  | { readonly t: 'comboChanged'; readonly combo: number }
  | { readonly t: 'trowelEarned'; readonly trowels: number }
  | {
      readonly t: 'placementWrong';
      readonly pieceId: PieceId;
      readonly reasons: readonly VerdictReason[];
      readonly missingSupport: readonly At[];
    }
  | {
      readonly t: 'mortarStuck';
      readonly pieceId: PieceId;
      readonly reason: VerdictReason;
      readonly missingSupport: readonly At[];
    }
  | {
      readonly t: 'pieceBounced';
      readonly pieceId: PieceId;
      readonly from: At;
      readonly to: At | 'queue';
      readonly viaDrop: boolean;
      readonly reason: VerdictReason;
      readonly missingSupport: readonly At[];
    }
  | {
      readonly t: 'movesChanged';
      readonly movesLeft: number;
      readonly delta: number;
      readonly reason: 'move' | 'offer' | 'booster';
      readonly cost?: { readonly base: 1 | 2; readonly glass: 0 | 1 };
    }
  | { readonly t: 'crateDamaged'; readonly obstacle: number; readonly hp: number }
  | { readonly t: 'crateBroken'; readonly obstacle: number }
  | { readonly t: 'bagTorn'; readonly obstacle: number }
  | { readonly t: 'chainReleased'; readonly pieceId: PieceId }
  | { readonly t: 'screwCollected'; readonly at: At; readonly total: number }
  | { readonly t: 'keyCollected'; readonly keyId: string }
  | { readonly t: 'gapUnlocked'; readonly gap: number }
  | { readonly t: 'gapChanged'; readonly gap: number; readonly open: boolean; readonly y: number }
  | { readonly t: 'wetTick'; readonly pieceId: PieceId; readonly left: number }
  | { readonly t: 'goalProgress'; readonly goal: number; readonly value: number; readonly target: number }
  | { readonly t: 'segmentCompleted'; readonly seg: number }
  | { readonly t: 'siteShifted'; readonly toSeg: number }
  | { readonly t: 'carouselRotated'; readonly front: number }
  | { readonly t: 'elevatorMoved'; readonly offset: number }
  | { readonly t: 'deliveryArrived'; readonly seg: number; readonly pieces: readonly PieceId[] }
  | { readonly t: 'deliveryQueued'; readonly queued: number }
  | { readonly t: 'levelWon'; readonly movesLeft: number }
  | { readonly t: 'outOfMoves' }
  | { readonly t: 'deadlockDetected'; readonly reason: 'noMoves' | 'material' | 'tiling' }
  | {
      readonly t: 'truckHelp';
      readonly kind: 'unchain' | 'deliverMissing' | 'reshuffle' | 'reshape';
      readonly moves?: readonly { readonly pieceId: PieceId; readonly from: At; readonly to: At }[];
      readonly delivered?: readonly PieceId[];
    }
  | { readonly t: 'boosterApplied'; readonly booster: BoosterName; readonly detail: unknown }
  | { readonly t: 'boosterRejected'; readonly booster: BoosterName; readonly reason: string };

export interface EvBase {
  /** 0, 1, 2 … inside one move. */
  readonly seq: number;
  /** K-35 pipeline step (GDD §12, TECH §6.2). */
  readonly step: number;
}

export type GameEvent = EvBase & GameEventBody;
export type GameEventType = GameEventBody['t'];
