/**
 * A `Graphics` that is drawn once into its own canvas texture and rendered as one textured quad (docs/TECH_DESIGN.md
 * §10.6: "her karede yeniden çizilen `Graphics` yok").
 *
 * Phaser 4's WebGL renderer replays a Graphics' whole command buffer on every frame: rounded rectangles, circles and
 * other paths go through Earcut each time. The HUD panels, buttons, balloons and the tutorial glove change a few times
 * per level, so at 4× CPU their replay was most of the frame's render time (perf gate, TECH §10.7). A baked Graphics
 * keeps the Graphics API (widgets draw into it as before): the first frame after a change (`clear()` or new commands)
 * replays the buffer into a canvas texture (graphicsBake.ts), and every frame draws that texture with the object's
 * position, rotation, scale, alpha and scroll factor (a container's transform and alpha included).
 *
 * Use it for shapes that do not change every frame; a shape redrawn every frame stays a plain `Graphics` (a bake per
 * frame costs more than the replay). A buffer with transforms or gradients is rendered live. The Canvas renderer
 * (no WebGL) keeps Phaser's own Graphics path.
 *
 * Like the other ui widgets this module uses Phaser through the scene only (`import type`), so modules that import it
 * stay loadable in the Node unit tests; the subclass is made on first use from the scene's own Graphics class.
 */
import type Phaser from 'phaser';
import { commandBounds, replayCommands } from './graphicsBake.ts';
import type { BakeBox } from './graphicsBake.ts';

type RenderStep = (
  renderer: Phaser.Renderer.WebGL.WebGLRenderer,
  src: Phaser.GameObjects.GameObject,
  drawingContext: Phaser.Renderer.WebGL.DrawingContext,
  parentMatrix?: Phaser.GameObjects.Components.TransformMatrix,
  ...rest: unknown[]
) => void;

type GraphicsClass = new (
  scene: Phaser.Scene,
  options?: Phaser.Types.GameObjects.Graphics.Options,
) => Phaser.GameObjects.Graphics;

let serial = 0;
let bakedClass: GraphicsClass | null = null;

function makeBakedClass(Base: GraphicsClass): GraphicsClass {
  /** Phaser's own WebGL Graphics renderer (the fallback for buffers the bake does not reproduce). */
  const liveRender = (Base.prototype as unknown as { renderWebGL: RenderStep }).renderWebGL;

  return class BakedGraphics extends Base {
    /** Command count at the last bake (−1: never baked); a new command or a `clear()` makes the bake stale. */
    private bakedLength = -1;
    private stale = true;
    /** Last bake result: the box, null (nothing drawn) or 'live' (render the buffer live). */
    private box: BakeBox | null | 'live' = null;
    private texture: Phaser.Textures.CanvasTexture | null = null;
    private quad: Phaser.GameObjects.Image | null = null;

    override clear(): this {
      super.clear();
      this.stale = true;
      return this;
    }

    /**
     * Render step 0. The GameObject constructor registers `renderWebGL` as the first render step and Phaser calls it
     * unbound, with the object as `src` (no `this` here).
     */
    renderWebGL(
      renderer: Phaser.Renderer.WebGL.WebGLRenderer,
      src: Phaser.GameObjects.GameObject,
      drawingContext: Phaser.Renderer.WebGL.DrawingContext,
      parentMatrix?: Phaser.GameObjects.Components.TransformMatrix,
      ...rest: unknown[]
    ): void {
      (src as BakedGraphics).renderBaked(renderer, drawingContext, parentMatrix, rest);
    }

    override preDestroy(): void {
      this.quad?.destroy();
      this.quad = null;
      const tex = this.texture;
      this.texture = null;
      if (tex && this.scene?.sys.textures.exists(tex.key)) this.scene.sys.textures.remove(tex.key);
      super.preDestroy();
    }

    /** The baked quad, or the live replay of a buffer the bake does not reproduce. */
    private renderBaked(
      renderer: Phaser.Renderer.WebGL.WebGLRenderer,
      drawingContext: Phaser.Renderer.WebGL.DrawingContext,
      parentMatrix: Phaser.GameObjects.Components.TransformMatrix | undefined,
      rest: readonly unknown[],
    ): void {
      if (this.stale || this.bakedLength !== this.commandBuffer.length) this.bake();
      if (this.box === 'live') {
        liveRender(renderer, this, drawingContext, parentMatrix, ...rest);
        return;
      }
      const quad = this.quad;
      if (this.box === null || !quad) return;
      drawingContext.camera?.addToRenderList(this);
      quad
        .setPosition(this.x, this.y)
        .setRotation(this.rotation)
        .setScale(this.scaleX, this.scaleY)
        .setAlpha(this.alpha)
        .setScrollFactor(this.scrollFactorX, this.scrollFactorY);
      quad.renderWebGLStep(renderer, quad, drawingContext, parentMatrix);
    }

    private bake(): void {
      this.stale = false;
      this.bakedLength = this.commandBuffer.length;
      const box = commandBounds(this.commandBuffer);
      if (box === 'unsupported') {
        this.box = 'live';
        return;
      }
      this.box = box;
      if (!box) return;
      let tex = this.texture;
      if (!tex) {
        serial += 1;
        tex = this.scene.sys.textures.createCanvas(`__baked_gfx_${serial}`, box.w, box.h);
        if (!tex) {
          this.box = 'live';
          return;
        }
        this.texture = tex;
      } else tex.setSize(box.w, box.h);
      const ctx = tex.getContext();
      ctx.clearRect(0, 0, box.w, box.h);
      replayCommands(ctx, this.commandBuffer, box);
      tex.refresh();
      const config: Phaser.Types.GameObjects.Sprite.SpriteConfig = { key: tex.key };
      if (!this.quad) this.quad = this.scene.make.image(config, false);
      else this.quad.setTexture(tex.key);
      // the quad's pivot is the Graphics' local origin, so rotation and scale match the live object
      this.quad.setDisplayOrigin(-box.x, -box.y);
    }
  };
}

/**
 * `scene.add.graphics()` for shapes that change rarely (see the module comment). The subclass is made once, from the
 * Graphics class of the running Phaser (a probe object that never joins the scene).
 */
export function addBakedGraphics(
  scene: Phaser.Scene,
  options?: Phaser.Types.GameObjects.Graphics.Options,
): Phaser.GameObjects.Graphics {
  if (!bakedClass) {
    const probe = scene.make.graphics({}, false);
    bakedClass = makeBakedClass(probe.constructor as GraphicsClass);
    probe.destroy();
  }
  return scene.add.existing(new bakedClass(scene, options));
}
