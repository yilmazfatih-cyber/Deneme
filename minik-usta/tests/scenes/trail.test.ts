/**
 * JUICE #6 wall pass ("3 hayalet beyaz %30 → 0, 200 ms") against JUICE #3 drag trail ("3 karelik soluk iz (%25)" above
 * `drag.trailMinSpeedCells`) on the EventPlayer's `GhostTrails` (review Faz 2 tur 4 #1). One `DragController.follow`
 * sends `crossedWall` (#6) and then `moved` (#3); the handlers run against the real trails on a recording fake scene.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('phaser', () => ({ default: { TintModes: { FILL: 1 }, BlendModes: { ADD: 1, NORMAL: 0 } } }));

import { JUICE_HANDLERS } from '../../src/scenes/level/juice/handlers.ts';
import type { JuiceCue, JuiceStage } from '../../src/scenes/level/juice/stage.ts';
import { GhostTrails } from '../../src/scenes/level/Trail.ts';
import type { PieceView } from '../../src/scenes/level/PieceView.ts';
import { JUICE_VIEW } from '../../src/scenes/level/viewConstants.ts';
import { TOKENS } from '../../src/theme/tokens.ts';

const WHITE = 0xffffff;
const FRAME_MS = 16;

class FakeImage {
  x = 0;
  y = 0;
  depth = 5;
  visible = false;
  alpha = 1;
  scaleX = 1;
  scaleY = 1;
  angle = 0;
  tint: number | null = null;
  texture = { key: 'lvl' };
  frame = { name: 'blk' };
  setTexture(): this {
    return this;
  }
  setOrigin(): this {
    return this;
  }
  setDepth(d: number): this {
    this.depth = d;
    return this;
  }
  setBlendMode(): this {
    return this;
  }
  clearTint(): this {
    this.tint = null;
    return this;
  }
  setTint(t: number): this {
    this.tint = t;
    return this;
  }
  setTintMode(): this {
    return this;
  }
  setPosition(x: number, y: number): this {
    this.x = x;
    this.y = y;
    return this;
  }
  setScale(x: number, y = x): this {
    this.scaleX = x;
    this.scaleY = y;
    return this;
  }
  setAngle(a: number): this {
    this.angle = a;
    return this;
  }
  setAlpha(a: number): this {
    this.alpha = a;
    return this;
  }
  setVisible(v: boolean): this {
    this.visible = v;
    return this;
  }
}

interface Rig {
  readonly trails: GhostTrails;
  readonly view: { readonly image: FakeImage; readonly bound: boolean };
  readonly stage: JuiceStage;
}

function rig(): Rig {
  const scene = { add: { image: () => new FakeImage() } };
  const trails = new GhostTrails(scene as never);
  const view = { image: new FakeImage(), bound: true };
  const target: Record<string, unknown> = {
    pieceBox: () => null,
    // EventPlayer.trail without its instant-board guard
    trail: (_id: number, time: number, frames: number, alpha: number, tint: number | null, ms: number) =>
      trails.begin(view as unknown as PieceView, time, frames, alpha, tint, ms),
  };
  const stage = new Proxy(target, {
    get: (t, k) => t[k as string] ?? (() => undefined),
  }) as unknown as JuiceStage;
  return { trails, view, stage };
}

const cue = (id: 3 | 6, time: number, extra: Partial<JuiceCue>): JuiceCue =>
  ({ id, time, ms: 0, reduced: false, instant: false, ev: null, piece: 0, ...extra }) as JuiceCue;

interface Ghost {
  readonly tint: number | null;
  readonly alpha: number;
}

/** The visible ghosts of one pool, copied (the pool reuses its images every frame). */
const visible = (t: GhostTrails, kind: 'block' | 'wall'): Ghost[] =>
  (t[kind] as unknown as { ghosts: FakeImage[] }).ghosts
    .filter((g) => g.visible)
    .map((g) => ({ tint: g.tint, alpha: g.alpha }));

/**
 * A wall crossing at `t0` with the block moving at `speed` cells/s: #6 then #3 in the crossing frame, then #3 on every
 * drawn frame while the block keeps moving. Returns the visible ghosts of both pools per frame.
 */
function crossing(speed: number, frames: number): { t: number; wall: Ghost[]; block: Ghost[] }[] {
  const { trails, view, stage } = rig();
  const t0 = 1000;
  const wallMs = TOKENS.duration.wallPass;
  JUICE_HANDLERS[6](cue(6, t0, { ms: wallMs, dx: 1 }), stage);
  const out: { t: number; wall: Ghost[]; block: Ghost[] }[] = [];
  for (let f = 0; f <= frames; f++) {
    const t = t0 + f * FRAME_MS;
    JUICE_HANDLERS[3](cue(3, t, { dx: speed, dy: speed }), stage);
    view.image.setPosition(f * 10, 0);
    trails.update(t);
    out.push({
      t: t - t0,
      wall: visible(trails, 'wall'),
      block: visible(trails, 'block'),
    });
  }
  return out;
}

describe('JUICE #6 wall-pass ghosts vs #3 drag trail (review Faz 2 tur 4 #1)', () => {
  it('JUICE 6 a fast wall pass (> drag.trailMinSpeedCells) keeps the 3 white ghosts, fading, for the whole 200 ms', () => {
    const speed = TOKENS.drag.trailMinSpeedCells + 4;
    const wallMs = TOKENS.duration.wallPass;
    const frames = crossing(speed, Math.ceil(wallMs / FRAME_MS) + 2);
    const during = frames.filter((f) => f.t >= 3 * FRAME_MS && f.t < wallMs);
    expect(during.length).toBeGreaterThan(5);
    let last = Number.POSITIVE_INFINITY;
    for (const f of during) {
      expect(f.wall.length, `t=${f.t}`).toBe(JUICE_VIEW.wallTrailFrames);
      for (const g of f.wall) expect(g.tint).toBe(WHITE);
      const a = f.wall[0]?.alpha ?? 0;
      expect(a).toBeLessThanOrEqual(JUICE_VIEW.wallTrailAlpha);
      expect(a).toBeLessThan(last); // 30 % → 0
      last = a;
      // the #3 trail still runs on its own pool (the block itself, no tint)
      expect(f.block.length).toBeGreaterThan(0);
      for (const g of f.block) expect(g.tint).toBeNull();
    }
    // the white ghosts end with their 200 ms; the drag trail goes on while the block is fast
    const after = frames.filter((f) => f.t >= wallMs);
    expect(after.length).toBeGreaterThan(0);
    for (const f of after) {
      expect(f.wall).toEqual([]);
      expect(f.block.length).toBeGreaterThan(0);
    }
  });

  it('JUICE 6 a slow wall pass shows only the white ghosts (no #3 trail under drag.trailMinSpeedCells)', () => {
    const frames = crossing(TOKENS.drag.trailMinSpeedCells - 4, 6);
    const shown = frames.filter((f) => f.t >= 3 * FRAME_MS);
    for (const f of shown) {
      expect(f.wall.length).toBe(JUICE_VIEW.wallTrailFrames);
      for (const g of f.wall) expect(g.tint).toBe(WHITE);
      expect(f.block).toEqual([]);
    }
  });
});
