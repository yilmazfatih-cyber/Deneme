/**
 * Canlı TV ve Rehber'in veri katmanı (TV): kalıcı sorgular TvLivePage / TvGuide, sunucu saati, iyimser
 * Kanallarım ve hatırlatma güncellemeleri, son kanal hafızası. Görsel bileşen yok.
 *
 *   useTvLive()        yetenek pazarlıklı livePage → kanal listesi, son kanal, tctx; satır TTL'i ve program sınırında
 *                      tek sorguyla yeniden çekilir (eski veri ekranda kalır)
 *   useServerNow(ms)   sunucu saatine göre "şimdi" (yanıttaki serverTime'dan hesaplanan farkla)
 *   lastTunedChannel   bu oturumda en son açılan kanal (tam ekrandan dönüşte liste o kanala odaklanır)
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { gql } from '../../api/graphql'
import { queryCache, useGql } from '../../api/hooks'
import { devbus } from '../../lib/devbus'
import { logEvent } from '../../telemetry/logger'
import { tvToast } from '../ui'
import { clockOffset, nextRefreshAt } from './model'

/* ───────────── Tipler (sorgu seçimlerinin aynası) ───────────── */

export type AccessState = 'PLAYABLE' | 'UPSELL' | 'DEVICE_RESTRICTED' | 'OUT_OF_WINDOW' | 'BLOCKED'

export interface TvArtwork {
  url: string
  width: number
  height: number
}

export interface TvAccess {
  state: AccessState
  reasonText: string | null
  requiredProductName: string | null
}

export interface TvAiring {
  airingId: string
  unifiedEntityId: string
  title: string
  kind: string
  startAt: string
  endAt: string
  liveState: 'UPCOMING' | 'LIVE' | 'ENDED'
  startOver: boolean
  catchup: { available: boolean; until: string | null }
  access: TvAccess
  synopsis?: string
  hasReminder?: boolean
  art?: TvArtwork | null
}

export interface TvChannel {
  channelId: number
  unifiedEntityId: string
  name: string
  number: number
  category: string
  categoryName: string
  isHd: boolean
  isFavorite: boolean
  isKids: boolean
  isSampleSchedule: boolean
  sourceKind: 'OWN_CDN' | 'YOUTUBE' | 'PROGRESSIVE'
  access: TvAccess
  logo: TvArtwork
  now: TvAiring | null
  next: TvAiring | null
  description?: string
  upcoming?: TvAiring[]
  airings?: TvAiring[]
}

interface TrackData {
  tctx: string
  entityId: string
}

interface LivePageRow {
  rowId: string
  type: string
  title: string | null
  ttlSec: number
  items: { kind: string; track: TrackData; entity: { __typename: string } & Partial<TvChannel> }[]
}

interface TvLivePageData {
  livePage: { id: string; expires: string; serverTime: string; rows: LivePageRow[] }
}

/* ───────────── Sunucu saati ───────────── */

let serverOffset = 0
const seenServerTimes = new Set<string>()

/** Yanıttaki serverTime'ı ilk görüldüğü anla eşleyip farkı günceller. */
export function noteServerTime(serverTime: string): void {
  if (seenServerTimes.has(serverTime)) return
  seenServerTimes.add(serverTime)
  serverOffset = clockOffset(serverTime, Date.now())
}

export const serverNow = (): number => Date.now() + serverOffset

/** Sunucu saatine göre "şimdi"; `intervalMs`'de bir yenilenir. */
export function useServerNow(intervalMs = 15_000): number {
  const [now, setNow] = useState(serverNow)
  useEffect(() => {
    const t = setInterval(() => setNow(serverNow()), intervalMs)
    return () => clearInterval(t)
  }, [intervalMs])
  return now
}

/* ───────────── Son kanal ───────────── */

let lastTuned: number | null = null

/** Bu oturumda en son tam ekran açılan kanal (TvWatch bildirir; zap da dahil). */
export function noteTunedChannel(channelId: number): void {
  lastTuned = channelId
}
export const lastTunedChannel = (): number | null => lastTuned

let guideRequest: number | null = null

/** Canlı TV'deki "Rehber" eylemi: rehber bu kanalda açılsın. */
export function requestGuideChannel(channelId: number): void {
  guideRequest = channelId
}

/** Rehber açılırken bir kez okunur. */
export function takeGuideChannel(): number | null {
  const id = guideRequest
  guideRequest = null
  return id
}

/* ───────────── Canlı TV ───────────── */

const CAPABILITIES = { rowTypes: ['LIVE_HERO', 'CHANNEL_ROW'], entityKinds: ['CHANNEL'] }
const UPCOMING_SPAN_MS = 8 * 3_600_000
const SLOT = 30 * 60_000

export interface TvLiveData {
  channels: TvChannel[]
  /** profilin son kanalı (yoksa ilk favori) — sunucunun LIVE_HERO satırı */
  heroId: number | null
  tctxOf: (channelId: number) => string | null
  isFavorite: (c: TvChannel) => boolean
  toggleFavorite: (c: TvChannel) => void
  loading: boolean
  error: Error | null
  refetch: () => void
}

/** Kanallar için yayın aralığı: yarım saate yuvarlanır ki değişkenler (önbellek anahtarı) her an değişmesin. */
function upcomingSpan(): { from: string; to: string } {
  const from = Math.floor(serverNow() / SLOT) * SLOT
  return { from: new Date(from).toISOString(), to: new Date(from + UPCOMING_SPAN_MS).toISOString() }
}

export function useTvLive(): TvLiveData {
  const [span, setSpan] = useState(upcomingSpan)
  const variables = useMemo(() => ({ capabilities: CAPABILITIES, ...span }), [span])
  const { data, error, loading, refetch } = useGql<TvLivePageData, typeof variables>('TvLivePage', variables, {
    ttlMs: 30_000,
  })
  const page = data?.livePage
  const [favOverride, setFavOverride] = useState<Map<number, boolean>>(() => new Map())

  useEffect(() => {
    if (page) noteServerTime(page.serverTime)
  }, [page])

  const { channels, heroId, tctx } = useMemo(() => {
    const tctxMap = new Map<number, string>()
    let hero: number | null = null
    let list: TvChannel[] = []
    for (const row of page?.rows ?? []) {
      const chans = row.items
        .filter((it) => it.kind === 'CHANNEL' && it.entity.__typename === 'Channel')
        .map((it) => ({ ch: it.entity as unknown as TvChannel, tctx: it.track.tctx }))
      if (row.type === 'LIVE_HERO' && chans[0]) hero = chans[0].ch.channelId
      if (row.type === 'CHANNEL_ROW' && chans.length >= list.length) {
        // En uzun kanal satırı ("Tüm kanallar") listedir; tctx o satırın konumunu taşır.
        list = chans.map((c) => c.ch)
        for (const c of chans) tctxMap.set(c.ch.channelId, c.tctx)
      }
    }
    list = [...list].sort((a, b) => a.number - b.number)
    return { channels: list, heroId: hero, tctx: tctxMap }
  }, [page])

  // Satır TTL'i ya da program sınırı geçince tek sorguyla yeniden çek; yarım saat dönünce aralığı kaydır.
  useEffect(() => {
    if (!page) return
    const fetchedAt = Date.parse(page.serverTime)
    const at = nextRefreshAt(
      page.rows.map((r) => r.ttlSec),
      channels.map((c) => c.now?.endAt),
      fetchedAt,
    )
    if (at === null) return
    const wait = Math.max(1000, at - serverNow() + 500)
    const t = window.setTimeout(() => {
      devbus.emit('cache', 'Canlı TV (TV): yeniden çek', { key: 'TvLivePage', ageMs: serverNow() - fetchedAt })
      const next = upcomingSpan()
      if (next.from !== span.from) setSpan(next)
      else refetch()
    }, wait)
    return () => window.clearTimeout(t)
  }, [page, channels, refetch, span.from])

  // Sunucu iyimser değeri yakalayınca geçersiz kılmayı bırak.
  useEffect(() => {
    if (!favOverride.size) return
    const next = new Map(favOverride)
    for (const c of channels) if (next.get(c.channelId) === c.isFavorite) next.delete(c.channelId)
    if (next.size !== favOverride.size) setFavOverride(next)
  }, [channels])

  const isFavorite = useCallback((c: TvChannel) => favOverride.get(c.channelId) ?? c.isFavorite, [favOverride])

  const toggleFavorite = useCallback(
    (c: TvChannel) => {
      const next = !(favOverride.get(c.channelId) ?? c.isFavorite)
      setFavOverride((m) => new Map(m).set(c.channelId, next))
      logEvent(
        'click',
        { surface: 'tv-canli', action: next ? 'kanal-ekle' : 'kanal-cikar', entityId: c.unifiedEntityId },
        tctx.get(c.channelId) ?? null,
      )
      gql<{ toggleFavoriteChannel: { channelId: number; isFavorite: boolean } }, { channelId: number }>(
        'ToggleFavoriteChannel',
        { channelId: c.channelId },
      ).then(
        (res) => {
          const fav = res.toggleFavoriteChannel.isFavorite
          setFavOverride((m) => new Map(m).set(c.channelId, fav))
          tvToast(fav ? `${c.name} Kanallarım'a eklendi` : `${c.name} Kanallarım'dan çıkarıldı`)
          queryCache.invalidate('Library')
          refetch()
        },
        () => {
          setFavOverride((m) => {
            const copy = new Map(m)
            copy.delete(c.channelId)
            return copy
          })
          tvToast('Kanal listesi güncellenemedi. Tekrar dene.')
        },
      )
    },
    [favOverride, refetch, tctx],
  )

  return {
    channels,
    heroId,
    tctxOf: (id) => tctx.get(id) ?? null,
    isFavorite,
    toggleFavorite,
    loading,
    error: page ? null : error,
    refetch,
  }
}

/* ───────────── Rehber ───────────── */

interface TvGuideData {
  channels: TvChannel[]
}

export interface TvGuideResult {
  channels: TvChannel[]
  hasReminder: (a: TvAiring) => boolean
  setReminder: (a: TvAiring, channel: TvChannel, enabled: boolean) => void
  loading: boolean
  error: Error | null
  refetch: () => void
}

/** Hatırlatma değişiklikleri ekranlar arası korunur (önbellekteki rehber verisi eski kalsa da doğru görünür). */
const reminderOverrides = new Map<string, boolean>()

export function useTvGuide(win: { from: number; to: number }): TvGuideResult {
  const variables = useMemo(
    () => ({ from: new Date(win.from).toISOString(), to: new Date(win.to).toISOString() }),
    [win.from, win.to],
  )
  const { data, error, loading, refetch } = useGql<TvGuideData, typeof variables>('TvGuide', variables, {
    ttlMs: 60_000,
  })
  const [version, setVersion] = useState(0)
  const channels = useMemo(() => [...(data?.channels ?? [])].sort((a, b) => a.number - b.number), [data])

  const hasReminder = useCallback(
    (a: TvAiring) => reminderOverrides.get(a.airingId) ?? a.hasReminder === true,
    // sürüm, geçersiz kılma tablosunun değiştiğini bildirir
    [version],
  )
  const put = (id: string, on: boolean | null): void => {
    if (on === null) reminderOverrides.delete(id)
    else reminderOverrides.set(id, on)
    setVersion((v) => v + 1)
  }

  const setReminder = useCallback((a: TvAiring, channel: TvChannel, enabled: boolean) => {
    put(a.airingId, enabled)
    logEvent(
      'click',
      { surface: 'tv-rehber', action: enabled ? 'hatirlat' : 'hatirlatma-kaldir', entityId: a.unifiedEntityId },
      null,
    )
    gql<{ setReminder: { airingId: string; hasReminder: boolean } | null }, { airingId: string; enabled: boolean }>(
      'SetReminder',
      { airingId: a.airingId, enabled },
    ).then(
      (res) => {
        const on = res.setReminder?.hasReminder ?? enabled
        put(a.airingId, on)
        tvToast(on ? `${a.title} başlayınca haber vereceğiz` : 'Hatırlatma kaldırıldı')
        queryCache.invalidate('Reminders')
        devbus.emit('cache', 'Rehber (TV): hatırlatma', { airingId: a.airingId, channelId: channel.channelId, on })
      },
      () => {
        put(a.airingId, null)
        tvToast('Hatırlatma kurulamadı. Tekrar dene.')
      },
    )
  }, [])

  return { channels, hasReminder, setReminder, loading, error: data ? null : error, refetch }
}
