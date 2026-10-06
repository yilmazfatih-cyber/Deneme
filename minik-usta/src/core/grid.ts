/**
 * Grid operations on a GameState (TECH_DESIGN §1.2, §2.4, §4.1): occupancy writes, collision masks for the drag BFS,
 * site column tops, `filled` / `wrongOcc` maintenance and the state invariants used by tests (§12.4).
 */
import { Zone } from './types.ts';
import type { PieceId } from './types.ts';
import { BOARD_ROWS, GRID_ROWS, SITE_COLS, SITE_X, YARD_COLS } from './coords.ts';
import { shapeByIndex } from './shapes.ts';
import { PLAN_OUTSIDE } from './level/compile.ts';
import {
  FLAG_BIT,
  H,
  OF,
  SITE_TROWEL,
  YARD_OCC_ROWS,
  filledMask,
  hdr,
  obstacleField,
  pieceFlags,
  pieceSeg,
  pieceShape,
  pieceX,
  pieceY,
  pieceZone,
  planAreaMask,
  queueIds,
  setFilledMask,
  setSiteOcc,
  setWrongOccMask,
  setYardOcc,
  siteOcc,
  wrongOccMask,
  yardOcc,
} from './state.ts';
import type { GameState } from './state.ts';

export interface BoardCell {
  readonly x: number;
  readonly y: number;
}

/** The segment shown on the site: front segment in carousel mode, active segment otherwise (K-22, K-23). */
export function visibleSegment(s: GameState): number {
  return s.lvl.mode === 'carousel' ? hdr(s, H.frontSeg) : hdr(s, H.activeSeg);
}

/**
 * Cells of a piece. Yard: global board cells. Site: global column and BOARD row (`sy + elev`).
 * Queue / pending / gone pieces have no cells.
 */
export function pieceBoardCells(s: GameState, id: PieceId): BoardCell[] {
  const zone = pieceZone(s, id);
  if (zone !== Zone.yard && zone !== Zone.site) return [];
  const shape = shapeByIndex(pieceShape(s, id));
  const x = pieceX(s, id);
  const y = pieceY(s, id) + (zone === Zone.site ? hdr(s, H.elev) : 0);
  return shape.cells.map((c) => ({ x: x + c.x, y: y + c.y }));
}

/** Writes the piece into the occupancy grids (yardOcc or its segment's siteOcc). Site masks: `refreshSiteMasks`. */
export function occupyPiece(s: GameState, id: PieceId): void {
  writePiece(s, id, id + 1);
}

/** Clears the piece from the occupancy grids. */
export function vacatePiece(s: GameState, id: PieceId): void {
  writePiece(s, id, 0);
}

function writePiece(s: GameState, id: PieceId, value: number): void {
  const zone = pieceZone(s, id);
  if (zone !== Zone.yard && zone !== Zone.site) return;
  const shape = shapeByIndex(pieceShape(s, id));
  const x = pieceX(s, id);
  const y = pieceY(s, id);
  if (zone === Zone.yard) {
    for (const c of shape.cells) setYardOcc(s, x + c.x, y + c.y, value);
  } else {
    const seg = pieceSeg(s, id);
    for (const c of shape.cells) setSiteOcc(s, seg, x - SITE_X + c.x, y + c.y, value);
  }
}

/**
 * Recomputes `filled` (locked blocks + Golden Trowel cells on plan cells) and `wrongOcc` (plan-area rows holding
 * debris or a stuck mortar block, K-34 / E-43) of one segment from its siteOcc. O(16).
 */
export function refreshSiteMasks(s: GameState, seg: number): void {
  const plan = s.lvl.segments[seg];
  if (!plan) return;
  for (let sx = 0; sx < SITE_COLS; sx++) {
    let filled = 0;
    let wrong = 0;
    const area = planAreaMask(s.lvl, seg, sx);
    for (let sy = 0; sy < BOARD_ROWS; sy++) {
      if (((area >> sy) & 1) === 0) continue;
      const v = siteOcc(s, seg, sx, sy);
      if (v === SITE_TROWEL) {
        filled |= 1 << sy;
      } else if (v > 0) {
        const f = pieceFlags(s, v - 1);
        if (f & FLAG_BIT.locked) filled |= 1 << sy;
        else if (f & (FLAG_BIT.debris | FLAG_BIT.stuck)) wrong |= 1 << sy;
      }
    }
    setFilledMask(s, seg, sx, filled & (plan.planMask[sx] ?? 0));
    setWrongOccMask(s, seg, sx, wrong);
  }
}

/**
 * Collision rows for the drag BFS (TECH §4.1 step 2): `out[y]` bit x is set when board/crane cell (x, y) is blocked.
 * Yard occupancy (minus `exclude`), the visible segment shifted by the elevator offset, and the platform rows
 * `y < elev` of the site columns. The wall boundary has no cells (R-03).
 */
export function collisionMasks(
  s: GameState,
  exclude: PieceId,
  out: Uint8Array = new Uint8Array(GRID_ROWS),
): Uint8Array {
  out.fill(0);
  const skip = exclude + 1;
  for (let y = 0; y < YARD_OCC_ROWS; y++) {
    let row = 0;
    for (let x = 0; x < YARD_COLS; x++) {
      const v = yardOcc(s, x, y);
      if (v !== 0 && v !== skip) row |= 1 << x;
    }
    out[y] = row;
  }
  const seg = visibleSegment(s);
  const elev = hdr(s, H.elev);
  for (let y = 0; y < GRID_ROWS; y++) {
    for (let sx = 0; sx < SITE_COLS; sx++) {
      const sy = y - elev;
      let blocked = y < elev;
      if (!blocked && sy < BOARD_ROWS && y < BOARD_ROWS) {
        const v = siteOcc(s, seg, sx, sy);
        blocked = v !== 0 && v !== skip;
      }
      if (blocked) out[y] = (out[y] ?? 0) | (1 << (SITE_X + sx));
    }
  }
  return out;
}

/**
 * `colTop` of the site columns (TECH §4.1): highest blocked board row of x = 6 / x = 7 (platform included), −1 when
 * the column is empty. `out[0]` = x 6, `out[1]` = x 7.
 */
export function siteColumnTops(
  s: GameState,
  exclude: PieceId,
  out: Int8Array = new Int8Array(SITE_COLS),
): Int8Array {
  const seg = visibleSegment(s);
  const elev = hdr(s, H.elev);
  const skip = exclude + 1;
  for (let sx = 0; sx < SITE_COLS; sx++) {
    let top = elev - 1;
    for (let sy = 0; sy < BOARD_ROWS && sy + elev < BOARD_ROWS; sy++) {
      const v = siteOcc(s, seg, sx, sy);
      if (v !== 0 && v !== skip) top = sy + elev;
    }
    out[sx] = top;
  }
  return out;
}

/**
 * Structural invariants (TECH §12.4). Returns human-readable violations; empty = consistent.
 * Occupancy ↔ piece table, obstacle cells, queue, `filled` / `wrongOcc` recomputation, and K-34 (no locked block
 * above an empty non-`.` plan cell of its columns).
 */
export function stateInvariantErrors(s: GameState): string[] {
  const errors: string[] = [];
  const { lvl } = s;
  const P = lvl.layout.counts.pieces;
  const expectYard = new Map<number, number>();
  const expectSite = new Map<string, number>();
  for (let id = 0; id < P; id++) {
    const zone = pieceZone(s, id);
    if (zone < Zone.yard || zone > Zone.pending) errors.push(`piece ${id}: bad zone ${zone}`);
    if (zone !== Zone.yard && zone !== Zone.site) continue;
    const shape = shapeByIndex(pieceShape(s, id));
    const x = pieceX(s, id);
    const y = pieceY(s, id);
    for (const c of shape.cells) {
      const cx = x + c.x;
      const cy = y + c.y;
      if (zone === Zone.yard) {
        if (cx < 0 || cx >= YARD_COLS || cy < 0 || cy >= BOARD_ROWS) {
          errors.push(`piece ${id}: yard cell (${cx},${cy}) outside the yard`);
          continue;
        }
        const key = cy * YARD_COLS + cx;
        if (expectYard.has(key))
          errors.push(`piece ${id}: overlaps piece ${expectYard.get(key)} at (${cx},${cy})`);
        expectYard.set(key, id + 1);
      } else {
        const seg = pieceSeg(s, id);
        const sx = cx - SITE_X;
        if (
          seg < 0 ||
          seg >= lvl.segments.length ||
          sx < 0 ||
          sx >= SITE_COLS ||
          cy < 0 ||
          cy >= BOARD_ROWS
        ) {
          errors.push(`piece ${id}: site cell (${cx},${cy}) seg ${seg} outside the site`);
          continue;
        }
        const key = `${seg}:${sx},${cy}`;
        if (expectSite.has(key))
          errors.push(`piece ${id}: overlaps piece ${expectSite.get(key)} at seg ${key}`);
        expectSite.set(key, id + 1);
      }
    }
  }
  lvl.obstacles.forEach((o) => {
    if (o.type !== 'crate' && o.type !== 'cement_bag') return;
    if (obstacleField(s, o.index, OF.hp) <= 0) return;
    const key = o.y * YARD_COLS + o.x;
    if (expectYard.has(key)) errors.push(`obstacle ${o.index}: shares (${o.x},${o.y}) with a piece`);
    expectYard.set(key, -(o.index + 1));
  });
  for (let y = 0; y < YARD_OCC_ROWS; y++) {
    for (let x = 0; x < YARD_COLS; x++) {
      const got = yardOcc(s, x, y);
      const want = expectYard.get(y * YARD_COLS + x) ?? 0;
      if (got !== want) errors.push(`yardOcc (${x},${y}) = ${got}, expected ${want}`);
    }
  }
  for (let seg = 0; seg < lvl.segments.length; seg++) {
    for (let sy = 0; sy < BOARD_ROWS; sy++) {
      for (let sx = 0; sx < SITE_COLS; sx++) {
        const got = siteOcc(s, seg, sx, sy);
        if (got === SITE_TROWEL) {
          if (expectSite.has(`${seg}:${sx},${sy}`))
            errors.push(`trowel cell seg ${seg} (${sx},${sy}) holds a piece`);
          continue;
        }
        const want = expectSite.get(`${seg}:${sx},${sy}`) ?? 0;
        if (got !== want) errors.push(`siteOcc seg ${seg} (${sx},${sy}) = ${got}, expected ${want}`);
      }
    }
  }
  // filled / wrongOcc against a recomputation on a scratch copy
  const scratch: GameState = { lvl, buf: s.buf.slice() };
  for (let seg = 0; seg < lvl.segments.length; seg++) {
    refreshSiteMasks(scratch, seg);
    for (let sx = 0; sx < SITE_COLS; sx++) {
      if (filledMask(scratch, seg, sx) !== filledMask(s, seg, sx))
        errors.push(
          `filled seg ${seg} col ${sx} = ${filledMask(s, seg, sx)}, expected ${filledMask(scratch, seg, sx)}`,
        );
      if (wrongOccMask(scratch, seg, sx) !== wrongOccMask(s, seg, sx))
        errors.push(
          `wrongOcc seg ${seg} col ${sx} = ${wrongOccMask(s, seg, sx)}, expected ${wrongOccMask(scratch, seg, sx)}`,
        );
    }
  }
  // queue
  const queued = queueIds(s);
  if (new Set(queued).size !== queued.length) errors.push('queue holds a piece twice');
  for (const id of queued)
    if (pieceZone(s, id) !== Zone.queue) errors.push(`queued piece ${id} is not in zone queue`);
  for (let id = 0; id < P; id++)
    if (pieceZone(s, id) === Zone.queue && !queued.includes(id))
      errors.push(`piece ${id} in zone queue but not queued`);
  // K-34: under every locked block, each non-dot plan row of its columns is filled
  for (let id = 0; id < P; id++) {
    if (pieceZone(s, id) !== Zone.site || (pieceFlags(s, id) & FLAG_BIT.locked) === 0) continue;
    const seg = pieceSeg(s, id);
    const plan = lvl.segments[seg];
    if (!plan) continue;
    const shape = shapeByIndex(pieceShape(s, id));
    for (let c = 0; c < shape.w; c++) {
      const sx = pieceX(s, id) - SITE_X + c;
      const r = pieceY(s, id) + (shape.colBottom[c] ?? 0);
      const need = ((1 << r) - 1) & (plan.planMask[sx] ?? 0);
      if ((need & ~filledMask(s, seg, sx)) !== 0)
        errors.push(`K-34: locked piece ${id} has an empty plan cell below it`);
    }
  }
  return errors;
}

/** Plan colour index at a local cell: 0–7, PLAN_DOT (−1) or PLAN_OUTSIDE (−2). */
export function planColorAt(s: GameState, seg: number, sx: number, sy: number): number {
  return s.lvl.segments[seg]?.planColors[sy * SITE_COLS + sx] ?? PLAN_OUTSIDE;
}
