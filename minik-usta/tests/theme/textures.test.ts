import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type Phaser from 'phaser';
import { describe, expect, it } from 'vitest';
import { loadLevel } from '../../src/core/level/compile.ts';
import type { CompiledLevel } from '../../src/core/level/compile.ts';
import { shapeById } from '../../src/core/shapes.ts';
import { COLOR_CODES } from '../../src/core/types.ts';
import type { ShapeId } from '../../src/core/types.ts';
import { TOKENS } from '../../src/theme/tokens.ts';
import { GHOST_STYLES, silhouettePad } from '../../src/theme/draw/block.ts';
import {
  BOOT_PAGE,
  FRAME,
  LEVEL_PAGE,
  blockFrame,
  blockFrameName,
  bootAtlasFrames,
  dotsFrameName,
  frameRef,
  ghostFrameName,
  gridFrameName,
  levelFrames,
  limitPage,
  packFrames,
  planFrameName,
  planFrontFrameName,
  renderPage,
  silhouetteFrameName,
  uploadAtlas,
} from '../../src/theme/textures.ts';
import type { AtlasPage, FrameSpec, PlacedFrame } from '../../src/theme/textures.ts';
import { createRecorder, opsOf, record, styleAt } from './recordingContext.ts';
import type { Recorder } from './recordingContext.ts';

const ROOT = join(import.meta.dirname, '..', '..');

function level(n: number): CompiledLevel {
  const json: unknown = JSON.parse(readFileSync(join(ROOT, 'levels', `level_00${n}.json`), 'utf8'));
  const res = loadLevel(json);
  if (!res.ok) throw new Error(`level ${n} failed to load: ${JSON.stringify(res.issues)}`);
  return res.level;
}

const box = (name: string, w: number, h: number): FrameSpec => ({
  name,
  w,
  h,
  anchorX: 0,
  anchorY: 0,
  aliases: [],
  draw: (ctx) => ctx.fillRect(0, 0, w, h),
});

function expectValidPages(pages: readonly AtlasPage[], gutter: number): void {
  for (const page of pages) {
    const fs = page.frames;
    for (const f of fs) {
      expect(f.x).toBeGreaterThanOrEqual(gutter);
      expect(f.y).toBeGreaterThanOrEqual(gutter);
      expect(f.x + f.w + gutter).toBeLessThanOrEqual(page.width);
      expect(f.y + f.h + gutter).toBeLessThanOrEqual(page.height);
    }
    for (let i = 0; i < fs.length; i++) {
      for (let j = i + 1; j < fs.length; j++) {
        const a = fs[i] as PlacedFrame;
        const b = fs[j] as PlacedFrame;
        const apart =
          a.x + a.w + 2 * gutter <= b.x ||
          b.x + b.w + 2 * gutter <= a.x ||
          a.y + a.h + 2 * gutter <= b.y ||
          b.y + b.h + 2 * gutter <= a.y;
        expect(apart, `${a.name} / ${b.name}`).toBe(true);
      }
    }
    expect(Math.log2(page.width) % 1).toBe(0);
    expect(Math.log2(page.height) % 1).toBe(0);
  }
}

describe('atlas packing (TECH 10.2)', () => {
  it('TECH 10.2 packing is deterministic, gutter-separated and inside the page', () => {
    const frames = [
      box('a', 300, 200),
      box('b', 120, 120),
      box('c', 1000, 90),
      box('d', 800, 200),
      box('e', 64, 64),
    ];
    const a = packFrames(frames, BOOT_PAGE);
    const b = packFrames([...frames].reverse(), BOOT_PAGE);
    expect(a.map((p) => p.frames.map((f) => [f.name, f.x, f.y]))).toEqual(
      b.map((p) => p.frames.map((f) => [f.name, f.x, f.y])),
    );
    expect(a).toHaveLength(1);
    expectValidPages(a, BOOT_PAGE.gutter);
  });

  it('TECH 10.2 frames overflow into extra pages; oversize and duplicate names are errors', () => {
    const many = Array.from({ length: 40 }, (_, i) => box(`f${String(i).padStart(2, '0')}`, 360, 360));
    const pages = packFrames(many, LEVEL_PAGE);
    expect(pages.length).toBeGreaterThan(1);
    expect(pages.flatMap((p) => p.frames)).toHaveLength(40);
    expectValidPages(pages, LEVEL_PAGE.gutter);
    expect(() => packFrames([box('huge', 2048, 10)], LEVEL_PAGE)).toThrow(/exceeds/);
    expect(() => packFrames([box('x', 1, 1), box('x', 2, 2)], LEVEL_PAGE)).toThrow(/duplicate/);
    expect(() => packFrames([box('x', 1, 1), { ...box('y', 1, 1), aliases: ['x'] }], LEVEL_PAGE)).toThrow(
      /duplicate/,
    );
  });

  it('TECH 10.2 a device max texture size below 2048 splits the pages to that size', () => {
    const small = limitPage(BOOT_PAGE, 1024);
    expect([small.maxWidth, small.maxHeight]).toEqual([1024, 1024]);
    const pages = packFrames(bootAtlasFrames(TOKENS), small);
    for (const p of pages) expect(Math.max(p.width, p.height)).toBeLessThanOrEqual(1024);
    expectValidPages(pages, small.gutter);
  });
});

describe('boot atlas (TECH 10.2 a)', () => {
  const frames = bootAtlasFrames(TOKENS);
  const names = frames.flatMap((f) => [f.name, ...f.aliases]);

  it('TECH 10.2 the boot atlas holds the 8 plan cells, ?, front, support hatch, badges and board pieces on one 2048 page', () => {
    for (const c of COLOR_CODES) expect(names).toContain(planFrameName(c));
    for (const c of COLOR_CODES) expect(names).toContain(planFrontFrameName(c));
    for (const n of [FRAME.hidden, FRAME.front, FRAME.supportHatch, FRAME.blueprintFloor, FRAME.gapRail]) {
      expect(names).toContain(n);
    }
    for (const k of ['ok', 'warn', 'support', 'glass', 'cancel']) expect(names).toContain(`ghost_badge_${k}`);
    const pages = packFrames(frames, BOOT_PAGE);
    expect(pages).toHaveLength(1);
    expectValidPages(pages, BOOT_PAGE.gutter);
    const cell = frames.find((f) => f.name === planFrameName('W'));
    expect([cell?.w, cell?.h]).toEqual([TOKENS.layout.grid.cellPx, TOKENS.layout.grid.cellPx]);
  });

  it('TECH 10.2 10.3 ASSET 2-3 frame names follow the docs (board_*, plan_*, blk_sil_*)', () => {
    for (const n of [
      'plan_front',
      'plan_support_hatch',
      'board_ceiling_beam',
      'board_yard_floor',
      'board_blueprint',
      'board_blueprint_corner',
      'board_scaffold_pole',
      'board_scaffold_ledger',
      'board_scaffold_clamp',
      'gap_rail',
    ]) {
      expect(names).toContain(n);
    }
    expect(silhouetteFrameName('L4_270', 'contact')).toBe('blk_sil_L4_270_contact');
    expect(silhouetteFrameName('O4_0', 'crane')).toBe('blk_sil_O4_0_crane');
    expect(ghostFrameName('L4_270', 'valid')).toBe('ghost_L4_270_valid');
  });

  it('ART 10 colour-blind boot atlas: same frame names, different plan art', () => {
    const cb = bootAtlasFrames(TOKENS, { colorBlind: true });
    expect(cb.map((f) => f.name)).toEqual(frames.map((f) => f.name));
    const draw = (fs: readonly FrameSpec[]) =>
      record((ctx) => fs.find((f) => f.name === 'plan_B')?.draw(ctx));
    expect(draw(cb)).not.toEqual(draw(frames));
  });

  it('TECH 10.2 rendering a page is deterministic and every frame is clipped to its rectangle', () => {
    const pages = packFrames(frames, BOOT_PAGE);
    const page = pages[0] as AtlasPage;
    const a = record((ctx) => renderPage(ctx, page));
    const b = record((ctx) => renderPage(ctx, page));
    expect(a).toEqual(b);
    expect(a[0]).toEqual(['clearRect', 0, 0, page.width, page.height]);
    const rects = opsOf(a, 'rect').filter((o, i, all) => all.indexOf(o) === i);
    for (const f of page.frames) expect(rects).toContainEqual(['rect', 0, 0, f.w, f.h]);
    expect(opsOf(a, 'translate').slice(0, page.frames.length).length).toBe(page.frames.length);
  });
});

describe('level bake (TECH 10.2 b, D-060)', () => {
  const expectedCombos = (lv: CompiledLevel): Set<string> => {
    const out = new Set<string>();
    for (const b of lv.data.yard.batches) {
      for (const p of b.pieces) out.add(blockFrameName(shapeById(p.shape).canonical, p.color));
    }
    return out;
  };

  for (const n of [1, 2, 3, 4, 5]) {
    it(`TECH 10.2 level ${n}: one frame per (shape × colour × flags) incl. truck batches, + silhouettes, ghosts, grid, wall`, () => {
      const lv = level(n);
      const frames = levelFrames(lv, TOKENS);
      const names = frames.flatMap((f) => [f.name, ...f.aliases]);
      const blocks = new Set(names.filter((x) => x.startsWith('blk_') && !x.startsWith('blk_sil_')));
      expect(blocks).toEqual(expectedCombos(lv));
      const shapes = new Set([...blocks].map((b) => b.split('_').slice(1, 3).join('_') as ShapeId));
      for (const s of shapes) {
        for (const k of ['contact', 'lifted', 'crane'] as const)
          expect(names).toContain(silhouetteFrameName(s, k));
        for (const st of GHOST_STYLES) expect(names).toContain(ghostFrameName(s, st));
        expect(names).not.toContain(ghostFrameName(s, 'body'));
      }
      for (const seg of lv.segments) expect(names).toContain(gridFrameName(seg.height));
      expect(names.includes(FRAME.wall)).toBe(lv.wallHeight > 0);
      const pages = packFrames(frames, LEVEL_PAGE);
      expect(pages.length).toBeLessThanOrEqual(2);
      expectValidPages(pages, LEVEL_PAGE.gutter);
      // Every frame draws without throwing and deterministically.
      const page = pages[0] as AtlasPage;
      expect(record((ctx) => renderPage(ctx, page))).toEqual(record((ctx) => renderPage(ctx, page)));
    });
  }

  it('S2 level 4 bakes the "." overlay of its plan; levels without "." do not', () => {
    expect(levelFrames(level(4), TOKENS).map((f) => f.name)).toContain(dotsFrameName(0));
    expect(levelFrames(level(1), TOKENS).map((f) => f.name)).not.toContain(dotsFrameName(0));
  });

  it('S1 level 5 has two plans of height 4 sharing one grid overlay frame', () => {
    const lv = level(5);
    expect(lv.segments.map((s) => s.height)).toEqual([4, 4]);
    expect(levelFrames(lv, TOKENS).filter((f) => f.name.startsWith('grid_'))).toHaveLength(1);
  });

  it('W1 level 3 wall frame is anchored on the wall strip (cap above, 6 px overhang)', () => {
    const wall = levelFrames(level(3), TOKENS).find((f) => f.name === FRAME.wall);
    expect(wall).toMatchObject({ w: 72, h: 6 * 120 + 20, anchorX: 6, anchorY: 20 });
  });

  it('TECH 10.2 silhouette frames are anchored on the block box; crane aliases lifted when the blurs match', () => {
    const frames = levelFrames(level(2), TOKENS);
    const shape = shapeById('O4_0').id;
    const lifted = frames.find((f) => f.name === silhouetteFrameName(shape, 'lifted'));
    const pad = silhouettePad('lifted', TOKENS);
    expect(lifted).toMatchObject({ anchorX: pad, anchorY: pad });
    expect(TOKENS.shadow.crane.blur).toBe(TOKENS.shadow.lifted.blur);
    expect(lifted?.aliases).toEqual([silhouetteFrameName(shape, 'crane')]);
  });

  it('TECH 10.2 on-demand bake of a new colour combination (paint booster) uses the same frame naming', () => {
    const f = blockFrame({ shape: 'D2_0', color: 'P' }, TOKENS);
    expect([f.name, f.w, f.h]).toEqual(['blk_D2_0_P', 120, 240]);
  });
});

interface FakeTexture {
  readonly key: string;
  readonly width: number;
  readonly height: number;
  readonly rec: Recorder;
  readonly added: unknown[][];
  refreshes: number;
}

function fakeTextureManager(preexisting: readonly string[] = []) {
  const existing = new Set(preexisting);
  const removed: string[] = [];
  const created: FakeTexture[] = [];
  const manager = {
    exists: (k: string) => existing.has(k),
    remove: (k: string) => {
      removed.push(k);
      existing.delete(k);
    },
    createCanvas: (key: string, width: number, height: number) => {
      const rec = createRecorder();
      const tex: FakeTexture & { context: unknown; add: (...a: unknown[]) => null; refresh: () => unknown } =
        {
          key,
          width,
          height,
          rec,
          added: [],
          refreshes: 0,
          context: rec.ctx,
          add: (...a: unknown[]) => {
            tex.added.push(a);
            return null;
          },
          refresh: () => {
            tex.refreshes++;
            return tex;
          },
        };
      created.push(tex);
      existing.add(key);
      return tex;
    },
  };
  return { textures: manager as unknown as Phaser.Textures.TextureManager, created, removed };
}

describe('Phaser upload, isolated in uploadAtlas (TECH 10.2, R-05)', () => {
  it('TECH 10.2 one CanvasTexture per page, every frame and alias added, ONE refresh per page', () => {
    const frames = levelFrames(level(5), TOKENS);
    const pages = packFrames(frames, LEVEL_PAGE);
    const fake = fakeTextureManager();
    const atlas = uploadAtlas(fake.textures, 'level-5', pages);
    expect(atlas.keys).toEqual(pages.map((_, i) => (i === 0 ? 'level-5' : `level-5#${i}`)));
    expect(fake.created.map((t) => [t.key, t.width, t.height])).toEqual(
      pages.map((p, i) => [atlas.keys[i], p.width, p.height]),
    );
    for (const t of fake.created) expect(t.refreshes).toBe(1);
    const addedNames = fake.created.flatMap((t) => t.added.map((a) => a[0]));
    expect(new Set(addedNames)).toEqual(new Set(frames.flatMap((f) => [f.name, ...f.aliases])));
    for (const [i, page] of pages.entries()) {
      const t = fake.created[i] as FakeTexture;
      expect(t.rec.ops).toEqual(record((ctx) => renderPage(ctx, page)));
      for (const f of page.frames) expect(t.added).toContainEqual([f.name, 0, f.x, f.y, f.w, f.h]);
    }
    const home = pages.findIndex((p) => p.frames.some((f) => f.name === 'blk_O4_0_W'));
    const ref = frameRef(atlas.index, 'blk_O4_0_W');
    expect(ref.key).toBe(atlas.keys[home]);
    expect(ref).toMatchObject({ frame: 'blk_O4_0_W', w: 240, h: 240, anchorX: 0, anchorY: 0 });
    expect(frameRef(atlas.index, silhouetteFrameName('O4_0', 'crane')).frame).toBe(
      silhouetteFrameName('O4_0', 'crane'),
    );
    expect(() => frameRef(atlas.index, 'blk_Q9_0_W')).toThrow(/not baked/);
    atlas.refresh();
    for (const t of fake.created) expect(t.refreshes).toBe(2);
  });

  it('ART 10 re-baking (colour-blind switch) replaces the texture with the same key', () => {
    const fake = fakeTextureManager(['atlas']);
    const atlas = uploadAtlas(
      fake.textures,
      'atlas',
      packFrames(bootAtlasFrames(TOKENS, { colorBlind: true }), BOOT_PAGE),
    );
    expect(fake.removed).toEqual(['atlas']);
    expect(atlas.keys).toEqual(['atlas']);
    const plan = fake.created[0]?.rec.ops ?? [];
    expect(styleAt(plan, 'fill', 'fillStyle').length).toBeGreaterThan(0);
  });
});
