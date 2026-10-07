/**
 * The block views of the board, kept in step with the core state (docs/TECH_DESIGN.md §1.4: the scene never changes
 * the state; it re-syncs its views from it). A piece has a view while it is visible: in the yard, or on the site in
 * the segment shown there (K-22); queued, pending and gone pieces have none. Views come from a `Pool` (48 ready,
 * TECH §10.4).
 */
import type Phaser from 'phaser';
import { shapeByIndex } from '../../core/shapes.ts';
import { pieceShape } from '../../core/state.ts';
import type { GameState } from '../../core/state.ts';
import type { PieceId } from '../../core/types.ts';
import type { Layout } from '../../theme/layout.ts';
import type { Frames } from '../atlas.ts';
import { pieceFrameName, statePose } from './pieceState.ts';
import { PieceView } from './PieceView.ts';
import { Pool } from './Pool.ts';
import { PIECE_POOL_PREWARM } from './viewConstants.ts';

export class PieceLayer {
  private readonly pool: Pool<PieceView>;
  private readonly byId = new Map<PieceId, PieceView>();
  private frames: Frames | null = null;

  /** `onRelease` runs before a view goes back to the pool (the EventPlayer finishes the view's animations). */
  constructor(scene: Phaser.Scene, onRelease: (v: PieceView) => void = () => undefined) {
    this.pool = new Pool(
      () => new PieceView(scene),
      (v) => {
        onRelease(v);
        v.unbind();
      },
    ).prewarm(PIECE_POOL_PREWARM);
  }

  /** Every bound view (EventPlayer group transforms, site glow). */
  views(): IterableIterator<PieceView> {
    return this.byId.values();
  }

  setFrames(frames: Frames): void {
    this.frames = frames;
  }

  view(id: PieceId): PieceView | undefined {
    return this.byId.get(id);
  }

  /** Releases every view (level change). */
  clear(): void {
    for (const v of this.byId.values()) this.pool.release(v);
    this.byId.clear();
  }

  /**
   * Re-syncs with the state: views for newly visible pieces (at their state pose), released views for pieces that left
   * the board, frames refreshed (colour, flags), and every resting, undragged view snapped to its state pose. Views
   * with a running track keep it (its last leg ends at the state pose). Returns the ids that got a new view.
   */
  sync(s: GameState): PieceId[] {
    const frames = this.frames;
    if (!frames) return [];
    const added: PieceId[] = [];
    const count = s.lvl.layout.counts.pieces;
    for (let id = 0; id < count; id++) {
      const pose = statePose(s, id);
      let view = this.byId.get(id);
      if (!pose) {
        if (view && !view.track && !view.isDragged) {
          this.pool.release(view);
          this.byId.delete(id);
        }
        continue;
      }
      if (!view) {
        view = this.pool.acquire();
        view.bind(id, shapeByIndex(pieceShape(s, id)), pieceFrameName(s, id), frames);
        view.pose = pose;
        this.byId.set(id, view);
        added.push(id);
        continue;
      }
      view.setBlockFrame(pieceFrameName(s, id));
      if (!view.track && !view.isDragged) view.pose = pose;
    }
    return added;
  }

  /** R-12: every running track jumps to its end (its final pose = the state pose). */
  finishTracks(): void {
    for (const [id, v] of [...this.byId]) {
      if (!v.track) continue;
      v.pose = v.track.final;
      v.track = null;
      v.setFlying(false);
      if (v.hideAtEnd) {
        this.pool.release(v);
        this.byId.delete(id);
      }
    }
  }

  /** Latest end time of the running tracks (or `now` when none runs). */
  busyUntil(now: number): number {
    let end = now;
    for (const v of this.byId.values()) if (v.track) end = Math.max(end, v.track.end);
    return end;
  }

  /** Per frame: advances the tracks and positions every view. */
  update(layout: Layout, now: number): void {
    for (const [id, v] of this.byId) {
      if (v.track) {
        v.pose = v.track.at(now);
        if (now >= v.track.end) {
          v.pose = v.track.final;
          v.track = null;
          v.setFlying(false);
          if (v.hideAtEnd) {
            this.pool.release(v);
            this.byId.delete(id);
            continue;
          }
        }
      }
      if (!v.isDragged) v.render(layout, now);
    }
  }

  /** Pool statistics (tests, debug). */
  get poolSize(): number {
    return this.pool.size;
  }
}
