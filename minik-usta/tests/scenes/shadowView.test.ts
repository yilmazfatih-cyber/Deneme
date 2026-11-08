/**
 * ShadowView on a recording fake scene (UX_FLOWS §5.4, D-014, K-12, K-18, K-34 hook 2; review Faz 2 tur 1 #0, #1, #2).
 * `phaser` is mocked (the view only reads `TintModes` at runtime); images record what the view sets on them.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('phaser', () => ({ default: { TintModes: { FILL: 1 }, BlendModes: { ADD: 1, NORMAL: 0 } } }));

import { computeFall } from '../../src/core/gravity.ts';
import { GameSession } from '../../src/core/session.ts';
import { shapeByIndex } from '../../src/core/shapes.ts';
import { COLOR_CODES } from '../../src/core/types.ts';
import { DEPTH, overTutorial } from '../../src/scenes/level/depth.ts';
import { PieceView } from '../../src/scenes/level/PieceView.ts';
import { ShadowView } from '../../src/scenes/level/ShadowView.ts';
import { shadowLook } from '../../src/scenes/level/shadowLook.ts';
import { createLayout } from '../../src/theme/layout.ts';
import { FRAME } from '../../src/theme/textures.ts';
import type { FrameRef } from '../../src/theme/textures.ts';
import { TOKENS } from '../../src/theme/tokens.ts';
import { N, RAIL, levelFile } from '../core/moves.fixtures.ts';

class FakeImage {
  x = 0;
  y = 0;
  depth = 0;
  visible = true;
  alpha = 1;
  scaleX = 1;
  scaleY = 1;
  frame = '';
  crop: number[] | null = null;
  setDepth(d: number): this {
    this.depth = d;
    return this;
  }
  setVisible(v: boolean): this {
    this.visible = v;
    return this;
  }
  setTexture(_key: string, frame: string): this {
    this.frame = frame;
    return this;
  }
  setOrigin(): this {
    return this;
  }
  setScale(x: number, y = x): this {
    this.scaleX = x;
    this.scaleY = y;
    return this;
  }
  setPosition(x: number, y: number): this {
    this.x = x;
    this.y = y;
    return this;
  }
  setTint(): this {
    return this;
  }
  setTintMode(): this {
    return this;
  }
  setAlpha(a: number): this {
    this.alpha = a;
    return this;
  }
  setCrop(...args: number[]): this {
    this.crop = args;
    return this;
  }
}

function fakeView(): { view: ShadowView; images: FakeImage[] } {
  const images: FakeImage[] = [];
  const scene = {
    add: {
      image: () => {
        const img = new FakeImage();
        images.push(img);
        return img;
      },
    },
  };
  const ref = (name: string): FrameRef => {
    const w = name === FRAME.fallPath ? 10 : name.startsWith('ghost_badge') ? 44 : 120;
    const h = name === FRAME.fallPath ? 960 : w;
    return { key: 'atlas', frame: name, w, h, anchorX: 0, anchorY: 0 };
  };
  const view = new ShadowView(scene as never);
  view.setFrames({ ref } as never, (u) => u);
  return { view, images };
}

const layout = createLayout(TOKENS, 1920);

/** Level 4 (easy): the W D2_90 parked on the gap rail at (6, 3) — right colour, nothing under it (K-34 support). */
function level4Rail(): {
  fall: ReturnType<typeof computeFall>;
  pieceId: number;
  state: GameSession['state'];
} {
  const lvl = levelFile(4);
  const { state } = GameSession.start(lvl);
  const w = COLOR_CODES.indexOf('W');
  const piece = lvl.pieces.find((p) => shapeByIndex(p.shapeIndex).id === 'D2_90' && p.colorIndex === w);
  if (!piece) throw new Error('level 4 has no W D2_90 piece');
  return { fall: computeFall(state, piece.id, RAIL(0, 6, 3)), pieceId: piece.id, state };
}

describe('fall shadow view (UX 5.4, D-014)', () => {
  it('K-12 / K-18 rail look draws outline and badge above the dragged block and follows its lift scale', () => {
    const { view, images } = fakeView();
    const { fall, pieceId, state } = level4Rail();
    const shape = shapeByIndex(state.lvl.pieces[pieceId]?.shapeIndex ?? 0);
    const look = shadowLook(fall, 'easy', { state, pieceId });
    expect(look.body).toBe(false);
    expect(look.badge).toBe('support');
    view.showFall(layout, 0, look, shape, fall.landing, 'blk', 'W');
    const box = layout.grid.pieceRect(fall.landing.ix, fall.landing.iy, shape.w, shape.h);
    const cx = box.x + box.w / 2 + 5;
    const cy = box.y + box.h / 2 - 30;
    view.follow({ cx, cy, scale: 1.08 });
    expect(view.depths.outline).toBeGreaterThan(DEPTH.draggedBlock);
    expect(view.depths.badge).toBeGreaterThan(DEPTH.draggedBlock);
    const outline = images.find((i) => i.frame.startsWith('ghost_D2_90_'));
    const badge = images.find((i) => i.frame === 'ghost_badge_support');
    expect(outline?.visible).toBe(true);
    expect(badge?.visible).toBe(true);
    expect([outline?.x, outline?.y, outline?.scaleX]).toEqual([cx, cy, 1.08]);
    // the badge stays on the top-right cell of the drawn (lifted) block
    expect(badge?.x ?? 0).toBeGreaterThan(cx);
    expect(badge?.y ?? 0).toBeLessThan(cy);
    expect(view.pathCount).toBe(0); // no fall on the rail: no fall path
  });

  it('K-18 a free fall keeps the shadow under the dragged block and draws one fall path per column (UX 5.4 Düşüş yolu)', () => {
    const { view, images } = fakeView();
    const { state } = GameSession.start(levelFile(1));
    const fall = computeFall(state, 1, N(6, 8));
    const shape = shapeByIndex(state.lvl.pieces[1]?.shapeIndex ?? 0);
    const look = shadowLook(fall, 'easy', { state, pieceId: 1 });
    view.showFall(layout, 0, look, shape, fall.landing, 'blk', 'W');
    const block = layout.grid.pieceRect(6, 8, shape.w, shape.h);
    view.follow({ cx: block.x + block.w / 2, cy: block.y + block.h / 2, scale: 1.08 });
    expect(view.depths.outline).toBeLessThan(DEPTH.draggedBlock);
    expect(view.pathCount).toBe(shape.w);
    const paths = images.filter((i) => i.frame === FRAME.fallPath && i.visible);
    for (const p of paths) expect(p.depth).toBe(DEPTH.fallShadow);
    view.showCancel(layout, shape, 6, 8);
    expect(view.pathCount).toBe(0); // hidden in the cancel preview
  });

  it('UX 5.4 wrong colour: the 45° hatch (ghost_hatch45) covers the mismatched landing cells and pulses with the outline', () => {
    const { view, images } = fakeView();
    const { state } = GameSession.start(levelFile(1));
    const fall = computeFall(state, 1, N(6, 8)); // W block onto the Y row
    expect(fall.verdict.reasons[0]).toBe('color');
    const shape = shapeByIndex(state.lvl.pieces[1]?.shapeIndex ?? 0);
    const look = shadowLook(fall, 'easy', { state, pieceId: 1 });
    expect(look.mismatchCells.length).toBeGreaterThan(0);
    view.showFall(layout, 0, look, shape, fall.landing, 'blk', 'W');
    const hatches = images.filter((i) => i.frame === FRAME.wrongHatch && i.visible);
    expect(hatches).toHaveLength(look.mismatchCells.length);
    for (const h of hatches) expect(h.depth).toBe(DEPTH.fallShadow + 1);
    view.update(125); // 2 Hz: a quarter period later the pulse is at its low point
    for (const h of hatches) expect(h.alpha).toBeLessThan(1);
  });
});

describe('UX 13.1 drag above the tutorial spotlight (review Faz 2 tur 2 #1)', () => {
  it('UX 13.1 the dragged block and its shadow look draw above the spotlight during a drag', () => {
    // the shadow: every part (body, outline, badge, hatches, fall path, cancel badge) above the bubble, under the windows
    const { view, images } = fakeView();
    const { state } = GameSession.start(levelFile(1));
    const fall = computeFall(state, 1, N(6, 8)); // wrong colour: body, outline, badge, 45° hatch, fall path
    const shape = shapeByIndex(state.lvl.pieces[1]?.shapeIndex ?? 0);
    const look = shadowLook(fall, 'easy', { state, pieceId: 1 });
    view.setRaised(true);
    view.showFall(layout, 0, look, shape, fall.landing, 'blk', 'W');
    const block = layout.grid.pieceRect(6, 8, shape.w, shape.h);
    view.follow({ cx: block.x + block.w / 2, cy: block.y + block.h / 2, scale: 1.08 });
    view.showCancel(layout, shape, 6, 8);
    const raised = view.allDepths;
    expect(raised.length).toBeGreaterThan(4);
    for (const d of raised) {
      expect(d).toBeGreaterThan(DEPTH.tutorial + 4); // the Usta Dede bubble
      expect(d).toBeLessThan(DEPTH.windows);
    }
    // the order inside the stack is kept: ghost body < outline < badge < cancel badge
    const depthOf = (frame: string): number =>
      images.find((i) => i.frame === frame && i.visible)?.depth ?? NaN;
    expect(depthOf('blk')).toBeLessThan(view.depths.outline);
    expect(view.depths.outline).toBeLessThan(view.depths.badge);
    expect(view.depths.badge).toBeLessThan(depthOf('ghost_badge_cancel'));
    // release: back under the spotlight
    view.setRaised(false);
    view.hideCancel();
    for (const d of view.allDepths) expect(d).toBeLessThan(DEPTH.hud);

    // the dragged block (image, flash overlay, lifted silhouette) — over its own shadow look, under the windows
    const made: Record<string, unknown>[] = [];
    const fakeImg = (): Record<string, unknown> => {
      const o: Record<string, unknown> = { depth: 0, visible: false, frame: { realWidth: 1, realHeight: 1 } };
      const proxy = new Proxy(o, {
        get(target, key: string) {
          if (key in target) return target[key];
          return (...args: unknown[]) => {
            if (key === 'setDepth') target['depth'] = args[0];
            if (key === 'setVisible') target['visible'] = args[0];
            return proxy;
          };
        },
      });
      made.push(o);
      return proxy;
    };
    const scene = { add: { image: fakeImg } };
    const pv = new PieceView(scene as never);
    const ref = (name: string): FrameRef => ({
      key: 'atlas',
      frame: name,
      w: 240,
      h: 120,
      anchorX: 0,
      anchorY: 0,
    });
    pv.bind(1, shape, 'blk', { ref } as never);
    const depths = (): number[] => made.map((o) => o['depth'] as number);
    for (const d of depths()) expect(d).toBeLessThan(DEPTH.hud);
    pv.beginDrag(0, { scale: 1.08, ms: 80, ease: (u) => u, hopPx: 6 });
    const [silhouette, image, overlay] = depths();
    expect(silhouette).toBeGreaterThan(DEPTH.tutorial + 4);
    expect(image).toBeGreaterThan(silhouette ?? Infinity);
    expect(overlay).toBeGreaterThan(image ?? Infinity);
    expect(overlay).toBeLessThan(DEPTH.windows);
    expect(image).toBe(overTutorial(DEPTH.draggedBlock));
    pv.endDrag();
    for (const d of depths()) expect(d).toBeLessThan(DEPTH.hud);
  });
});
