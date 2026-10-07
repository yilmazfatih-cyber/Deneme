import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { TOKENS } from '../../src/theme/tokens.ts';
import {
  AudioService,
  RENDER_CHUNK_SAMPLES,
  RecipeRender,
  SoundBank,
  SoundGate,
  assertDisjointSoundSets,
  mixSequence,
  renderSound,
  resolveSound,
  soundNames,
} from '../../src/services/audio.ts';
import type { AudioTokens, SoundName } from '../../src/services/audio.ts';
import { ZZFX_DEFAULTS, ZzfxRender, buildSamples } from '../../src/services/audio/zzfxSynth.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (rel: string): string => readFileSync(join(ROOT, rel), 'utf8');
const SR = TOKENS.audio.sampleRateHz;

/** ASSET_LIST §13 sound table: every `sfx_*` / `music_*` name (row "_dede" shorthands expanded). */
function assetSoundNames(): Set<string> {
  const section = read('docs/ASSET_LIST.md').split('## 13. Sesler')[1]?.split('\n## ')[0] ?? '';
  const out = new Set<string>();
  for (const line of section.split('\n').filter((l) => l.startsWith('| '))) {
    for (const m of line.matchAll(/`((?:sfx|music)_[a-z_]+)`/g)) out.add(m[1] as string);
  }
  return out;
}

/** JUICE Faz 2 P0 rows (TECH §14.1 #11/#13 list) → sound names they ask for. */
const P0_ROWS = [
  ...[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13],
  ...[15, 16, 17, 18, 19, 20, 22, 23],
  ...[50, 51, 52, 53, 55, 56, 57, 58, 69, 70, 71, 83, 84, 87, 88],
];
function juiceP0SoundNames(): Set<string> {
  const out = new Set<string>();
  let rows = 0;
  for (const line of read('docs/JUICE.md').split('\n')) {
    const m = /^\|\s*(\d+)\s*\|/.exec(line);
    if (m === null || !P0_ROWS.includes(Number(m[1]))) continue;
    rows++;
    for (const s of line.matchAll(/`((?:sfx|music)_[a-z_]+)`/g)) out.add(s[1] as string);
  }
  expect(rows).toBe(P0_ROWS.length);
  return out;
}

const peak = (b: Float32Array): number => b.reduce((m, v) => Math.max(m, Math.abs(v)), 0);

describe('ZzFX synth (D-057, TECH 11.6)', () => {
  it('D-057 buildSamples is deterministic and keeps the ZzFX 1.4.0 envelope length', () => {
    const p = TOKENS.audio.sfx.sfx_pick;
    const a = buildSamples(p, SR);
    const b = buildSamples(p, SR);
    expect(a).toEqual(b);
    // length = (attack + decay + sustain + release + delay) · sampleRate | 0 (attack 0 → 9 samples)
    expect(a.length).toBe((0.002 * SR + 0 + 0 + 0.068 * SR + 0) | 0);
    expect(peak(a)).toBeGreaterThan(0.3);
    expect(peak(a)).toBeLessThanOrEqual(0.6 + 1e-6);
    expect(buildSamples([], SR).length).toBe((9 + 0.1 * SR) | 0);
    expect(ZZFX_DEFAULTS).toHaveLength(21);
  });

  it('D-057 randomness is ignored (tokens always write 0) so a value does not change the output', () => {
    const p = [...TOKENS.audio.sfx.sfx_coin];
    const noisy = [...p];
    noisy[1] = 0.5;
    expect(buildSamples(noisy, SR)).toEqual(buildSamples(p, SR));
  });

  it('D-057 regression: checksums of two token sounds stay stable', () => {
    const sum = (b: Float32Array): number => b.reduce((s, v) => s + Math.abs(v), 0);
    const place = renderSound('sfx_place_ok');
    const whoosh = renderSound('sfx_whoosh');
    expect(place.length).toBe(4895);
    expect(whoosh.length).toBe(3969);
    expect(sum(place)).toBeCloseTo(PLACE_OK_SUM, 6);
    expect(sum(whoosh)).toBeCloseTo(WHOOSH_SUM, 6);
  });
});

describe('sound names and recipes (TECH 11.6, ASSET 13)', () => {
  it('ASSET 13 every sfx name resolves in audio.sfx or audio.seq', () => {
    const asset = assetSoundNames();
    const names = soundNames();
    expect(names.length).toBe(Object.keys(TOKENS.audio.sfx).length + Object.keys(TOKENS.audio.seq).length);
    for (const n of names) expect(asset.has(n), `${n} is not in ASSET_LIST §13`).toBe(true);
    const p0 = juiceP0SoundNames();
    expect(p0.size).toBeGreaterThanOrEqual(25);
    for (const n of p0) expect(resolveSound(n), `JUICE P0 sound ${n}`).not.toBeNull();
    expect(resolveSound('sfx_woof')).toBeNull();
    expect(resolveSound('_doc')).toBeNull();
  });

  it('TECH 11.6 no name is in both audio.sfx and audio.seq; sfx wins the lookup', () => {
    expect(() => assertDisjointSoundSets()).not.toThrow();
    const clash = {
      ...TOKENS.audio,
      seq: { ...TOKENS.audio.seq, sfx_pick: [[0, [0.1]]] },
    } as unknown as AudioTokens;
    expect(() => assertDisjointSoundSets(clash)).toThrow(/sfx_pick/);
    expect(resolveSound('sfx_pick', clash)?.kind).toBe('sfx');
    expect(resolveSound('music_win')?.kind).toBe('seq');
  });

  it('audio seq mix peak <= 1', () => {
    for (const name of Object.keys(TOKENS.audio.seq) as SoundName[]) {
      expect(peak(renderSound(name)), name).toBeLessThanOrEqual(1 + 1e-6);
    }
    // a loud stack is scaled to exactly 1 instead of clipping
    const loud = mixSequence(
      [
        [0, [1, 0, 440, 0, 0.05, 0.05]],
        [0, [1, 0, 440, 0, 0.05, 0.05]],
      ],
      SR,
    );
    expect(peak(loud)).toBeCloseTo(1, 6);
  });

  it('TECH 11.6 seq buffer length = latest step end at startMs · sampleRate / 1000', () => {
    const steps = TOKENS.audio.seq.sfx_goal_done;
    const ends = steps.map(([ms, p]) => Math.round((ms * SR) / 1000) + buildSamples(p, SR).length);
    expect(renderSound('sfx_goal_done').length).toBe(Math.max(...ends));
    const step0 = buildSamples(steps[0]?.[1] ?? [], SR);
    const mixed = mixSequence([[0, steps[0]?.[1] ?? []]], SR);
    expect(mixed).toEqual(step0);
  });
});

describe('SoundBank, SoundGate, AudioService (TECH 11.6, JUICE 0 rule 6)', () => {
  it('TECH 11.6 SoundBank.pump renders in resumable chunks within the frame budget (review Faz 2 tur 4 #0)', () => {
    // a frozen timer: every render fits the budget, everything in one call
    const bank = new SoundBank({ now: () => 0 });
    bank.request(['sfx_pick', 'sfx_land', 'music_win', 'sfx_pick']);
    expect(bank.pending).toBe(3);
    expect(bank.pump(TOKENS.audio.prerenderBudgetMsPerFrame)).toBe(0);
    expect(bank.get('music_win')).toEqual(renderSound('music_win'));
    bank.request(['sfx_pick']);
    expect(bank.pending).toBe(0);

    // every timer read advances 5 ms > budget 4 ms: exactly one chunk per pump, never a whole long sound
    let t = 0;
    const slow = new SoundBank({
      now: () => {
        t += 5;
        return t;
      },
    });
    slow.request(['sfx_pick', 'music_win']);
    const pickChunks = Math.ceil(renderSound('sfx_pick').length / RENDER_CHUNK_SAMPLES);
    for (let k = 1; k < pickChunks; k++) {
      expect(slow.pump()).toBe(2);
      expect(slow.get('sfx_pick')).toBeUndefined();
    }
    expect(slow.pump()).toBe(1);
    expect(slow.get('sfx_pick')).toEqual(renderSound('sfx_pick'));
    // music_win (a seq): render + mix chunks, then the peak pass (and a scale pass when the mix peaked over 1)
    slow.request(['music_win']); // in progress: not queued twice
    expect(slow.pending).toBe(1);
    let pumps = 0;
    while (slow.pending > 0) {
      slow.pump();
      pumps++;
      if (slow.pending > 0) expect(slow.get('music_win')).toBeUndefined();
    }
    const win = renderSound('music_win');
    const renderUnits = TOKENS.audio.seq.music_win.reduce((n, [, p]) => n + buildSamples(p, SR).length, 0);
    expect(pumps).toBeGreaterThanOrEqual(Math.ceil((renderUnits + win.length) / RENDER_CHUNK_SAMPLES));
    expect(pumps).toBeLessThanOrEqual(
      Math.ceil((renderUnits + 2 * win.length) / RENDER_CHUNK_SAMPLES) +
        TOKENS.audio.seq.music_win.length +
        2,
    );
    expect(slow.get('music_win')).toEqual(win);
  });

  it('TECH 11.6 a sound rendered chunk by chunk is bit-identical to the one-shot render (every token sound)', () => {
    for (const name of soundNames()) {
      const recipe = resolveSound(name);
      if (recipe === null) throw new Error(name);
      const r = new RecipeRender(recipe, SR);
      let calls = 0;
      while (!r.done) {
        const used = r.run(97);
        expect(used).toBeLessThanOrEqual(97);
        calls++;
      }
      expect(calls, name).toBeGreaterThan(1);
      expect(r.samples, name).toEqual(renderSound(name));
    }
    // the synth alone: `run(n)` renders at most n samples and resumes where it stopped
    const z = new ZzfxRender(TOKENS.audio.sfx.sfx_fall, SR);
    expect(z.run(10)).toBe(10);
    expect(z.rendered).toBe(10);
    while (!z.done) expect(z.run(RENDER_CHUNK_SAMPLES)).toBeLessThanOrEqual(RENDER_CHUNK_SAMPLES);
    expect(z.run(RENDER_CHUNK_SAMPLES)).toBe(0);
    expect(z.samples).toEqual(buildSamples(TOKENS.audio.sfx.sfx_fall, SR));
  });

  it('TECH 11.6 AudioService.pump copies finished sounds into AudioBuffers off the input path (review Faz 2 tur 4 #0)', () => {
    let buffers = 0;
    const ctx = {
      state: 'running',
      sampleRate: SR,
      destination: {},
      resume: () => Promise.resolve(),
      createBuffer: (_c: number, len: number) => {
        buffers++;
        return { getChannelData: () => new Float32Array(len) };
      },
      createGain: () => ({ gain: { value: 1 }, connect: (n: unknown) => n }),
      createBufferSource: () => ({
        buffer: null,
        playbackRate: { value: 1 },
        onended: null,
        connect: (n: unknown) => n,
        start: () => {},
      }),
    } as unknown as AudioContext;
    const svc = new AudioService({ createContext: () => ctx, bank: new SoundBank({ now: () => 0 }) });
    svc.bank.request(['sfx_pick', 'sfx_land']);
    // no context yet: rendered, nothing copied (the finished names wait)
    expect(svc.pump(1e9)).toBe(0);
    expect(buffers).toBe(0);
    svc.prepare();
    svc.pump(); // one copy per call
    expect(buffers).toBe(1);
    svc.pump();
    expect(buffers).toBe(2);
    svc.pump();
    expect(buffers).toBe(2);
    // the first plays reuse them: no buffer is created inside the (input-driven) play
    expect(svc.play('sfx_pick')).toBe(true);
    expect(svc.play('sfx_land')).toBe(true);
    expect(buffers).toBe(2);
  });

  it('JUICE 0 rule 6 same sound at most once per 60 ms and at most 4 voices', () => {
    const gate = new SoundGate(TOKENS.audio);
    expect(TOKENS.audio.sameSoundCooldownMs).toBe(60);
    expect(TOKENS.audio.maxVoices).toBe(4);
    expect(gate.admit('sfx_land', 0)).toBe(true);
    expect(gate.admit('sfx_land', 59)).toBe(false);
    expect(gate.admit('sfx_land', 60)).toBe(true);
    expect(gate.admit('sfx_pick', 60)).toBe(true);
    expect(gate.admit('sfx_coin', 60)).toBe(true);
    expect(gate.voices).toBe(4);
    expect(gate.admit('sfx_tick', 61)).toBe(false);
    gate.release();
    expect(gate.admit('sfx_tick', 62)).toBe(true);
  });

  it('TECH 11.6 no AudioContext before unlock; locked requests are dropped, not queued; sound and music mute apart', () => {
    let created = 0;
    const started: string[] = [];
    let state: AudioContextState = 'suspended';
    const ctx = {
      get state() {
        return state;
      },
      resume: () => {
        state = 'running';
        return Promise.resolve();
      },
      suspend: () => {
        state = 'suspended';
        return Promise.resolve();
      },
      destination: {},
      createBuffer: (_c: number, len: number) => ({ getChannelData: () => new Float32Array(len) }),
      createGain: () => ({ gain: { value: 1 }, connect: (n: unknown) => n }),
      createBufferSource: () => {
        const src = {
          buffer: null as unknown,
          playbackRate: { value: 1 },
          onended: null as null | (() => void),
          connect: (n: unknown) => n,
          start: () => started.push(`rate ${src.playbackRate.value}`),
        };
        return src;
      },
    } as unknown as AudioContext;
    let now = 0;
    const svc = new AudioService({
      createContext: () => {
        created++;
        return ctx;
      },
      now: () => now,
    });
    svc.bank.request(['sfx_pick', 'music_win']);
    svc.bank.pump(1e9);
    expect(created).toBe(0);
    expect(svc.play('sfx_pick')).toBe(false); // locked: dropped
    svc.unlock();
    expect(created).toBe(1);
    expect(svc.unlocked).toBe(true);
    // only the one-sample silent kick of the unlock (WebKit); the dropped request was not queued
    expect(started).toEqual(['rate 1']);
    started.length = 0;
    expect(svc.play('sfx_pick', { rate: 1.5 })).toBe(true);
    expect(started).toEqual(['rate 1.5']);
    now = 100;
    svc.setEnabled({ sound: false });
    expect(svc.play('sfx_pick')).toBe(false);
    expect(svc.play('music_win')).toBe(true);
    svc.setEnabled({ sound: true, music: false });
    expect(svc.play('music_win')).toBe(false);
    expect(svc.play('sfx_land')).toBe(false); // not rendered yet
    svc.suspend();
    now = 300;
    expect(svc.play('sfx_pick')).toBe(false);
    svc.resume();
    expect(svc.play('sfx_pick')).toBe(true);
    svc.unlock();
    expect(created).toBe(1);
  });
});

// Σ|sample| computed with the ORIGINAL ZzFX 1.4.0 module (`ZZFX.buildSamples`, sampleRate 22050) from npm; the port
// was also compared sample by sample with it for all 80 token parameter lists (maximum difference 0).
const PLACE_OK_SUM = 833.6942097575447;
const WHOOSH_SUM = 414.5930811638418;
