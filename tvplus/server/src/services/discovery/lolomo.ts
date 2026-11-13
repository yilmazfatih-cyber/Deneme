/**
 * Film & Dizi ana sayfası: lolomo ("list of lists of movies"). Falcor yolları bunu sunar.
 * Kişisel satırlar (devam et, Listem, Top 10, "… izlediğin için", "Sana özel") + editoryal satırlar (home-layout.json).
 * Satır kimlikleri kararlıdır (profil özeti + bağlam + anahtar); trackId satır başına sayısal ve kararlıdır.
 * Kural: billboard / continueWatching / queue / bridge dışındaki satırlar 3 öğeden azsa düşer; boş kişisel satır gösterilmez.
 */
import type { ContentTitle } from '../../../../shared/content-schema'
import { GENRES } from '../../../../shared/taxonomy'
import { stableId } from '../../../../shared/text'
import type { ProfileRecord } from '../../kernel/context'
import type { Services } from '../../kernel/services'
import { DAY_MS, localDayNumber, localMidnight, parseLocalDate } from '../epg/time'
import { similarTitles, tasteScore, tasteVector } from './similarity'
import { top10ForProfile } from './top10'

export type ListContext =
  | 'billboard'
  | 'continueWatching'
  | 'queue'
  | 'top10'
  | 'becauseYouWatched'
  | 'gems'
  | 'newReleases'
  | 'genre'
  | 'collection'
  | 'curated'
  | 'exclusive'
  | 'leaving'
  | 'bridge'

export interface LolomoList {
  listId: string
  context: ListContext
  displayName: string
  trackId: number
  /** Üst başlık (film/dizi) kimlikleri */
  videoIds: number[]
  genreId?: number
  collectionId?: number
}
export interface Lolomo {
  profileGuid: string
  trackId: number
  expires: string
  lists: LolomoList[]
}

export const MIN_ROW_ITEMS = 3
export const MAX_ROW_ITEMS = 40
export const LEAVING_WINDOW_DAYS = 30
const EXEMPT: ListContext[] = ['billboard', 'continueWatching', 'queue', 'bridge']

export const TEXT = {
  continueWatching: 'İzlemeye devam et',
  top10: "Bugünün Top 10'u",
  queue: 'Listem',
  becauseYouWatched: (t: string) => `${t} izlediğin için`,
  gems: 'Sana özel',
  newReleases: 'Yeni gelenler',
  exclusive: "Sadece TV+'ta",
  leaving: 'Kalkmadan izle',
  bridge: 'Canlı TV',
  billboard: 'Öne çıkan',
} as const

export const profileHash = (guid: string) => stableId(`profile|${guid}`).toString(36)
export const trackIdOf = (key: string) => 10_000_000 + (stableId(`track|${key}`) % 90_000_000)
export const listIdOf = (guid: string, context: ListContext, key?: string | number) =>
  `${profileHash(guid)}_${context}${key !== undefined ? `_${key}` : ''}`

export interface LolomoOptions {
  top10Supported: boolean
  now: Date
}

export function buildLolomo(services: Partial<Services>, profile: ProfileRecord, opts: LolomoOptions): Lolomo {
  const catalog = services.catalog
  const progress = services.progress
  const guid = profile.guid
  const now = opts.now
  const lists: LolomoList[] = []
  const usedIds = new Set<string>()

  const visible = (id: number) => !!catalog?.getTitle(id) && catalog.isVisibleTo(profile, id)
  const push = (context: ListContext, displayName: string, ids: number[], key?: string | number, extra?: Partial<LolomoList>) => {
    const videoIds = [...new Set(ids)].filter(visible).slice(0, MAX_ROW_ITEMS)
    if (context !== 'bridge' && videoIds.length === 0) return
    if (!EXEMPT.includes(context) && videoIds.length < MIN_ROW_ITEMS) return
    let listId = listIdOf(guid, context, key)
    for (let n = 2; usedIds.has(listId); n++) listId = listIdOf(guid, context, `${key ?? ''}${n}`)
    usedIds.add(listId)
    lists.push({ listId, context, displayName, trackId: trackIdOf(`${context}|${key ?? ''}`), videoIds, ...extra })
  }

  if (!catalog) return { profileGuid: guid, trackId: trackIdOf(`lolomo|${guid}`), expires: now.toISOString(), lists }
  const titles = catalog.allTitles()
  const byPopularity = (a: ContentTitle, b: ContentTitle) => b.popularity - a.popularity || a.videoId - b.videoId
  const layout = catalog.homeLayout()

  // 1. Vitrin: günlük dönüşle tek başlık
  const candidates = (layout?.billboard ?? []).filter(visible)
  if (candidates.length) push('billboard', TEXT.billboard, [candidates[localDayNumber(now) % candidates.length]!])

  // 2. İzlemeye devam et
  push('continueWatching', TEXT.continueWatching, progress?.continueWatching(guid).map((c) => c.titleId) ?? [])

  // 3. Top 10 (yetenek bayrağı kapalıysa hiç üretilmez)
  if (opts.top10Supported) push('top10', TEXT.top10, top10ForProfile(services, profile, now))

  // 4. "… izlediğin için"
  const recent = (progress?.recentTitles(guid) ?? []).filter(visible)
  const last = recent[0] !== undefined ? catalog.getTitle(recent[0]) : null
  if (last) {
    push(
      'becauseYouWatched',
      TEXT.becauseYouWatched(last.title),
      similarTitles(catalog, last.videoId, (t) => visible(t.videoId)).map((t) => t.videoId),
      last.videoId,
    )
  }

  // 5. Listem
  push('queue', TEXT.queue, progress?.myList(guid) ?? [])

  // 6. Yeni gelenler
  const today = localMidnight(localDayNumber(now) + 1).getTime()
  const added = (t: ContentTitle) => parseLocalDate(t.availability.addedAt)?.getTime() ?? 0
  push(
    'newReleases',
    TEXT.newReleases,
    titles
      .filter((t) => added(t) < today)
      .sort((a, b) => added(b) - added(a) || byPopularity(a, b))
      .slice(0, 20)
      .map((t) => t.videoId),
  )

  // 7. Sana özel: zevk vektörüne göre (sinyal yoksa satır yok)
  const disliked = new Set(progress?.disliked(guid) ?? [])
  const signals = [
    ...recent.map((titleId, i) => ({ titleId, weight: 1 / (1 + 0.2 * i) })),
    ...(progress?.myList(guid) ?? []).map((titleId) => ({ titleId, weight: 1 })),
    ...(progress?.liked(guid) ?? []).map((titleId) => ({ titleId, weight: 2 })),
    ...[...disliked].map((titleId) => ({ titleId, weight: -2 })),
  ]
  const gemsIds: number[] = []
  if (signals.length) {
    const taste = tasteVector(catalog, signals)
    gemsIds.push(
      ...titles
        .filter((t) => !disliked.has(t.videoId) && progress?.watchStatus(guid, t.videoId) !== 'WATCHED')
        .map((t) => ({ t, s: tasteScore(taste, t) }))
        .filter((x) => x.s > 0)
        .sort((a, b) => b.s - a.s || byPopularity(a.t, b.t))
        .slice(0, 20)
        .map((x) => x.t.videoId),
    )
  }

  // 8. Editoryal satırlar
  const editorial: (() => void)[] = (layout?.rows ?? []).map((row) => () => {
    if (row.kind === 'genre') {
      const g = GENRES[row.genre]
      push(
        'genre',
        row.title ?? g.name,
        titles
          .filter((t) => t.genres.includes(row.genre))
          .sort(byPopularity)
          .map((t) => t.videoId),
        g.genreId,
        { genreId: g.genreId },
      )
    } else if (row.kind === 'collection') {
      const c = catalog.getCollection(row.collectionId)
      if (c) push('collection', c.name, c.videoIds, c.collectionId, { collectionId: c.collectionId })
    } else {
      push('curated', row.title, row.videoIds, row.id)
    }
  })

  editorial[0]?.()
  push('gems', TEXT.gems, gemsIds)
  editorial[1]?.()
  // 9. Geçiş: Canlı TV'ye köprü (öğesiz)
  push('bridge', TEXT.bridge, [])
  push(
    'exclusive',
    TEXT.exclusive,
    titles
      .filter((t) => t.availability.exclusive)
      .sort(byPopularity)
      .map((t) => t.videoId),
  )
  for (const run of editorial.slice(2)) run()

  // 10. Kalkmadan izle: 30 gün içinde kalkanlar, en yakın önce
  const horizon = now.getTime() + LEAVING_WINDOW_DAYS * DAY_MS
  const leaving = (t: ContentTitle) => parseLocalDate(t.availability.leavingAt)?.getTime() ?? null
  push(
    'leaving',
    TEXT.leaving,
    titles
      .filter((t) => {
        const l = leaving(t)
        return l !== null && l > now.getTime() && l <= horizon
      })
      .sort((a, b) => leaving(a)! - leaving(b)!)
      .map((t) => t.videoId),
  )

  const expires = Math.min(now.getTime() + 15 * 60_000, localMidnight(localDayNumber(now) + 1).getTime())
  return { profileGuid: guid, trackId: trackIdOf(`lolomo|${guid}`), expires: new Date(expires).toISOString(), lists }
}
