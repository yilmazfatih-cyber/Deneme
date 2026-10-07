/**
 * ASCII board (TECH_DESIGN Appendix A): debug "copy board", test snapshots, level preview.
 *
 * ```
 * L4 turn 3 moves 11 seg 1/1 elev 0
 *  y  0 1 2 3 4 5 | W | 6 7
 *  9  . . . . . . | : | . .
 *  …
 *  0  . . . . . . | # | Y Y
 * plan seg0 (top→bottom): YY WW W. WW YY
 * hidden: screw@(3,4) key:a@(5,3)
 * ```
 *
 * Yard: `.` empty, lower-case colour = block, `1`–`3` crate (hp), `%` cement bag. Site: upper case = locked correct
 * block, lower case = unlocked (debris, stuck mortar), `_` platform (below the elevator offset), `*` trowel cell.
 * Wall column (the boundary has no cells, R-03; printed for readability): `#` closed, `=` open gap, `x` closed gap,
 * `:` air above the wall. Optional lines: `queue:` (FIFO ids). With `ids: true` the header ends in `ids`, cells show
 * piece ids (0–9, a–z, A–Z = 0…61), crates/bags move to an `obstacles:` line and `locked:` / `stuck:` list flags, so
 * `fromAscii` can rebuild the state.
 */
import { COLOR_CODES, Zone } from './types.ts';
import type { PieceId } from './types.ts';
import { BOARD_ROWS, GRID_ROWS, SITE_COLS, SITE_X, YARD_COLS } from './coords.ts';
import { shapeByIndex } from './shapes.ts';
import {
  FLAG_BIT,
  GF,
  H,
  OF,
  SITE_TROWEL,
  createInitialState,
  enqueuePiece,
  gapField,
  hdr,
  hiddenCollected,
  obstacleField,
  pieceColor,
  pieceFlags,
  pieceZone,
  queueIds,
  revealedMask,
  setFlag,
  setHdr,
  setHiddenCollected,
  setObstacleField,
  setPieceField,
  setSiteOcc,
  setYardOcc,
  siteOcc,
  yardOcc,
  PF,
} from './state.ts';
import type { GameState } from './state.ts';
import { occupyPiece, refreshSiteMasks, visibleSegment } from './grid.ts';
import type { CompiledLevel } from './level/compile.ts';

const ID_CHARS = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';

export interface AsciiOptions {
  /** Print piece ids instead of colours (fixture mode). */
  readonly ids?: boolean;
}

function idChar(id: PieceId): string {
  const ch = ID_CHARS[id];
  if (ch === undefined) throw new RangeError(`ascii: piece id ${id} has no single-character form (max 61)`);
  return ch;
}

function colorChar(s: GameState, id: PieceId, upper: boolean): string {
  const c = (COLOR_CODES[pieceColor(s, id)] ?? 'W').toLowerCase();
  return upper ? c.toUpperCase() : c;
}

/** Wall boundary character of board row y. */
export function wallChar(s: GameState, y: number): string {
  const { lvl } = s;
  if (y >= lvl.wallHeight) return ':';
  const shutterOpen = hdr(s, H.turn) < hdr(s, H.openShutterUntil);
  for (const g of lvl.gaps) {
    const gy = gapField(s, g.index, GF.y);
    if (y < gy || y >= gy + g.size) continue;
    const open =
      gapField(s, g.index, GF.open) === 1 || (shutterOpen && (g.type === 'shutter' || g.type === 'locked'));
    return open ? '=' : 'x';
  }
  return '#';
}

function yardChar(s: GameState, x: number, y: number, ids: boolean): string {
  const v = yardOcc(s, x, y);
  if (v > 0) return ids ? idChar(v - 1) : colorChar(s, v - 1, false);
  if (v < 0 && !ids) {
    const o = s.lvl.obstacles[-v - 1];
    if (o?.type === 'crate') return String(obstacleField(s, o.index, OF.hp));
    if (o?.type === 'cement_bag') return '%';
  }
  return '.';
}

function siteChar(s: GameState, sx: number, y: number, ids: boolean): string {
  const elev = hdr(s, H.elev);
  if (y < elev) return '_';
  const sy = y - elev;
  if (sy >= BOARD_ROWS || y >= BOARD_ROWS) return '.';
  const v = siteOcc(s, visibleSegment(s), sx, sy);
  if (v === SITE_TROWEL) return '*';
  if (v <= 0) return '.';
  if (ids) return idChar(v - 1);
  return colorChar(s, v - 1, (pieceFlags(s, v - 1) & FLAG_BIT.locked) !== 0);
}

/** The board as Appendix A text (lines joined with `\n`, no trailing newline). */
export function toAscii(s: GameState, opts: AsciiOptions = {}): string {
  const ids = opts.ids === true;
  const { lvl } = s;
  const seg = visibleSegment(s);
  const lines: string[] = [];
  lines.push(
    `L${lvl.id} turn ${hdr(s, H.turn)} moves ${hdr(s, H.movesLeft)} seg ${seg + 1}/${lvl.segments.length} elev ${hdr(s, H.elev)}${ids ? ' ids' : ''}`,
  );
  lines.push(' y  0 1 2 3 4 5 | W | 6 7');
  for (let y = GRID_ROWS - 1; y >= 0; y--) {
    const yard: string[] = [];
    for (let x = 0; x < YARD_COLS; x++) yard.push(yardChar(s, x, y, ids));
    const site: string[] = [];
    for (let sx = 0; sx < SITE_COLS; sx++) site.push(siteChar(s, sx, y, ids));
    lines.push(` ${y}  ${yard.join(' ')} | ${wallChar(s, y)} | ${site.join(' ')}`);
  }
  const rows = lvl.data.build.segments[seg]?.rows ?? [];
  const revealed = revealedMask(s, seg);
  const h = rows.length;
  const shownRows = rows.map((row, i) =>
    [...row]
      .map((ch, sx) => {
        if (ch !== '?') return ch;
        const local = (h - 1 - i) * SITE_COLS + sx;
        const color = lvl.segments[seg]?.planColors[local] ?? -2;
        return (revealed >> local) & 1 && color >= 0 ? (COLOR_CODES[color] ?? '?') : '?';
      })
      .join(''),
  );
  lines.push(`plan seg${seg} (top→bottom): ${shownRows.join(' ')}`);
  if (lvl.hiddenItems.length > 0) {
    const items: string[] = [];
    for (const index of lvl.hiddenItems) {
      const o = lvl.obstacles[index];
      if (!o || (o.type !== 'screw' && o.type !== 'key')) continue;
      if (hiddenCollected(s, o.hiddenIndex)) continue;
      items.push(o.type === 'key' ? `key:${o.id ?? ''}@(${o.x},${o.y})` : `screw@(${o.x},${o.y})`);
    }
    lines.push(`hidden: ${items.length > 0 ? items.join(' ') : '-'}`);
  }
  const queue = queueIds(s);
  if (queue.length > 0) lines.push(`queue: ${queue.join(' ')}`);
  if (ids) {
    const obs: string[] = [];
    for (const o of lvl.obstacles) {
      if (o.type !== 'crate' && o.type !== 'cement_bag') continue;
      const hp = obstacleField(s, o.index, OF.hp);
      if (hp <= 0) continue;
      obs.push(o.type === 'crate' ? `crate:${hp}@(${o.x},${o.y})` : `bag@(${o.x},${o.y})`);
    }
    if (obs.length > 0) lines.push(`obstacles: ${obs.join(' ')}`);
    const locked: number[] = [];
    const stuck: number[] = [];
    for (let id = 0; id < lvl.layout.counts.pieces; id++) {
      if (pieceZone(s, id) !== Zone.site) continue;
      const f = pieceFlags(s, id);
      if (f & FLAG_BIT.locked) locked.push(id);
      if (f & FLAG_BIT.stuck) stuck.push(id);
    }
    if (locked.length > 0) lines.push(`locked: ${locked.join(' ')}`);
    if (stuck.length > 0) lines.push(`stuck: ${stuck.join(' ')}`);
  }
  return lines.join('\n');
}

/** Structural parse of either mode. */
export interface AsciiBoard {
  readonly levelId: number;
  readonly turn: number;
  readonly moves: number;
  /** 0-based visible segment. */
  readonly seg: number;
  readonly segCount: number;
  readonly elev: number;
  readonly ids: boolean;
  /** `cells[y][x]` for x 0–7 (yard 0–5, site 6–7), y 0–9. */
  readonly cells: readonly (readonly string[])[];
  /** `wall[y]`. */
  readonly wall: readonly string[];
  readonly plan: readonly string[];
  /** `hidden:` entries (null when the line is absent). */
  readonly hidden: readonly string[] | null;
  readonly queue: readonly number[];
  readonly obstacles: readonly string[];
  readonly locked: readonly number[];
  readonly stuck: readonly number[];
}

const HEADER_RE = /^L(\d+) turn (\d+) moves (\d+) seg (\d+)\/(\d+) elev (\d+)( ids)?$/;
const ROW_RE = /^ (\d) {2}(\S(?: \S){5}) \| (\S) \| (\S) (\S)$/;

export function parseAscii(text: string): AsciiBoard {
  const lines = text.split('\n').map((l) => l.replace(/\s+$/, ''));
  const head = HEADER_RE.exec(lines[0] ?? '');
  if (!head) throw new SyntaxError(`ascii: bad header "${lines[0] ?? ''}"`);
  const cells: string[][] = Array.from({ length: GRID_ROWS }, () => Array.from({ length: 8 }, () => '.'));
  const wall: string[] = Array.from({ length: GRID_ROWS }, () => '#');
  const seen = new Set<number>();
  let plan: string[] = [];
  let hidden: string[] | null = null;
  let queue: number[] = [];
  let obstacles: string[] = [];
  let locked: number[] = [];
  let stuck: number[] = [];
  const nums = (rest: string): number[] => rest.trim().split(/\s+/).filter(Boolean).map(Number);
  for (const line of lines.slice(2)) {
    const row = ROW_RE.exec(line);
    if (row) {
      const y = Number(row[1]);
      const yard = (row[2] ?? '').split(' ');
      const target = cells[y] as string[];
      yard.forEach((ch, x) => (target[x] = ch));
      target[6] = row[4] ?? '.';
      target[7] = row[5] ?? '.';
      wall[y] = row[3] ?? '#';
      seen.add(y);
      continue;
    }
    if (line.startsWith('plan '))
      plan = line
        .slice(line.indexOf(':') + 1)
        .trim()
        .split(/\s+/)
        .filter(Boolean);
    else if (line.startsWith('hidden:')) {
      const rest = line.slice(7).trim();
      hidden = rest === '-' ? [] : rest.split(/\s+/).filter(Boolean);
    } else if (line.startsWith('queue:')) queue = nums(line.slice(6));
    else if (line.startsWith('obstacles:')) obstacles = line.slice(10).trim().split(/\s+/).filter(Boolean);
    else if (line.startsWith('locked:')) locked = nums(line.slice(7));
    else if (line.startsWith('stuck:')) stuck = nums(line.slice(6));
    else if (line.trim() !== '') throw new SyntaxError(`ascii: unexpected line "${line}"`);
  }
  if (seen.size !== GRID_ROWS) throw new SyntaxError('ascii: the board needs rows 9 … 0');
  return {
    levelId: Number(head[1]),
    turn: Number(head[2]),
    moves: Number(head[3]),
    seg: Number(head[4]) - 1,
    segCount: Number(head[5]),
    elev: Number(head[6]),
    ids: head[7] !== undefined,
    cells,
    wall,
    plan,
    hidden,
    queue,
    obstacles,
    locked,
    stuck,
  };
}

/**
 * Rebuilds a state from `ids` text (fixtures, debug "load from ASCII"). Starts from the level's initial state, then
 * places every drawn piece (anchor = bottom-left of its cells), queue, locked/stuck flags, crates/bags and hidden
 * items. Pieces that are neither drawn nor queued stay `pending` when their batch is not delivered yet, else `gone`.
 * Colour-mode text cannot identify pieces: use `parseAscii` for it.
 */
export function fromAscii(lvl: CompiledLevel, text: string): GameState {
  const board = parseAscii(text);
  if (!board.ids) throw new Error('fromAscii needs ids mode text (toAscii(state, { ids: true }))');
  if (board.levelId !== lvl.id)
    throw new Error(`fromAscii: text is level ${board.levelId}, compiled level is ${lvl.id}`);
  const s = createInitialState(lvl);
  const P = lvl.layout.counts.pieces;
  // fresh occupancy grids (yardOcc, siteOcc, filled, wrongOcc precede the piece table in the layout)
  s.buf.fill(0, lvl.layout.yardOcc, lvl.layout.pieces);
  setHdr(s, H.turn, board.turn);
  setHdr(s, H.movesLeft, board.moves);
  setHdr(s, H.elev, board.elev);
  if (lvl.mode === 'carousel') setHdr(s, H.frontSeg, board.seg);
  else {
    setHdr(s, H.activeSeg, board.seg);
    setHdr(s, H.deliveryCursor, board.seg);
  }
  const cellsById = new Map<number, { x: number; y: number }[]>();
  for (let y = 0; y < GRID_ROWS; y++) {
    for (let x = 0; x < 8; x++) {
      const ch = board.cells[y]?.[x] ?? '.';
      if (x >= SITE_X && ch === '*' && y >= board.elev)
        setSiteOcc(s, board.seg, x - SITE_X, y - board.elev, SITE_TROWEL);
      const id = ID_CHARS.indexOf(ch);
      if (ch === '.' || ch === '_' || ch === '*' || id < 0) continue;
      const list = cellsById.get(id) ?? [];
      list.push({ x, y });
      cellsById.set(id, list);
    }
  }
  const cursor = hdr(s, H.deliveryCursor);
  for (let id = 0; id < P; id++) {
    const cells = cellsById.get(id);
    const compiled = lvl.pieces[id];
    if (!compiled) continue;
    if (!cells) {
      const batch = lvl.batches[compiled.batch];
      const undelivered = compiled.origin === 'truck' && batch !== undefined && batch.forSegment > cursor;
      if (compiled.origin === 'help' || undelivered) continue; // keep gone / pending
      setPieceField(s, id, PF.zone, Zone.gone);
      continue;
    }
    const ax = Math.min(...cells.map((c) => c.x));
    const ay = Math.min(...cells.map((c) => c.y));
    const shape = shapeByIndex(compiled.shapeIndex);
    const want = shape.cells.map((c) => `${ax + c.x},${ay + c.y}`).sort();
    const got = cells.map((c) => `${c.x},${c.y}`).sort();
    if (want.join(';') !== got.join(';'))
      throw new Error(
        `fromAscii: piece ${id} cells ${got.join(' ')} do not match ${shape.id} at (${ax},${ay})`,
      );
    const onSite = ax >= SITE_X;
    setPieceField(s, id, PF.zone, onSite ? Zone.site : Zone.yard);
    setPieceField(s, id, PF.x, ax);
    setPieceField(s, id, PF.y, onSite ? ay - board.elev : ay);
    setPieceField(s, id, PF.seg, onSite ? board.seg : compiled.segment);
    occupyPiece(s, id);
  }
  for (const id of board.queue) enqueuePiece(s, id);
  for (const id of board.locked) setFlag(s, id, 'locked', true);
  for (const id of board.stuck) setFlag(s, id, 'stuck', true);
  // crates / bags
  for (const o of lvl.obstacles) {
    if (o.type !== 'crate' && o.type !== 'cement_bag') continue;
    const entry = board.obstacles.find((e) => e.endsWith(`@(${o.x},${o.y})`));
    let hp = 0;
    if (entry) hp = o.type === 'crate' ? Number(/^crate:(\d)/.exec(entry)?.[1] ?? 0) : 1;
    setObstacleField(s, o.index, OF.hp, hp);
    if (hp > 0) setYardOcc(s, o.x, o.y, -(o.index + 1));
  }
  // hidden items: listed = still hidden
  if (board.hidden) {
    for (const index of lvl.hiddenItems) {
      const o = lvl.obstacles[index];
      if (!o || (o.type !== 'screw' && o.type !== 'key')) continue;
      const listed = board.hidden.some((e) => e.endsWith(`@(${o.x},${o.y})`));
      setHiddenCollected(s, o.hiddenIndex, !listed);
      setObstacleField(s, o.index, OF.hp, listed ? 1 : 0);
    }
  }
  for (let seg = 0; seg < lvl.segments.length; seg++) refreshSiteMasks(s, seg);
  return s;
}
