/**
 * Yayın eylem durum makinesi (saf): bir yayının ŞU AN hangi tek eylemi sunduğu.
 * Canlı durum sunucunun `liveState` değerinden değil, startAt/endAt + istemci saatinden hesaplanır;
 * böylece sayfa açık kalırken biten ya da başlayan yayın yeniden çekmeyi beklemeden doğru eylemi gösterir.
 *
 *   UPCOMING → eylem yok, "Bugün 22:15'te başlıyor"
 *   LIVE     → "Canlı İzle" (+ "Baştan Başlat" startOver ise)
 *   ENDED    → geri al penceresi açıksa "İzle" (Airing:<id>), değilse "Tekrar izlenemiyor"
 *   yetki PLAYABLE değilse oynatma eylemi yerine kilit + gerekçe (tam ekran hata yok)
 */
import { formatDayTime } from '../../ui'
import type { AccessData } from './types'

const HOUR_MS = 3_600_000

export interface AiringLike {
  airingId: string
  startAt: string
  endAt: string
  startOver: boolean
  catchup: { available: boolean; until: string | null }
  access: AccessData
}

export interface ActionLink {
  label: string
  to: string
}

export type AiringAction =
  | { kind: 'live'; primary: ActionLink; secondary: ActionLink | null }
  | { kind: 'catchup'; primary: ActionLink; hint: string | null }
  | { kind: 'ended'; note: string }
  | { kind: 'upcoming'; note: string; lockReason: string | null }
  | { kind: 'locked'; reason: string }

export type TimeState = 'UPCOMING' | 'LIVE' | 'ENDED'

export function timeStateOf(startAt: string, endAt: string, now: number): TimeState {
  if (now < Date.parse(startAt)) return 'UPCOMING'
  if (now < Date.parse(endAt)) return 'LIVE'
  return 'ENDED'
}

/** `?tctx=…` (+ ek parametreler) */
function withQuery(path: string, params: [string, string | null | undefined][]): string {
  const q = params.filter(([, v]) => v).map(([k, v]) => `${k}=${encodeURIComponent(v ?? '')}`)
  return q.length ? `${path}?${q.join('&')}` : path
}

export function liveWatchPath(channelId: number, tctx?: string | null, fromStart = false): string {
  return withQuery(`/izle/Channel:${channelId}`, [
    ['tctx', tctx],
    ['baslat', fromStart ? 'bastan' : null],
  ])
}

export function airingWatchPath(airingId: string, tctx?: string | null): string {
  return withQuery(`/izle/Airing:${airingId}`, [['tctx', tctx]])
}

/** Yetki kilidinin tek satırı: "HBO Max paketiyle" ya da sunucunun gerekçesi. */
export function lockText(access: AccessData): string | null {
  if (access.state === 'PLAYABLE') return null
  return access.reasonText ?? (access.requiredProductName ? `${access.requiredProductName} ile` : 'Paketinde yok')
}

/** Paket/cihaz kilidi (kilit simgesi): OUT_OF_WINDOW bir kilit değil, "Tekrar izlenemiyor" durumudur. */
export function packageLock(access: AccessData): string | null {
  return access.state === 'OUT_OF_WINDOW' ? null : lockText(access)
}

/** Geri al penceresi açık mı (istemci saatiyle): yayın bitmiş ve `until` geçmemiş. */
export function catchupOpen(a: Pick<AiringLike, 'endAt' | 'catchup'>, now: number): boolean {
  if (!a.catchup.until) return false
  return now >= Date.parse(a.endAt) && now <= Date.parse(a.catchup.until)
}

/** Geri al penceresi 24 saatten az kaldıysa: "Son 1 gün" · "Son 5 saat" · "Son 40 dk"; değilse null. */
export function catchupHint(until: string | null, now: number): string | null {
  if (!until) return null
  const left = Date.parse(until) - now
  if (left <= 0 || left > 24 * HOUR_MS) return null
  if (left > 12 * HOUR_MS) return 'Son 1 gün'
  if (left >= HOUR_MS) return `Son ${Math.floor(left / HOUR_MS)} saat`
  return `Son ${Math.max(1, Math.ceil(left / 60_000))} dk`
}

/** Bulunma eki (-de/-da/-te/-ta) saatin okunuşuna göre: "22:15'te", "20:00'de", "21:30'da". */
export function locativeSuffix(clock: string): string {
  const [h = '0', m = '0'] = clock.split(':')
  const minutes = Number(m)
  const n = minutes !== 0 ? minutes : Number(h)
  const units: Record<number, string> = {
    0: 'da',
    1: 'de',
    2: 'de',
    3: 'te',
    4: 'te',
    5: 'te',
    6: 'da',
    7: 'de',
    8: 'de',
    9: 'da',
  }
  const tens: Record<number, string> = { 1: 'da', 2: 'de', 3: 'da', 4: 'ta', 5: 'de' }
  if (n === 0) return 'da'
  if (n % 10 !== 0) return units[n % 10] ?? 'de'
  return tens[Math.floor(n / 10) % 10] ?? 'de'
}

/** "Bugün 22:15'te başlıyor" */
export function upcomingNote(startAt: string, now: number): string {
  const label = formatDayTime(startAt, now)
  const clock = label.slice(label.lastIndexOf(' ') + 1)
  return `${label}'${locativeSuffix(clock)} başlıyor`
}

export function airingAction(a: AiringLike, channelId: number, now: number, tctx?: string | null): AiringAction {
  const state = timeStateOf(a.startAt, a.endAt, now)
  const lock = lockText(a.access)
  if (state === 'UPCOMING') return { kind: 'upcoming', note: upcomingNote(a.startAt, now), lockReason: lock }
  if (state === 'LIVE') {
    if (lock) return { kind: 'locked', reason: lock }
    return {
      kind: 'live',
      primary: { label: 'Canlı İzle', to: liveWatchPath(channelId, tctx) },
      secondary: a.startOver ? { label: 'Baştan Başlat', to: liveWatchPath(channelId, tctx, true) } : null,
    }
  }
  if (!catchupOpen(a, now)) return { kind: 'ended', note: 'Tekrar izlenemiyor' }
  // Sunucu biten ve penceresi kapalı yayına OUT_OF_WINDOW der; pencere açıkken başka bir kilit gerçek bir kilittir.
  if (lock && a.access.state !== 'OUT_OF_WINDOW') return { kind: 'locked', reason: lock }
  return {
    kind: 'catchup',
    primary: { label: 'İzle', to: airingWatchPath(a.airingId, tctx) },
    hint: catchupHint(a.catchup.until, now),
  }
}
