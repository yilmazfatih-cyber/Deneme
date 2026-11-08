/**
 * Procedural placeholder icons (ASSET_LIST P0 placeholders until the art lands: `icon_coin`, `icon_ok`, `icon_life`,
 * `icon_star`, `icon_pause`, goal "yapı" icon, Tuna's glove, Usta Dede's bust). Each drawer clears a Graphics and draws
 * the icon centred on (0, 0), once (TECH §10.6: no per-frame Graphics redraw; the heart is redrawn only while #58
 * plays). Colours come from tokens (`color.ui.*`, `color.character.*`).
 */
import type Phaser from 'phaser';
import { TOKENS } from '../theme/tokens.ts';
import { hex } from './text.ts';

const C = TOKENS.color.ui;
const CH = TOKENS.color.character;

/** Character colours are open records in tokens (`color.character.*`); a missing key falls back to the outline. */
function cc(v: string | undefined): number {
  return hex(v ?? CH.outline);
}

/** `icon_coin` (inline `{coin}`, UX §0.3 PriceLabel "●"). */
export function drawCoin(g: Phaser.GameObjects.Graphics, d: number): void {
  g.clear();
  g.fillStyle(hex(C.goldDark), 1).fillCircle(0, 0, d / 2);
  g.fillStyle(hex(C.gold), 1).fillCircle(0, 0, d / 2 - Math.max(2, d * 0.1));
  g.fillStyle(hex(C.goldDark), 0.5).fillRoundedRect(-d * 0.08, -d * 0.24, d * 0.16, d * 0.48, d * 0.06);
}

/** `{ok}` / goal done: a green badge with a white check. */
export function drawOk(g: Phaser.GameObjects.Graphics, d: number): void {
  g.clear();
  g.fillStyle(hex(C.primaryLip), 1).fillCircle(0, 0, d / 2);
  g.fillStyle(hex(C.primary), 1).fillCircle(0, 0, d / 2 - Math.max(2, d * 0.08));
  g.lineStyle(Math.max(3, d * 0.12), hex(C.inkOnDark), 1);
  g.beginPath();
  g.moveTo(-d * 0.22, 0)
    .lineTo(-d * 0.05, d * 0.18)
    .lineTo(d * 0.24, -d * 0.18);
  g.strokePath();
}

/**
 * Horizontal spans of the heart at row `y` (heart in a `d` box centred on 0): each lobe's own span and the point's
 * triangle, overlapping spans merged — so the rows above the lobes' centres keep the gap between the lobes (the top
 * notch, `r` = d / 4 deep; review Faz 2 tur 1 #8). Empty outside.
 */
export function heartSpans(y: number, d: number): [number, number][] {
  const r = d / 4;
  const cy = -d / 8;
  const spans: [number, number][] = [];
  for (const cx of [-r, r]) {
    const dy = y - cy;
    if (Math.abs(dy) <= r) {
      const half = Math.sqrt(r * r - dy * dy);
      spans.push([cx - half, cx + half]);
    }
  }
  const top = cy;
  const bottom = d / 2 - d * 0.06;
  if (y >= top && y <= bottom) {
    const half = (d / 2) * (1 - (y - top) / (bottom - top));
    spans.push([-half, half]);
  }
  spans.sort((p, q) => p[0] - q[0]);
  const out: [number, number][] = [];
  for (const sp of spans) {
    const last = out[out.length - 1];
    if (last && sp[0] <= last[1]) last[1] = Math.max(last[1], sp[1]);
    else if (sp[1] > sp[0]) out.push([sp[0], sp[1]]);
  }
  return out;
}

/**
 * `icon_life`: red heart; `drain` 0 → 1 turns it grey from the bottom up (JUICE #58 "dolgu aşağıdan yukarı söner", no
 * break).
 */
export function drawHeart(g: Phaser.GameObjects.Graphics, d: number, drain = 0): void {
  g.clear();
  const step = 2;
  const top = -d / 2 + d * 0.12;
  const bottom = d / 2 - d * 0.06;
  const grey = top + (bottom - top) * (1 - Math.min(1, Math.max(0, drain)));
  for (let y = -d / 2; y <= d / 2; y += step) {
    const spans = heartSpans(y + step / 2, d);
    if (spans.length === 0) continue;
    g.fillStyle(hex(y + step / 2 > grey ? C.disabled : C.heart), 1);
    for (const [x0, x1] of spans) g.fillRect(x0, y, x1 - x0, step + 0.5);
  }
}

/** `icon_star` (win reward row). */
export function drawStar(g: Phaser.GameObjects.Graphics, d: number): void {
  g.clear();
  // fillPoints only reads x / y (Phaser 4 Graphics), so plain points are enough
  const pts: { x: number; y: number }[] = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const r = i % 2 === 0 ? d / 2 : d / 4.4;
    pts.push({ x: Math.cos(a) * r, y: Math.sin(a) * r });
  }
  const poly = pts as Phaser.Math.Vector2[];
  g.fillStyle(hex(C.star), 1).fillPoints(poly, true);
  g.lineStyle(Math.max(2, d * 0.06), hex(C.starOutline), 1).strokePoints(poly, true);
}

/** UX §5.1 pause: two bars. */
export function drawPauseBars(g: Phaser.GameObjects.Graphics, barW: number, barH: number, gap: number): void {
  g.clear();
  g.fillStyle(hex(C.ink), 1);
  g.fillRoundedRect(-gap / 2 - barW, -barH / 2, barW, barH, barW / 3);
  g.fillRoundedRect(gap / 2, -barH / 2, barW, barH, barW / 3);
}

/** Goal "yapı" icon (UX §5.1 `build` goal): a small house of plan blocks. */
export function drawBuildIcon(g: Phaser.GameObjects.Graphics, d: number): void {
  g.clear();
  const b = TOKENS.color.block;
  const w = d * 0.7;
  const h = d * 0.42;
  g.fillStyle(hex(b.O), 1).fillRect(-w / 2, d * 0.5 - h, w / 2, h);
  g.fillStyle(hex(b.C), 1).fillRect(0, d * 0.5 - h, w / 2, h);
  g.fillStyle(hex(b.R), 1).fillTriangle(-d * 0.45, d * 0.5 - h, d * 0.45, d * 0.5 - h, 0, -d * 0.45);
  g.lineStyle(Math.max(2, d * 0.05), hex(CH.outline), 1);
  g.strokeRect(-w / 2, d * 0.5 - h, w, h);
  g.strokeTriangle(-d * 0.45, d * 0.5 - h, d * 0.45, d * 0.5 - h, 0, -d * 0.45);
}

/** UX §0.3 "Kapat (×)": red disc with a white cross. */
export function drawClose(g: Phaser.GameObjects.Graphics, d: number): void {
  g.clear();
  g.fillStyle(hex(C.dangerLip), 1).fillCircle(0, 4, d / 2);
  g.fillStyle(hex(C.danger), 1).fillCircle(0, 0, d / 2);
  const k = d * 0.2;
  g.lineStyle(Math.max(4, d * 0.1), hex(C.inkOnDark), 1);
  g.beginPath();
  g.moveTo(-k, -k).lineTo(k, k).moveTo(k, -k).lineTo(-k, k);
  g.strokePath();
}

/** "▶" of the rewarded-ad option (UX §7 "▶ Reklam izle"). */
export function drawPlay(g: Phaser.GameObjects.Graphics, d: number, color: string): void {
  g.clear();
  g.fillStyle(hex(color), 1).fillTriangle(-d * 0.3, -d * 0.36, -d * 0.3, d * 0.36, d * 0.38, 0);
}

/**
 * UX §13.2 level 5 panorama arrow (Faz 2 tur 2): a right-pointing white arrow `w × h` (64 × 40) with a `stroke` px
 * `ui.ink` outline, centred on (0, 0).
 */
export function drawPanoramaArrow(
  g: Phaser.GameObjects.Graphics,
  w: number,
  h: number,
  stroke: number,
): void {
  g.clear();
  const s = stroke / 2;
  const head = w * 0.45;
  const shaft = h * 0.44;
  const pts = [
    { x: -w / 2 + s, y: -shaft / 2 },
    { x: w / 2 - head, y: -shaft / 2 },
    { x: w / 2 - head, y: -h / 2 + s },
    { x: w / 2 - s, y: 0 },
    { x: w / 2 - head, y: h / 2 - s },
    { x: w / 2 - head, y: shaft / 2 },
    { x: -w / 2 + s, y: shaft / 2 },
  ];
  const path = (): void => {
    g.beginPath();
    pts.forEach((p, i) => (i === 0 ? g.moveTo(p.x, p.y) : g.lineTo(p.x, p.y)));
    g.closePath();
  };
  g.fillStyle(hex(C.inkOnDark), 1);
  path();
  g.fillPath();
  g.lineStyle(stroke, hex(C.ink), 1);
  path();
  g.strokePath();
}

/** UX §13.1 Tuna's yellow work glove (140 × 160 placeholder), the index finger points up. */
export function drawGlove(g: Phaser.GameObjects.Graphics, w: number, h: number): void {
  g.clear();
  const fill = cc(CH.tuna.gloves);
  const line = hex(CH.outline);
  const lw = Math.max(3, w * 0.04);
  const palmW = w * 0.62;
  const palmH = h * 0.42;
  const palmY = h * 0.08;
  g.fillStyle(fill, 1).fillRoundedRect(-palmW / 2, palmY, palmW, palmH, palmW * 0.22);
  g.lineStyle(lw, line, 1).strokeRoundedRect(-palmW / 2, palmY, palmW, palmH, palmW * 0.22);
  // index finger (the touch point is its tip at (0, -h/2))
  const fw = w * 0.2;
  g.fillStyle(fill, 1).fillRoundedRect(-fw / 2, -h / 2, fw, h * 0.62, fw / 2);
  g.lineStyle(lw, line, 1).strokeRoundedRect(-fw / 2, -h / 2, fw, h * 0.62, fw / 2);
  // folded fingers and thumb
  for (const dx of [fw * 0.9, fw * 1.75]) {
    g.fillStyle(fill, 1).fillRoundedRect(dx - fw / 2, palmY - fw * 0.3, fw * 0.9, fw * 1.1, fw * 0.4);
    g.lineStyle(lw, line, 1).strokeRoundedRect(dx - fw / 2, palmY - fw * 0.3, fw * 0.9, fw * 1.1, fw * 0.4);
  }
  g.fillStyle(fill, 1).fillRoundedRect(-palmW / 2 - fw * 0.55, palmY + palmH * 0.2, fw, fw * 1.4, fw * 0.45);
  g.lineStyle(lw, line, 1).strokeRoundedRect(
    -palmW / 2 - fw * 0.55,
    palmY + palmH * 0.2,
    fw,
    fw * 1.4,
    fw * 0.45,
  );
  // cuff
  g.fillStyle(cc(CH.tuna.vest), 1).fillRect(-palmW / 2, palmY + palmH - 4, palmW, h * 0.1);
  g.lineStyle(lw, line, 1).strokeRect(-palmW / 2, palmY + palmH - 4, palmW, h * 0.1);
}

/** UX §13.1 Usta Dede bust (200 px placeholder): cap, face, white moustache. */
export function drawDedeBust(g: Phaser.GameObjects.Graphics, d: number): void {
  g.clear();
  const dd = CH.dede;
  const line = hex(CH.outline);
  const lw = Math.max(3, d * 0.025);
  g.fillStyle(cc(dd.jacket), 1).fillRoundedRect(-d * 0.42, d * 0.18, d * 0.84, d * 0.32, d * 0.12);
  g.lineStyle(lw, line, 1).strokeRoundedRect(-d * 0.42, d * 0.18, d * 0.84, d * 0.32, d * 0.12);
  g.fillStyle(cc(dd.skin), 1).fillCircle(0, -d * 0.02, d * 0.3);
  g.lineStyle(lw, line, 1).strokeCircle(0, -d * 0.02, d * 0.3);
  g.fillStyle(cc(dd.cap), 1)
    .slice(0, -d * 0.1, d * 0.31, Math.PI, 0, false)
    .fillPath();
  g.fillStyle(cc(dd.capBand), 1).fillRect(-d * 0.33, -d * 0.12, d * 0.66, d * 0.06);
  g.fillStyle(cc(dd.mustache), 1).fillEllipse(-d * 0.08, d * 0.1, d * 0.18, d * 0.08);
  g.fillStyle(cc(dd.mustache), 1).fillEllipse(d * 0.08, d * 0.1, d * 0.18, d * 0.08);
  g.fillStyle(line, 1)
    .fillCircle(-d * 0.1, -d * 0.02, d * 0.025)
    .fillCircle(d * 0.1, -d * 0.02, d * 0.025);
}
