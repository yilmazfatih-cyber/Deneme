/**
 * Pointer → drag (docs/TECH_DESIGN.md §1.4, §4.1, §4.4–§4.6, §10.5; UX_FLOWS §5.3; GDD K-07, K-08, K-09).
 *
 * - `pointerdown` on the board region: R-12 fast-forward of the board motions, hit test (hitTest.ts), then the core's
 *   K-09 gate + ONE BFS (`tryBeginDrag` with the level's `levelHooks(lvl).drag`). Nothing moves yet.
 * - The press becomes a drag when the finger moved `drag.startThresholdPx` or stayed down `drag.holdMs`; a release
 *   before that is a tap (no move, no cancel; K-07).
 * - While dragging, every `pointermove` runs `DragSession.follow(p)` (K-08 sticky follow, tie-breaks, hysteresis) with
 *   p = finger − grab + (0, `drag.fingerOffsetCells`·t) and positions the block INSIDE the event handler (Phaser 4
 *   handles DOM input immediately, TECH §0): the block moves in the next frame (one-frame response, TECH §4.6).
 * - A non-adjacent node change is followed along the BFS path (12 ms / cell, ≤ 120 ms): the block never seems to pass
 *   through the wall or a block (TECH §4.4).
 * - Only the pointer that started the press is followed; a second finger is ignored (TECH §4.6).
 * - `pointerup` / `pointerupoutside` release at the current node; the host commits it through `GameSession`.
 *
 * The controller never decides a rule: reachability, release class, landing and verdict come from the core.
 */
import type Phaser from 'phaser';
import { tryBeginDrag } from '../../core/movement.ts';
import type { DragRules, DragSession, DropClass, PickFailure } from '../../core/movement.ts';
import type { GameState } from '../../core/state.ts';
import type { DragNode, PieceId } from '../../core/types.ts';
import type { Layout } from '../../theme/layout.ts';
import { TOKENS } from '../../theme/tokens.ts';
import {
  NO_EDGES,
  drawAnchor,
  edgesOf,
  exceedsThreshold,
  grabAt,
  pathDurationMs,
  pathPoint,
  targetAnchor,
} from './dragMath.ts';
import type { Edges, Grab } from './dragMath.ts';
import { pieceAtPoint } from './hitTest.ts';
import type { PieceView } from './PieceView.ts';
import { VIEW } from './viewConstants.ts';

/** Presentation signals of a drag (tutorial `overWall` / `gapPass`, K-05 `blockedByWallHeight`; TECH §4.4, §8.2). */
export type DragSignal = 'crossedWall' | 'enteredRail' | 'blockedByWallHeight';

export interface DragHost {
  /** The state to pick on; null while the board takes no input (loading, level over, blocking sequence, R-12). */
  boardState(): GameState | null;
  layout(): Layout;
  /** `levelHooks(lvl).drag` (K-09 (c) `canPick`, RAIL `canPassGap`, K-07 row 5 `siteClosed`). */
  dragRules(): DragRules;
  view(id: PieceId): PieceView | undefined;
  /** Scene clock (ms). */
  now(): number;
  /** R-12: running board motions jump to their last frame before the BFS. */
  fastForward(): void;
  /** Any press outside the HUD: a locked sequence (segment slide, truck) plays 3× faster (JUICE §0 rule 3). */
  touched(): void;
  /** K-09: the piece cannot be picked (immovable / rule → shake; locked → no reaction, K-14). */
  pickFailed(id: PieceId, reason: PickFailure): void;
  /** A press released under the threshold (UX §5.3 "Tıklama"). */
  tapped(id: PieceId): void;
  /** The press became a drag: the host lifts the view (`PieceView.beginDrag`, JUICE #1). */
  lifted(session: DragSession): void;
  /** The current node changed: `drop` = the core's K-07 class of the new node (shadow / cancel preview). */
  nodeChanged(session: DragSession, drop: DropClass): void;
  /**
   * The dragged block was drawn at continuous anchor `(ax, ay)`; `(px, py)` is the follow target (the gap between the
   * two is the sticky-follow separation, JUICE #4) and `(fx, fy)` the finger (design px).
   */
  moved(session: DragSession, ax: number, ay: number, px: number, py: number, fx: number, fy: number): void;
  released(session: DragSession, node: DragNode): void;
  /** The drag was aborted (app hidden, resize, level change): nothing is committed. */
  aborted(session: DragSession): void;
  signal(kind: DragSignal, session: DragSession): void;
}

interface Press {
  readonly pointerId: number;
  readonly id: PieceId;
  readonly session: DragSession;
  readonly view: PieceView;
  readonly grab: Grab;
  readonly downX: number;
  readonly downY: number;
  readonly downAt: number;
  lastX: number;
  lastY: number;
  lifted: boolean;
  liftAt: number;
  edges: Edges;
  path: { points: { ax: number; ay: number }[]; start: number; ms: number } | null;
  /** Last drawn anchor. */
  ax: number;
  ay: number;
}

export class DragController {
  private readonly scene: Phaser.Scene;
  private readonly host: DragHost;
  private press: Press | null = null;

  private readonly onDown = (pointer: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]): void => {
    if (over.length > 0) return; // a HUD object took the touch
    this.down(pointer);
  };
  private readonly onMove = (pointer: Phaser.Input.Pointer): void => this.move(pointer);
  private readonly onUp = (pointer: Phaser.Input.Pointer): void => this.up(pointer);

  constructor(scene: Phaser.Scene, host: DragHost) {
    this.scene = scene;
    this.host = host;
    scene.input.on('pointerdown', this.onDown);
    scene.input.on('pointermove', this.onMove);
    scene.input.on('pointerup', this.onUp);
    scene.input.on('pointerupoutside', this.onUp);
  }

  destroy(): void {
    this.scene.input.off('pointerdown', this.onDown);
    this.scene.input.off('pointermove', this.onMove);
    this.scene.input.off('pointerup', this.onUp);
    this.scene.input.off('pointerupoutside', this.onUp);
    this.press = null;
  }

  /** A press or a drag is in progress. */
  get active(): boolean {
    return this.press !== null;
  }

  /** The drag in progress, if the block is lifted. */
  get dragging(): DragSession | null {
    return this.press?.lifted ? this.press.session : null;
  }

  /** Aborts the press / drag without committing (the host returns the block). */
  abort(): void {
    const p = this.press;
    this.press = null;
    if (p?.lifted) this.host.aborted(p.session);
  }

  /** Per frame: hold-to-lift, the finger-offset glide and BFS path following continue without pointer events. */
  update(now: number): void {
    const p = this.press;
    if (!p) return;
    if (!p.lifted) {
      if (now - p.downAt >= TOKENS.drag.holdMs) this.lift(p, now);
      return;
    }
    if (now - p.liftAt <= TOKENS.duration.fingerOffset || p.path) this.follow(p, now);
  }

  /** Board region of the invisible input zone: crane area top … board bottom, grown by the block hit slop. */
  private onBoard(layout: Layout, x: number, y: number): boolean {
    const slop = layout.touch.hitSlopPx;
    const crane = layout.board.crane;
    const board = layout.board.board;
    return (
      x >= crane.x - slop &&
      x < crane.x + crane.w + slop &&
      y >= crane.y - slop &&
      y < board.y + board.h + slop
    );
  }

  private down(pointer: Phaser.Input.Pointer): void {
    if (this.press) return; // second finger (TECH §4.6)
    const host = this.host;
    const layout = host.layout();
    const x = pointer.worldX;
    const y = pointer.worldY;
    const board = this.onBoard(layout, x, y);
    // R-12: a grab makes pending board motions jump to their end (a locked sequence may start now) …
    if (board) host.fastForward();
    // … and a touch during a locked sequence plays it 3× faster
    host.touched();
    if (!board) return;
    const s = host.boardState();
    if (!s) return;
    const id = pieceAtPoint(s, layout.grid, x, y, layout.touch.hitSlopPx);
    if (id === null) return;
    const attempt = tryBeginDrag(s, id, host.dragRules());
    if (!attempt.ok) {
      host.pickFailed(id, attempt.reason);
      return;
    }
    const view = host.view(id);
    if (!view) return;
    const session = attempt.session;
    const now = host.now();
    this.press = {
      pointerId: pointer.id,
      id,
      session,
      view,
      grab: grabAt(layout.grid, x, y, session.start, session.shape.cells),
      downX: x,
      downY: y,
      downAt: now,
      lastX: x,
      lastY: y,
      lifted: false,
      liftAt: now,
      edges: NO_EDGES,
      path: null,
      ax: session.start.ix,
      ay: session.start.iy,
    };
  }

  private move(pointer: Phaser.Input.Pointer): void {
    const p = this.press;
    if (!p || pointer.id !== p.pointerId) return;
    p.lastX = pointer.worldX;
    p.lastY = pointer.worldY;
    const now = this.host.now();
    if (!p.lifted) {
      if (!exceedsThreshold(p.lastX - p.downX, p.lastY - p.downY, TOKENS.drag.startThresholdPx)) return;
      this.lift(p, now);
      return;
    }
    this.follow(p, now);
  }

  private up(pointer: Phaser.Input.Pointer): void {
    const p = this.press;
    if (!p || pointer.id !== p.pointerId) return;
    this.press = null;
    if (!p.lifted) {
      this.host.tapped(p.id);
      return;
    }
    this.host.released(p.session, p.session.current);
  }

  private lift(p: Press, now: number): void {
    p.lifted = true;
    p.liftAt = now;
    p.edges = edgesOf(p.session.current, p.session.neighbours(p.session.current));
    this.host.lifted(p.session);
    this.host.nodeChanged(p.session, p.session.classify());
    this.follow(p, now);
  }

  /** Sticky follow + drawing (called from the pointer handler: the block moves with this event, TECH §4.6). */
  private follow(p: Press, now: number): void {
    const host = this.host;
    const layout = host.layout();
    const t = (now - p.liftAt) / TOKENS.duration.fingerOffset;
    const target = targetAnchor(layout.grid, p.grab, p.lastX, p.lastY, t, TOKENS.drag.fingerOffsetCells);
    const res = p.session.follow(target.px, target.py);
    if (res.changed) {
      p.edges = edgesOf(res.node, p.session.neighbours(res.node));
      if (res.path.length > 1) {
        p.path = {
          points: [{ ax: p.ax, ay: p.ay }, ...res.path.map((n) => ({ ax: n.ix, ay: n.iy }))],
          start: now,
          ms: pathDurationMs(res.path.length, VIEW.pathMsPerCell, VIEW.pathMaxMs),
        };
      } else p.path = null;
      host.nodeChanged(p.session, p.session.classify(res.node));
    }
    if (res.crossedWall) host.signal('crossedWall', p.session);
    if (res.enteredRail) host.signal('enteredRail', p.session);
    if (res.blockedByWallHeight) host.signal('blockedByWallHeight', p.session);

    const rest = drawAnchor(p.session.current, target, p.edges);
    let pos = rest;
    if (p.path) {
      const u = (now - p.path.start) / p.path.ms;
      if (u >= 1) p.path = null;
      else {
        const pts = p.path.points;
        pos = pathPoint([...pts.slice(0, -1), rest], u);
      }
    }
    p.ax = pos.ax;
    p.ay = pos.ay;
    p.view.pose = { ax: pos.ax, ay: pos.ay, scale: p.view.pose.scale, alpha: p.view.pose.alpha };
    p.view.render(layout, now);
    host.moved(p.session, pos.ax, pos.ay, target.px, target.py, p.lastX, p.lastY);
  }
}
