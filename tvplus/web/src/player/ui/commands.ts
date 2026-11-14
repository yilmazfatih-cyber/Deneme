/**
 * `PlayerCommand` → oynatıcı işlemi. Saf mantık: hedef, bağdaştırıcının (STREAMS / PROGRESSIVE / YouTube) ve
 * görünümün üstünde ince bir yüzeydir; testte sahte bir hedefle sınanır.
 */
import type { RemoteKey } from '../../../../shared/devices'
import type { PlayerCommand, PlayerSnapshotState } from '../remote'

export interface CommandTarget {
  state(): PlayerSnapshotState
  position(): number
  /** bilinmiyorsa 0 */
  duration(): number
  /** 0–1 */
  volume(): number
  muted(): boolean
  play(): void
  pause(): void
  seek(sec: number): void
  setVolume(v: number): void
  setMuted(m: boolean): void
  /** Konum değiştirilebilir mi (doğrusal kanalda değil) */
  seekable(): boolean
  /** Yer imini kaydet ve çık */
  stop(): void
  /** Sonraki bölüm / kanal; yoksa false */
  next(): boolean
  /** Altyazıyı aç/kapat; altyazı yoksa false */
  toggleSubtitles(): boolean
  /** Kumanda tuşu (TV kabuğu kendi durum makinesine yollar; diğerleri `basicKeyCommand`) */
  key(k: RemoteKey): boolean
}

export const SEEK_STEP_SEC = 10
export const VOLUME_STEP = 10

export function isPlayingState(s: PlayerSnapshotState): boolean {
  return s === 'playing' || s === 'buffering'
}

/** Hedef konumu [0, süre] aralığına sıkıştırır (süre bilinmiyorsa yalnız alttan). */
export function clampPosition(sec: number, duration: number): number {
  const s = Number.isFinite(sec) ? sec : 0
  if (duration > 0) return Math.max(0, Math.min(duration - 0.5, s))
  return Math.max(0, s)
}

function applyVolume(t: CommandTarget, vol100: number): void {
  const v = Math.max(0, Math.min(100, Math.round(vol100))) / 100
  t.setVolume(v)
  // Netflix gibi: sesi açmak sessizi kaldırır, sıfıra çekmek sessize alır
  if (v > 0 && t.muted()) t.setMuted(false)
  if (v === 0 && !t.muted()) t.setMuted(true)
}

/** Komutu uygular; işlenmediyse (ör. konum değiştirilemez, oynatıcı hazır değil) false. */
export function runCommand(t: CommandTarget, cmd: PlayerCommand): boolean {
  const st = t.state()
  switch (cmd.type) {
    case 'PLAY':
      if (st === 'error') return false
      if (st === 'ended') t.seek(0)
      t.play()
      return true
    case 'PAUSE':
      if (st === 'error') return false
      t.pause()
      return true
    case 'TOGGLE':
      if (st === 'error') return false
      if (isPlayingState(st)) t.pause()
      else {
        if (st === 'ended') t.seek(0)
        t.play()
      }
      return true
    case 'SEEK':
      if (!t.seekable() || !Number.isFinite(cmd.positionSec)) return false
      t.seek(clampPosition(cmd.positionSec, t.duration()))
      return true
    case 'SEEK_BY':
      if (!t.seekable() || !Number.isFinite(cmd.deltaSec)) return false
      t.seek(clampPosition(t.position() + cmd.deltaSec, t.duration()))
      return true
    case 'VOLUME':
      if (!Number.isFinite(cmd.volume)) return false
      applyVolume(t, cmd.volume)
      return true
    case 'VOLUME_BY': {
      if (!Number.isFinite(cmd.delta)) return false
      const base = t.muted() ? 0 : t.volume() * 100
      applyVolume(t, base + cmd.delta)
      return true
    }
    case 'MUTE_TOGGLE':
      t.setMuted(!t.muted())
      return true
    case 'STOP':
      t.stop()
      return true
    case 'NEXT':
      return t.next()
    case 'SUBTITLES_TOGGLE':
      return t.toggleSubtitles()
    case 'KEY':
      return t.key(cmd.key)
  }
}

/**
 * Masaüstü ve mobil kabukta kumanda tuşlarının karşılığı (TV kabuğu kendi durum makinesini kullanır).
 * null → bu kabukta karşılığı yok.
 */
export function basicKeyCommand(key: RemoteKey, live: boolean): PlayerCommand | null {
  switch (key) {
    case 'OK':
    case 'PLAY_PAUSE':
      return { type: 'TOGGLE' }
    case 'LEFT':
    case 'REWIND':
      return { type: 'SEEK_BY', deltaSec: -SEEK_STEP_SEC }
    case 'RIGHT':
    case 'FORWARD':
      return { type: 'SEEK_BY', deltaSec: SEEK_STEP_SEC }
    case 'UP':
    case 'VOLUME_UP':
      return { type: 'VOLUME_BY', delta: VOLUME_STEP }
    case 'DOWN':
    case 'VOLUME_DOWN':
      return { type: 'VOLUME_BY', delta: -VOLUME_STEP }
    case 'MUTE':
      return { type: 'MUTE_TOGGLE' }
    case 'SUBTITLES':
      return { type: 'SUBTITLES_TOGGLE' }
    case 'BACK':
    case 'HOME':
      return { type: 'STOP' }
    case 'CHANNEL_UP':
      return live ? { type: 'NEXT' } : null
    default:
      return null
  }
}

/** Altyazı aç/kapa: kapalıysa son kullanılan (yoksa Türkçe, yoksa ilk) parça açılır. */
export function nextSubtitleChoice(
  tracks: { trackId: string; language: string; type?: string }[],
  selected: string | null,
  lastUsed: string | null,
): string | null {
  if (selected) return null
  if (lastUsed && tracks.some((t) => t.trackId === lastUsed)) return lastUsed
  const tr = tracks.find((t) => t.language.toLowerCase().startsWith('tr') && t.type !== 'CC')
  return tr?.trackId ?? tracks[0]?.trackId ?? null
}
