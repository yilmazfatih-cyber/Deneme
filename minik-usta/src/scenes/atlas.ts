/**
 * Texture pages of the game (docs/TECH_DESIGN.md §10.2, R-05, D-060): the boot atlas (once per game, Boot scene) and
 * the level bake (`level-<id>` pages at level start; the previous level's pages are removed). Frames are looked up by
 * name (theme/textures.ts `FRAME`, `planFrameName`, `blockFrameName` …) through one `Frames` index.
 *
 * WebGL context restore: the pages are `CanvasTexture`s that keep their source canvas, so a defensive `refresh()` of
 * every live page re-uploads them (TECH §10.2 "WebGL bağlam kaybı").
 */
import Phaser from 'phaser';
import {
  BOOT_PAGE,
  LEVEL_PAGE,
  blockFrame,
  blockFrameName,
  bootAtlasFrames,
  frameRef,
  levelFrames,
  limitPage,
  packFrames,
  uploadAtlas,
} from '../theme/textures.ts';
import type { FrameRef, FrameSpec, UploadedAtlas } from '../theme/textures.ts';
import { PLAN_DOT, PLAN_OUTSIDE } from '../core/level/compile.ts';
import type { CompiledLevel } from '../core/level/compile.ts';
import { COLOR_CODES } from '../core/types.ts';
import type { ColorCode } from '../core/types.ts';
import { TOKENS } from '../theme/tokens.ts';

export const BOOT_ATLAS_KEY = 'atlas';
export const levelAtlasKey = (id: number): string => `level-${id}`;

/** Fallback when the renderer does not report a limit (Canvas renderer). */
const DEFAULT_MAX_TEXTURE = 4096;

/** Name → frame lookup over the boot atlas and the current level bake (level frames win on a name clash). */
export class Frames {
  private readonly boot: UploadedAtlas;
  private readonly level: UploadedAtlas | null;

  constructor(boot: UploadedAtlas, level: UploadedAtlas | null) {
    this.boot = boot;
    this.level = level;
  }

  has(name: string): boolean {
    return (this.level?.index.has(name) ?? false) || this.boot.index.has(name);
  }

  /** A missing frame is a programming error (the boot atlas or the level bake did not include it). */
  ref(name: string): FrameRef {
    const own = this.level?.index.get(name);
    return own ?? frameRef(this.boot.index, name);
  }
}

interface AtlasState {
  boot: UploadedAtlas | null;
  level: { id: number; atlas: UploadedAtlas } | null;
  restoreHooked: boolean;
}

const pages = new WeakMap<Phaser.Game, AtlasState>();

function stateOf(game: Phaser.Game): AtlasState {
  let s = pages.get(game);
  if (!s) {
    s = { boot: null, level: null, restoreHooked: false };
    pages.set(game, s);
  }
  return s;
}

function maxTextureSize(game: Phaser.Game): number {
  const r = game.renderer as Phaser.Renderer.WebGL.WebGLRenderer | Phaser.Renderer.Canvas.CanvasRenderer;
  return 'getMaxTextureSize' in r ? r.getMaxTextureSize() : DEFAULT_MAX_TEXTURE;
}

function hookRestore(game: Phaser.Game, st: AtlasState): void {
  if (st.restoreHooked) return;
  st.restoreHooked = true;
  game.renderer.on(Phaser.Renderer.Events.RESTORE_WEBGL, () => {
    st.boot?.refresh();
    st.level?.atlas.refresh();
  });
}

/** TECH §10.2 (a): bakes and uploads the boot atlas the first time; later calls return the same pages. */
export function ensureBootAtlas(game: Phaser.Game): UploadedAtlas {
  const st = stateOf(game);
  if (st.boot && game.textures.exists(BOOT_ATLAS_KEY)) return st.boot;
  const limits = limitPage(BOOT_PAGE, maxTextureSize(game));
  st.boot = uploadAtlas(game.textures, BOOT_ATLAS_KEY, packFrames(bootAtlasFrames(TOKENS), limits));
  hookRestore(game, st);
  return st.boot;
}

/** Frame of a cell filled by the Golden Trowel (K-33, JUICE #17): a one-cell block of the plan colour. */
export const trowelCellFrameName = (color: ColorCode): string => blockFrameName('B1_0', color);

/**
 * One-cell block frames (`blk_B1_<c>`) for every plan colour of the level that the level bake does not already hold:
 * a trowel-filled cell shows "the correct colour" as a block (K-33; TECH §6.4 "hücre doğru renkle dolar").
 */
export function trowelCellFrames(lvl: CompiledLevel, baked: readonly FrameSpec[]): FrameSpec[] {
  const have = new Set(baked.map((f) => f.name));
  const out: FrameSpec[] = [];
  for (const seg of lvl.segments) {
    for (const v of seg.planColors) {
      if (v === PLAN_DOT || v === PLAN_OUTSIDE) continue;
      const color = COLOR_CODES[v];
      if (color === undefined || have.has(trowelCellFrameName(color))) continue;
      have.add(trowelCellFrameName(color));
      out.push(blockFrame({ shape: 'B1_0', color }, TOKENS));
    }
  }
  return out;
}

/**
 * TECH §10.2 (b): bakes level `lvl` (pieces, silhouettes, ghosts, grid and `.` overlays, wall) and removes the previous
 * level's pages. Images using the old pages must be released before (LevelScene.reset).
 */
export function bakeLevelAtlas(game: Phaser.Game, lvl: CompiledLevel): Frames {
  const st = stateOf(game);
  const boot = ensureBootAtlas(game);
  if (st.level && st.level.id === lvl.id && st.level.atlas.keys.every((k) => game.textures.exists(k)))
    return new Frames(boot, st.level.atlas);
  if (st.level) for (const k of st.level.atlas.keys) if (game.textures.exists(k)) game.textures.remove(k);
  const limits = limitPage(LEVEL_PAGE, maxTextureSize(game));
  const frames = levelFrames(lvl, TOKENS);
  const atlas = uploadAtlas(
    game.textures,
    levelAtlasKey(lvl.id),
    packFrames([...frames, ...trowelCellFrames(lvl, frames)], limits),
  );
  st.level = { id: lvl.id, atlas };
  hookRestore(game, st);
  return new Frames(boot, atlas);
}

/** Frames of the boot atlas only (before a level is baked). */
export function bootFrames(game: Phaser.Game): Frames {
  return new Frames(ensureBootAtlas(game), null);
}
