import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { TOKENS } from '../../src/theme/tokens.ts';
import {
  AudioService,
  SoundBank,
  SoundGate,
  assertDisjointSoundSets,
  mixSequence,
  renderSound,
  resolveSound,
  soundNames,
} from '../../src/services/audio.ts';
import type { AudioTokens, SoundName } from '../../src/services/audio.ts';
import { ZZFX_DEFAULTS, buildSamples } from '../../src/services/audio/zzfxSynth.ts';

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
  it('TECH 11.6 SoundBank.pump renders at least one sound per call within the frame budget', () => {
    // a frozen timer: every render fits the budget
    const bank = new SoundBank({ now: () => 0 });
    bank.request(['sfx_pick', 'sfx_land', 'music_win', 'sfx_pick']);
    expect(bank.pending).toBe(3);
    // every timer read advances 5 ms > budget 4 ms: exactly one sound per pump
    let t = 0;
    const slow = new SoundBank({
      now: () => {
        t += 5;
        return t;
      },
    });
    slow.request(['sfx_pick', 'sfx_land', 'music_win']);
    expect(slow.pump()).toBe(2);
    expect(slow.get('sfx_pick')).toBeDefined();
    expect(slow.get('sfx_land')).toBeUndefined();
    expect(slow.pump()).toBe(1);
    expect(slow.pump()).toBe(0);
    // a fast clock renders everything in one call
    expect(bank.pump(TOKENS.audio.prerenderBudgetMsPerFrame)).toBe(0);
    expect(bank.get('music_win')?.length).toBeGreaterThan(SR * 2);
    bank.request(['sfx_pick']);
    expect(bank.pending).toBe(0);
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
    expect(started).toEqual([]); // the dropped request was not queued
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
