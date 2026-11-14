/**
 * "Şu an TV'de" konumu: TV durumunu en çok saniyede bir bildirir; arada konum istemcide ilerletilir.
 * Saf işlevler (birim testi: progress.test.ts).
 */
import type { DeviceInfo, NowPlaying } from '../../../shared/devices'

/** Saat kayması ya da uzun süre gelmeyen bildirimde konum en çok bu kadar ilerletilir. */
export const MAX_EXTRAPOLATE_SEC = 30 * 60

/** `nowPlaying`'in `now` anındaki tahmini konumu (sn, kesirli). Duraklatılmışsa bildirilen konum. */
export function positionAt(
  np: Pick<NowPlaying, 'positionSec' | 'paused' | 'updatedAt' | 'durationSec'>,
  now: number,
): number {
  let pos = Number.isFinite(np.positionSec) ? Math.max(0, np.positionSec) : 0
  if (!np.paused) {
    const at = Date.parse(np.updatedAt)
    if (Number.isFinite(at)) {
      const elapsed = (now - at) / 1000
      if (elapsed > 0) pos += Math.min(elapsed, MAX_EXTRAPOLATE_SEC)
    }
  }
  if (np.durationSec !== null && np.durationSec > 0) pos = Math.min(pos, np.durationSec)
  return pos
}

/** 0–1 ilerleme; süre bilinmiyorsa (canlı) null. */
export function progressAt(np: NowPlaying, now: number): number | null {
  if (np.live || np.durationSec === null || np.durationSec <= 0) return null
  return Math.max(0, Math.min(1, positionAt(np, now) / np.durationSec))
}

/** "1:02:03" / "4:05" biçimi. */
export function formatClockSec(sec: number): string {
  const s = Math.max(0, Math.floor(sec))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const r = s % 60
  const mm = h ? String(m).padStart(2, '0') : String(m)
  return `${h ? `${h}:` : ''}${mm}:${String(r).padStart(2, '0')}`
}

/**
 * İyimser durum: kumandadan basılan duraklat/oynat ya da sarma, TV'nin bir sonraki bildirimi gelene kadar hemen
 * görünsün. TV yeni bir bildirim yollayınca (updatedAt değişince) ya da süre dolunca geçersizleşir.
 */
export interface Optimistic {
  paused?: boolean
  positionSec?: number
  volume?: number
  muted?: boolean
  /** Bu üst üste bindirme yapıldığında TV'nin son bildirimi */
  basedOn: string
  at: number
}

export const OPTIMISTIC_TTL_MS = 4000

export function applyOptimistic(np: NowPlaying, o: Optimistic | null, now: number): NowPlaying {
  if (!o || o.basedOn !== np.updatedAt || now - o.at > OPTIMISTIC_TTL_MS) return np
  const position = o.positionSec ?? positionAt(np, o.at)
  return {
    ...np,
    paused: o.paused ?? np.paused,
    positionSec: position,
    volume: o.volume ?? np.volume,
    muted: o.muted ?? np.muted,
    updatedAt: new Date(o.at).toISOString(),
  }
}

/* ───────────── Cihaz listesinden türetilenler ───────────── */

/** Yansıtılabilecek TV'ler: çevrimiçi, bu cihaz değil. */
export function castTargets(devices: readonly DeviceInfo[]): DeviceInfo[] {
  return devices.filter((d) => d.kind === 'TV' && d.online && !d.isThisDevice)
}

/** Seçicide gösterilecek TV'ler: önce çevrimiçiler, sonra diğerleri (bu cihaz hariç). */
export function pickerDevices(devices: readonly DeviceInfo[]): DeviceInfo[] {
  return devices
    .filter((d) => d.kind === 'TV' && !d.isThisDevice)
    .sort((a, b) => Number(b.online) - Number(a.online) || a.name.localeCompare(b.name, 'tr'))
}

/** Hedef cihaz çevrimiçiyse ve bir şey oynatıyorsa onun oynatma durumu. */
export function playingOn(target: DeviceInfo | null): NowPlaying | null {
  return target && target.online && !target.isThisDevice ? target.nowPlaying : null
}
