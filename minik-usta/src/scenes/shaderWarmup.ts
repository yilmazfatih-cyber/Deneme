/**
 * Image batch shader warm-up (TECH §10.6 "sürükleme karelerinde soğuk kod yok"; review Faz 2 tur 4 #0).
 *
 * Phaser 4 builds one program of its image batch handler (`BatchHandlerQuad`) per number of textures a sub-batch binds
 * (`finalizeTextureCount(entry.unit)` → `ProgramManager.getCurrentProgramSuite`), on first use. A count first reached
 * inside a drag (the lifted block, its shadow and the drag cues add textures to a batch) compiled and linked a program
 * in that frame: the only program link of a level 1–5 run, ≈ 4–5 ms at 4× CPU in the first lift of level 1. The
 * warm-up builds the variants 1 … `maxTexturesPerBatch` ahead, one per idle frame. On mobile Phaser batches one
 * texture (`autoMobileTextures`), so there is nothing left to build there.
 */
import Phaser from 'phaser';

export class ShaderWarmup {
  private readonly game: Phaser.Game;
  private next = 1;
  private done = false;

  constructor(game: Phaser.Game) {
    this.game = game;
  }

  /** Builds the next missing variant; returns `true` once every variant exists (or there is no WebGL renderer). */
  step(): boolean {
    if (this.done) return true;
    const renderer = this.game.renderer;
    if (!(renderer instanceof Phaser.Renderer.WebGL.WebGLRenderer)) return (this.done = true);
    const node = renderer.renderNodes.getNode('BatchHandlerQuad');
    if (!(node instanceof Phaser.Renderer.WebGL.RenderNodes.BatchHandlerQuad)) return (this.done = true);
    const max = Math.max(1, node.maxTexturesPerBatch);
    if (this.next > max) return (this.done = true);
    try {
      // the next `run` sets the count of its own sub-batch again before it draws
      node.finalizeTextureCount(this.next);
      // `null` while a parallel compile runs: the same count is asked again next frame
      if (node.programManager.getCurrentProgramSuite() !== null) this.next += 1;
    } catch {
      this.done = true; // decoration: the program is then built on first use, as before
    }
    return this.done || this.next > max;
  }
}

let warmup: ShaderWarmup | null = null;

/** One warm-up per game (Intro, Home and Level idle frames share it). */
export function shaderWarmup(game: Phaser.Game): ShaderWarmup {
  warmup ??= new ShaderWarmup(game);
  return warmup;
}
