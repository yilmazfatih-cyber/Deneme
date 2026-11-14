/**
 * Canlı TV sayfasının veri katmanı (masaüstü ve mobil aynı modeli çizer):
 *   - GraphQL `LivePage`: istemci çizebildiği satır tiplerini ve varlık türlerini BİLDİRİR (LIVE_CAPABILITIES);
 *     sunucu bilinmeyeni yollamaz, gelen tanınmayan tip/tür yine de sessizce atlanır.
 *   - Satır başına TTL: bir satırın `ttlSec` süresi dolunca ya da bir programın sınırı geçince sayfa TEK sorguyla
 *     yeniden çekilir; bu sırada eski veri ekranda kalır (titreme yok). İlerleme ve kalan süre `useNow` ile akar.
 *   - Şimdi/sonraki sunucu saatine göre: serverTime ile istemci saati arasındaki fark düzeltilir.
 *   - Favoriler ve hatırlatmalar iyimser (actions.ts); onaylanınca sayfa ve "Hatırlatmaların" yeniden çekilir.
 *   - Kahraman + kanal sırasındaki sonraki iki kanalın manifesti önceden hazırlanır.
 */
import { useCallback, useEffect, useMemo, useRef } from 'react'
import { useGql } from '../../api/hooks'
import { devbus } from '../../lib/devbus'
import { prefetchManifest } from '../../player'
import { logEvent } from '../../telemetry/logger'
import { useNow } from '../../ui'
import { onLiveDataChanged, useFavoriteResolver, useReminderResolver } from './actions'
import {
  LIVE_CAPABILITIES,
  neighbourChannelIds,
  nextRefetchAt,
  renderableRows,
  rowsNeedingRefetch,
  type RenderableRow,
} from './liveLogic'
import {
  categoryGroups,
  channelEntries,
  clockOffset,
  favoriteEntries,
  featuredEntry,
  rowEntries,
  upNext,
  type CategoryGroup,
  type ChannelEntry,
  type UpNext,
} from './liveRows'
import type { AiringBriefData, ArtworkData, LivePageData, RowItemData } from './types'

const VARIABLES = { capabilities: LIVE_CAPABILITIES }

export interface ReminderAiring extends AiringBriefData {
  artwork: ArtworkData | null
  channel: { channelId: number; name: string; number: number; logo: ArtworkData }
}
interface RemindersData {
  reminders: ReminderAiring[]
}

export interface LiveModel {
  pageId: string
  /** Sunucu saatine göre düzeltilmiş "şimdi" (30 sn'de bir akar) */
  now: number
  entries: ChannelEntry[]
  featured: ChannelEntry | null
  favorites: ChannelEntry[]
  categories: CategoryGroup[]
  upNext: UpNext[]
  tonight: RenderableRow | undefined
  catchup: RenderableRow | undefined
  reminders: ReminderAiring[]
  /** Satırın görünen kartları (gösterim günlüğü) */
  onVisible: (rowId: string, rowType: string, items: { entityId: string; tctx: string }[]) => void
}

/** Her serverTime ilk görüldüğü anda ölçülür (önbellekten yeniden bağlanan kanca yanlış fark hesaplamasın). */
const offsets = new Map<string, number>()
function offsetFor(serverTime: string): number {
  let o = offsets.get(serverTime)
  if (o === undefined) {
    o = clockOffset(serverTime, Date.now())
    offsets.set(serverTime, o)
    if (offsets.size > 20) offsets.delete(offsets.keys().next().value!)
  }
  return o
}

function useImpressions(pageId: string | undefined) {
  const seen = useRef(new Set<string>())
  useEffect(() => {
    seen.current = new Set()
  }, [pageId])
  return useCallback((rowId: string, rowType: string, items: { entityId: string; tctx: string }[]) => {
    for (const it of items) {
      const k = `${rowId}|${it.entityId}`
      if (seen.current.has(k)) continue
      seen.current.add(k)
      logEvent('impression', { surface: 'canli', rowType, rowId, entityId: it.entityId }, it.tctx)
    }
  }, [])
}

export function useLiveModel(): {
  model: LiveModel | null
  error: Error | null
  retry: () => void
} {
  const { data, error, loading, refetch } = useGql<LivePageData, typeof VARIABLES>('LivePage', VARIABLES, {
    ttlMs: 60_000,
  })
  const reminders = useGql<RemindersData>('Reminders', undefined, { ttlMs: 60_000 })
  const refetchReminders = reminders.refetch
  const page = data?.livePage
  const clientNow = useNow()
  const offset = page ? offsetFor(page.serverTime) : 0
  const now = clientNow + offset
  const rows = useMemo(() => renderableRows(page?.rows ?? []), [page])
  const fetchedAt = page ? Date.parse(page.serverTime) : 0
  const onVisible = useImpressions(page?.id)
  const isFav = useFavoriteResolver()
  const hasReminder = useReminderResolver()

  // Eylem onaylanınca: sayfa (Kanallarım, kartlardaki durum) ve Hatırlatmalar yeniden çekilir — eski veri kalır.
  useEffect(
    () =>
      onLiveDataChanged(() => {
        refetch()
        refetchReminders()
      }),
    [refetch, refetchReminders],
  )

  // Program sınırı ya da satır ttl'i geçtiyse tek sorguyla yeniden çek (useNow tikinde denetlenir).
  useEffect(() => {
    if (!page || loading) return
    const serverNow = Date.now() + offset
    const due = rowsNeedingRefetch(page.rows, fetchedAt, serverNow)
    if (due.length) {
      devbus.emit('cache', 'Canlı TV: yeniden çek', { key: 'LivePage', rows: due, ageMs: serverNow - fetchedAt })
      refetch()
    }
  }, [clientNow, page, loading, fetchedAt, offset, refetch])

  // Kesin zamanlayıcı: bir sonraki sınır / ttl anında (30 sn'lik tiki beklemeden).
  useEffect(() => {
    if (!page) return
    const at = nextRefetchAt(page.rows, fetchedAt)
    if (at === null) return
    const wait = Math.max(1000, at - (Date.now() + offset) + 500)
    const t = window.setTimeout(() => {
      devbus.emit('cache', 'Canlı TV: yeniden çek', {
        key: 'LivePage',
        rows: rowsNeedingRefetch(page.rows, fetchedAt, Date.now() + offset),
        ageMs: Date.now() + offset - fetchedAt,
      })
      refetch()
    }, wait)
    return () => window.clearTimeout(t)
  }, [page, fetchedAt, offset, refetch])

  const entries = useMemo(() => channelEntries(rows), [rows])
  const heroRow = rows.find((r) => r.type === 'LIVE_HERO')
  const featured = useMemo(() => featuredEntry(heroRow, entries), [heroRow, entries])
  const serverFavorites = useMemo(() => rowEntries(rows.find((r) => r.rowId === 'live-favorites') ?? undefined), [rows])
  const favorites = favoriteEntries(serverFavorites, entries, (ch) => isFav(ch.channelId, ch.isFavorite))
  const categories = useMemo(() => categoryGroups(entries), [entries])
  const upcoming = useMemo(() => upNext(entries, now), [entries, now])

  // Komşu kanal ön hazırlığı: kahraman + kanal sırasındaki sonraki iki kanal.
  const heroId = featured?.channel.channelId
  const order = entries.map((e) => e.channel.channelId).join(',')
  useEffect(() => {
    if (heroId === undefined) return
    const ids = [heroId, ...neighbourChannelIds(order.split(',').map(Number), heroId, 2)]
    for (const id of ids) {
      devbus.emit('prefetch', 'komşu kanal', { viewableId: `Channel:${id}`, hero: id === heroId })
      void prefetchManifest(`Channel:${id}`)
    }
  }, [heroId, order])

  // Kahramanın gösterimi
  useEffect(() => {
    if (featured && heroRow)
      onVisible(heroRow.rowId, 'LIVE_HERO', [{ entityId: featured.track.entityId, tctx: featured.track.tctx }])
  }, [featured, heroRow, onVisible])

  if (!page) return { model: null, error, retry: refetch }
  const remindersList = (reminders.data?.reminders ?? []).filter(
    (a) => hasReminder(a.airingId, a.hasReminder ?? true) && Date.parse(a.endAt) > now,
  )
  return {
    model: {
      pageId: page.id,
      now,
      entries,
      featured,
      favorites,
      categories,
      upNext: upcoming,
      tonight: rows.find((r) => r.type === 'TONIGHT_ROW'),
      catchup: rows.find((r) => r.type === 'CATCHUP_ROW'),
      reminders: remindersList,
      onVisible,
    },
    error,
    retry: refetch,
  }
}

/** Satır öğesinin izleme bilgisi (gösterim günlüğü için). */
export const trackOf = (it: RowItemData) => ({ entityId: it.track.entityId, tctx: it.track.tctx })
