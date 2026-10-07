/*
  ZzFX - Zuper Zmall Zound Zynth v1.4.0 by Frank Force
  https://github.com/KilledByAPixel/ZzFX

  ZzFX MIT License

  Copyright (c) 2019 - Frank Force

  Permission is hereby granted, free of charge, to any person obtaining a copy
  of this software and associated documentation files (the "Software"), to deal
  in the Software without restriction, including without limitation the rights
  to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
  copies of the Software, and to permit persons to whom the Software is
  furnished to do so, subject to the following conditions:

  The above copyright notice and this permission notice shall be included in all
  copies or substantial portions of the Software.

  THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
  IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
  FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
  AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
  LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
  OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
  SOFTWARE.
*/

/**
 * TypeScript port of `ZZFX.buildSamples` from ZzFX 1.4.0 (`ZzFX.js`, MIT, © 2019 Frank Force; header above kept as the
 * license requires). Decision D-057 / TECH_DESIGN §11.6 (P-9): no npm dependency, only this pure function is embedded.
 *
 * Changes against the original, all behaviour-preserving for the parameters used by tokens.json:
 * - the sample rate is an argument instead of the `ZZFX.sampleRate` field (tokens `audio.sampleRateHz`);
 * - the parameter list is passed as an array (tokens `audio.sfx.<name>` / `audio.seq.<name>` steps); a missing trailing
 *   entry takes the original default value;
 * - `randomness` (index 1) is ignored: the original multiplies the frequency by `1 ± randomness · Math.random()`. Tokens
 *   always write 0 (`audio._doc`), so dropping the term keeps the output identical and the synth deterministic;
 * - no `AudioContext` is created here (the original creates one when the module loads, TECH §0);
 * - the sample loop is resumable (`ZzfxRender.run(maxSamples)`, review Faz 2 tur 4 #0): the loop state lives in the
 *   renderer between calls, so a long sound is rendered over several frames within `audio.prerenderBudgetMsPerFrame`.
 *   `buildSamples` is one run to the end; the arithmetic and its order are unchanged (bit-identical output).
 */

/** Number of ZzFX parameters (tokens `audio._doc` order). */
export const ZZFX_PARAM_COUNT = 21;

/** Original ZzFX 1.4.0 default values, index = parameter position. */
export const ZZFX_DEFAULTS: readonly number[] = [
  1, // volume
  0.05, // randomness (ignored, see header)
  220, // frequency
  0, // attack
  0, // sustain
  0.1, // release
  0, // shape
  1, // shapeCurve
  0, // slide
  0, // deltaSlide
  0, // pitchJump
  0, // pitchJumpTime
  0, // repeatTime
  0, // noise
  0, // modulation
  0, // bitCrush
  0, // delay
  1, // sustainVolume
  0, // decay
  0, // tremolo
  0, // filter
];

function param(params: readonly number[], index: number): number {
  const value = params[index];
  return value === undefined ? (ZZFX_DEFAULTS[index] ?? 0) : value;
}

/** Buffer length in samples of one ZzFX parameter list (`attack + decay + sustain + release + delay`, as `ZzfxRender`). */
export function zzfxLength(params: readonly number[], sampleRate: number): number {
  const length =
    ((param(params, 3) * sampleRate || 9) +
      param(params, 18) * sampleRate +
      param(params, 4) * sampleRate +
      param(params, 5) * sampleRate +
      param(params, 16) * sampleRate) |
    0;
  return length > 0 ? length : 0;
}

/**
 * One ZzFX sound rendered in resumable slices: `run(n)` renders the next `n` samples (or what is left) into `samples`.
 * The buffer is allocated up front (the delay term reads earlier samples of the same buffer). Pure and deterministic.
 */
export class ZzfxRender {
  readonly samples: Float32Array;
  // constants of the sound (scaled by the sample rate)
  private readonly volume: number;
  private readonly attack: number;
  private readonly sustain: number;
  private readonly release: number;
  private readonly shape: number;
  private readonly shapeCurve: number;
  private readonly deltaSlide: number;
  private readonly pitchJump: number;
  private readonly pitchJumpTime: number;
  private readonly repeatTime: number;
  private readonly noise: number;
  private readonly modulation: number;
  private readonly bitCrush: number;
  private readonly delay: number;
  private readonly sustainVolume: number;
  private readonly decay: number;
  private readonly tremolo: number;
  private readonly filter: number;
  private readonly startSlide: number;
  private readonly length: number;
  private readonly a1: number;
  private readonly a2: number;
  private readonly b0: number;
  private readonly b1: number;
  private readonly b2: number;
  // loop state carried between `run` calls
  private frequency: number;
  private slide: number;
  private startFrequency: number;
  private modOffset = 0; // modulation offset
  private repeat = 0; // repeat offset
  private crush = 0; // bit crush offset
  private jump = 1; // pitch jump timer
  private t = 0; // sample time
  private i = 0; // sample index
  private s = 0; // sample value
  private x2 = 0;
  private x1 = 0;
  private y2 = 0;
  private y1 = 0;

  constructor(params: readonly number[], sampleRate: number) {
    this.volume = param(params, 0);
    let frequency = param(params, 2);
    let attack = param(params, 3);
    let sustain = param(params, 4);
    let release = param(params, 5);
    this.shape = param(params, 6);
    this.shapeCurve = param(params, 7);
    let slide = param(params, 8);
    const deltaSlide = param(params, 9);
    const pitchJump = param(params, 10);
    const pitchJumpTime = param(params, 11);
    const repeatTime = param(params, 12);
    this.noise = param(params, 13);
    const modulation = param(params, 14);
    this.bitCrush = param(params, 15);
    let delay = param(params, 16);
    this.sustainVolume = param(params, 17);
    let decay = param(params, 18);
    this.tremolo = param(params, 19);
    const filter = (this.filter = param(params, 20));

    // init parameters
    const PI2 = Math.PI * 2;
    const sign = (v: number): number => (v < 0 ? -1 : 1);
    this.startSlide = slide *= (500 * PI2) / sampleRate / sampleRate;
    this.slide = slide;
    this.startFrequency = frequency *= PI2 / sampleRate;
    this.frequency = frequency;

    // biquad LP/HP filter
    const quality = 2;
    const w = (PI2 * Math.abs(filter) * 2) / sampleRate;
    const cos = Math.cos(w);
    const alpha = Math.sin(w) / 2 / quality;
    const a0 = 1 + alpha;
    this.a1 = (-2 * cos) / a0;
    this.a2 = (1 - alpha) / a0;
    this.b0 = (1 + sign(filter) * cos) / 2 / a0;
    this.b1 = -(sign(filter) + cos) / a0;
    this.b2 = this.b0;

    // scale by sample rate
    const minAttack = 9; // prevent pop if attack is 0
    this.attack = attack = attack * sampleRate || minAttack;
    this.decay = decay *= sampleRate;
    this.sustain = sustain *= sampleRate;
    this.release = release *= sampleRate;
    this.delay = delay *= sampleRate;
    this.deltaSlide = deltaSlide * ((500 * PI2) / sampleRate ** 3);
    this.modulation = modulation * (PI2 / sampleRate);
    this.pitchJump = pitchJump * (PI2 / sampleRate);
    this.pitchJumpTime = pitchJumpTime * sampleRate;
    this.repeatTime = (repeatTime * sampleRate) | 0;

    // allocate the full sample buffer up front
    const length = (this.length = (attack + decay + sustain + release + delay) | 0);
    this.samples = new Float32Array(length > 0 ? length : 0);
  }

  /** Every sample is rendered. */
  get done(): boolean {
    return this.i >= this.length;
  }

  /** Samples rendered so far. */
  get rendered(): number {
    return Math.min(this.i, this.samples.length);
  }

  /** Renders up to `maxSamples` more samples; returns how many were rendered by this call. */
  run(maxSamples: number): number {
    const {
      volume,
      attack,
      decay,
      sustain,
      length,
      delay,
      release,
      shape,
      shapeCurve,
      sustainVolume,
      tremolo,
    } = this;
    const {
      deltaSlide,
      modulation,
      noise,
      pitchJump,
      pitchJumpTime,
      repeatTime,
      startSlide,
      bitCrush,
      filter,
    } = this;
    const { a1, a2, b0, b1, b2 } = this;
    const b = this.samples;
    const PI2 = Math.PI * 2;
    const abs = Math.abs;
    const sign = (v: number): number => (v < 0 ? -1 : 1);
    let { frequency, slide, startFrequency, modOffset, repeat, crush, jump, t, i, s, x2, x1, y2, y1 } = this;
    let f: number; // wave frequency
    const from = i;
    const stop = Math.min(length, i + Math.max(0, maxSamples));

    // generate waveform
    for (; i < stop; b[i++] = s * volume) {
      if (!(++crush % ((bitCrush * 100) | 0))) {
        // wave shape: 0 sin, 1 triangle, 2 saw, 3 tan, 4 noise, 5 square duty
        s = shape
          ? shape > 1
            ? shape > 2
              ? shape > 3
                ? shape > 4
                  ? (t / PI2) % 1 < shapeCurve / 2
                    ? 1
                    : -1
                  : Math.sin(t ** 3)
                : Math.max(Math.min(Math.tan(t), 1), -1)
              : 1 - (((((2 * t) / PI2) % 2) + 2) % 2)
            : 1 - 4 * abs(Math.round(t / PI2) - t / PI2)
          : Math.sin(t);

        s =
          (repeatTime ? 1 - tremolo + tremolo * Math.sin((PI2 * i) / repeatTime) : 1) * // tremolo
          (shape > 4 ? s : sign(s) * abs(s) ** shapeCurve) * // shape curve
          (i < attack
            ? i / attack // attack
            : i < attack + decay // decay
              ? 1 - ((i - attack) / decay) * (1 - sustainVolume) // decay falloff
              : i < attack + decay + sustain // sustain
                ? sustainVolume // sustain volume
                : i < length - delay // release
                  ? ((length - i - delay) / release) * sustainVolume // release falloff
                  : 0); // post release

        s = delay
          ? s / 2 +
            (delay > i
              ? 0
              : ((i < length - delay ? 1 : (length - i) / delay) * (b[(i - delay) | 0] ?? 0)) / 2 / volume)
          : s; // sample delay

        if (filter) {
          // apply filter
          const y = b2 * x2 + b1 * x1 + b0 * s - a2 * y2 - a1 * y1;
          x2 = x1;
          x1 = s;
          y2 = y1;
          y1 = y;
          s = y;
        }
      }

      f = (frequency += slide += deltaSlide) * Math.cos(modulation * modOffset++); // frequency, modulation
      t += f + f * noise * (((i * i * PI2) % 2) - 1); // noise

      if (jump && ++jump > pitchJumpTime) {
        // pitch jump
        frequency += pitchJump;
        startFrequency += pitchJump;
        jump = 0;
      }

      if (repeatTime && !(++repeat % repeatTime)) {
        // repeat
        frequency = startFrequency;
        slide = startSlide;
        jump ||= 1;
      }
    }

    this.frequency = frequency;
    this.slide = slide;
    this.startFrequency = startFrequency;
    this.modOffset = modOffset;
    this.repeat = repeat;
    this.crush = crush;
    this.jump = jump;
    this.t = t;
    this.i = i;
    this.s = s;
    this.x2 = x2;
    this.x1 = x1;
    this.y2 = y2;
    this.y1 = y1;
    return i - from;
  }
}

/** Builds the mono sample buffer for one ZzFX parameter list (one `ZzfxRender` run to the end). Pure and deterministic. */
export function buildSamples(params: readonly number[], sampleRate: number): Float32Array {
  const r = new ZzfxRender(params, sampleRate);
  r.run(Number.POSITIVE_INFINITY);
  return r.samples;
}
