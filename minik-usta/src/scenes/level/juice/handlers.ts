/**
 * JUICE Phase 2 P0 handlers (docs/JUICE.md rows #1–13, 15–20, 22, 23, 50–53, 55–58, 69–71, 83, 84, 87, 88; TECH_DESIGN
 * §6.3, §14.1 #11). One handler per P0 event: it plays the row's animation (full or "Animasyonları azalt" variant),
 * particles, sounds and haptic through a `JuiceStage`. Pure: no Phaser, no clock, no game rule — the core already
 * decided everything; a handler only shows it. tests/scenes/juice.test.ts checks that every P0 id has a handler and
 * that each handler plays exactly the catalogue's sounds and haptic.
 */
import type { At, GameEvent } from '../../../core/types.ts';
import { TOKENS } from '../../../theme/tokens.ts';
import type { Rect } from '../../../theme/layout.ts';
import { fallLeg, linear } from '../motion.ts';
import type { Ease, LegSpec } from '../motion.ts';
import { JUICE_VIEW, VIEW } from '../viewConstants.ts';
import {
  JUICE,
  JUICE_P0_IDS,
  coinRate,
  comboRate,
  dbGain,
  juiceMs,
  juiceParticles,
  landGain,
  reducedScale,
} from './catalog.ts';
import type { JuiceId } from './catalog.ts';
import { popCurve } from './fx.ts';
import { yardFallMs } from './plan.ts';
import type { JuiceCue, JuiceHandler, JuiceStage, Point, Tweenable } from './stage.ts';

const T = TOKENS;
const D = T.duration;
const V = JUICE_VIEW;
const WHITE = 0xffffff;

type Ev<K extends GameEvent['t']> = Extract<GameEvent, { t: K }>;

function evOf<K extends GameEvent['t']>(cue: JuiceCue, type: K): Ev<K> | null {
  const e = cue.ev;
  return e !== null && e.t === type ? (e as Ev<K>) : null;
}

const centre = (r: Rect): Point => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });
const bottom = (r: Rect): Point => ({ x: r.x + r.w / 2, y: r.y + r.h });
const top = (r: Rect): Point => ({ x: r.x + r.w / 2, y: r.y });
const easeOf = (st: JuiceStage, id: JuiceId): Ease => st.ease(JUICE[id].ease);
const count = (cue: JuiceCue): number => juiceParticles(cue.id, cue.reduced);
const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/** Uniform scale of a target (windows, buttons). */
function setScale(t: Tweenable, s: number): void {
  t.scaleX = s;
  t.scaleY = s;
}

/**
 * #52 window entry: dim 200 ms → the panel slides up and settles; options enter 40 ms apart; the "+5" chip hops once
 * while the window opens (no loop, R-15). Reduced: 150 ms fade, no hop. Shared with #87 exception (a).
 */
function offerWindow(c: JuiceCue, st: JuiceStage): void {
  const w = c.window;
  if (!w) return;
  const ease = st.ease(JUICE[52].ease);
  if (w.dim)
    st.tween(w.dim, { alpha: T.alpha.overlay }, c.time, c.reduced ? c.ms : V.offerDimMs, linear, {
      alpha: 0,
    });
  const enter = c.reduced ? c.time : c.time + V.offerDimMs;
  if (c.reduced) st.tween(w.panel, { alpha: 1 }, enter, c.ms, linear, { alpha: 0 });
  else
    st.tween(w.panel, { y: w.panel.y, alpha: 1 }, enter, c.ms, ease, {
      y: w.panel.y + V.offerSlidePx,
      alpha: 1,
    });
  (w.options ?? []).forEach((o, i) => {
    if (c.reduced) st.tween(o, { alpha: 1 }, enter, c.ms, linear, { alpha: 0 });
    else
      st.tween(o, { y: o.y, alpha: 1 }, enter + i * V.offerStaggerMs, c.ms, ease, {
        y: o.y + V.offerSlidePx,
        alpha: 0,
      });
  });
  const chip = w.chip;
  if (chip && !c.reduced) {
    const y0 = chip.y;
    st.drive(enter, c.ms, linear, (_k, u) => (chip.y = y0 - V.offerChipHopPx * Math.sin(Math.PI * u)), false);
  }
}

const H: { readonly [K in JuiceId]: JuiceHandler } = {
  // #1 lift: scale 1 → 1,08 (reduced 1,03), 6 px hop (reduced none), lifted silhouette (PieceView)
  1: (c, st) => {
    if (c.piece === null) return;
    const scale = reducedScale(T.drag.liftScale, c.reduced);
    st.beginLift(c.piece, c.time, scale, c.reduced ? 0 : V.liftHopPx, c.ms, easeOf(st, 1));
    st.sound('sfx_pick');
    st.haptic('light');
  },

  // #2 pick blocked: 2 px shake ×3 (reduced: none), the blocking pieces flash white 300 ms, 3 dust motes
  2: (c, st) => {
    if (c.piece === null) return;
    if (!c.reduced) st.pieceShake(c.piece, c.time, VIEW.shakePx, VIEW.shakeCycles, juiceMs(2, false));
    const blockers = c.pieces && c.pieces.length > 0 ? c.pieces : [c.piece];
    for (const id of blockers) st.pieceFlash(id, c.time, WHITE, V.flashPeak, V.blockedFlashMs, false);
    const box = st.pieceBox(c.piece);
    if (box) st.burst('dust', count(c), bottom(box), { w: box.w * 0.6 });
    st.sound('sfx_blocked');
    st.haptic('light');
  },

  // #3 follow: tilt ±4° with the horizontal speed, a 3-frame trail over 12 cells/s (reduced: neither)
  3: (c, st) => {
    if (c.piece === null) return;
    if (c.reduced) {
      st.pieceTilt(c.piece, 0);
      return;
    }
    const vx = c.dx ?? 0;
    const speed = c.dy ?? Math.abs(vx);
    st.pieceTilt(c.piece, clamp(vx / T.drag.trailMinSpeedCells, -1, 1) * T.drag.tiltMaxDeg);
    if (speed > T.drag.trailMinSpeedCells)
      st.trail(c.piece, c.time, V.dragTrailFrames, V.dragTrailAlpha, null, D.ghostSwitch);
  },

  // #4 sticky follow hit an obstacle: 6 px stretch toward the push (reduced: none), 2 dust, sound, haptic ≤ 1 / 400 ms;
  // the dotted tether and the 3° lean while the finger is > 0,5 cell away for > 150 ms (also reduced: information)
  4: (c, st) => {
    if (c.piece === null) return;
    const dx = c.dx ?? 0;
    const dy = c.dy ?? 0;
    if (c.first) {
      if (!c.reduced)
        st.pieceNudge(c.piece, c.time, dx * T.drag.bumpPx, dy * T.drag.bumpPx, c.ms, easeOf(st, 4));
      const box = st.pieceBox(c.piece);
      if (box) {
        const p = centre(box);
        st.burst('dust', count(c), { x: p.x + (dx * box.w) / 2, y: p.y - (dy * box.h) / 2 });
      }
      st.sound('sfx_bump');
      if (c.flag) st.haptic('light');
    }
    st.tether(c.piece, c.from ?? null, c.from ? Math.sign(dx || 1) * T.drag.leanDeg : 0);
  },

  // #5 crane area: the silhouette lengthens (y +18 → +30, 30 % → 20 %) over 150 ms (same when reduced: information)
  5: (c, st) => {
    if (c.piece === null) return;
    st.shadowKind(c.piece, c.flag ? 'crane' : 'lifted', c.time, c.ms, easeOf(st, 5));
  },

  // #6 over the wall: 3 white ghosts 30 % → 0 over 200 ms, 6 wind lines (reduced: no trail; the sound stays)
  6: (c, st) => {
    if (c.piece === null) return;
    if (!c.reduced) {
      st.trail(c.piece, c.time, V.wallTrailFrames, V.wallTrailAlpha, WHITE, c.ms);
      const box = st.pieceBox(c.piece);
      if (box) st.burst('wind', count(c), centre(box), { h: box.h, dir: Math.sign(c.dx ?? 1) || 1 });
    }
    st.sound('sfx_whoosh');
  },

  // #7 shadow switch: the badge pop is ShadowView's; `sfx_ghost_ok` only when the shadow turned ✓ (easy / normal, no `?`)
  7: (c, st) => {
    if (c.flag) st.sound('sfx_ghost_ok');
  },

  // #8 cancel: arc back home 220 ms Cubic.easeInOut, scale → 1 (reduced: 150 ms straight); same spot: a short settle
  8: (c, st) => {
    if (c.piece === null) return;
    const home = st.restAnchor(c.piece);
    if (!home) return;
    if (c.flag) {
      st.pieceTrack(c.piece, c.time, [
        { ax: home.ax, ay: home.ay, ms: D.setYard, ease: st.ease(T.easing.move), scale: 1, alpha: 1 },
      ]);
      return;
    }
    const arc = c.reduced ? 0 : VIEW.cancelArcCells;
    st.pieceTrack(
      c.piece,
      c.time,
      [{ ax: home.ax, ay: home.ay, ms: c.ms, ease: easeOf(st, 8), arc, scale: 1, alpha: 1 }],
      { flying: true },
    );
    st.sound('sfx_cancel');
  },

  // #9 yard drop (K-10): settle 90 ms, scale 1,08 → 1, squash y 0,94 (reduced: none), 4 dust
  9: (c, st) => {
    const e = evOf(c, 'pieceMoved');
    if (!e || c.piece === null) return;
    const ease = easeOf(st, 9);
    st.pieceTrack(c.piece, c.time, [{ ax: e.to.x, ay: e.to.y, ms: c.ms, ease, scale: 1, alpha: 1 }]);
    const land = c.time + c.ms;
    if (!c.reduced) st.pieceSquash(c.piece, land, 1, V.setYardSquashY, c.ms, ease);
    const box = st.boxAt(c.piece, e.to);
    if (box) st.burst('dust', count(c), bottom(box), { w: box.w, at: land });
    st.sound('sfx_set_yard');
    st.haptic('light');
  },

  // #10 site fall: physics fall (tokens.physics), 2-frame vertical trail 20 % (reduced: none), `sfx_fall` from 3 rows
  10: (c, st) => {
    const e = evOf(c, 'pieceFell');
    if (!e || c.piece === null) return;
    const ph = T.physics;
    const ease =
      c.gravity === 'low'
        ? linear
        : c.gravity === 'high'
          ? fallLeg(e.rows, ph.fallHighAccel, ph.fallHighMax).ease
          : fallLeg(e.rows, ph.fallNormalAccel, ph.fallNormalMax).ease;
    st.pieceTrack(c.piece, c.time, [{ ax: e.to.x, ay: e.to.y, ms: c.ms, ease, scale: 1, alpha: 1 }]);
    if (!c.reduced && c.ms > 0) st.trail(c.piece, c.time, V.fallTrailFrames, V.fallTrailAlpha, null, c.ms);
    if (!c.instant && e.rows >= V.fallSoundMinRows) st.sound('sfx_fall');
  },

  // #11 landing: squash x 1,12 / y 0,86 → 1 (reduced x 1,03), 10 dust ±60 px (reduced 2), `sfx_land` +0…+4 dB
  11: (c, st) => {
    const e = evOf(c, 'pieceFell');
    if (!e || c.piece === null) return;
    const sx = reducedScale(V.landSquashX, c.reduced);
    const sy = c.reduced ? 2 - sx : V.landSquashY;
    st.pieceSquash(c.piece, c.time, sx, sy, c.ms, easeOf(st, 11));
    const box = st.boxAt(c.piece, e.to);
    if (box) st.burst('dust', count(c), bottom(box), { w: box.w + V.landDustSpreadPx, at: c.time });
    st.sound('sfx_land', { gain: landGain(e.rows), at: c.time });
    st.haptic('medium', c.time);
  },

  // #12 correct: white sweep over the block (reduced: 150 ms flash), 4 mortar dots, 14 sparks (reduced 4) rising,
  // `sfx_place_ok` at the streak pitch
  12: (c, st) => {
    if (c.piece === null) return;
    st.pieceFlash(c.piece, c.time, WHITE, V.flashPeak, c.ms, !c.reduced);
    const box = st.pieceBox(c.piece);
    if (box) {
      st.burst('spark', count(c), top(box), {
        w: box.w,
        colors: [st.pieceColor(c.piece), WHITE],
        at: c.time,
      });
      if (!c.reduced) {
        for (const p of [
          { x: box.x, y: box.y },
          { x: box.x + box.w, y: box.y },
          { x: box.x, y: box.y + box.h },
          { x: box.x + box.w, y: box.y + box.h },
        ])
          st.burst('grayDust', V.mortarDots / 4, p, { at: c.time });
      }
    }
    st.sound('sfx_place_ok', { rate: comboRate(c.n ?? 1), at: c.time });
    st.haptic('light', c.time);
  },

  // #13 wrong (K-17): red tint 100 ms, 2 px shake ×3, then the arc bounce (1,5 cells) to the K-17 target — over the
  // yard and down when `viaDrop`; into the truck queue it is #88. Reduced: tint + straight 220 ms path.
  13: (c, st) => {
    const e = evOf(c, 'pieceBounced');
    if (!e || c.piece === null) return;
    st.pieceFlash(c.piece, c.time, st.colorOf(T.color.ghost.invalid), V.wrongTintAlpha, V.wrongTintMs, false);
    st.sound('sfx_place_bad', { at: c.time });
    st.haptic('doubleLight', c.time);
    if (c.flag || e.to === 'queue') return;
    const to: At = e.to;
    const shake = c.reduced ? 0 : V.wrongShakeMs;
    if (shake > 0) st.pieceShake(c.piece, c.time, VIEW.shakePx, VIEW.shakeCycles, shake);
    const start = c.time + shake;
    const rows = e.viaDrop ? (c.n ?? 0) : 0;
    const fall = e.viaDrop ? yardFallMs(rows) : 0;
    const flight = Math.max(0, c.ms - shake - fall);
    const arc = c.reduced ? 0 : VIEW.bounceArcCells;
    const legs: LegSpec[] = [
      { ax: to.x, ay: to.y + rows, ms: flight, ease: st.ease(T.easing.move), arc, scale: 1, alpha: 1 },
    ];
    if (fall > 0) {
      const ph = T.physics;
      legs.push({ ax: to.x, ay: to.y, ms: fall, ease: fallLeg(rows, ph.yardFallAccel, ph.yardFallMax).ease });
    }
    st.pieceTrack(c.piece, start, legs, { flying: true });
    st.sound('sfx_bounce', { at: start });
    const box = st.boxAt(c.piece, to);
    if (box) st.burst('grayDust', count(c), bottom(box), { w: box.w, at: start + flight + fall });
  },

  // #15 streak bead: 0,6 → 1,2 → 1,0 (reduced 1,03), 4 gold sparks, `sfx_streak_pip` at the streak pitch
  15: (c, st) => {
    const reached = c.n ?? 1;
    const i = reached - 1;
    st.streakPip(
      i,
      c.time,
      c.reduced ? 1 : V.pipFrom,
      reducedScale(V.pipPeak, c.reduced),
      c.ms,
      easeOf(st, 15),
    );
    st.burst('gold', count(c), st.beadPoint(i), { at: c.time });
    st.sound('sfx_streak_pip', { rate: comboRate(reached), at: c.time });
  },

  // #16 Golden Trowel earned (MVP-lite): the trowel icon 1,0 → 1,4 → 1,1 and glows (reduced ≤ 1,03), beads empty
  16: (c, st) => {
    st.trowelsSet(c.n ?? 1);
    st.trowelPop(
      c.time,
      reducedScale(V.comboIconPeak, c.reduced),
      c.reduced ? 1 : V.comboIconRest,
      c.ms,
      easeOf(st, 16),
    );
    st.drive(c.time, c.ms, linear, (_k, u) => (u >= 1 ? st.streakSet(0) : undefined), false);
    st.sound('sfx_combo', { at: c.time });
    st.haptic('medium', c.time);
  },

  // #17 trowel use: the trowel flies (arc) to the build-front cell and plasters it left → right (200 ms setCrop);
  // 12 gold + colour sparks; `sfx_trowel` + `sfx_place_ok`. Reduced: the cell fades in.
  17: (c, st) => {
    const e = evOf(c, 'boosterApplied');
    if (!e) return;
    const d = e.detail as { readonly cell: At; readonly color: string; readonly trowels: number };
    const sweep = c.reduced ? c.ms : V.trowelSweepMs;
    const fly = c.reduced ? 0 : Math.max(0, c.ms - sweep);
    st.trowelsSet(d.trowels);
    st.trowelFill(d.cell, c.time, fly, sweep, c.reduced);
    const hit = c.time + fly;
    const r = st.cellRect(d.cell.x, d.cell.y);
    st.burst('gold', count(c), centre(r), {
      w: r.w,
      colors: [st.colorOf(T.color.ui.gold), st.colorOf(d.color)],
      at: hit,
    });
    st.sound('sfx_trowel', { at: hit });
    st.sound('sfx_place_ok', { at: hit + sweep });
    st.haptic('light', hit);
  },

  // #18 segment done (K-22, locked): scaffold fades, the structure flashes ×2, 3 px shake, the segment flies to the
  // panorama and the next one enters from the right; 24 confetti. Reduced: no shake, no confetti (JUICE §0 rule 8),
  // 150 ms fade.
  18: (c, st) => {
    const site = st.cellRect(6, T.layout.grid.rows - 1);
    const colors = st.siteColors();
    const done = evOf(c, 'segmentCompleted');
    st.segmentDone(c.time, c.ms, c.reduced, done ? done.seg : 0, c.toSeg ?? null, easeOf(st, 18));
    if (!c.reduced) {
      st.shake(V.segmentShakePx, c.time, D.scaffoldFade);
      st.burst('confetti', count(c), top(site), {
        w: site.w * 2,
        colors: colors.length > 0 ? colors : [WHITE],
        at: c.time,
      });
    }
    st.sound('sfx_segment', { at: c.time });
    st.haptic('heavy', c.time);
  },

  // #19 truck delivery (K-25, locked): the truck drives in, tips its bed, blocks drop 60 ms apart, it drives away;
  // horn, `sfx_land` −6 dB per block, 4 dust per block, haptic on the first block. Reduced: the truck fades.
  19: (c, st) => {
    const drops = c.drops ?? [];
    st.truck(c.time, c.ms, c.reduced, drops);
    st.sound('sfx_truck_horn', { at: c.time });
    drops.forEach((d, i) => {
      const land = c.time + d.delay + d.ms;
      st.sound('sfx_land', { at: land, gain: dbGain(V.truckLandDb) });
      const box = st.boxAt(d.pieceId, d.to);
      if (box) st.burst('dust', count(c), bottom(box), { w: box.w, at: land });
      if (i === 0) st.haptic('light', land);
    });
  },

  // #20 truck queue chip (K-26): queued blocks leave the chip for the yard (FIFO); the chip bumps 1,15 and shows N
  20: (c, st) => {
    const drops = c.drops ?? [];
    if (drops.length > 0) st.chipDrops(c.time, drops, st.ease(JUICE[88].ease), c.reduced);
    if (c.n !== undefined) st.queueSet(c.n);
    st.chipBump(c.time, reducedScale(V.chipPeak, c.reduced), juiceMs(20, c.reduced), easeOf(st, 20));
    st.sound('sfx_queue', { at: c.time });
  },

  // #22 static gap (W1): light flows along the rails (reduced: none), 4 sparks on the rail contact
  22: (c, st) => {
    if (c.n === undefined) return;
    st.railGlow(c.n, c.time, c.ms, !c.reduced);
    const box = c.piece === null ? null : st.pieceBox(c.piece);
    if (box)
      st.burst(
        'spark',
        count(c),
        { x: box.x, y: box.y + box.h },
        { colors: [WHITE, st.colorOf(T.color.board.scaffoldClamp)] },
      );
    st.sound('sfx_gap_rail');
    st.haptic('light');
  },

  // #23 rail park (K-12): the block settles on its rail node, two orange clamps pop 0 → 1 (reduced: no scale)
  23: (c, st) => {
    const e = evOf(c, 'pieceMoved');
    if (!e || c.piece === null) return;
    st.pieceTrack(c.piece, c.time, [
      { ax: e.to.x, ay: e.to.y, ms: c.ms, ease: st.ease(T.easing.move), scale: 1, alpha: 1 },
    ]);
    st.clamps(c.piece, c.time, c.ms, !c.reduced);
    st.sound('sfx_clamp');
    st.haptic('light');
  },

  // #50 moves counter: the digit slides up, the new one comes from below (reduced: at once)
  50: (c, st) => {
    const n = c.n ?? 0;
    if (c.reduced || c.ms <= 0) st.movesSet(n);
    else st.movesRoll(n, c.time, c.ms, easeOf(st, 50));
  },

  // #51 last 5 moves: red digit + edge, 1,0 ↔ 1,06 loop and one strong pulse per move (reduced: colour and edge only);
  // `sfx_lastmoves` + haptic only when the counter reaches 5
  51: (c, st) => {
    st.movesDanger(true, !c.reduced, c.time);
    if (!c.reduced) st.movesBump(c.time, V.lastMovesStrong, D.lastMovesPulse / 2, easeOf(st, 51));
    if (c.first) {
      st.sound('sfx_lastmoves', { at: c.time });
      st.haptic('light', c.time);
    }
  },

  // #52 +5 offer window (K-29): dim 200 ms → the window slides up and settles; options enter 40 ms apart; "+5" hops
  // once (no loop, R-15). Reduced: 150 ms fade, no hop.
  52: (c, st) => {
    offerWindow(c, st);
    st.sound('sfx_offer', { at: c.time });
    st.haptic('medium', c.time);
  },

  // #53 +5 moves: five "+1" chips fly to the counter 60 ms apart, the counter bumps 1,2 (reduced: one chip, at once)
  53: (c, st) => {
    const n = c.n ?? 0;
    const chips = c.reduced ? 1 : V.movesAddChips;
    const stagger = c.reduced ? 0 : V.movesAddStaggerMs;
    const fly = Math.max(0, c.ms - stagger * (chips - 1));
    st.movesChips(c.from ?? st.movesPoint(), chips, c.time, stagger, fly, easeOf(st, 53));
    const arrive = c.time + c.ms;
    st.drive(c.time, c.ms, linear, (_k, u) => (u >= 1 ? st.movesSet(n) : undefined), false);
    st.movesDanger(n <= V.lastMovesAt, !c.reduced, arrive);
    st.movesBump(arrive, reducedScale(V.movesAddBump, c.reduced), D.movesTick, st.ease(T.easing.pop));
    st.burst('gold', count(c), st.movesPoint(), { at: arrive });
    st.sound('sfx_moves_add', { at: c.time });
    st.haptic('success', c.time);
  },

  // #55 win (K-28, locked): the site glows 400 ms → the ribbon is cut 600 ms → confetti 2 × 40 for 1,5 s with
  // "KAZANDIN!" 0 → 1,1 → 1,0 in its first 500 ms. Reduced: a static banner instead of confetti, the title fades.
  55: (c, st) => {
    const glow = D.winGlow;
    const ribbon = D.winRibbon;
    st.siteGlow(c.time, glow);
    st.ribbonCut(c.time + glow, ribbon, c.reduced);
    const party = c.time + glow + ribbon;
    const recipe = JUICE[55].particles;
    if (!c.reduced && recipe) {
      const board = st.boardRect();
      const colors = Object.values(T.color.block).map((h) => st.colorOf(h));
      for (let wave = 0; wave < recipe.waves; wave++) {
        st.burst(
          'confetti',
          recipe.count,
          { x: board.x + board.w / 2, y: board.y + board.h * 0.35 },
          {
            w: board.w,
            colors,
            at: party + (wave * D.winConfetti) / (2 * recipe.waves),
          },
        );
      }
    }
    st.banner('win.title', party, V.winTitleMs, c.reduced ? 'fade' : 'pop', easeOf(st, 55));
    st.sound('music_win', { at: c.time });
    st.haptic('win', c.time);
  },

  // #56 Bonus İnşaat: each counted move (≤ META `bonusMaxMovesCounted`) becomes a coin 120 ms apart; pitch +1 semitone
  // every 3 coins; haptic every 3rd; the rest fade on the counter. Reduced: the counter counts down in 300 ms.
  56: (c, st) => {
    const total = c.n ?? 0;
    if (total <= 0) return;
    if (c.reduced) {
      st.drive(c.time, c.ms, linear, (k) => st.movesSet(Math.round(total * (1 - k))), false);
      st.sound('sfx_coin', { at: c.time });
      st.haptic('light', c.time);
      return;
    }
    const counted = Math.max(1, Math.min(total, Math.round(c.ms / D.bonusPerMove)));
    const per = c.ms / counted;
    for (let i = 0; i < counted; i++) {
      const at = c.time + i * per;
      const left = total - i - 1;
      st.drive(at, 0, linear, () => st.movesSet(i === counted - 1 ? 0 : left), false);
      st.coinFly(at, V.bonusCoinFlyMs, easeOf(st, 56));
      st.burst('gold', count(c), st.movesPoint(), { at });
      st.sound('sfx_coin', { at, rate: coinRate(i) });
      if ((i + 1) % V.bonusPitchEvery === 0) st.haptic('light', at);
    }
  },

  // #57 out of moves (K-29): the board darkens 20 %, "Hamleler bitti!" drops from the top (reduced: fades)
  57: (c, st) => {
    st.boardDim(V.loseDim, c.time, c.ms);
    st.banner('lose.title', c.time, c.ms, c.reduced ? 'fade' : 'drop', easeOf(st, 57));
    st.sound('sfx_out_of_moves', { at: c.time });
    st.haptic('medium', c.time);
  },

  // #58 life lost: the heart's fill drains bottom → top to grey, no break (reduced: at once)
  58: (c, st) => {
    const heart = c.heart;
    if (heart) {
      if (c.reduced || c.ms <= 0) heart.setDrain(1);
      else st.drive(c.time, c.ms, easeOf(st, 58), (k) => heart.setDrain(k), false);
    }
    st.sound('sfx_life_lost', { at: c.time });
    st.haptic('light', c.time);
  },

  // #69 button: press 0,94 + lip 12 → 4 px (60 ms); release 1,04 → 1,0 (120 ms). Reduced: the lip only.
  69: (c, st) => {
    const b = c.button;
    if (!b) return;
    const lip = T.shadow.buttonLipPx;
    const pressed = T.shadow.buttonPressedLipPx;
    if (c.variant === 'release') {
      b.setLip(lip);
      if (!c.reduced)
        st.drive(
          c.time,
          D.buttonRelease,
          linear,
          (_k, u) => setScale(b, popCurve(u, V.buttonPressScale, V.buttonReleasePeak, 1, 0.4)),
          false,
        );
      return;
    }
    if (!c.reduced)
      st.tween(b, { scaleX: V.buttonPressScale, scaleY: V.buttonPressScale }, c.time, c.ms, easeOf(st, 69));
    st.drive(c.time, c.ms, easeOf(st, 69), (k) => b.setLip(lip + (pressed - lip) * k), false);
    st.sound('sfx_button');
    st.haptic('light');
  },

  // #70 window opens: dim 0 → 55 % (180 ms), panel 0,85 → 1,03 → 1,0 (220 ms). Reduced: 150 ms fade.
  70: (c, st) => {
    const w = c.window;
    if (w) {
      if (w.dim)
        st.tween(w.dim, { alpha: T.alpha.overlay }, c.time, c.reduced ? c.ms : V.popupDimMs, linear, {
          alpha: 0,
        });
      if (c.reduced) st.tween(w.panel, { alpha: 1 }, c.time, c.ms, linear, { alpha: 0 });
      else {
        const panel = w.panel;
        const ease = easeOf(st, 70);
        panel.alpha = 1;
        st.drive(
          c.time,
          c.ms,
          linear,
          (_k, u) => setScale(panel, popCurve(ease(u), V.popupFrom, V.popupPeak, 1, 0.7)),
          false,
        );
      }
    }
    st.sound('sfx_popup', { at: c.time });
  },

  // #71 window closes: panel 1,0 → 0,9 + fade (160 ms Quad.easeIn). Reduced: 120 ms fade.
  71: (c, st) => {
    const w = c.window;
    if (w) {
      const ease = c.reduced ? linear : easeOf(st, 71);
      if (w.dim) st.tween(w.dim, { alpha: 0 }, c.time, c.ms, ease);
      const to = c.reduced ? { alpha: 0 } : { alpha: 0, scaleX: V.popupCloseTo, scaleY: V.popupCloseTo };
      st.tween(w.panel, to, c.time, c.ms, ease);
    }
    st.sound('sfx_close', { at: c.time });
  },

  // #83 build front (K-34): the next-floor cells crossfade to the front look (reduced: at once)
  83: (c, st) => {
    st.frontShift(c.time, c.reduced ? 0 : c.ms, easeOf(st, 83));
  },

  // #84 missing support (K-34): yellow hatch on the missing cells blinks 3× over 600 ms (reduced: steady), 2 ticks −14 dB
  84: (c, st) => {
    const cells = c.cells ?? [];
    if (cells.length === 0) return;
    st.supportFlash(cells, c.time, c.ms, c.reduced ? 0 : V.supportBlinks);
    const gain = dbGain(V.supportTickDb);
    st.sound('sfx_tick', { at: c.time, gain });
    st.sound('sfx_tick', { at: c.time + c.ms / V.supportBlinks, gain });
  },

  // #87 resume (K-43, UX §1): the board fades in (150 ms) with the Pause window and the 1,5 s `resume.strip`;
  // exception (a) out-of-moves: the offer window (#52) instead; (c) void attempt: notice window (+ refund coins).
  87: (c, st) => {
    if (c.variant === 'void') {
      st.sound('sfx_popup', { at: c.time });
      if ((c.n ?? 0) > 0) st.sound('sfx_coin', { at: c.time + D.popupOpen });
      return;
    }
    st.boardFadeIn(c.time, c.ms);
    const after = c.time + c.ms;
    if (c.variant === 'offer') {
      // exception (a): no Pause window — the out-of-moves window enters like #52 (same offer number), no haptic
      offerWindow({ ...c, id: 52, time: after, ms: juiceMs(52, c.reduced) }, st);
      st.sound('sfx_offer', { at: after });
      return;
    }
    st.toast('resume.strip', { n: st.levelNumber() }, after, D.resumeToast);
    if (c.window) H[70]({ ...c, id: 70, time: after, ms: juiceMs(70, c.reduced) }, st);
    else st.sound('sfx_popup', { at: after });
  },

  // #88 bounce → truck queue (K-17 step 3): the block shrinks and flies into the "Kamyonda: N" chip, which bumps
  // (reduced: the block fades, the number changes)
  88: (c, st) => {
    if (c.piece === null) return;
    const here = st.pieceAnchor(c.piece);
    if (!here) return;
    const target = c.reduced ? here : (st.anchorAt(c.piece, st.chipPoint()) ?? here);
    const scale = c.reduced ? 1 : V.queueShrink;
    st.pieceTrack(
      c.piece,
      c.time,
      [{ ax: target.ax, ay: target.ay, ms: c.ms, ease: easeOf(st, 88), scale, alpha: 0 }],
      { flying: true, hideAtEnd: true },
    );
    const arrive = c.time + c.ms;
    st.drive(c.time, c.ms, linear, (_k, u) => (u >= 1 ? st.queueSet(st.queueCount()) : undefined), false);
    st.chipBump(arrive, reducedScale(V.chipPeak, c.reduced), juiceMs(20, c.reduced), st.ease(JUICE[20].ease));
    st.sound('sfx_queue', { at: arrive });
  },
};

/** The handler table: exactly one handler per JUICE Phase 2 P0 id. */
export const JUICE_HANDLERS: { readonly [K in JuiceId]: JuiceHandler } = Object.freeze(H);

/** Every P0 id with its handler, in JUICE order (debug panel, tests). */
export function handlerEntries(): readonly (readonly [JuiceId, JuiceHandler])[] {
  return JUICE_P0_IDS.map((id) => [id, JUICE_HANDLERS[id]] as const);
}
