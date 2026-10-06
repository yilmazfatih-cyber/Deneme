/**
 * Procedural sound service (docs/TECH_DESIGN.md §11.6; D-057; JUICE §0 rule 6; ASSET_LIST §13).
 *
 * - Recipes come only from design tokens: `audio.sfx.<name>` (one ZzFX call) and `audio.seq.<name>` (`[startMs, params]`
 *   steps mixed into one buffer). Name resolution: `audio.sfx` first, then `audio.seq`; a name in both is a development
 *   error (`assertDisjointSoundSets`).
 * - Rendering is pure (`renderSound`), at `audio.sampleRateHz` mono, and is sliced over frames by `SoundBank.pump`
 *   (≤ `audio.prerenderBudgetMsPerFrame` per call, one whole sound at least).
 * - Playback policy (`SoundGate`): a sound name plays at most once per `audio.sameSoundCooldownMs`, at most
 *   `audio.maxVoices` sounds at once; requests while the audio context is locked are DROPPED, never queued.
 * - No `AudioContext` exists at import time. `AudioService` creates it lazily on `unlock()` (call it from a user gesture).
 *   Engine-free: the Phaser sound manager can instead take `SoundBank` buffers through `toAudioBuffer` (TECH §11.6).
 */
import { TOKENS } from '../theme/tokens.ts';
import type { Tokens } from '../theme/tokens.ts';
import { buildSamples } from './audio/zzfxSynth.ts';

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
 * Mixes `[startMs, params]` steps into one buffer: each step is rendered with `buildSamples` and added at sample offset
 * `round(startMs · sampleRate / 1000)`; length = latest step end; if the summed peak exceeds 1 the whole buffer is
 * scaled so the peak is exactly 1 (no clipping).
 */
export function mixSequence(
  steps: readonly (readonly [number, readonly number[]])[],
  sampleRate: number,
): Float32Array {
  const parts = steps.map(([startMs, params]) => ({
    offset: Math.round((startMs * sampleRate) / 1000),
    samples: buildSamples(params, sampleRate),
  }));
  const length = parts.reduce((m, p) => Math.max(m, p.offset + p.samples.length), 0);
  const out = new Float32Array(length);
  for (const p of parts) {
    for (let i = 0; i < p.samples.length; i++)
      out[p.offset + i] = (out[p.offset + i] ?? 0) + (p.samples[i] ?? 0);
  }
  let peak = 0;
  for (let i = 0; i < out.length; i++) peak = Math.max(peak, Math.abs(out[i] ?? 0));
  if (peak > 1) {
    const k = 1 / peak;
    for (let i = 0; i < out.length; i++) out[i] = (out[i] ?? 0) * k;
  }
  return out;
}

export function renderRecipe(recipe: SoundRecipe, sampleRate: number): Float32Array {
  return recipe.kind === 'sfx'
    ? buildSamples(recipe.params, sampleRate)
    : mixSequence(recipe.steps, sampleRate);
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
}

/** Pre-rendered sample buffers, filled in budgeted slices (one or more whole sounds per `pump`). */
export class SoundBank {
  readonly sampleRate: number;
  readonly #audio: AudioTokens;
  readonly #now: () => number;
  readonly #queue: SoundName[] = [];
  readonly #ready = new Map<SoundName, Float32Array>();

  constructor(opts: SoundBankOptions = {}) {
    this.#audio = opts.audio ?? TOKENS.audio;
    this.sampleRate = this.#audio.sampleRateHz;
    this.#now = opts.now ?? (() => performance.now());
  }

  /** Queues names for rendering (already rendered or queued names are skipped). */
  request(names: Iterable<SoundName>): void {
    for (const n of names) if (!this.#ready.has(n) && !this.#queue.includes(n)) this.#queue.push(n);
  }

  /** Renders queued sounds until `budgetMs` is used (at least one sound per call). Returns the number still queued. */
  pump(budgetMs: number = this.#audio.prerenderBudgetMsPerFrame): number {
    const start = this.#now();
    let rendered = 0;
    while (this.#queue.length > 0 && (rendered === 0 || this.#now() - start < budgetMs)) {
      const name = this.#queue.shift() as SoundName;
      this.#ready.set(name, renderSound(name, this.#audio, this.sampleRate));
      rendered++;
    }
    return this.#queue.length;
  }

  get(name: SoundName): Float32Array | undefined {
    return this.#ready.get(name);
  }

  get pending(): number {
    return this.#queue.length;
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
  #sound = true;
  #music = true;

  constructor(opts: AudioServiceOptions = {}) {
    this.bank = opts.bank ?? new SoundBank();
    this.#createContext = opts.createContext ?? defaultContext;
    this.#now = opts.now ?? (() => performance.now());
  }

  /** Creates (first call) and resumes the context. Call from a user gesture (iOS starts suspended). */
  unlock(): void {
    if (this.#ctx === null) this.#ctx = this.#createContext();
    if (this.#ctx !== null && this.#ctx.state === 'suspended') void this.#ctx.resume();
  }

  get unlocked(): boolean {
    return this.#ctx !== null && this.#ctx.state === 'running';
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
