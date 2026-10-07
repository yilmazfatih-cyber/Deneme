/**
 * One block on the board (docs/TECH_DESIGN.md §10.3–§10.4): ONE baked piece image (`blk_<shape>_<colour>[_flags]`, level
 * page) + its pre-blurred silhouette (`blk_sil_<shape>_contact|lifted|crane`; ART §3 layers 8–9, no runtime filter) +
 * a flash overlay (the same frame tint-filled; JUICE #2 / #12 / #13 flashes and the #12 `setCrop` sweep — no Filter,
 * no mask, JUICE §0 rule 11). Pooled (48 ready): `bind` gives it a piece, `unbind` returns it to the pool.
 *
 * A view only SHOWS a pose (continuous anchor, scale, alpha). Where a piece is comes from the core state (PieceLayer)
 * or, while dragged, from the DragController; motions after a move are `Track`s (motion.ts). Cosmetic layers are added
 * on top and never change the pose: shake / tap hop (UX §5.3), lift hop (#1), squash (#9, #11), nudge (#4), tilt (#3),
 * the silhouette's crane transition (#5) and a group transform (the #18 segment flight).
 */
import Phaser from 'phaser';
import type { ShapeDef } from '../../core/shapes.ts';
import type { PieceId } from '../../core/types.ts';
import type { Layout } from '../../theme/layout.ts';
import { FRAME, silhouetteFrameName } from '../../theme/textures.ts';
import type { FrameRef } from '../../theme/textures.ts';
import type { SilhouetteKind } from '../../theme/draw/block.ts';
import { TOKENS } from '../../theme/tokens.ts';
import { BOOT_ATLAS_KEY } from '../atlas.ts';
import type { Frames } from '../atlas.ts';
import { DEPTH, overTutorial } from './depth.ts';
import { linear } from './motion.ts';
import type { Ease, Pose, Track } from './motion.ts';
import { VIEW } from './viewConstants.ts';

interface Anim {
  readonly from: number;
  readonly to: number;
  readonly start: number;
  readonly ms: number;
  readonly ease: Ease;
}

function animAt(a: Anim, now: number): number {
  if (a.ms <= 0 || now >= a.start + a.ms) return a.to;
  if (now <= a.start) return a.from;
  return a.from + (a.to - a.from) * a.ease((now - a.start) / a.ms);
}

/** Lift recipe (JUICE #1; reduced variant from the EventPlayer). */
export interface LiftSpec {
  readonly scale: number;
  readonly ms: number;
  readonly ease: Ease;
  /** Upward hop at the lift (px), 0 = none. */
  readonly hopPx: number;
}

/** Group transform around a pivot (the #18 segment flight to the panorama): screen = pivot + (p − pivot)·scale + d. */
export interface GroupXf {
  readonly px: number;
  readonly py: number;
  readonly scale: number;
  readonly dx: number;
  readonly dy: number;
  readonly alpha: number;
}

export class PieceView {
  readonly image: Phaser.GameObjects.Image;
  readonly silhouette: Phaser.GameObjects.Image;
  /** Flash overlay (same frame, tint-filled). */
  readonly overlay: Phaser.GameObjects.Image;

  id: PieceId = -1;
  shape: ShapeDef | null = null;
  /** Block frame shown (re-bound when colour or flags change). */
  frameName = '';
  pose: Pose = { ax: 0, ay: 0, scale: 1, alpha: 1 };
  /** Motion after a move; null when the view rests at its state pose. */
  track: Track | null = null;
  /** The view flies over the others while its track runs (bounce, return). */
  flying = false;
  /** Released to the pool when its track ends (block bounced into the truck queue). */
  hideAtEnd = false;
  /** Cosmetic layers written by the EventPlayer (JUICE #3, #4, #9, #11, #18). */
  squashX = 1;
  squashY = 1;
  tiltDeg = 0;
  nudgeX = 0;
  nudgeY = 0;
  xf: GroupXf | null = null;

  private dragged = false;
  private drawnNow: { cx: number; cy: number; scale: number } | null = null;
  private shadowKind: SilhouetteKind = 'contact';
  private shadowFrom: SilhouetteKind = 'contact';
  private shadowAnim: { start: number; ms: number; ease: Ease } | null = null;
  private scaleAnim: Anim | null = null;
  private hopAnim: { start: number; ms: number; px: number } | null = null;
  private shake: { start: number; ms: number; px: number; cycles: number } | null = null;
  private hop: { start: number; ms: number; pulse: boolean } | null = null;
  private flashOn = false;
  private frames: Frames | null = null;

  constructor(scene: Phaser.Scene) {
    this.silhouette = scene.add.image(0, 0, BOOT_ATLAS_KEY, FRAME.whitePixel).setVisible(false);
    this.image = scene.add.image(0, 0, BOOT_ATLAS_KEY, FRAME.whitePixel).setVisible(false);
    this.overlay = scene.add.image(0, 0, BOOT_ATLAS_KEY, FRAME.whitePixel).setVisible(false);
  }

  /** Gives the view piece `id` with block frame `ref`. */
  bind(id: PieceId, shape: ShapeDef, frameName: string, frames: Frames): void {
    this.id = id;
    this.shape = shape;
    this.frames = frames;
    this.frameName = '';
    this.setBlockFrame(frameName);
    this.track = null;
    this.flying = false;
    this.hideAtEnd = false;
    this.dragged = false;
    this.scaleAnim = null;
    this.hopAnim = null;
    this.shake = null;
    this.hop = null;
    this.resetCosmetics();
    this.shadowAnim = null;
    this.setShadowKind('contact');
    this.applyDepth();
    this.image.setVisible(true).clearTint().setAlpha(1).setAngle(0);
    this.silhouette.setVisible(true).setAngle(0);
  }

  /** Back to the pool: hidden, on the boot atlas (the level page it used may be removed). */
  unbind(): void {
    this.id = -1;
    this.shape = null;
    this.frames = null;
    this.frameName = '';
    this.track = null;
    this.resetCosmetics();
    this.image.setVisible(false).setTexture(BOOT_ATLAS_KEY, FRAME.whitePixel);
    this.silhouette.setVisible(false).setTexture(BOOT_ATLAS_KEY, FRAME.whitePixel);
    this.overlay.setVisible(false).setTexture(BOOT_ATLAS_KEY, FRAME.whitePixel).setCrop();
  }

  private resetCosmetics(): void {
    this.squashX = 1;
    this.squashY = 1;
    this.tiltDeg = 0;
    this.nudgeX = 0;
    this.nudgeY = 0;
    this.xf = null;
    this.clearFlash();
  }

  get bound(): boolean {
    return this.id >= 0;
  }

  get isDragged(): boolean {
    return this.dragged;
  }

  setBlockFrame(name: string): void {
    if (!this.frames || name === this.frameName) return;
    const ref = this.frames.ref(name);
    this.image.setTexture(ref.key, ref.frame).setOrigin(0.5, 0.5);
    this.overlay.setTexture(ref.key, ref.frame).setOrigin(0.5, 0.5);
    this.frameName = name;
  }

  /** Silhouette kind; with `ms` the offset and alpha slide from the current kind (JUICE #5, 150 ms). */
  setShadowKind(kind: SilhouetteKind, now = 0, ms = 0, ease: Ease = linear): void {
    if (!this.frames || !this.shape) return;
    if (kind === this.shadowKind && this.shadowAnim === null) return;
    this.shadowFrom = this.shadowKind;
    this.shadowKind = kind;
    this.shadowAnim = ms > 0 ? { start: now, ms, ease } : null;
    const ref: FrameRef = this.frames.ref(silhouetteFrameName(this.shape.id, kind));
    this.silhouette.setTexture(ref.key, ref.frame).setOrigin(0.5, 0.5);
  }

  /** UX §5.3 / JUICE #1: lift — scale 1 → `lift.scale` over `lift.ms`, an optional hop, lifted silhouette, on top. */
  beginDrag(now: number, lift: LiftSpec): void {
    this.dragged = true;
    this.track = null;
    this.flying = false;
    this.resetCosmetics();
    this.scaleAnim = { from: this.pose.scale, to: lift.scale, start: now, ms: lift.ms, ease: lift.ease };
    this.hopAnim = lift.hopPx > 0 ? { start: now, ms: lift.ms * 2, px: lift.hopPx } : null;
    this.shadowAnim = null;
    this.setShadowKind('lifted');
    this.applyDepth();
  }

  /** The drag ends: the view keeps its pose; the caller gives it a track (or snaps it). */
  endDrag(): void {
    this.dragged = false;
    this.scaleAnim = null;
    this.hopAnim = null;
    this.tiltDeg = 0;
    this.nudgeX = 0;
    this.nudgeY = 0;
    this.image.setAlpha(1);
    this.shadowAnim = null;
    this.setShadowKind('contact');
    this.applyDepth();
  }

  /** Box centre and scale of the last `render` (the rail shadow rides on the dragged block, ShadowView.follow). */
  get drawn(): { readonly cx: number; readonly cy: number; readonly scale: number } | null {
    return this.drawnNow;
  }

  /** Current drag scale (lift animation), for the pose the DragController writes. */
  dragScale(now: number): number {
    return this.scaleAnim ? animAt(this.scaleAnim, now) : this.pose.scale;
  }

  setFlying(on: boolean): void {
    if (this.flying === on) return;
    this.flying = on;
    this.applyDepth();
  }

  /** UX §5.3 "Taşınamayan blok" / JUICE #2, #13: `px` left-right shake, `cycles` cycles over `ms`. */
  startShake(
    now: number,
    ms: number = TOKENS.duration.blockedShake,
    px: number = VIEW.shakePx,
    cycles: number = VIEW.shakeCycles,
  ): void {
    this.shake = { start: now, ms, px, cycles };
  }

  /** UX §5.3 tap without drag: a one-cell hop, or with reduced motion a ≤ 3 % scale pulse (JUICE §0 rule 8). */
  startHop(now: number, reduced = false): void {
    this.hop = { start: now, ms: VIEW.tapHopMs, pulse: reduced };
  }

  /** Flash overlay: `color` at `alpha` (0 hides it); `add` = additive white; `crop` 0…1 opens it left → right. */
  setFlash(color: number, alpha: number, add: boolean, crop = 1): void {
    if (alpha <= 0.001 || crop <= 0) {
      this.clearFlash();
      return;
    }
    const o = this.overlay;
    if (!this.flashOn) {
      o.setTint(color).setTintMode(Phaser.TintModes.FILL);
      o.setBlendMode(add ? Phaser.BlendModes.ADD : Phaser.BlendModes.NORMAL);
      this.flashOn = true;
    }
    o.setAlpha(alpha).setVisible(this.image.visible);
    if (crop < 1) o.setCrop(0, 0, o.frame.realWidth * crop, o.frame.realHeight);
    else if (o.isCropped) o.setCrop();
  }

  clearFlash(): void {
    if (!this.flashOn && !this.overlay.visible) return;
    this.flashOn = false;
    this.overlay.setVisible(false).setCrop().clearTint().setBlendMode(Phaser.BlendModes.NORMAL);
  }

  /** Positions image, overlay and silhouette for `pose` at time `now` (cosmetic layers on top). */
  render(layout: Layout, now: number): void {
    const shape = this.shape;
    if (!shape) return;
    const g = layout.grid;
    const r = g.pieceRect(this.pose.ax, this.pose.ay, shape.w, shape.h);
    let ox = this.nudgeX;
    let oy = this.nudgeY;
    if (this.shake) {
      const u = (now - this.shake.start) / this.shake.ms;
      if (u >= 1) this.shake = null;
      else if (u >= 0) ox += this.shake.px * Math.sin(2 * Math.PI * this.shake.cycles * u);
    }
    let pulse = 1;
    if (this.hop) {
      const u = (now - this.hop.start) / this.hop.ms;
      if (u >= 1 || u < 0) this.hop = null;
      else if (this.hop.pulse) pulse = 1 + (VIEW.tapPulseScale - 1) * Math.sin(Math.PI * u);
      else oy -= VIEW.tapHopCells * g.cellPx * Math.sin(Math.PI * linear(u));
    }
    if (this.hopAnim) {
      const u = (now - this.hopAnim.start) / this.hopAnim.ms;
      if (u >= 1 || u < 0) this.hopAnim = null;
      else oy -= this.hopAnim.px * Math.sin(Math.PI * u);
    }
    const scale = (this.dragged ? this.dragScale(now) : this.pose.scale) * pulse;
    const sx = scale * this.squashX;
    const sy = scale * this.squashY;
    // a squash keeps the block on the ground: the bottom edge stays where it was
    let cx = r.x + r.w / 2 + ox;
    let cy = r.y + r.h / 2 + oy + ((1 - this.squashY) * r.h * scale) / 2;
    let gs = 1;
    let alpha = this.pose.alpha;
    const xf = this.xf;
    if (xf) {
      cx = xf.px + (cx - xf.px) * xf.scale + xf.dx;
      cy = xf.py + (cy - xf.py) * xf.scale + xf.dy;
      gs = xf.scale;
      alpha *= xf.alpha;
    }
    this.image
      .setPosition(cx, cy)
      .setScale(sx * gs, sy * gs)
      .setAngle(this.tiltDeg)
      .setAlpha(alpha);
    this.drawnNow = { cx, cy, scale: scale * gs };
    if (this.flashOn)
      this.overlay
        .setPosition(cx, cy)
        .setScale(sx * gs, sy * gs)
        .setAngle(this.tiltDeg);

    let shx = TOKENS.shadow[this.shadowKind].x;
    let shy = TOKENS.shadow[this.shadowKind].y;
    let sha = TOKENS.shadow[this.shadowKind].alpha;
    const sa = this.shadowAnim;
    if (sa) {
      const u = (now - sa.start) / sa.ms;
      if (u >= 1) this.shadowAnim = null;
      else {
        const k = sa.ease(Math.max(0, u));
        const from = TOKENS.shadow[this.shadowFrom];
        shx = from.x + (shx - from.x) * k;
        shy = from.y + (shy - from.y) * k;
        sha = from.alpha + (sha - from.alpha) * k;
      }
    }
    this.silhouette
      .setPosition(cx + shx * gs, cy + shy * gs)
      .setScale(sx * gs, sy * gs)
      .setAngle(this.tiltDeg)
      .setAlpha(sha * alpha);
  }

  /** Placed / flying / dragged layers; while dragged, above the tutorial spotlight (`overTutorial`, UX §13.1). */
  private applyDepth(): void {
    const top = this.dragged || this.flying;
    const z = this.dragged ? overTutorial : (d: number): number => d;
    this.image.setDepth(z(top ? DEPTH.draggedBlock : DEPTH.placedBlocks));
    this.overlay.setDepth(z((top ? DEPTH.draggedBlock : DEPTH.placedBlocks) + 1));
    this.silhouette.setDepth(z(top ? DEPTH.draggedShadow : DEPTH.contactShadow));
  }
}
