/**
 * TV kabuğunun kumanda mantığı (saf): klavye/kumanda olayı → RemoteKey eşlemesi ve oynatıcı durum makinesi
 * (alt şerit, hızlanan ileri/geri sarma önizlemesi, paneller, kanal numarası girişi).
 *
 * Zamanlayıcılar bileşende durur; süre dolunca bileşen buraya eylem yollar:
 *   COMMIT_SEEK (son sarma tuşundan 500 ms sonra) · DIGITS_TIMEOUT (son rakamdan 2 sn sonra) · HIDE_BAND (4 sn).
 * TV uygulamasıyla (web/src/tv) aynı tuş eşlemesi; oradan içe aktarılmaz.
 */
import type { RemoteKey } from '../../../../shared/devices'

/* ───────────── klavye → RemoteKey ───────────── */

const KEY_NAMES: Record<string, RemoteKey> = {
  ArrowUp: 'UP',
  ArrowDown: 'DOWN',
  ArrowLeft: 'LEFT',
  ArrowRight: 'RIGHT',
  Up: 'UP',
  Down: 'DOWN',
  Left: 'LEFT',
  Right: 'RIGHT',
  Enter: 'OK',
  Accept: 'OK',
  Escape: 'BACK',
  Backspace: 'BACK',
  BrowserBack: 'BACK',
  GoBack: 'BACK',
  BrowserHome: 'HOME',
  GoHome: 'HOME',
  BrowserSearch: 'SEARCH',
  Guide: 'GUIDE',
  ' ': 'PLAY_PAUSE',
  MediaPlayPause: 'PLAY_PAUSE',
  MediaPlay: 'PLAY_PAUSE',
  MediaPause: 'PLAY_PAUSE',
  MediaRewind: 'REWIND',
  MediaTrackPrevious: 'REWIND',
  MediaFastForward: 'FORWARD',
  MediaTrackNext: 'FORWARD',
  ChannelUp: 'CHANNEL_UP',
  ChannelDown: 'CHANNEL_DOWN',
  PageUp: 'CHANNEL_UP',
  PageDown: 'CHANNEL_DOWN',
  AudioVolumeUp: 'VOLUME_UP',
  AudioVolumeDown: 'VOLUME_DOWN',
  AudioVolumeMute: 'MUTE',
  VolumeUp: 'VOLUME_UP',
  VolumeDown: 'VOLUME_DOWN',
  VolumeMute: 'MUTE',
  Subtitle: 'SUBTITLES',
  ClosedCaptionToggle: 'SUBTITLES',
}

/** Televizyon tarayıcılarının (Tizen, webOS, HbbTV) sayısal tuş kodları */
const KEY_CODES: Record<number, RemoteKey> = {
  461: 'BACK', // webOS
  10009: 'BACK', // Tizen
  8: 'BACK',
  27: 'BACK',
  13: 'OK',
  37: 'LEFT',
  38: 'UP',
  39: 'RIGHT',
  40: 'DOWN',
  415: 'PLAY_PAUSE',
  19: 'PLAY_PAUSE',
  10252: 'PLAY_PAUSE',
  412: 'REWIND',
  417: 'FORWARD',
  427: 'CHANNEL_UP',
  428: 'CHANNEL_DOWN',
  33: 'CHANNEL_UP',
  34: 'CHANNEL_DOWN',
  447: 'VOLUME_UP',
  448: 'VOLUME_DOWN',
  449: 'MUTE',
  460: 'SUBTITLES',
  458: 'GUIDE',
}

export function remoteKeyFromKeyboard(e: { key?: string; keyCode?: number }): RemoteKey | null {
  const k = e.key ?? ''
  if (/^[0-9]$/.test(k)) return `DIGIT_${k}` as RemoteKey
  const byName = KEY_NAMES[k]
  if (byName) return byName
  const code = e.keyCode ?? 0
  if (code >= 48 && code <= 57) return `DIGIT_${code - 48}` as RemoteKey
  if (code >= 96 && code <= 105) return `DIGIT_${code - 96}` as RemoteKey
  return KEY_CODES[code] ?? null
}

export function digitOf(key: RemoteKey): string | null {
  return key.startsWith('DIGIT_') ? key.slice(6) : null
}

/* ───────────── durum makinesi ───────────── */

export type TvPanelKind = 'audioSubs' | 'episodes' | 'channels'

export interface TvPanelState {
  kind: TvPanelKind
  /** etkin sütun */
  column: number
  /** sütun başına odaktaki satır */
  index: number[]
}

export interface TvState {
  /** Alt şerit (kanal kipinde bilgi bandı) görünür mü */
  band: boolean
  /** Sarma önizlemesi: hedef konum, yön, art arda basış sayısı */
  seek: { target: number; dir: 1 | -1; steps: number } | null
  panel: TvPanelState | null
  /** Yazılan kanal numarası ('' → yok) */
  digits: string
}

export interface PanelInfo {
  /** sütun başına satır sayısı */
  sizes: number[]
  /** sütun başına seçili satır (açılışta odak oraya gelir) */
  selected: number[]
}

/** Durum makinesinin o anki oynatıcı bilgisi. */
export interface TvContext {
  position: number
  /** bilinmiyorsa 0 */
  duration: number
  seekable: boolean
  /** Doğrusal kanal tam ekran: ↑/↓ kanal değiştirir, OK kanal listesini açar, rakamlarla geçiş */
  channelMode: boolean
  /** Komşu kanal var mı (CHANNEL_UP/DOWN) */
  canZap: boolean
  /** Yayındaki program baştan başlatılabilir mi (kanal kipinde ← / ◀◀) */
  canStartOver: boolean
  /** Panelin içeriği; null → bu oynatmada o panel yok */
  panel(kind: TvPanelKind): PanelInfo | null
}

export type TvEffect =
  | { type: 'toggle' }
  | { type: 'seek'; sec: number }
  | { type: 'exit' }
  | { type: 'zap'; dir: 1 | -1 }
  | { type: 'tune'; number: number }
  | { type: 'select'; kind: TvPanelKind; column: number; index: number }
  | { type: 'startOver' }
  | { type: 'volume'; delta: number }
  | { type: 'mute' }
  | { type: 'subtitles' }

export type TvAction =
  { type: 'KEY'; key: RemoteKey } | { type: 'COMMIT_SEEK' } | { type: 'DIGITS_TIMEOUT' } | { type: 'HIDE_BAND' }

export interface TvStep {
  state: TvState
  effects: TvEffect[]
  /** Tuş bu kabukta bir karşılık buldu mu */
  handled: boolean
}

export const TV_BAND_HIDE_MS = 4000
export const TV_SEEK_COMMIT_MS = 500
export const TV_DIGITS_MS = 2000
export const TV_MAX_DIGITS = 3

export function tvInitial(): TvState {
  return { band: true, seek: null, panel: null, digits: '' }
}

/** Art arda n. basışın adımı: 1–3 → 10 sn, 4–6 → 20 sn, 7–10 → 30 sn, sonra 60 sn. */
export function seekStepSec(steps: number): number {
  if (steps <= 3) return 10
  if (steps <= 6) return 20
  if (steps <= 10) return 30
  return 60
}

function clampTarget(t: number, duration: number): number {
  if (duration > 0) return Math.max(0, Math.min(Math.max(0, duration - 1), t))
  return Math.max(0, t)
}

function openPanel(s: TvState, kind: TvPanelKind, ctx: TvContext): TvState | null {
  const info = ctx.panel(kind)
  if (!info || !info.sizes.some((n) => n > 0)) return null
  const index = info.sizes.map((n, i) => Math.max(0, Math.min(n - 1, info.selected[i] ?? 0)))
  // İlk dolu sütundan başla (Ses ve Altyazı'da: tek ses varsa doğrudan Altyazılar'a)
  const column = info.sizes.length > 1 && info.sizes[0]! <= 1 && (info.sizes[1] ?? 0) > 0 ? 1 : 0
  return { ...s, band: true, seek: null, panel: { kind, column, index } }
}

const done = (state: TvState, effects: TvEffect[] = [], handled = true): TvStep => ({ state, effects, handled })

function panelKey(s: TvState, p: TvPanelState, key: RemoteKey, ctx: TvContext): TvStep {
  const info = ctx.panel(p.kind)
  if (!info) return done({ ...s, panel: null })
  const size = info.sizes[p.column] ?? 0
  const cur = p.index[p.column] ?? 0
  const withIndex = (i: number): TvState => {
    const index = [...p.index]
    index[p.column] = Math.max(0, Math.min(Math.max(0, size - 1), i))
    return { ...s, panel: { ...p, index } }
  }
  switch (key) {
    case 'UP':
      return done(withIndex(cur - 1))
    case 'DOWN':
      return done(withIndex(cur + 1))
    case 'LEFT':
    case 'RIGHT': {
      const dir = key === 'LEFT' ? -1 : 1
      let col = p.column + dir
      while (col >= 0 && col < info.sizes.length && (info.sizes[col] ?? 0) === 0) col += dir
      if (col < 0 || col >= info.sizes.length) return done(s)
      return done({ ...s, panel: { ...p, column: col } })
    }
    case 'OK': {
      if (size === 0) return done(s)
      const eff: TvEffect = { type: 'select', kind: p.kind, column: p.column, index: cur }
      // Ses ve Altyazı açık kalır (seçim işareti yer değiştirir); bölüm / kanal seçimi paneli kapatır
      return done(p.kind === 'audioSubs' ? s : { ...s, panel: null }, [eff])
    }
    case 'BACK':
      return done({ ...s, panel: null })
    case 'PLAY_PAUSE':
      return done(s, [{ type: 'toggle' }])
    case 'VOLUME_UP':
      return done(s, [{ type: 'volume', delta: 10 }])
    case 'VOLUME_DOWN':
      return done(s, [{ type: 'volume', delta: -10 }])
    case 'MUTE':
      return done(s, [{ type: 'mute' }])
    case 'HOME':
      return done({ ...s, panel: null }, [{ type: 'exit' }])
    default:
      return done(s)
  }
}

function seekKey(s: TvState, dir: 1 | -1, ctx: TvContext): TvStep {
  if (ctx.channelMode) {
    if (dir === -1 && ctx.canStartOver) return done({ ...s, band: true }, [{ type: 'startOver' }])
    return done({ ...s, band: true })
  }
  if (!ctx.seekable) return done({ ...s, band: true }, [], false)
  const same = s.seek && s.seek.dir === dir
  const steps = same ? s.seek!.steps + 1 : 1
  const base = s.seek ? s.seek.target : ctx.position
  const target = clampTarget(base + dir * seekStepSec(steps), ctx.duration)
  return done({ ...s, band: true, seek: { target, dir, steps } })
}

export function tvStep(s: TvState, a: TvAction, ctx: TvContext): TvStep {
  switch (a.type) {
    case 'COMMIT_SEEK':
      if (!s.seek) return done(s, [], false)
      return done({ ...s, seek: null }, [{ type: 'seek', sec: s.seek.target }])
    case 'DIGITS_TIMEOUT': {
      if (!s.digits) return done(s, [], false)
      return done({ ...s, digits: '' }, [{ type: 'tune', number: Number(s.digits) }])
    }
    case 'HIDE_BAND':
      if (s.panel || s.seek || s.digits || !s.band) return done(s, [], false)
      return done({ ...s, band: false })
    case 'KEY':
      break
  }
  const key = a.key
  if (s.panel) return panelKey(s, s.panel, key, ctx)

  const d = digitOf(key)
  if (d !== null) {
    if (!ctx.channelMode) return done({ ...s, band: true }, [], false)
    const digits = s.digits.length >= TV_MAX_DIGITS ? d : s.digits + d
    return done({ ...s, band: true, digits })
  }

  const shown: TvState = { ...s, band: true }
  switch (key) {
    case 'OK':
      if (s.digits) return done({ ...shown, digits: '' }, [{ type: 'tune', number: Number(s.digits) }])
      if (s.seek) return done({ ...shown, seek: null }, [{ type: 'seek', sec: s.seek.target }])
      if (ctx.channelMode) return done(openPanel(s, 'channels', ctx) ?? shown)
      return done(shown, [{ type: 'toggle' }])
    case 'PLAY_PAUSE': {
      const eff: TvEffect[] = s.seek ? [{ type: 'seek', sec: s.seek.target }] : []
      return done({ ...shown, seek: null }, [...eff, { type: 'toggle' }])
    }
    case 'LEFT':
    case 'REWIND':
      return seekKey(s, -1, ctx)
    case 'RIGHT':
    case 'FORWARD':
      return seekKey(s, 1, ctx)
    case 'UP':
      if (ctx.channelMode) return done(shown, ctx.canZap ? [{ type: 'zap', dir: 1 }] : [])
      return done(openPanel(s, 'audioSubs', ctx) ?? shown)
    case 'DOWN':
      if (ctx.channelMode) return done(shown, ctx.canZap ? [{ type: 'zap', dir: -1 }] : [])
      return done(openPanel(s, 'episodes', ctx) ?? openPanel(s, 'channels', ctx) ?? shown)
    case 'CHANNEL_UP':
    case 'CHANNEL_DOWN':
      if (!ctx.canZap) return done(shown, [], false)
      return done(shown, [{ type: 'zap', dir: key === 'CHANNEL_UP' ? 1 : -1 }])
    case 'GUIDE':
      return done(openPanel(s, 'channels', ctx) ?? shown)
    case 'BACK':
      if (s.digits) return done({ ...s, digits: '' })
      if (s.seek) return done({ ...s, seek: null })
      if (s.band) return done({ ...s, band: false })
      return done(s, [{ type: 'exit' }])
    case 'HOME':
      return done(s, [{ type: 'exit' }])
    case 'VOLUME_UP':
      return done(shown, [{ type: 'volume', delta: 10 }])
    case 'VOLUME_DOWN':
      return done(shown, [{ type: 'volume', delta: -10 }])
    case 'MUTE':
      return done(shown, [{ type: 'mute' }])
    case 'SUBTITLES':
      return done(shown, [{ type: 'subtitles' }])
    default:
      return done(shown, [], false)
  }
}
