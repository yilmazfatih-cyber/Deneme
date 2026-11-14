import { describe, expect, it } from 'vitest'
import type { RemoteKey } from '../../../../shared/devices'
import {
  makeSnapshot,
  PlayerRegistry,
  type PlayerCommand,
  type PlayerSnapshotState,
  type SnapshotInput,
} from '../remote'
import { basicKeyCommand, nextSubtitleChoice, runCommand, type CommandTarget } from './commands'
import { parseKonum, parseWatchOptions, startPosition, type StartInput } from './options'
import {
  remoteKeyFromKeyboard,
  seekStepSec,
  tvInitial,
  tvStep,
  type PanelInfo,
  type TvAction,
  type TvContext,
  type TvEffect,
  type TvPanelKind,
  type TvState,
} from './tvKeys'

/* ───────────── sahte bağdaştırıcı ───────────── */

class FakePlayer implements CommandTarget {
  st: PlayerSnapshotState = 'playing'
  pos = 100
  dur = 600
  vol = 0.5
  mute = false
  canSeek = true
  stopped = 0
  nextAvailable = true
  nexted = 0
  subs: string | null = null
  keys: RemoteKey[] = []
  state(): PlayerSnapshotState {
    return this.st
  }
  position(): number {
    return this.pos
  }
  duration(): number {
    return this.dur
  }
  volume(): number {
    return this.vol
  }
  muted(): boolean {
    return this.mute
  }
  play(): void {
    this.st = 'playing'
  }
  pause(): void {
    this.st = 'paused'
  }
  seek(sec: number): void {
    this.pos = sec
  }
  setVolume(v: number): void {
    this.vol = v
  }
  setMuted(m: boolean): void {
    this.mute = m
  }
  seekable(): boolean {
    return this.canSeek
  }
  stop(): void {
    this.stopped += 1
  }
  next(): boolean {
    if (!this.nextAvailable) return false
    this.nexted += 1
    return true
  }
  toggleSubtitles(): boolean {
    this.subs = this.subs ? null : 'tr'
    return true
  }
  key(k: RemoteKey): boolean {
    this.keys.push(k)
    const cmd = basicKeyCommand(k, false)
    return cmd ? runCommand(this, cmd) : false
  }
}

function snapOf(p: FakePlayer, extra: Partial<SnapshotInput> = {}): SnapshotInput {
  return {
    viewableId: 'Video:80010001',
    title: 'Sintel',
    subtitle: null,
    artUrl: null,
    live: false,
    positionSec: p.pos,
    durationSec: p.dur,
    state: p.st,
    volume: p.vol,
    muted: p.mute,
    sourceKind: 'OWN_CDN',
    chrome: 'desktop',
    ...extra,
  }
}

describe('runCommand', () => {
  it('TOGGLE / PLAY / PAUSE durumu çevirir; bitmişte PLAY baştan başlatır', () => {
    const p = new FakePlayer()
    expect(runCommand(p, { type: 'TOGGLE' })).toBe(true)
    expect(p.st).toBe('paused')
    runCommand(p, { type: 'TOGGLE' })
    expect(p.st).toBe('playing')
    runCommand(p, { type: 'PAUSE' })
    expect(p.st).toBe('paused')
    p.st = 'ended'
    p.pos = 600
    runCommand(p, { type: 'PLAY' })
    expect(p.st).toBe('playing')
    expect(p.pos).toBe(0)
  })

  it('hata durumunda oynatma komutlarını işlemez', () => {
    const p = new FakePlayer()
    p.st = 'error'
    expect(runCommand(p, { type: 'TOGGLE' })).toBe(false)
    expect(runCommand(p, { type: 'PLAY' })).toBe(false)
  })

  it('SEEK ve SEEK_BY süreye sıkıştırılır; doğrusal kanalda reddedilir', () => {
    const p = new FakePlayer()
    runCommand(p, { type: 'SEEK', positionSec: 9999 })
    expect(p.pos).toBeCloseTo(599.5)
    runCommand(p, { type: 'SEEK_BY', deltaSec: -10_000 })
    expect(p.pos).toBe(0)
    runCommand(p, { type: 'SEEK_BY', deltaSec: 30 })
    expect(p.pos).toBe(30)
    expect(runCommand(p, { type: 'SEEK', positionSec: Number.NaN })).toBe(false)
    p.canSeek = false
    expect(runCommand(p, { type: 'SEEK_BY', deltaSec: 10 })).toBe(false)
    expect(p.pos).toBe(30)
  })

  it('VOLUME 0–100 ölçeğindedir; açmak sessizi kaldırır, sıfır sessize alır', () => {
    const p = new FakePlayer()
    p.mute = true
    runCommand(p, { type: 'VOLUME', volume: 80 })
    expect(p.vol).toBeCloseTo(0.8)
    expect(p.mute).toBe(false)
    runCommand(p, { type: 'VOLUME', volume: 150 })
    expect(p.vol).toBe(1)
    runCommand(p, { type: 'VOLUME_BY', delta: -30 })
    expect(p.vol).toBeCloseTo(0.7)
    runCommand(p, { type: 'VOLUME', volume: 0 })
    expect(p.mute).toBe(true)
    // sessizken +10 → 10'dan başlar
    runCommand(p, { type: 'VOLUME_BY', delta: 10 })
    expect(p.vol).toBeCloseTo(0.1)
    expect(p.mute).toBe(false)
    runCommand(p, { type: 'MUTE_TOGGLE' })
    expect(p.mute).toBe(true)
  })

  it('STOP, NEXT, SUBTITLES_TOGGLE ve KEY hedefe iletilir', () => {
    const p = new FakePlayer()
    expect(runCommand(p, { type: 'STOP' })).toBe(true)
    expect(p.stopped).toBe(1)
    expect(runCommand(p, { type: 'NEXT' })).toBe(true)
    p.nextAvailable = false
    expect(runCommand(p, { type: 'NEXT' })).toBe(false)
    runCommand(p, { type: 'SUBTITLES_TOGGLE' })
    expect(p.subs).toBe('tr')
    expect(runCommand(p, { type: 'KEY', key: 'OK' })).toBe(true)
    expect(p.st).toBe('paused')
    runCommand(p, { type: 'KEY', key: 'RIGHT' })
    expect(p.pos).toBe(110)
    expect(runCommand(p, { type: 'KEY', key: 'DIGIT_4' })).toBe(false)
  })
})

describe('basicKeyCommand', () => {
  it('masaüstü/mobilde kumanda tuşlarını karşılar', () => {
    expect(basicKeyCommand('LEFT', false)).toEqual({ type: 'SEEK_BY', deltaSec: -10 })
    expect(basicKeyCommand('UP', false)).toEqual({ type: 'VOLUME_BY', delta: 10 })
    expect(basicKeyCommand('BACK', false)).toEqual({ type: 'STOP' })
    expect(basicKeyCommand('CHANNEL_UP', false)).toBeNull()
    expect(basicKeyCommand('CHANNEL_UP', true)).toEqual({ type: 'NEXT' })
  })
})

describe('nextSubtitleChoice', () => {
  const tracks = [
    { trackId: 'en', language: 'en', type: 'SUBTITLES' },
    { trackId: 'tr-cc', language: 'tr', type: 'CC' },
    { trackId: 'tr', language: 'tr', type: 'SUBTITLES' },
  ]
  it('açıkken kapatır, kapalıyken son kullanılanı ya da Türkçeyi açar', () => {
    expect(nextSubtitleChoice(tracks, 'tr', null)).toBeNull()
    expect(nextSubtitleChoice(tracks, null, 'en')).toBe('en')
    expect(nextSubtitleChoice(tracks, null, null)).toBe('tr')
    expect(nextSubtitleChoice([], null, null)).toBeNull()
  })
})

/* ───────────── playerRemote ───────────── */

describe('PlayerRegistry (playerRemote)', () => {
  it('oynatıcı yokken dispatch false, getState null', () => {
    const r = new PlayerRegistry()
    expect(r.getState()).toBeNull()
    expect(r.dispatch({ type: 'TOGGLE' })).toBe(false)
  })

  it('komutlar takılı oynatıcıya gider; anlık görüntü onları izler', () => {
    const r = new PlayerRegistry()
    const p = new FakePlayer()
    const detach = r.attach({ dispatch: (c: PlayerCommand) => runCommand(p, c) })
    let calls = 0
    r.subscribe(() => (calls += 1))
    r.publish(makeSnapshot(snapOf(p)))
    const first = r.getState()
    expect(first?.paused).toBe(false)
    expect(first?.volume).toBe(50)

    expect(r.dispatch({ type: 'TOGGLE' })).toBe(true)
    r.publish(makeSnapshot(snapOf(p)))
    expect(r.getState()?.paused).toBe(true)
    expect(r.getState()?.state).toBe('paused')

    r.dispatch({ type: 'SEEK', positionSec: 250.7 })
    r.dispatch({ type: 'VOLUME', volume: 30 })
    r.publish(makeSnapshot(snapOf(p)))
    expect(r.getState()?.positionSec).toBe(250)
    expect(r.getState()?.volume).toBe(30)

    r.dispatch({ type: 'KEY', key: 'LEFT' })
    r.publish(makeSnapshot(snapOf(p)))
    expect(r.getState()?.positionSec).toBe(240)
    expect(calls).toBe(4)

    detach()
    expect(r.getState()).toBeNull()
    expect(r.dispatch({ type: 'PLAY' })).toBe(false)
  })

  it('içerik aynıyken nesne kimliği korunur; konum saniye altı değişimlerde sabit kalır', () => {
    const r = new PlayerRegistry()
    const p = new FakePlayer()
    let calls = 0
    r.subscribe(() => (calls += 1))
    r.publish(makeSnapshot(snapOf(p, { positionSec: 10.1 })))
    const a = r.getState()
    r.publish(makeSnapshot(snapOf(p, { positionSec: 10.6 })))
    r.publish(makeSnapshot(snapOf(p, { positionSec: 10.99 })))
    expect(r.getState()).toBe(a)
    expect(calls).toBe(1)
    r.publish(makeSnapshot(snapOf(p, { positionSec: 11.01 })))
    expect(r.getState()).not.toBe(a)
    expect(r.getState()?.positionSec).toBe(11)
    expect(calls).toBe(2)
  })

  it('eski kaydın sökülmesi yenisini silmez (StrictMode çift kurulum)', () => {
    const r = new PlayerRegistry()
    const offA = r.attach({ dispatch: () => true })
    r.attach({ dispatch: () => false })
    offA()
    expect(r.dispatch({ type: 'PLAY' })).toBe(false) // B hâlâ kayıtlı ve false döndürüyor
  })

  it('makeSnapshot: canlıda süre yoksa null; ses 0–100; tamponlanırken paused=false', () => {
    const p = new FakePlayer()
    const s = makeSnapshot(snapOf(p, { live: true, durationSec: 0, state: 'buffering', volume: 0.333 }))
    expect(s.durationSec).toBeNull()
    expect(s.paused).toBe(false)
    expect(s.volume).toBe(33)
  })
})

/* ───────────── adres seçenekleri ───────────── */

describe('parseWatchOptions / parseKonum', () => {
  it('konum, baslat, kaynak, tctx', () => {
    const o = parseWatchOptions(new URLSearchParams('konum=120&baslat=bastan&kaynak=YOUTUBE&tctx=abc'))
    expect(o).toEqual({ tctx: 'abc', fromStart: true, kaynak: 'YOUTUBE', konumSec: 120 })
    expect(parseWatchOptions(new URLSearchParams('kaynak=FOO')).kaynak).toBeNull()
  })
  it('sayı, ondalık ve s:dd / s:dd:ss biçimleri; geçersizler null', () => {
    expect(parseKonum('95.5')).toBe(95.5)
    expect(parseKonum('2:05')).toBe(125)
    expect(parseKonum('1:02:05')).toBe(3725)
    expect(parseKonum('-3')).toBeNull()
    expect(parseKonum('abc')).toBeNull()
    expect(parseKonum('1:75')).toBeNull()
    expect(parseKonum('')).toBeNull()
    expect(parseKonum(null)).toBeNull()
  })
})

describe('startPosition', () => {
  const base: StartInput = {
    manifest: { kind: 'STREAMS', live: null, bookmark: null, durationMs: 888_000 },
    metaBookmarkSec: 300,
    runtimeSec: 888,
    fromStart: false,
    hintSec: null,
    konumSec: null,
    linearChannel: false,
  }
  it('yer iminden sürer', () => {
    expect(startPosition(base)).toEqual({ sec: 300, resumed: true })
  })
  it('konum yer iminin önüne geçer ve süreye sıkıştırılır', () => {
    expect(startPosition({ ...base, konumSec: 120 })).toEqual({ sec: 120, resumed: false })
    expect(startPosition({ ...base, konumSec: 5000 }).sec).toBe(887)
    expect(startPosition({ ...base, konumSec: 120, fromStart: true }).sec).toBe(120)
  })
  it('kaynak değişimi konumun da önüne geçer', () => {
    expect(startPosition({ ...base, konumSec: 120, hintSec: 42 }).sec).toBe(42)
  })
  it('doğrusal kanalda konum yok sayılır, katılma noktası kullanılır', () => {
    const live = { startAt: '', endAt: null, joinOffsetMs: 61_000, seekable: false }
    expect(
      startPosition({ ...base, manifest: { ...base.manifest, live }, konumSec: 120, linearChannel: true }).sec,
    ).toBe(61)
  })
  it('baştan başlat yer imini yok sayar', () => {
    expect(startPosition({ ...base, fromStart: true })).toEqual({ sec: 0, resumed: false })
  })
})

/* ───────────── TV durum makinesi ───────────── */

interface Ctx extends TvContext {
  panels: Partial<Record<TvPanelKind, PanelInfo>>
}
function ctx(p: Partial<Ctx> = {}): Ctx {
  const panels = p.panels ?? {}
  return {
    position: 100,
    duration: 600,
    seekable: true,
    channelMode: false,
    canZap: false,
    canStartOver: false,
    ...p,
    panels,
    panel: (k: TvPanelKind) => panels[k] ?? null,
  }
}
function run(c: TvContext, actions: (TvAction | RemoteKey)[], s: TvState = tvInitial()) {
  const effects: TvEffect[] = []
  let state = s
  for (const a of actions) {
    const step = tvStep(state, typeof a === 'string' ? { type: 'KEY', key: a } : a, c)
    state = step.state
    effects.push(...step.effects)
  }
  return { state, effects }
}

describe('remoteKeyFromKeyboard', () => {
  it('ok tuşları, geri kodları, medya tuşları ve rakamlar', () => {
    expect(remoteKeyFromKeyboard({ key: 'ArrowRight' })).toBe('RIGHT')
    expect(remoteKeyFromKeyboard({ key: 'Enter' })).toBe('OK')
    expect(remoteKeyFromKeyboard({ key: 'Escape' })).toBe('BACK')
    expect(remoteKeyFromKeyboard({ key: 'Unidentified', keyCode: 461 })).toBe('BACK')
    expect(remoteKeyFromKeyboard({ key: 'XF86Back', keyCode: 10009 })).toBe('BACK')
    expect(remoteKeyFromKeyboard({ key: 'MediaPlayPause' })).toBe('PLAY_PAUSE')
    expect(remoteKeyFromKeyboard({ key: '', keyCode: 412 })).toBe('REWIND')
    expect(remoteKeyFromKeyboard({ key: '7' })).toBe('DIGIT_7')
    expect(remoteKeyFromKeyboard({ key: 'Unidentified', keyCode: 99 })).toBe('DIGIT_3')
    expect(remoteKeyFromKeyboard({ key: 'PageUp' })).toBe('CHANNEL_UP')
    expect(remoteKeyFromKeyboard({ key: 'q' })).toBeNull()
  })
})

describe('tvStep: sarma', () => {
  it('üç kez → ön izleme +30 sn, 500 ms sonra tek seek', () => {
    const r = run(ctx(), ['RIGHT', 'RIGHT', 'RIGHT'])
    expect(r.effects).toEqual([])
    expect(r.state.seek).toEqual({ target: 130, dir: 1, steps: 3 })
    expect(r.state.band).toBe(true)
    const c = run(ctx(), [{ type: 'COMMIT_SEEK' }], r.state)
    expect(c.effects).toEqual([{ type: 'seek', sec: 130 }])
    expect(c.state.seek).toBeNull()
  })
  it('basılı tutunca hızlanır', () => {
    expect([1, 3, 4, 6, 7, 10, 11].map(seekStepSec)).toEqual([10, 10, 20, 20, 30, 30, 60])
    const r = run(ctx(), Array<RemoteKey>(5).fill('RIGHT'))
    expect(r.state.seek?.target).toBe(100 + 30 + 20 + 20)
  })
  it('yön değişince adım sıfırlanır, hedef korunur; sınırlara sıkıştırılır', () => {
    const r = run(ctx(), ['RIGHT', 'RIGHT', 'LEFT'])
    expect(r.state.seek).toEqual({ target: 110, dir: -1, steps: 1 })
    const z = run(ctx({ position: 5 }), ['LEFT', 'LEFT'])
    expect(z.state.seek?.target).toBe(0)
    const e = run(ctx({ position: 595 }), ['FORWARD'])
    expect(e.state.seek?.target).toBe(599)
  })
  it('OK bekleyen sarmayı hemen uygular; BACK iptal eder', () => {
    const ok = run(ctx(), ['RIGHT', 'OK'])
    expect(ok.effects).toEqual([{ type: 'seek', sec: 110 }])
    const back = run(ctx(), ['RIGHT', 'BACK', { type: 'COMMIT_SEEK' }])
    expect(back.effects).toEqual([])
  })
  it('OK oynat/duraklat; konum değiştirilemiyorsa sarma yok', () => {
    expect(run(ctx(), ['OK']).effects).toEqual([{ type: 'toggle' }])
    const r = run(ctx({ seekable: false }), ['RIGHT'])
    expect(r.state.seek).toBeNull()
  })
})

describe('tvStep: şerit ve geri', () => {
  it('Geri: önce şeridi gizler, sonra çıkar', () => {
    const r1 = run(ctx(), ['BACK'])
    expect(r1.state.band).toBe(false)
    expect(r1.effects).toEqual([])
    const r2 = run(ctx(), ['BACK', 'BACK'])
    expect(r2.effects).toEqual([{ type: 'exit' }])
  })
  it('herhangi bir tuş şeridi gösterir; HIDE_BAND panel ya da sarma varken gizlemez', () => {
    const hidden = run(ctx(), [{ type: 'HIDE_BAND' }]).state
    expect(hidden.band).toBe(false)
    expect(run(ctx(), ['VOLUME_UP'], hidden).state.band).toBe(true)
    const seeking = run(ctx(), ['RIGHT', { type: 'HIDE_BAND' }]).state
    expect(seeking.band).toBe(true)
  })
})

describe('tvStep: paneller', () => {
  const panels: Ctx['panels'] = {
    audioSubs: { sizes: [2, 3], selected: [0, 1] },
    episodes: { sizes: [5], selected: [2] },
  }
  it('↑ Ses ve Altyazı: seçili satırdan açılır, ↑/↓ gezinir, ←/→ sütun, OK seçer ve açık kalır', () => {
    const c = ctx({ panels })
    const r = run(c, ['UP'])
    expect(r.state.panel).toEqual({ kind: 'audioSubs', column: 0, index: [0, 1] })
    const r2 = run(c, ['DOWN', 'DOWN', 'RIGHT', 'DOWN', 'DOWN', 'OK'], r.state)
    expect(r2.state.panel).toEqual({ kind: 'audioSubs', column: 1, index: [1, 2] })
    expect(r2.effects).toEqual([{ type: 'select', kind: 'audioSubs', column: 1, index: 2 }])
    const closed = run(c, ['BACK'], r2.state)
    expect(closed.state.panel).toBeNull()
    expect(closed.effects).toEqual([])
  })
  it('tek ses parçası varsa Altyazılar sütunundan başlar', () => {
    const r = run(ctx({ panels: { audioSubs: { sizes: [1, 3], selected: [0, 0] } } }), ['UP'])
    expect(r.state.panel?.column).toBe(1)
  })
  it('↓ Bölümler: OK bölümü seçer ve paneli kapatır; panel açıkken ←/→ sarmaz', () => {
    const c = ctx({ panels })
    const r = run(c, ['DOWN', 'LEFT', 'RIGHT', 'UP', 'OK'])
    expect(r.effects).toEqual([{ type: 'select', kind: 'episodes', column: 0, index: 1 }])
    expect(r.state.panel).toBeNull()
    expect(r.state.seek).toBeNull()
  })
  it('panel yoksa ↑/↓ yalnız şeridi gösterir', () => {
    const r = run(ctx(), ['UP', 'DOWN'])
    expect(r.state.panel).toBeNull()
    expect(r.effects).toEqual([])
  })
})

describe('tvStep: doğrusal kanal', () => {
  const channels: PanelInfo = { sizes: [13], selected: [0] }
  const live = ctx({ channelMode: true, canZap: true, seekable: false, canStartOver: true, panels: { channels } })
  it('↑/↓ ve kanal tuşları kanal değiştirir', () => {
    const r = run(live, ['UP', 'DOWN', 'CHANNEL_UP', 'CHANNEL_DOWN'])
    expect(r.effects).toEqual([
      { type: 'zap', dir: 1 },
      { type: 'zap', dir: -1 },
      { type: 'zap', dir: 1 },
      { type: 'zap', dir: -1 },
    ])
  })
  it('OK kanal listesini açar; ↓ ↓ OK listeden kanal seçer', () => {
    const r = run(live, ['OK', 'DOWN', 'DOWN', 'OK'])
    expect(r.effects).toEqual([{ type: 'select', kind: 'channels', column: 0, index: 2 }])
    expect(r.state.panel).toBeNull()
  })
  it('rakamlar: 2 sn sonra ya da OK ile geçer; en çok 3 hane', () => {
    const a = run(live, ['DIGIT_2', 'DIGIT_0'])
    expect(a.state.digits).toBe('20')
    expect(a.effects).toEqual([])
    const t = run(live, [{ type: 'DIGITS_TIMEOUT' }], a.state)
    expect(t.effects).toEqual([{ type: 'tune', number: 20 }])
    expect(t.state.digits).toBe('')
    const ok = run(live, ['DIGIT_6', 'DIGIT_0', 'OK'])
    expect(ok.effects).toEqual([{ type: 'tune', number: 60 }])
    expect(run(live, ['DIGIT_1', 'DIGIT_2', 'DIGIT_3', 'DIGIT_4']).state.digits).toBe('4')
    expect(run(live, ['DIGIT_2', 'BACK', { type: 'DIGITS_TIMEOUT' }]).effects).toEqual([])
  })
  it('← baştan başlatır (yayın destekliyorsa)', () => {
    expect(run(live, ['LEFT']).effects).toEqual([{ type: 'startOver' }])
    expect(run(ctx({ ...live, canStartOver: false }), ['LEFT']).effects).toEqual([])
  })
  it('kanal kipi dışında rakamlar yok sayılır', () => {
    expect(run(ctx(), ['DIGIT_2']).state.digits).toBe('')
  })
})
