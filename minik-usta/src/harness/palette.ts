/**
 * Harness-only palette fixture (review Faz 2 tur 1 #10, shot `19-palette`; TECH §12.2): levels 1–5 use only W, Y, G and
 * R, so the readability of all 8 block / plan colours at phone size is reviewed here — per colour a placed block (the
 * level-bake drawer, 1 × 1), its plan cell and the build-front variant with the `plan_front` contour; then a `.` window
 * cell and a `?` cell, all on the blueprint floor. Frames come from the theme drawers and the boot atlas; no game state.
 */
import Phaser from 'phaser';
import { scaleMode } from '../config/display.ts';
import { COLOR_CODES } from '../core/types.ts';
import { BOOT_ATLAS_KEY } from '../scenes/atlas.ts';
import { appSave } from '../scenes/appServices.ts';
import { drawPlanDots } from '../theme/draw/plan.ts';
import { createLayout, designHeight } from '../theme/layout.ts';
import {
  FRAME,
  LEVEL_PAGE,
  blockFrame,
  blockFrameName,
  packFrames,
  planFrameName,
  planFrontFrameName,
  uploadAtlas,
} from '../theme/textures.ts';
import type { FrameSpec } from '../theme/textures.ts';
import { TOKENS } from '../theme/tokens.ts';

export const PALETTE_SCENE_KEY = 'HarnessPalette';
const ATLAS_KEY = 'harness-palette';
const DOTS_FRAME = 'harness_dots_1';

export class PaletteScene extends Phaser.Scene {
  constructor() {
    super(PALETTE_SCENE_KEY);
  }

  create(): void {
    const parent = this.scale.parentSize;
    const L = createLayout(
      TOKENS,
      designHeight(scaleMode, { width: parent.width, height: parent.height }, TOKENS),
    );
    const sky = TOKENS.color.chapter.ch1;
    this.cameras.main.setBackgroundColor(sky.skyTop);
    const c = L.grid.cellPx;
    const mode = { colorBlind: appSave().data.settings.colorblind };
    const specs: FrameSpec[] = COLOR_CODES.map((color) =>
      blockFrame({ shape: 'B1_0', color, flags: [], mode }, TOKENS),
    );
    specs.push({
      name: DOTS_FRAME,
      w: c,
      h: c,
      anchorX: 0,
      anchorY: 0,
      aliases: [],
      draw: (ctx) => drawPlanDots(ctx, { rows: 1, cols: 1, dots: [{ x: 0, y: 0 }] }, TOKENS),
    });
    uploadAtlas(this.textures, ATLAS_KEY, packFrames(specs, LEVEL_PAGE));

    const gap = 24;
    const cols = 3;
    const w = cols * c + (cols - 1) * gap;
    const x0 = (L.W - w) / 2;
    const rows = COLOR_CODES.length + 1;
    const y0 = Math.max(TOKENS.layout.marginPx, (L.H - rows * (c + gap)) / 2);
    const floor = this.add
      .image(x0 - gap, y0 - gap, BOOT_ATLAS_KEY, FRAME.blueprintFloor)
      .setOrigin(0, 0)
      .setDisplaySize(w + 2 * gap, rows * (c + gap) + gap);
    floor.setDepth(0);
    COLOR_CODES.forEach((color, i) => {
      const y = y0 + i * (c + gap);
      this.add.image(x0, y, ATLAS_KEY, blockFrameName('B1_0', color)).setOrigin(0, 0).setDepth(2);
      this.add
        .image(x0 + c + gap, y, BOOT_ATLAS_KEY, planFrameName(color))
        .setOrigin(0, 0)
        .setDepth(1);
      const fx = x0 + 2 * (c + gap);
      this.add.image(fx, y, BOOT_ATLAS_KEY, planFrontFrameName(color)).setOrigin(0, 0).setDepth(1);
      this.add.image(fx, y, BOOT_ATLAS_KEY, FRAME.front).setOrigin(0, 0).setDepth(2);
    });
    const y = y0 + COLOR_CODES.length * (c + gap);
    this.add
      .image(x0 + c + gap, y, ATLAS_KEY, DOTS_FRAME)
      .setOrigin(0, 0)
      .setDepth(1);
    this.add
      .image(x0 + 2 * (c + gap), y, BOOT_ATLAS_KEY, FRAME.hidden)
      .setOrigin(0, 0)
      .setDepth(1);
  }
}
