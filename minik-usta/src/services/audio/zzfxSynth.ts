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
 * - no `AudioContext` is created here (the original creates one when the module loads, TECH §0).
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

/** Builds the mono sample buffer for one ZzFX parameter list. Pure and deterministic. */
export function buildSamples(params: readonly number[], sampleRate: number): Float32Array {
  const volume = param(params, 0);
  let frequency = param(params, 2);
  let attack = param(params, 3);
  let sustain = param(params, 4);
  let release = param(params, 5);
  const shape = param(params, 6);
  const shapeCurve = param(params, 7);
  let slide = param(params, 8);
  let deltaSlide = param(params, 9);
  let pitchJump = param(params, 10);
  let pitchJumpTime = param(params, 11);
  let repeatTime = param(params, 12);
  const noise = param(params, 13);
  let modulation = param(params, 14);
  const bitCrush = param(params, 15);
  let delay = param(params, 16);
  const sustainVolume = param(params, 17);
  let decay = param(params, 18);
  const tremolo = param(params, 19);
  const filter = param(params, 20);

  // init parameters
  const PI2 = Math.PI * 2;
  const abs = Math.abs;
  const sign = (v: number): number => (v < 0 ? -1 : 1);
  const startSlide = (slide *= (500 * PI2) / sampleRate / sampleRate);
  let startFrequency = (frequency *= PI2 / sampleRate);
  let modOffset = 0; // modulation offset
  let repeat = 0; // repeat offset
  let crush = 0; // bit crush offset
  let jump = 1; // pitch jump timer
  let t = 0; // sample time
  let i = 0; // sample index
  let s = 0; // sample value
  let f: number; // wave frequency

  // biquad LP/HP filter
  const quality = 2;
  const w = (PI2 * abs(filter) * 2) / sampleRate;
  const cos = Math.cos(w);
  const alpha = Math.sin(w) / 2 / quality;
  const a0 = 1 + alpha;
  const a1 = (-2 * cos) / a0;
  const a2 = (1 - alpha) / a0;
  const b0 = (1 + sign(filter) * cos) / 2 / a0;
  const b1 = -(sign(filter) + cos) / a0;
  const b2 = b0;
  let x2 = 0;
  let x1 = 0;
  let y2 = 0;
  let y1 = 0;

  // scale by sample rate
  const minAttack = 9; // prevent pop if attack is 0
  attack = attack * sampleRate || minAttack;
  decay *= sampleRate;
  sustain *= sampleRate;
  release *= sampleRate;
  delay *= sampleRate;
  deltaSlide *= (500 * PI2) / sampleRate ** 3;
  modulation *= PI2 / sampleRate;
  pitchJump *= PI2 / sampleRate;
  pitchJumpTime *= sampleRate;
  repeatTime = (repeatTime * sampleRate) | 0;

  // allocate the full sample buffer up front
  const length = (attack + decay + sustain + release + delay) | 0;
  const b = new Float32Array(length > 0 ? length : 0);

  // generate waveform
  for (; i < length; b[i++] = s * volume) {
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

  return b;
}
