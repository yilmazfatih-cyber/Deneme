/**
 * Small Phaser helpers for baked frames (theme/textures.ts `FrameRef`): a frame is placed by its LOGICAL top-left
 * (cell, block box, wall strip) with origin `(anchorX / w, anchorY / h)` (TECH §10.2), or by its centre.
 */
import type Phaser from 'phaser';
import type { FrameRef } from '../../theme/textures.ts';

/** `#RRGGBB` token → 0xRRGGBB for tints. */
export function hexColor(hex: string): number {
  return Number.parseInt(hex.slice(1), 16);
}

/** Shows `ref` on `img` with its logical top-left at `(x, y)`, unscaled. */
export function setFrameAt(img: Phaser.GameObjects.Image, ref: FrameRef, x: number, y: number): void {
  img.setTexture(ref.key, ref.frame);
  img.setOrigin(ref.anchorX / ref.w, ref.anchorY / ref.h);
  img.setScale(1);
  img.setPosition(x, y);
}

/** Shows `ref` on `img` centred at `(cx, cy)` (symmetric frames: blocks, silhouettes, ghosts, badges). */
export function setFrameCentred(img: Phaser.GameObjects.Image, ref: FrameRef, cx: number, cy: number): void {
  img.setTexture(ref.key, ref.frame);
  img.setOrigin(0.5, 0.5);
  img.setPosition(cx, cy);
}

/** A flat rectangle from the 4 × 4 white pixel frame (keeps flat fills inside the atlas batch, TECH §10.6). */
export function setRect(
  img: Phaser.GameObjects.Image,
  ref: FrameRef,
  x: number,
  y: number,
  w: number,
  h: number,
  color: number,
  alpha = 1,
): void {
  img.setTexture(ref.key, ref.frame);
  img.setOrigin(0, 0);
  img.setPosition(x, y);
  img.setDisplaySize(w, h);
  img.setTint(color);
  img.setAlpha(alpha);
}
