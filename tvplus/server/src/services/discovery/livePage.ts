/**
 * Canlı TV ana sayfası (GraphQL `livePage`): Page → rows[] → items[] (netflix_patterns §4.2).
 * Yetenek pazarlığı: istemcinin bildirmediği satır tipi ya da varlık türü hiç yollanmaz.
 * Her öğe tctx taşıyan bir Track ile gelir; satırlar kendi ttlSec değerini taşır.
 */
import type { ContentChannel } from '../../../../shared/content-schema'
import { airingEntityId, channelEntityId, formatTctx } from '../../../../shared/tctx'
import type { Passport } from '../../kernel/context'
import type { AiringRecord, Services } from '../../kernel/services'
import { catchupOf, CATCHUP_DAYS } from '../epg/epg'
import { DAY_MS, dayKey, localDayNumber, localMidnight } from '../epg/time'
import { trackIdOf } from './lolomo'

export type RowTypeName = 'LIVE_HERO' | 'CHANNEL_ROW' | 'TONIGHT_ROW' | 'CATCHUP_ROW' | 'POSTER_ROW' | 'CONTINUE_ROW' | 'BRIDGE'
export type EntityKindName = 'VIDEO' | 'CHANNEL' | 'PROGRAM_AIRING' | 'PERSON' | 'GENERIC_CONTAINER'

export interface TrackResult {
  row: number
  pos: number
  rowId: string
  trackId: number
  entityId: string
  tctx: string
}
export interface RowItemResult {
  kind: EntityKindName
  track: TrackResult
  /** Üst nesne kuralı: Channel → { channelId }, ProgramAiring → AiringRecord */
  entity: { channelId: number } | AiringRecord
}
export interface PageRowResult {
  rowId: string
  type: RowTypeName
  title: string | null
  ttlSec: number
  trackId: number
  bridgeTo: string | null
  items: RowItemResult[]
}
export interface PageResult {
  id: string
  expires: string
  serverTime: string
  rows: PageRowResult[]
}
export interface PageCapabilities {
  rowTypes: string[]
  entityKinds: string[]
}

export const LIVE_TTL_SEC = 60
export const CATCHUP_TTL_SEC = 300
export const BRIDGE_TTL_SEC = 3600
const TONIGHT_FROM_HOUR = 19
const MAX_AIRING_ITEMS = 30
const CATCHUP_PER_CHANNEL = 5

export const TEXT = {
  favorites: 'Kanallarım',
  all: 'Tüm kanallar',
  tonight: 'Bu akşam',
  catchup: 'Kaçırdıkların · son 7 gün',
  bridge: 'Film & Dizi',
} as const

interface DraftRow {
  rowId: string
  type: RowTypeName
  title: string | null
  ttlSec: number
  bridgeTo: string | null
  entities: ({ kind: 'CHANNEL'; channelId: number } | { kind: 'PROGRAM_AIRING'; airing: AiringRecord })[]
}

/** Profilin görebileceği kanallar (çocuk profili yalnız çocuk kanallarını görür), numara sırasıyla */
export function visibleChannels(services: Partial<Services>, passport: Passport): ContentChannel[] {
  const all = services.catalog?.listChannels() ?? []
  return passport.profile?.isKids ? all.filter((c) => c.kids) : all
}

export function buildLivePage(services: Partial<Services>, passport: Passport, caps: PageCapabilities, now: Date): PageResult {
  const epg = services.epg
  const progress = services.progress
  const guid = passport.profile?.guid ?? null
  const channels = visibleChannels(services, passport)
  const byId = new Map(channels.map((c) => [c.channelId, c]))
  const favorites = guid && progress ? progress.favoriteChannels(guid).filter((id) => byId.has(id)) : channels.filter((c) => c.favorite).map((c) => c.channelId)
  const drafts: DraftRow[] = []
  const channelItem = (channelId: number) => ({ kind: 'CHANNEL' as const, channelId })

  // Kahraman: son izlenen kanal, yoksa ilk favori
  const last = guid ? progress?.lastChannel(guid) : null
  const heroId = last && byId.has(last) ? last : (favorites[0] ?? channels[0]?.channelId)
  if (heroId !== undefined) drafts.push({ rowId: 'live-hero', type: 'LIVE_HERO', title: null, ttlSec: LIVE_TTL_SEC, bridgeTo: null, entities: [channelItem(heroId)] })

  drafts.push({ rowId: 'live-favorites', type: 'CHANNEL_ROW', title: TEXT.favorites, ttlSec: LIVE_TTL_SEC, bridgeTo: null, entities: favorites.map(channelItem) })
  drafts.push({
    rowId: 'live-all',
    type: 'CHANNEL_ROW',
    title: TEXT.all,
    ttlSec: LIVE_TTL_SEC,
    bridgeTo: null,
    entities: channels.map((c) => channelItem(c.channelId)),
  })

  if (epg) {
    // Bu akşam: bugün 19:00–24:00 arasında başlayan, henüz bitmemiş yayınlar
    const today = localDayNumber(now)
    const from = new Date(localMidnight(today).getTime() + TONIGHT_FROM_HOUR * 3_600_000)
    const to = localMidnight(today + 1)
    const tonight = channels
      .flatMap((c) => epg.airings(c.channelId, from, to))
      .filter((a) => a.startAt >= from && a.startAt < to && a.endAt > now)
      .sort((a, b) => a.startAt.getTime() - b.startAt.getTime() || (byId.get(a.channelId)?.number ?? 0) - (byId.get(b.channelId)?.number ?? 0))
      .slice(0, MAX_AIRING_ITEMS)
    drafts.push({
      rowId: 'live-tonight',
      type: 'TONIGHT_ROW',
      title: TEXT.tonight,
      ttlSec: LIVE_TTL_SEC,
      bridgeTo: null,
      entities: tonight.map((airing) => ({ kind: 'PROGRAM_AIRING', airing })),
    })

    // Kaçırdıkların: son 7 günde biten, geri izlenebilir yayınlar; en yeni önce, kanal başına en çok 5
    const since = new Date(now.getTime() - CATCHUP_DAYS * DAY_MS)
    const catchup = channels
      .flatMap((c) =>
        epg
          .airings(c.channelId, since, now)
          .filter((a) => catchupOf(a, now, epg.isLinear(c.channelId)).available)
          .sort((a, b) => b.endAt.getTime() - a.endAt.getTime())
          .slice(0, CATCHUP_PER_CHANNEL),
      )
      .sort((a, b) => b.endAt.getTime() - a.endAt.getTime())
      .slice(0, MAX_AIRING_ITEMS)
    drafts.push({
      rowId: 'live-catchup',
      type: 'CATCHUP_ROW',
      title: TEXT.catchup,
      ttlSec: CATCHUP_TTL_SEC,
      bridgeTo: null,
      entities: catchup.map((airing) => ({ kind: 'PROGRAM_AIRING', airing })),
    })
  }

  drafts.push({ rowId: 'live-bridge', type: 'BRIDGE', title: TEXT.bridge, ttlSec: BRIDGE_TTL_SEC, bridgeTo: 'film-dizi', entities: [] })

  // Yetenek pazarlığı + tctx
  const rowTypes = new Set(caps.rowTypes)
  const kinds = new Set(caps.entityKinds)
  const rows: PageRowResult[] = []
  for (const d of drafts) {
    if (!rowTypes.has(d.type)) continue
    const entities = d.entities.filter((e) => kinds.has(e.kind))
    if (entities.length === 0 && d.type !== 'BRIDGE') continue
    const row = rows.length
    const trackId = trackIdOf(`live|${d.rowId}`)
    rows.push({
      rowId: d.rowId,
      type: d.type,
      title: d.title,
      ttlSec: d.ttlSec,
      trackId,
      bridgeTo: d.bridgeTo,
      items: entities.map((e, pos) => {
        const entityId = e.kind === 'CHANNEL' ? channelEntityId(e.channelId) : airingEntityId(e.airing.airingId)
        return {
          kind: e.kind,
          track: { row, pos, rowId: d.rowId, trackId, entityId, tctx: formatTctx({ row, rank: pos, rowId: d.rowId, trackId, entityId }) },
          entity: e.kind === 'CHANNEL' ? { channelId: e.channelId } : e.airing,
        }
      }),
    })
  }
  const minTtl = Math.min(LIVE_TTL_SEC, ...rows.map((r) => r.ttlSec))
  return {
    id: `canli-${guid ? guid.slice(0, 8) : 'anonim'}-${dayKey(now)}`,
    expires: new Date(now.getTime() + minTtl * 1000).toISOString(),
    serverTime: now.toISOString(),
    rows,
  }
}
