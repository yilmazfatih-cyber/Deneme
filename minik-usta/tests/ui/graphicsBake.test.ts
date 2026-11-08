import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BAKE_PAD_PX, GFX, commandBounds, replayCommands } from '../../src/ui/graphicsBake.ts';
import type { BakeBox, BakeContext } from '../../src/ui/graphicsBake.ts';

/** Records the Canvas 2D calls of a replay (style values at the moment of each fill / stroke). */
class Recorder implements BakeContext {
  fillStyle: BakeContext['fillStyle'] = '';
  strokeStyle: BakeContext['strokeStyle'] = '';
  lineWidth = 1;
  readonly calls: string[] = [];
  beginPath(): void {
    this.calls.push('begin');
  }
  moveTo(x: number, y: number): void {
    this.calls.push(`move ${x},${y}`);
  }
  lineTo(x: number, y: number): void {
    this.calls.push(`line ${x},${y}`);
  }
  arc(x: number, y: number, r: number, a0: number, a1: number, ccw?: boolean): void {
    this.calls.push(`arc ${x},${y} r${r} ${a0.toFixed(2)}→${a1.toFixed(2)}${ccw ? ' ccw' : ''}`);
  }
  closePath(): void {
    this.calls.push('close');
  }
  fill(): void {
    this.calls.push(`fill ${String(this.fillStyle)}`);
  }
  stroke(): void {
    this.calls.push(`stroke ${String(this.strokeStyle)} w${this.lineWidth}`);
  }
  fillRect(x: number, y: number, w: number, h: number): void {
    this.calls.push(`rect ${x},${y} ${w}×${h} ${String(this.fillStyle)}`);
  }
}

const ORIGIN: BakeBox = { x: 0, y: 0, w: 100, h: 100 };

describe('TECH 10.6 BakedGraphics command replay (graphicsBake.ts)', () => {
  it('command ids match the installed Phaser Graphics commands', () => {
    const src = readFileSync('node_modules/phaser/src/gameobjects/graphics/Commands.js', 'utf8');
    const phaser = Object.fromEntries(
      [...src.matchAll(/^\s*([A-Z_]+):\s*(\d+)/gm)].map((m) => [m[1] ?? '', Number(m[2])]),
    );
    expect(phaser).toEqual(GFX);
  });

  it('bounds: a filled rect, padded for antialiasing', () => {
    const buf = [GFX.FILL_STYLE, 0xff0000, 1, GFX.FILL_RECT, 10, 20, 30, 40];
    const p = BAKE_PAD_PX;
    expect(commandBounds(buf)).toEqual({ x: 10 - p, y: 20 - p, w: 30 + 2 * p, h: 40 + 2 * p });
  });

  it('bounds: arcs count their full circle, strokes widen by half the line width', () => {
    const buf = [
      GFX.LINE_STYLE,
      8,
      0x000000,
      1,
      GFX.BEGIN_PATH,
      GFX.ARC,
      50,
      60,
      10,
      0,
      Math.PI,
      false,
      0,
      GFX.STROKE_PATH,
    ];
    const pad = 4 + BAKE_PAD_PX;
    expect(commandBounds(buf)).toEqual({ x: 40 - pad, y: 50 - pad, w: 20 + 2 * pad, h: 20 + 2 * pad });
  });

  it('bounds: nothing drawn → null; transforms and gradients → unsupported (rendered live)', () => {
    expect(commandBounds([])).toBeNull();
    expect(commandBounds([GFX.FILL_STYLE, 0xffffff, 1, GFX.MOVE_TO, 0, 0, GFX.LINE_TO, 5, 5])).toBeNull();
    expect(commandBounds([GFX.TRANSLATE, 5, 5, GFX.FILL_RECT, 0, 0, 1, 1])).toBe('unsupported');
    expect(commandBounds([GFX.GRADIENT_FILL_STYLE, 1, 1, 1, 1, 0, 0, 0, 0])).toBe('unsupported');
    expect(commandBounds([99])).toBe('unsupported');
  });

  it('replay: like the WebGL renderer, each sub-path is filled on its own', () => {
    const ctx = new Recorder();
    const buf = [
      GFX.FILL_STYLE,
      0x112233,
      0.5,
      GFX.BEGIN_PATH,
      GFX.MOVE_TO,
      0,
      0,
      GFX.LINE_TO,
      10,
      0,
      GFX.LINE_TO,
      10,
      10,
      GFX.CLOSE_PATH,
      GFX.MOVE_TO,
      20,
      0,
      GFX.ARC,
      25,
      5,
      5,
      0,
      Math.PI,
      true,
      0,
      GFX.FILL_PATH,
    ];
    replayCommands(ctx, buf, ORIGIN);
    expect(ctx.calls).toEqual([
      'begin',
      'move 0,0',
      'line 10,0',
      'line 10,10',
      'close',
      'fill rgba(17,34,51,0.5)',
      'begin',
      'move 20,0',
      'arc 25,5 r5 0.00→3.14 ccw',
      'fill rgba(17,34,51,0.5)',
    ]);
  });

  it('replay: coordinates are shifted so the box corner is the canvas origin; BEGIN_PATH drops old sub-paths', () => {
    const ctx = new Recorder();
    const box: BakeBox = { x: -50, y: 10, w: 200, h: 200 };
    const buf = [
      GFX.LINE_STYLE,
      4,
      0xffffff,
      1,
      GFX.BEGIN_PATH,
      GFX.MOVE_TO,
      0,
      20,
      GFX.LINE_TO,
      10,
      20,
      GFX.STROKE_PATH,
      GFX.BEGIN_PATH,
      GFX.FILL_STYLE,
      0x000000,
      1,
      GFX.FILL_RECT,
      -50,
      10,
      5,
      5,
      GFX.FILL_TRIANGLE,
      0,
      10,
      10,
      10,
      5,
      20,
      GFX.FILL_PATH,
    ];
    replayCommands(ctx, buf, box);
    expect(ctx.calls).toEqual([
      'begin',
      'move 50,10',
      'line 60,10',
      'stroke rgba(255,255,255,1) w4',
      'rect 0,0 5×5 rgba(0,0,0,1)',
      'begin',
      'move 50,0',
      'line 60,0',
      'line 55,10',
      'close',
      'fill rgba(0,0,0,1)',
    ]);
  });
});
