/**
 * JUICE Phase 2 P0 catalogue (docs/JUICE.md §0 rule 12; TECH_DESIGN §6.3 "Sahne tarafı", §14.1 #11). Pure data: one
 * row per P0 event with its duration, ease, sounds, haptic and particles — every value read from `tokens.json`
 * (`duration.*`, `easing.*`, `particles.*`) or, when design-lead has no token yet, from `JUICE_VIEW` (viewConstants.ts).
 *
 * TECH §6.3: "her JUICE olayı `EventPlayer` tablosunda `{ full, reduced }` iki tarifle durur". `ms` is the full recipe,
 * `reducedMs` the "Animasyonları azalt" fade variant (JUICE §0 rule 8: fades instead of slides, scale ≤
 * `a11y.reducedScaleMax`, no screen shake, particles × `particles.reducedFactor`; game information is never lost and
 * rule durations do not change). Sounds and haptics are the same in both variants (haptics follow only the vibration
 * switch).
 *
 * Input classes (JUICE §0 rule 3, R-12, D-021):
 * - `lock`: the board takes no input while it plays (segment slide, truck delivery; level end); a touch plays the rest
 *   3× faster.
 * - `fastForward`: it changes the board (fall, landing, bounce, …): a grab makes it jump to its last frame.
 * - neither: it runs at its own pace (particles, sounds, the support hatch, HUD pulses, windows).
 */
import type { HapticName } from '../../../services/haptics.ts';
import type { SoundName } from '../../../services/audio.ts';
import { TOKENS } from '../../../theme/tokens.ts';
import { JUICE_VIEW } from '../viewConstants.ts';

/** JUICE §0 rule 12 "Faz 2 P0" = #1–13, 15–20, 22, 23, 50–53, 55–58, 69–71, 83–84, 87, 88 (36 events). */
export const JUICE_P0_IDS = Object.freeze([
  1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 15, 16, 17, 18, 19, 20, 22, 23, 50, 51, 52, 53, 55, 56, 57, 58,
  69, 70, 71, 83, 84, 87, 88,
] as const);

export type JuiceId = (typeof JUICE_P0_IDS)[number];

/** Particle families (`fx_*` in ART; drawn from one pooled layer, JUICE §0 rule 4). */
export type ParticleFamily = 'dust' | 'grayDust' | 'spark' | 'gold' | 'confetti' | 'wind';

export interface ParticleRecipe {
  readonly family: ParticleFamily;
  /** Particles of one burst (≤ `particles.maxPerBurst`). */
  readonly count: number;
  /** Reduced-motion count (JUICE row value, else `count × particles.reducedFactor`). */
  readonly reduced: number;
  /** Bursts (waves) of the event (#55: `particles.winWaves`). */
  readonly waves: number;
}

export interface JuiceSpec {
  readonly id: JuiceId;
  /** Short English name (logs, debug panel). */
  readonly name: string;
  /** Full duration (ms); 0 = continuous or computed per event (#3, #10). */
  readonly ms: number;
  /** "Animasyonları azalt" duration (ms). */
  readonly reducedMs: number;
  /** Phaser ease name of the main motion (JUICE §0 rule 9). */
  readonly ease: string;
  /** Every sound the row may play (`audio.sfx` / `audio.seq`). */
  readonly sounds: readonly SoundName[];
  readonly haptic: HapticName | null;
  readonly particles: ParticleRecipe | null;
  readonly lock: boolean;
  readonly fastForward: boolean;
}

const D = TOKENS.duration;
const E = TOKENS.easing;
const P = TOKENS.particles;
const V = JUICE_VIEW;

/** `count × particles.reducedFactor`, rounded (JUICE §0 rule 8: "parçacık sayısı ≤ %20"). */
export function reducedCount(count: number): number {
  return Math.round(count * P.reducedFactor);
}

function parts(
  family: ParticleFamily,
  count: number,
  reduced = reducedCount(count),
  waves = 1,
): ParticleRecipe {
  return { family, count: Math.min(count, P.maxPerBurst), reduced, waves };
}

type Row = Omit<JuiceSpec, 'id' | 'lock' | 'fastForward' | 'particles' | 'haptic' | 'reducedMs'> & {
  readonly reducedMs?: number;
  readonly particles?: ParticleRecipe | null;
  readonly haptic?: HapticName | null;
  readonly lock?: boolean;
  readonly fastForward?: boolean;
};

const ROWS: { readonly [K in JuiceId]: Row } = {
  1: { name: 'lift', ms: D.pick, ease: E.pop, sounds: ['sfx_pick'], haptic: 'light' },
  2: {
    name: 'pickBlocked',
    ms: D.blockedShake,
    reducedMs: V.blockedFlashMs,
    ease: E.settle,
    sounds: ['sfx_blocked'],
    haptic: 'light',
    particles: parts('dust', V.blockedDust),
  },
  3: { name: 'dragFollow', ms: 0, ease: E.linear, sounds: [] },
  4: {
    name: 'stickyBump',
    ms: D.bump,
    reducedMs: 0,
    ease: E.pop,
    sounds: ['sfx_bump'],
    haptic: 'light',
    particles: parts('dust', V.bumpDust),
  },
  5: { name: 'craneEnter', ms: D.craneEnter, ease: E.move, sounds: [] },
  6: {
    name: 'wallPass',
    ms: D.wallPass,
    reducedMs: 0,
    ease: E.move,
    sounds: ['sfx_whoosh'],
    particles: parts('wind', V.windLines, 0),
  },
  7: { name: 'ghostSwitch', ms: D.ghostSwitch, ease: E.move, sounds: ['sfx_ghost_ok'] },
  8: {
    name: 'cancel',
    ms: D.cancel,
    reducedMs: D.reducedFade,
    ease: E.slide,
    sounds: ['sfx_cancel'],
    fastForward: true,
  },
  9: {
    name: 'yardDrop',
    ms: D.setYard,
    ease: E.move,
    sounds: ['sfx_set_yard'],
    haptic: 'light',
    particles: parts('dust', V.setYardDust),
    fastForward: true,
  },
  10: { name: 'siteFall', ms: 0, ease: E.linear, sounds: ['sfx_fall'], fastForward: true },
  11: {
    name: 'landing',
    ms: D.land,
    ease: E.pop,
    sounds: ['sfx_land'],
    haptic: 'medium',
    particles: parts('dust', P.land, 2),
    fastForward: true,
  },
  12: {
    name: 'placeCorrect',
    ms: D.placeOk,
    reducedMs: D.reducedFade,
    ease: E.burst,
    sounds: ['sfx_place_ok'],
    haptic: 'light',
    particles: parts('spark', P.placeOk, 4),
    fastForward: true,
  },
  13: {
    name: 'placeWrong',
    ms: D.placeBad,
    reducedMs: D.cancel,
    ease: E.settle,
    sounds: ['sfx_place_bad', 'sfx_bounce'],
    haptic: 'doubleLight',
    particles: parts('grayDust', V.wrongDust),
    fastForward: true,
  },
  15: {
    name: 'streakPip',
    ms: D.streakPip,
    ease: E.pop,
    sounds: ['sfx_streak_pip'],
    particles: parts('gold', V.pipSparks),
  },
  // MVP-lite (JUICE §0 rule 12): icon glow + sound only — no spark rain, no dance.
  16: { name: 'trowelEarned', ms: D.combo, ease: E.elastic, sounds: ['sfx_combo'], haptic: 'medium' },
  17: {
    name: 'trowelUse',
    ms: D.goldTrowel,
    reducedMs: D.reducedFade,
    ease: V.easeMoveInOut,
    sounds: ['sfx_trowel', 'sfx_place_ok'],
    haptic: 'light',
    particles: parts('gold', V.trowelSparks),
    fastForward: true,
  },
  18: {
    name: 'segmentDone',
    ms: D.segment,
    reducedMs: D.reducedFade,
    ease: E.slide,
    sounds: ['sfx_segment'],
    haptic: 'heavy',
    particles: parts('confetti', P.segment),
    lock: true,
  },
  19: {
    name: 'truckDelivery',
    ms: D.truck,
    ease: E.pop,
    sounds: ['sfx_truck_horn', 'sfx_land'],
    haptic: 'light',
    particles: parts('dust', V.truckDustPerBlock),
    lock: true,
  },
  20: { name: 'queueChip', ms: D.queue, ease: E.pop, sounds: ['sfx_queue'], fastForward: true },
  22: {
    name: 'gapRail',
    ms: D.gapRail,
    ease: E.move,
    sounds: ['sfx_gap_rail'],
    haptic: 'light',
    particles: parts('spark', V.railSparks),
  },
  23: {
    name: 'railClamp',
    ms: D.clamp,
    ease: E.pop,
    sounds: ['sfx_clamp'],
    haptic: 'light',
    fastForward: true,
  },
  50: { name: 'movesTick', ms: D.movesTick, reducedMs: 0, ease: E.move, sounds: [] },
  51: {
    name: 'lastMoves',
    ms: D.lastMovesPulse,
    reducedMs: 0,
    ease: E.settle,
    sounds: ['sfx_lastmoves'],
    haptic: 'light',
  },
  52: {
    name: 'offerOpen',
    ms: D.offer,
    reducedMs: D.reducedFade,
    ease: E.pop,
    sounds: ['sfx_offer'],
    haptic: 'medium',
  },
  53: {
    name: 'movesAdded',
    ms: D.movesAdd,
    reducedMs: D.reducedFade,
    ease: V.easeMoveInOut,
    sounds: ['sfx_moves_add'],
    haptic: 'success',
    particles: parts('gold', V.movesAddSparks),
  },
  55: {
    name: 'win',
    ms: D.win,
    ease: E.elastic,
    sounds: ['music_win'],
    haptic: 'win',
    particles: parts('confetti', P.win, 0, P.winWaves),
    lock: true,
  },
  56: {
    name: 'bonusBuild',
    ms: D.bonusPerMove,
    reducedMs: V.bonusReducedMs,
    ease: E.move,
    sounds: ['sfx_coin'],
    haptic: 'light',
    particles: parts('gold', V.bonusSparks),
    lock: true,
  },
  57: {
    name: 'outOfMoves',
    ms: D.outOfMoves,
    reducedMs: D.reducedFade,
    ease: E.pop,
    sounds: ['sfx_out_of_moves'],
    haptic: 'medium',
    lock: true,
  },
  58: {
    name: 'lifeLost',
    ms: D.lifeLost,
    reducedMs: 0,
    ease: E.moveIn,
    sounds: ['sfx_life_lost'],
    haptic: 'light',
  },
  69: {
    name: 'button',
    ms: D.buttonPress,
    ease: E.move,
    sounds: ['sfx_button'],
    haptic: 'light',
  },
  70: { name: 'popupOpen', ms: D.popupOpen, reducedMs: D.reducedFade, ease: E.pop, sounds: ['sfx_popup'] },
  71: {
    name: 'popupClose',
    ms: D.popupClose,
    reducedMs: V.popupCloseReducedMs,
    ease: E.moveIn,
    sounds: ['sfx_close'],
  },
  83: { name: 'frontShift', ms: D.frontShift, reducedMs: 0, ease: E.move, sounds: [], fastForward: true },
  84: { name: 'supportFlash', ms: D.supportFlash, ease: E.settle, sounds: ['sfx_tick'] },
  87: {
    name: 'resume',
    ms: D.reducedFade,
    ease: E.move,
    // UX §1: Pause window (sfx_popup); exception (a) out-of-moves offer (sfx_offer); (c) void notice + refund (sfx_coin)
    sounds: ['sfx_popup', 'sfx_offer', 'sfx_coin'],
  },
  88: {
    name: 'bounceToQueue',
    ms: D.bounceToQueue,
    reducedMs: D.reducedFade,
    ease: V.easeMoveInOut,
    sounds: ['sfx_queue'],
    fastForward: true,
  },
};

function build(): { readonly [K in JuiceId]: JuiceSpec } {
  const out = {} as { [K in JuiceId]: JuiceSpec };
  for (const id of JUICE_P0_IDS) {
    const r = ROWS[id];
    out[id] = Object.freeze({
      id,
      name: r.name,
      ms: r.ms,
      reducedMs: r.reducedMs ?? r.ms,
      ease: r.ease,
      sounds: Object.freeze([...r.sounds]),
      haptic: r.haptic ?? null,
      particles: r.particles ?? null,
      lock: r.lock ?? false,
      fastForward: r.fastForward ?? false,
    });
  }
  return Object.freeze(out);
}

/** The P0 table (frozen). */
export const JUICE: { readonly [K in JuiceId]: JuiceSpec } = build();

export function isP0(id: number): id is JuiceId {
  return (JUICE_P0_IDS as readonly number[]).includes(id);
}

/** Duration of `id` in the current motion mode. */
export function juiceMs(id: JuiceId, reduced: boolean): number {
  const spec = JUICE[id];
  return reduced ? spec.reducedMs : spec.ms;
}

/** Particles of one burst of `id` in the current motion mode (0 when the row has none). */
export function juiceParticles(id: JuiceId, reduced: boolean): number {
  const p = JUICE[id].particles;
  if (!p) return 0;
  return reduced ? p.reduced : p.count;
}

/** Playback rate of a pitch step of `semitones` (TECH §11.6: pitch steps are played with `rate`, not re-rendered). */
export function semitoneRate(semitones: number): number {
  return 2 ** (semitones / 12);
}

/** Linear gain of `db` decibels. */
export function dbGain(db: number): number {
  return 10 ** (db / 20);
}

/**
 * JUICE #12 / #15 combo pitch: the streak value a placement reached (1…4) → `audio.comboSemitones` step (+0, +2, +4,
 * +5, +7; the 5th step is unused while K-33 earns the trowel at 4).
 */
export function comboRate(reached: number): number {
  const steps = TOKENS.audio.comboSemitones;
  const i = Math.max(0, Math.min(steps.length - 1, reached - 1));
  return semitoneRate(steps[i] ?? 0);
}

/** JUICE #11: `sfx_land` gets +0…+4 dB over the fall distance (0 … 8 rows). */
export function landGain(rows: number): number {
  const k = Math.max(0, Math.min(1, rows / JUICE_VIEW.landRowsForMaxDb));
  return dbGain(k * JUICE_VIEW.landMaxDb);
}

/** JUICE #56: pitch of the n-th coin (0-based): +1 semitone every 3 coins, at most +12. */
export function coinRate(n: number): number {
  const v = JUICE_VIEW;
  return semitoneRate(Math.min(v.bonusPitchMax, Math.floor(n / v.bonusPitchEvery)));
}

/** JUICE §0 rule 8: a scale peak in the reduced variant (≤ `a11y.reducedScaleMax`). */
export function reducedScale(peak: number, reduced: boolean): number {
  if (!reduced) return peak;
  const max = TOKENS.a11y.reducedScaleMax;
  return peak >= 1 ? Math.min(peak, max) : Math.max(peak, 2 - max);
}
