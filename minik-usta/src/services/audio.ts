/**
 * Procedural sound service (docs/TECH_DESIGN.md §11.6; D-057; JUICE §0 rule 6; ASSET_LIST §13).
 *
 * - Recipes come only from design tokens: `audio.sfx.<name>` (one ZzFX call) and `audio.seq.<name>` (`[startMs, params]`
 *   steps mixed into one buffer). Name resolution: `audio.sfx` first, then `audio.seq`; a name in both is a development
 *   error (`assertDisjointSoundSets`).
 * - Rendering is pure (`renderSound`), at `audio.sampleRateHz` mono, and is sliced over frames by `SoundBank.pump`
 *   (≤ `audio.prerenderBudgetMsPerFrame` per call). A sound is rendered in resumable chunks of `RENDER_CHUNK_SAMPLES`
 *   (`RecipeRender`): a call stops at the first chunk boundary past the budget, never at the end of a whole sound
 *   (review Faz 2 tur 4 #0: `music_win` alone was 11,5 ms at 1×, ≈ 46 ms at 4× CPU).
 * - Playback policy (`SoundGate`): a sound name plays at most once per `audio.sameSoundCooldownMs`, at most
 *   `audio.maxVoices` sounds at once; requests while the audio context is locked are DROPPED, never queued.
 * - No `AudioContext` exists at import time. `AudioService` creates it on `prepare()` (boot, outside any input) or at
 *   the latest on `unlock()` (call it from a user gesture), which resumes it.
 *   Engine-free: the Phaser sound manager can instead take `SoundBank` buffers through `toAudioBuffer` (TECH §11.6).
 */
import { TOKENS } from '../theme/tokens.ts';
import type { Tokens } from '../theme/tokens.ts';
import { ZzfxRender, zzfxLength } from './audio/zzfxSynth.ts';

export type AudioTokens = Tokens['audio'];
export type SfxName = keyof AudioTokens['sfx'];
export type SeqName = keyof AudioTokens['seq'];
/** Every sound name the game may request; a name that is not in tokens does not compile. */
export type SoundName = SfxName | SeqName;

export type SoundRecipe =
  | { readonly kind: 'sfx'; readonly params: readonly number[] }
  | { readonly kind: 'seq'; readonly steps: readonly (readonly [number, readonly number[]])[] };

const isDocKey = (k: string): boolean => k.startsWith('_doc');

/** All sound names in `audio.sfx` ∪ `audio.seq` (`_doc*` keys are not names). */
export function soundNames(audio: AudioTokens = TOKENS.audio): SoundName[] {
  const out = new Set<string>();
  for (const k of Object.keys(audio.sfx)) if (!isDocKey(k)) out.add(k);
  for (const k of Object.keys(audio.seq)) if (!isDocKey(k)) out.add(k);
  return [...out] as SoundName[];
}

/** Throws when a name exists in both `audio.sfx` and `audio.seq` (TECH §11.6: development error). */
export function assertDisjointSoundSets(audio: AudioTokens = TOKENS.audio): void {
  const both = Object.keys(audio.sfx).filter((k) => !isDocKey(k) && Object.hasOwn(audio.seq, k));
  if (both.length > 0) throw new Error(`audio: names in both audio.sfx and audio.seq: ${both.join(', ')}`);
}

/** `audio.sfx` first, then `audio.seq`; `null` when the name is missing. */
export function resolveSound(name: string, audio: AudioTokens = TOKENS.audio): SoundRecipe | null {
  if (isDocKey(name)) return null;
  const sfx = (audio.sfx as Readonly<Record<string, readonly number[]>>)[name];
  if (sfx !== undefined) return { kind: 'sfx', params: sfx };
  const seq = (audio.seq as Readonly<Record<string, readonly (readonly [number, readonly number[]])[]>>)[
    name
  ];
  if (seq !== undefined) return { kind: 'seq', steps: seq };
  return null;
}

/**
 * Samples per render slice. The slowest token sounds cost ≈ 0,25 µs/sample at 1× (≈ 1 µs at 4× CPU), so one chunk is
 * ≈ 0,13 ms at 1× and ≈ 0,5 ms at 4×: `pump` overshoots its budget by at most one chunk.
 */
export const RENDER_CHUNK_SAMPLES = 512;

type Step = readonly [number, readonly number[]];

/**
 * One recipe rendered in resumable slices (`run(n)`: ≤ n sample units per call; `done` → `samples`).
 * - `sfx`: one `ZzfxRender`.
 * - `seq`: each `[startMs, params]` step is rendered with its own `ZzfxRender` (created when the step starts: the
 *   allocations are spread over the slices too) and added at sample offset
 *   `round(startMs · sampleRate / 1000)`, steps in order (the float32 sums are the same as mixing whole steps); length =
 *   latest step end; then a peak pass, and if the summed peak exceeds 1 a scale pass so the peak is exactly 1 (no
 *   clipping). Mixing, peak and scale passes are sliced like the synth.
 */
export class RecipeRender {
  readonly samples: Float32Array;
  readonly #sampleRate: number;
  readonly #steps: readonly Step[];
  readonly #offsets: readonly number[];
  /** Step being rendered (`steps.length`: the peak / scale passes); its synth is created when the step starts. */
  #step = 0;
  #synth: ZzfxRender | null = null;
  /** Peak pass position, then scale pass position (`samples.length` each). */
  #peakAt = 0;
  #peak = 0;
  #scaleAt = 0;
  readonly #mix: boolean;

  constructor(recipe: SoundRecipe, sampleRate: number) {
    this.#sampleRate = sampleRate;
    if (recipe.kind === 'sfx') {
      this.#synth = new ZzfxRender(recipe.params, sampleRate);
      this.#steps = [];
      this.#offsets = [];
      this.samples = this.#synth.samples;
      this.#mix = false;
      return;
    }
    this.#steps = recipe.steps;
    this.#offsets = recipe.steps.map(([startMs]) => Math.round((startMs * sampleRate) / 1000));
    let length = 0;
    recipe.steps.forEach(([, params], k) => {
      length = Math.max(length, (this.#offsets[k] ?? 0) + zzfxLength(params, sampleRate));
    });
    this.samples = new Float32Array(length);
    this.#mix = true;
  }

  get done(): boolean {
    if (!this.#mix) return this.#synth?.done ?? true;
    return this.#step >= this.#steps.length && this.#scaleAt >= this.samples.length;
  }

  /** Processes up to `maxUnits` samples (render + mix, then peak, then scale); returns the units used. */
  run(maxUnits: number): number {
    if (!this.#mix) return this.#synth?.run(maxUnits) ?? 0;
    const out = this.samples;
    let left = Math.max(0, maxUnits);
    while (left > 0 && this.#step < this.#steps.length) {
      const step = this.#steps[this.#step];
      if (!step) break;
      const synth = (this.#synth ??= new ZzfxRender(step[1], this.#sampleRate));
      const offset = this.#offsets[this.#step] ?? 0;
      const from = synth.rendered;
      const n = synth.run(left);
      const src = synth.samples;
      for (let i = from; i < from + n; i++) out[offset + i] = (out[offset + i] ?? 0) + (src[i] ?? 0);
      left -= n;
      if (synth.done) {
        this.#step += 1;
        this.#synth = null;
      } else if (n === 0) break;
    }
    if (this.#step < this.#steps.length) return maxUnits - left;
    if (this.#peakAt < out.length && left > 0) {
      const stop = Math.min(out.length, this.#peakAt + left);
      let peak = this.#peak;
      for (let i = this.#peakAt; i < stop; i++) peak = Math.max(peak, Math.abs(out[i] ?? 0));
      this.#peak = peak;
      left -= stop - this.#peakAt;
      this.#peakAt = stop;
    }
    if (this.#peakAt < out.length) return maxUnits - left;
    if (this.#peak <= 1) this.#scaleAt = out.length;
    else if (this.#scaleAt < out.length && left > 0) {
      const k = 1 / this.#peak;
      const stop = Math.min(out.length, this.#scaleAt + left);
      for (let i = this.#scaleAt; i < stop; i++) out[i] = (out[i] ?? 0) * k;
      left -= stop - this.#scaleAt;
      this.#scaleAt = stop;
    }
    return maxUnits - left;
  }
}

/**
 * Mixes `[startMs, params]` steps into one buffer: each step is rendered with `buildSamples` and added at sample offset
 * `round(startMs · sampleRate / 1000)`; length = latest step end; if the summed peak exceeds 1 the whole buffer is
 * scaled so the peak is exactly 1 (no clipping). One `RecipeRender` run to the end.
 */
export function mixSequence(steps: readonly Step[], sampleRate: number): Float32Array {
  return renderRecipe({ kind: 'seq', steps }, sampleRate);
}

export function renderRecipe(recipe: SoundRecipe, sampleRate: number): Float32Array {
  const r = new RecipeRender(recipe, sampleRate);
  r.run(Number.POSITIVE_INFINITY);
  return r.samples;
}

/** Renders one named sound; throws for an unknown name (a development error). */
export function renderSound(
  name: SoundName,
  audio: AudioTokens = TOKENS.audio,
  sampleRate: number = audio.sampleRateHz,
): Float32Array {
  const recipe = resolveSound(name, audio);
  if (recipe === null) throw new Error(`audio: unknown sound "${name}"`);
  return renderRecipe(recipe, sampleRate);
}

export interface SoundBankOptions {
  readonly audio?: AudioTokens;
  /** Millisecond timer for the per-frame budget (default `performance.now`). */
  readonly now?: () => number;
  /** Samples per render slice (default `RENDER_CHUNK_SAMPLES`). */
  readonly chunkSamples?: number;
}

/**
 * Pre-rendered sample buffers, filled in budgeted slices: `pump` renders chunks of the queued sounds (in request order)
 * until its budget is used, at least one chunk per call, and resumes the unfinished sound on the next call.
 */
export class SoundBank {
  readonly sampleRate: number;
  readonly #audio: AudioTokens;
  readonly #now: () => number;
  readonly #chunk: number;
  readonly #queue: SoundName[] = [];
  readonly #ready = new Map<SoundName, Float32Array>();
  /** Names finished since the last `takeFinished` (the player turns them into `AudioBuffer`s off the input path). */
  readonly #finished: SoundName[] = [];
  #job: { readonly name: SoundName; readonly render: RecipeRender } | null = null;

  constructor(opts: SoundBankOptions = {}) {
    this.#audio = opts.audio ?? TOKENS.audio;
    this.sampleRate = this.#audio.sampleRateHz;
    this.#now = opts.now ?? (() => performance.now());
    this.#chunk = Math.max(1, Math.floor(opts.chunkSamples ?? RENDER_CHUNK_SAMPLES));
  }

  /** Queues names for rendering (already rendered, in progress or queued names are skipped). */
  request(names: Iterable<SoundName>): void {
    for (const n of names)
      if (!this.#ready.has(n) && this.#job?.name !== n && !this.#queue.includes(n)) this.#queue.push(n);
  }

  /**
   * Renders queued sounds chunk by chunk until `budgetMs` is used (at least one chunk per call; an unfinished sound
   * resumes on the next call). Returns the number of sounds not rendered yet.
   */
  pump(budgetMs: number = this.#audio.prerenderBudgetMsPerFrame): number {
    const start = this.#now();
    do {
      let job = this.#job;
      if (job === null) {
        const name = this.#queue.shift();
        if (name === undefined) break;
        const recipe = resolveSound(name, this.#audio);
        if (recipe === null) throw new Error(`audio: unknown sound "${name}"`);
        job = this.#job = { name, render: new RecipeRender(recipe, this.sampleRate) };
      }
      job.render.run(this.#chunk);
      if (job.render.done) {
        this.#ready.set(job.name, job.render.samples);
        this.#finished.push(job.name);
        this.#job = null;
      }
    } while (this.pending > 0 && this.#now() - start < budgetMs);
    return this.pending;
  }

  get(name: SoundName): Float32Array | undefined {
    return this.#ready.get(name);
  }

  /** The oldest sound rendered since the last call (`undefined`: none). */
  takeFinished(): SoundName | undefined {
    return this.#finished.shift();
  }

  /** Sounds not rendered yet (queued + the one in progress). */
  get pending(): number {
    return this.#queue.length + (this.#job === null ? 0 : 1);
  }
}

/** Copies mono samples into an `AudioBuffer` of the given context (Phaser cache or `AudioService`). */
export function toAudioBuffer(ctx: BaseAudioContext, samples: Float32Array, sampleRate: number): AudioBuffer {
  const buffer = ctx.createBuffer(1, Math.max(1, samples.length), sampleRate);
  buffer.getChannelData(0).set(samples);
  return buffer;
}

export const isMusic = (name: SoundName): boolean => name.startsWith('music_');

/** Playback policy shared by every player: cooldown per name and a voice cap (JUICE §0 rule 6). */
export class SoundGate {
  readonly #cooldownMs: number;
  readonly #maxVoices: number;
  readonly #lastStart = new Map<SoundName, number>();
  #voices = 0;

  constructor(audio: Pick<AudioTokens, 'sameSoundCooldownMs' | 'maxVoices'> = TOKENS.audio) {
    this.#cooldownMs = audio.sameSoundCooldownMs;
    this.#maxVoices = audio.maxVoices;
  }

  /** `true` = the sound may start now (a voice is taken; call `release` when it ends). */
  admit(name: SoundName, nowMs: number): boolean {
    const last = this.#lastStart.get(name);
    if (last !== undefined && nowMs - last < this.#cooldownMs) return false;
    if (this.#voices >= this.#maxVoices) return false;
    this.#lastStart.set(name, nowMs);
    this.#voices++;
    return true;
  }

  release(): void {
    this.#voices = Math.max(0, this.#voices - 1);
  }

  get voices(): number {
    return this.#voices;
  }
}

export interface PlayOptions {
  /** Playback rate (pitch steps such as combo or coin, TECH §11.6). */
  readonly rate?: number;
  /** Linear gain multiplier. */
  readonly volume?: number;
}

export interface AudioServiceOptions {
  readonly bank?: SoundBank;
  /** Creates the context on `unlock()`; return `null` when Web Audio is unavailable. */
  readonly createContext?: () => AudioContext | null;
  readonly now?: () => number;
}

/** A one-sample silent buffer started inside the unlocking gesture (WebKit). Decoration: failures are ignored. */
function kickSilent(ctx: AudioContext): void {
  try {
    const source = ctx.createBufferSource();
    source.buffer = ctx.createBuffer(1, 1, ctx.sampleRate || TOKENS.audio.sampleRateHz);
    source.connect(ctx.destination);
    source.start(0);
  } catch {
    // no output device, or a minimal test double: nothing to unlock
  }
}

function defaultContext(): AudioContext | null {
  const Ctor = (globalThis as { AudioContext?: typeof AudioContext }).AudioContext;
  return Ctor === undefined ? null : new Ctor();
}

/**
 * Standalone Web Audio player over `SoundBank` + `SoundGate`. Settings: sound and music are muted separately
 * (TECH §11.6); `suspend()` on tab hide, `resume()` on show.
 */
export class AudioService {
  readonly bank: SoundBank;
  readonly #gate = new SoundGate();
  readonly #createContext: () => AudioContext | null;
  readonly #now: () => number;
  readonly #buffers = new Map<SoundName, AudioBuffer>();
  #ctx: AudioContext | null = null;
  /** The silent buffer ran (first unlock). */
  #kicked = false;
  #sound = true;
  #music = true;

  constructor(opts: AudioServiceOptions = {}) {
    this.bank = opts.bank ?? new SoundBank();
    this.#createContext = opts.createContext ?? defaultContext;
    this.#now = opts.now ?? (() => performance.now());
  }

  /**
   * Creates (first call) and resumes the context. Call from an activation-triggering input event (pointerup, touchend,
   * click, keydown; a touch `pointerdown` is not one): iOS and Chrome keep a context suspended until then. The first
   * call also starts a one-sample silent buffer, which WebKit needs to really unlock output.
   */
  unlock(): void {
    this.prepare();
    const ctx = this.#ctx;
    if (ctx === null) return;
    if (!this.#kicked) {
      this.#kicked = true;
      kickSilent(ctx);
    }
    if (ctx.state !== 'running' && ctx.state !== 'closed') void ctx.resume().catch(() => {});
  }

  /**
   * Creates the context now, outside any input (TECH §10.7 item 6, review Faz 2 tur 2 #11): creating it costs ~45 ms
   * at 4× CPU, which inside the first drag's touch handler was the drag's longest frame. Without user activation the
   * context starts suspended; the first activating input then only `resume()`s it (synchronously in the handler, as
   * WebKit requires) and starts the silent buffer.
   */
  prepare(): void {
    if (this.#ctx === null) this.#ctx = this.#createContext();
  }

  get unlocked(): boolean {
    return this.#ctx !== null && this.#ctx.state === 'running';
  }

  /**
   * Idle-frame work (the scenes' `update`): renders the bank within `budgetMs` (`SoundBank.pump`) and, once the context
   * exists, copies one finished sound into its `AudioBuffer` — the first `play` of a sound then does no allocation and
   * no copy inside an input handler (review Faz 2 tur 4 #0: ≈ 1,5 ms at 4× in the first lift). Returns the number of
   * sounds not rendered yet.
   */
  pump(budgetMs?: number): number {
    const left = this.bank.pump(budgetMs);
    const ctx = this.#ctx;
    if (ctx !== null) {
      const name = this.bank.takeFinished();
      const samples = name === undefined ? undefined : this.bank.get(name);
      if (name !== undefined && samples !== undefined && !this.#buffers.has(name))
        this.#buffers.set(name, toAudioBuffer(ctx, samples, this.bank.sampleRate));
    }
    return left;
  }

  setEnabled(opts: { readonly sound?: boolean; readonly music?: boolean }): void {
    if (opts.sound !== undefined) this.#sound = opts.sound;
    if (opts.music !== undefined) this.#music = opts.music;
  }

  /** Plays a pre-rendered sound. Returns `false` when dropped (locked, muted, not rendered, cooldown, voice cap). */
  play(name: SoundName, opts: PlayOptions = {}): boolean {
    const ctx = this.#ctx;
    if (ctx === null || ctx.state !== 'running') return false;
    if (isMusic(name) ? !this.#music : !this.#sound) return false;
    const samples = this.bank.get(name);
    if (samples === undefined) return false;
    if (!this.#gate.admit(name, this.#now())) return false;
    let buffer = this.#buffers.get(name);
    if (buffer === undefined) {
      buffer = toAudioBuffer(ctx, samples, this.bank.sampleRate);
      this.#buffers.set(name, buffer);
    }
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = opts.rate ?? 1;
    const gain = ctx.createGain();
    gain.gain.value = opts.volume ?? 1;
    source.connect(gain).connect(ctx.destination);
    source.onended = () => this.#gate.release();
    source.start();
    return true;
  }

  suspend(): void {
    if (this.#ctx !== null && this.#ctx.state === 'running') void this.#ctx.suspend();
  }

  resume(): void {
    if (this.#ctx !== null && this.#ctx.state === 'suspended') void this.#ctx.resume();
  }
}
