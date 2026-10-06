/**
 * Particle simulation with a fixed budget (JUICE §0 rule 4; TECH_DESIGN §10.4, §10.6). Pure: no Phaser, no clock, the
 * random source is injected (presentation only — the core's seeded RNG is never used here).
 *
 * - Capacity = `particles.maxOnScreen` (120) particle slots allocated ONCE (struct of arrays); spawning and updating
 *   allocate nothing (TECH §10.6 "sıcak yollarda tahsis yok").
 * - One burst holds at most `particles.maxPerBurst` (40); larger moments are split into waves by the caller (#55 win:
 *   `particles.win` × `winWaves`).
 * - Over budget, the OLDEST burst dies early ("en eski patlama erken söner"): its particles are removed first.
 * - Families give the motion (dust puffs sideways, sparks rise 120–220 px, confetti falls with spin, wind streaks fly
 *   flat); the renderer (ParticleLayer) only draws `x, y, size, aspect, rotation, colour, alpha`.
 */
import { TOKENS } from '../../../theme/tokens.ts';
import type { ParticleFamily } from './catalog.ts';

export interface BurstSpec {
  readonly family: ParticleFamily;
  readonly count: number;
  /** Spawn centre (design px). */
  readonly x: number;
  readonly y: number;
  /** Spawn box around the centre (design px; default 0 × 0). */
  readonly w?: number;
  readonly h?: number;
  /** 0xRRGGBB colours picked in turn (default: the family colour). */
  readonly colors?: readonly number[];
  /** Horizontal direction of wind streaks (−1 / 1). */
  readonly dir?: number;
}

interface FamilyStyle {
  readonly speed: readonly [number, number];
  /** Direction (deg, 0 = up, clockwise) and full spread. */
  readonly angle: number;
  readonly spread: number;
  /** px/s² downward. */
  readonly gravity: number;
  readonly life: readonly [number, number];
  readonly size: readonly [number, number];
  /** Width / height of the drawn quad. */
  readonly aspect: number;
  /** Spin (deg/s, ±). */
  readonly spin: number;
  readonly alpha: number;
}

/** Motion of each family (ART `fx_*`; JUICE rows give counts and the spark rise 120–220 px). */
export const FAMILY_STYLE: Readonly<Record<ParticleFamily, FamilyStyle>> = Object.freeze({
  dust: { speed: [60, 180], angle: 0, spread: 170, gravity: 260, life: [320, 520], size: [10, 18], aspect: 1, spin: 90, alpha: 0.75 },
  grayDust: { speed: [50, 140], angle: 0, spread: 170, gravity: 260, life: [300, 480], size: [8, 14], aspect: 1, spin: 90, alpha: 0.8 },
  spark: { speed: [460, 640], angle: 0, spread: 60, gravity: 900, life: [360, 560], size: [8, 14], aspect: 1, spin: 360, alpha: 1 },
  gold: { speed: [220, 460], angle: 0, spread: 360, gravity: 520, life: [380, 620], size: [10, 16], aspect: 1, spin: 360, alpha: 1 },
  confetti: { speed: [520, 900], angle: 0, spread: 80, gravity: 1100, life: [1100, 1500], size: [14, 22], aspect: 0.55, spin: 540, alpha: 1 },
  wind: { speed: [700, 950], angle: 90, spread: 12, gravity: 0, life: [160, 220], size: [36, 56], aspect: 0.12, spin: 0, alpha: 0.6 },
});

export type RandomFn = () => number;

export class ParticleField {
  readonly capacity: number;
  readonly maxPerBurst: number;
  private readonly x: Float32Array;
  private readonly y: Float32Array;
  private readonly vx: Float32Array;
  private readonly vy: Float32Array;
  private readonly g: Float32Array;
  private readonly age: Float32Array;
  private readonly life: Float32Array;
  private readonly size: Float32Array;
  private readonly aspect: Float32Array;
  private readonly rot: Float32Array;
  private readonly vr: Float32Array;
  private readonly alpha0: Float32Array;
  private readonly color: Uint32Array;
  private readonly burst: Uint32Array;
  private alive = 0;
  private nextBurst = 1;
  private readonly random: RandomFn;

  constructor(opts: { capacity?: number; maxPerBurst?: number; random?: RandomFn } = {}) {
    this.capacity = opts.capacity ?? TOKENS.particles.maxOnScreen;
    this.maxPerBurst = opts.maxPerBurst ?? TOKENS.particles.maxPerBurst;
    this.random = opts.random ?? Math.random;
    const n = this.capacity;
    this.x = new Float32Array(n);
    this.y = new Float32Array(n);
    this.vx = new Float32Array(n);
    this.vy = new Float32Array(n);
    this.g = new Float32Array(n);
    this.age = new Float32Array(n);
    this.life = new Float32Array(n);
    this.size = new Float32Array(n);
    this.aspect = new Float32Array(n);
    this.rot = new Float32Array(n);
    this.vr = new Float32Array(n);
    this.alpha0 = new Float32Array(n);
    this.color = new Uint32Array(n);
    this.burst = new Uint32Array(n);
  }

  /** Alive particles. */
  get count(): number {
    return this.alive;
  }

  /** Bursts with at least one alive particle. */
  get bursts(): number {
    const ids = new Set<number>();
    for (let i = 0; i < this.alive; i++) ids.add(this.burst[i] ?? 0);
    return ids.size;
  }

  /** Spawns one burst (count clamped to `maxPerBurst`); the oldest bursts die first when the budget is full. */
  emit(spec: BurstSpec, defaultColor: number): number {
    const n = Math.min(Math.max(0, Math.floor(spec.count)), this.maxPerBurst, this.capacity);
    if (n === 0) return 0;
    while (this.alive + n > this.capacity) this.killOldestBurst();
    const st = FAMILY_STYLE[spec.family];
    const id = this.nextBurst++;
    const rnd = this.random;
    const colors = spec.colors && spec.colors.length > 0 ? spec.colors : null;
    const dir = spec.dir !== undefined && spec.dir < 0 ? -1 : 1;
    for (let k = 0; k < n; k++) {
      const i = this.alive++;
      const deg = st.angle * dir + (rnd() - 0.5) * st.spread;
      const rad = (deg * Math.PI) / 180;
      const speed = lerp(st.speed[0], st.speed[1], rnd());
      this.x[i] = spec.x + (rnd() - 0.5) * (spec.w ?? 0);
      this.y[i] = spec.y + (rnd() - 0.5) * (spec.h ?? 0);
      this.vx[i] = Math.sin(rad) * speed;
      this.vy[i] = -Math.cos(rad) * speed;
      this.g[i] = st.gravity;
      this.age[i] = 0;
      this.life[i] = lerp(st.life[0], st.life[1], rnd());
      this.size[i] = lerp(st.size[0], st.size[1], rnd());
      this.aspect[i] = st.aspect;
      this.rot[i] = st.spin === 0 ? (dir < 0 ? 180 : 0) : rnd() * 360;
      this.vr[i] = (rnd() - 0.5) * 2 * st.spin;
      this.alpha0[i] = st.alpha;
      this.color[i] = colors ? (colors[k % colors.length] ?? defaultColor) : defaultColor;
      this.burst[i] = id;
    }
    return n;
  }

  /** Advances the simulation by `dtMs`; dead particles are removed (swap with the last). */
  update(dtMs: number): void {
    const dt = Math.max(0, dtMs) / 1000;
    let i = 0;
    while (i < this.alive) {
      const age = (this.age[i] ?? 0) + dtMs;
      if (age >= (this.life[i] ?? 0)) {
        this.removeAt(i);
        continue;
      }
      this.age[i] = age;
      const vy = (this.vy[i] ?? 0) + (this.g[i] ?? 0) * dt;
      this.vy[i] = vy;
      this.x[i] = (this.x[i] ?? 0) + (this.vx[i] ?? 0) * dt;
      this.y[i] = (this.y[i] ?? 0) + vy * dt;
      this.rot[i] = (this.rot[i] ?? 0) + (this.vr[i] ?? 0) * dt;
      i++;
    }
  }

  /**
   * Visits every alive particle: position (design px), size (px), aspect, rotation (deg), colour, alpha (fades out
   * over the last half of its life). No allocation.
   */
  forEach(
    visit: (i: number, x: number, y: number, size: number, aspect: number, rot: number, color: number, alpha: number) => void,
  ): void {
    for (let i = 0; i < this.alive; i++) {
      const u = (this.age[i] ?? 0) / (this.life[i] ?? 1);
      const fade = u < 0.5 ? 1 : 1 - (u - 0.5) * 2;
      visit(
        i,
        this.x[i] ?? 0,
        this.y[i] ?? 0,
        this.size[i] ?? 0,
        this.aspect[i] ?? 1,
        this.rot[i] ?? 0,
        this.color[i] ?? 0xffffff,
        (this.alpha0[i] ?? 1) * fade,
      );
    }
  }

  clear(): void {
    this.alive = 0;
  }

  private killOldestBurst(): void {
    let oldest = Infinity;
    for (let i = 0; i < this.alive; i++) oldest = Math.min(oldest, this.burst[i] ?? Infinity);
    let i = 0;
    while (i < this.alive) {
      if (this.burst[i] === oldest) this.removeAt(i);
      else i++;
    }
  }

  private removeAt(i: number): void {
    const last = --this.alive;
    if (i === last) return;
    this.x[i] = this.x[last] ?? 0;
    this.y[i] = this.y[last] ?? 0;
    this.vx[i] = this.vx[last] ?? 0;
    this.vy[i] = this.vy[last] ?? 0;
    this.g[i] = this.g[last] ?? 0;
    this.age[i] = this.age[last] ?? 0;
    this.life[i] = this.life[last] ?? 0;
    this.size[i] = this.size[last] ?? 0;
    this.aspect[i] = this.aspect[last] ?? 1;
    this.rot[i] = this.rot[last] ?? 0;
    this.vr[i] = this.vr[last] ?? 0;
    this.alpha0[i] = this.alpha0[last] ?? 1;
    this.color[i] = this.color[last] ?? 0;
    this.burst[i] = this.burst[last] ?? 0;
  }
}

function lerp(a: number, b: number, k: number): number {
  return a + (b - a) * k;
}
