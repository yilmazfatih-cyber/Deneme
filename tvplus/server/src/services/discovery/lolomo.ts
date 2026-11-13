/**
 * Film & Dizi ana sayfası: lolomo ("list of lists of movies"). Falcor yolları bunu sunar.
 * Kişisel satırlar (devam et, Listem, Top 10, "… adlı içeriği izlediğin için", "‹Ad› için En İyi Seçimler") +
 * görünmeyen katmanın yüzü (zevk topluluğu satırı, görünen mikro tür satırları; bkz. microgenreRows.ts) +
 * editoryal satırlar (home-layout.json). Satır adları UX_SPEC §6 sözlüğündeki yazımladır.
 * Satır kimlikleri kararlıdır (profil özeti + bağlam + anahtar); trackId satır başına sayısal ve kararlıdır.
 * Kural: billboard / continueWatching / queue / bridge dışındaki satırlar 3 öğeden azsa düşer; boş kişisel satır gösterilmez.
 *
 * Kategoriler (MIMARI §9.4 `lolomoByCategory`): `home` (ana sayfa; `lolomo` ile aynı nesne), `shows` (Diziler),
 * `movies` (Filmler), `newPopular` (Yeni ve Popüler). Kategori listelerinin kimliği de profile özeldir ve kategori
 * önekini taşır: `<profil özeti>_s.genre_1365` (s: diziler, m: filmler, n: yeni ve popüler; ana sayfada önek yok).
 */
import type { ContentTitle } from '../../../../shared/content-schema'
import { GENRES, type GenreKey } from '../../../../shared/taxonomy'
import { stableId } from '../../../../shared/text'
import type { ProfileRecord } from '../../kernel/context'
import type { Services } from '../../kernel/services'
import { DAY_MS, localDayNumber, localMidnight, parseLocalDate } from '../epg/time'
import { blendedSimilars, rowReason } from './blend'
import { communityRow, MICROGENRE_ROWS_CATEGORY, MICROGENRE_ROWS_HOME, pickMicrogenreRows } from './microgenreRows'
import { tasteScore, tasteVector } from './similarity'
import { top10ForProfile, top10ForType, top10Scores, type TitleType } from './top10'

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
  | 'top10Shows'
  | 'top10Movies'
  | 'popular'
  | 'microgenre'
  | 'tasteCommunity'

export type LolomoCategory = 'home' | 'shows' | 'movies' | 'newPopular'
export const LOLOMO_CATEGORIES: readonly LolomoCategory[] = ['home', 'shows', 'movies', 'newPopular']
/** Liste kimliğindeki kategori öneki (ana sayfada yok: eski kimlikler değişmez) */
const CATEGORY_PREFIX: Record<Exclude<LolomoCategory, 'home'>, string> = { shows: 's', movies: 'm', newPopular: 'n' }
const PREFIX_CATEGORY: Record<string, LolomoCategory> = { s: 'shows', m: 'movies', n: 'newPopular' }
export const isLolomoCategory = (x: string): x is LolomoCategory => (LOLOMO_CATEGORIES as string[]).includes(x)

export interface LolomoList {
  listId: string
  context: ListContext
  displayName: string
  trackId: number
  /** Üst başlık (film/dizi) kimlikleri */
  videoIds: number[]
  genreId?: number
  collectionId?: number
  /** becauseYouWatched: satırdaki öğelerin çoğunun paylaştığı mikro türün adı */
  reason?: string
  /** microgenre: satırın mikro türü (mg_…) */
  microgenreId?: string
  /** tasteCommunity: profilin zevk topluluğu (tc_…) */
  communityId?: string
}
export interface Lolomo {
  profileGuid: string
  category: LolomoCategory
  trackId: number
  expires: string
  lists: LolomoList[]
}

export const MIN_ROW_ITEMS = 3
export const MAX_ROW_ITEMS = 40
export const LEAVING_WINDOW_DAYS = 30
const EXEMPT: ListContext[] = ['billboard', 'continueWatching', 'queue', 'bridge']

/** Satır adları — docs/UX_SPEC.md §6 sözlüğündeki yazımla. Başlığa hiçbir zaman ek getirilmez. */
export const TEXT = {
  continueWatching: 'İzlemeye Devam Et',
  top10: "Türkiye'de Bugünün Top 10 Listesi",
  queue: 'Listem',
  becauseYouWatched: (t: string) => `${t} adlı içeriği izlediğin için`,
  gems: 'Sana Özel',
  newReleases: 'Yeni Gelenler',
  exclusive: "Sadece TV+'ta",
  leaving: 'Son Şans',
  bridge: 'Canlı TV',
  billboard: 'Öne çıkan',
  topPicks: (name: string) => `${name} için En İyi Seçimler`,
  top10Shows: "Türkiye'de Bugünün Top 10 Dizi Listesi",
  top10Movies: "Türkiye'de Bugünün Top 10 Film Listesi",
  newReleasesPage: 'Yeni Gelenler',
  leavingPage: 'Son Şans',
  popular: 'Herkes Bunları İzliyor',
  tasteCommunity: 'Senin Gibi İzleyenler Bunları Seviyor',
} as const

/** Top 10 tür satırları ana sayfada tek karma Top 10'un yerine ancak ikisi de bu kadar dolu olunca geçer */
export const TYPED_TOP10_MIN = 5
/** "Herkes Bunları İzliyor": iki Top 10 listesinin ilk kaçı dışarıda kalır */
export const POPULAR_EXCLUDE_TOP = 3
/** Diziler / Filmler sayfasında tür satırı için gereken en az başlık */
export const GENRE_ROW_MIN = 4

export const profileHash = (guid: string) => stableId(`profile|${guid}`).toString(36)
export const trackIdOf = (key: string) => 10_000_000 + (stableId(`track|${key}`) % 90_000_000)
export const listIdOf = (
  guid: string,
  context: ListContext,
  key?: string | number,
  category: LolomoCategory = 'home',
) =>
  `${profileHash(guid)}_${category === 'home' ? '' : `${CATEGORY_PREFIX[category]}.`}${context}${key !== undefined ? `_${key}` : ''}`

/** Liste kimliğinin kategorisi (profil öneki doğrulandıktan sonra çağrılır) */
export function categoryOfListId(listId: string): LolomoCategory {
  const rest = listId.slice(listId.indexOf('_') + 1)
  const m = /^([a-z])\./.exec(rest)
  return (m && PREFIX_CATEGORY[m[1]!]) || 'home'
}

/** lolomos[...] anahtarı: ana sayfa için profil GUID'i (eski biçim), diğerleri `<guid>:<kategori>` */
export const lolomoKeyOf = (guid: string, category: LolomoCategory) =>
  category === 'home' ? guid : `${guid}:${category}`

export interface LolomoOptions {
  top10Supported: boolean
  now: Date
  /** Verilmezse ana sayfa */
  category?: LolomoCategory
}

/** Satır ekleme kuralları (görünürlük, en az öğe, kimlik çakışması) tüm kategorilerde ortaktır. */
function listBuilder(services: Partial<Services>, profile: ProfileRecord, category: LolomoCategory) {
  const catalog = services.catalog
  const guid = profile.guid
  const lists: LolomoList[] = []
  const usedIds = new Set<string>()
  const visible = (id: number) => !!catalog?.getTitle(id) && catalog.isVisibleTo(profile, id)
  const push = (
    context: ListContext,
    displayName: string,
    ids: number[],
    key?: string | number,
    extra?: Partial<LolomoList>,
  ): boolean => {
    const videoIds = [...new Set(ids)].filter(visible).slice(0, MAX_ROW_ITEMS)
    if (context !== 'bridge' && videoIds.length === 0) return false
    if (!EXEMPT.includes(context) && videoIds.length < MIN_ROW_ITEMS) return false
    let listId = listIdOf(guid, context, key, category)
    for (let n = 2; usedIds.has(listId); n++) listId = listIdOf(guid, context, `${key ?? ''}${n}`, category)
    usedIds.add(listId)
    const trackKey = `${context}|${key ?? ''}`
    lists.push({
      listId,
      context,
      displayName,
      trackId: trackIdOf(category === 'home' ? trackKey : `${category}|${trackKey}`),
      videoIds,
      ...extra,
    })
    return true
  }
  return { lists, push, visible }
}

const byPopularity = (a: ContentTitle, b: ContentTitle) => b.popularity - a.popularity || a.videoId - b.videoId

function lolomoExpires(now: Date): string {
  const expires = Math.min(now.getTime() + 15 * 60_000, localMidnight(localDayNumber(now) + 1).getTime())
  return new Date(expires).toISOString()
}

/** Bugüne kadar eklenmiş başlıklar, en yeni önce */
function newestTitles(titles: ContentTitle[], now: Date): ContentTitle[] {
  const today = localMidnight(localDayNumber(now) + 1).getTime()
  const added = (t: ContentTitle) => parseLocalDate(t.availability.addedAt)?.getTime() ?? 0
  return titles.filter((t) => added(t) < today).sort((a, b) => added(b) - added(a) || byPopularity(a, b))
}

/** 30 gün içinde kalkanlar, en yakın önce */
function leavingTitles(titles: ContentTitle[], now: Date): ContentTitle[] {
  const horizon = now.getTime() + LEAVING_WINDOW_DAYS * DAY_MS
  const leaving = (t: ContentTitle) => parseLocalDate(t.availability.leavingAt)?.getTime() ?? null
  return titles
    .filter((t) => {
      const l = leaving(t)
      return l !== null && l > now.getTime() && l <= horizon
    })
    .sort((a, b) => leaving(a)! - leaving(b)!)
}

/**
 * Zevk sinyalleri: izlenen (+1, en yeni daha ağır), Listem (+1), beğenilen (+2), beğenilmeyen (−2).
 * `recent` görünürlük süzgecinden geçmiş izleme geçmişidir (genç/çocuk profilinde 18+ geçmiş sızmaz).
 */
function profileSignals(services: Partial<Services>, guid: string, recent: number[]) {
  const progress = services.progress
  const disliked = new Set(progress?.disliked(guid) ?? [])
  const signals = [
    ...recent.map((titleId, i) => ({ titleId, weight: 1 / (1 + 0.2 * i) })),
    ...(progress?.myList(guid) ?? []).map((titleId) => ({ titleId, weight: 1 })),
    ...(progress?.liked(guid) ?? []).map((titleId) => ({ titleId, weight: 2 })),
    ...[...disliked].map((titleId) => ({ titleId, weight: -2 })),
  ]
  return { signals, disliked }
}

export function buildLolomo(services: Partial<Services>, profile: ProfileRecord, opts: LolomoOptions): Lolomo {
  const category = opts.category ?? 'home'
  if (category === 'shows') return buildTypeLolomo(services, profile, opts, 'SHOW')
  if (category === 'movies') return buildTypeLolomo(services, profile, opts, 'MOVIE')
  if (category === 'newPopular') return buildNewPopularLolomo(services, profile, opts)
  return buildHomeLolomo(services, profile, opts)
}

function buildHomeLolomo(services: Partial<Services>, profile: ProfileRecord, opts: LolomoOptions): Lolomo {
  const catalog = services.catalog
  const progress = services.progress
  const guid = profile.guid
  const now = opts.now
  const { lists, push, visible } = listBuilder(services, profile, 'home')

  if (!catalog)
    return {
      profileGuid: guid,
      category: 'home',
      trackId: trackIdOf(`lolomo|${guid}`),
      expires: now.toISOString(),
      lists,
    }
  const titles = catalog.allTitles()
  const layout = catalog.homeLayout()

  // 1. Vitrin: günlük dönüşle tek başlık
  const candidates = (layout?.billboard ?? []).filter(visible)
  if (candidates.length) push('billboard', TEXT.billboard, [candidates[localDayNumber(now) % candidates.length]!])

  // 2. İzlemeye devam et
  push('continueWatching', TEXT.continueWatching, progress?.continueWatching(guid).map((c) => c.titleId) ?? [])

  // 3. Top 10 (yetenek bayrağı kapalıysa hiç üretilmez): iki tür listesi de doluysa dizi + film ayrı satır,
  //    değilse tek karma liste
  if (opts.top10Supported) {
    const shows = top10ForType(services, profile, now, 'SHOW')
    const movies = top10ForType(services, profile, now, 'MOVIE')
    if (shows.length >= TYPED_TOP10_MIN && movies.length >= TYPED_TOP10_MIN) {
      push('top10Shows', TEXT.top10Shows, shows)
      push('top10Movies', TEXT.top10Movies, movies)
    } else push('top10', TEXT.top10, top10ForProfile(services, profile, now))
  }

  // 4. "… izlediğin için"
  const recent = (progress?.recentTitles(guid) ?? []).filter(visible)
  const last = recent[0] !== undefined ? catalog.getTitle(recent[0]) : null
  //    Harman benzerlikten (künye + mikro tür + gömme); gerekçe satırın çoğunun paylaştığı mikro tür
  if (last) {
    const items = blendedSimilars(services, last.videoId, visible).slice(0, MAX_ROW_ITEMS)
    const reason = rowReason(services, items)
    push(
      'becauseYouWatched',
      TEXT.becauseYouWatched(last.title),
      items.map((x) => x.titleId),
      last.videoId,
      reason ? { reason } : undefined,
    )
  }

  // 5. Listem
  push('queue', TEXT.queue, progress?.myList(guid) ?? [])

  // 6. Yeni gelenler
  push(
    'newReleases',
    TEXT.newReleases,
    newestTitles(titles, now)
      .slice(0, 20)
      .map((t) => t.videoId),
  )

  // 7. Sana özel: zevk vektörüne göre (sinyal yoksa satır yok)
  const { signals, disliked } = profileSignals(services, guid, recent)
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
  // Kişisel satır: "‹Profil› için En İyi Seçimler"
  push('gems', TEXT.topPicks(profile.name), gemsIds)
  // Görünmeyen katmanın yüzü: zevk topluluğu satırı, sonra görünen mikro tür satırları (servisler boşsa hiçbiri yok)
  const watched = new Set(progress?.recentTitles(guid) ?? [])
  const community = communityRow(services, profile, { visible, watched })
  if (community)
    push('tasteCommunity', TEXT.tasteCommunity, community.videoIds, community.communityId, {
      communityId: community.communityId,
    })
  const genreSets = (layout?.rows ?? []).flatMap((row) =>
    row.kind === 'genre'
      ? [new Set(titles.filter((t) => t.genres.includes(row.genre) && visible(t.videoId)).map((t) => t.videoId))]
      : [],
  )
  for (const r of pickMicrogenreRows(services, {
    visible,
    type: null,
    limit: MICROGENRE_ROWS_HOME,
    signals,
    genreSets,
    watched,
  }))
    push('microgenre', r.microgenre.name, r.videoIds, r.microgenre.id, { microgenreId: r.microgenre.id })
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
  push(
    'leaving',
    TEXT.leaving,
    leavingTitles(titles, now).map((t) => t.videoId),
  )

  return {
    profileGuid: guid,
    category: 'home',
    trackId: trackIdOf(`lolomo|${guid}`),
    expires: lolomoExpires(now),
    lists,
  }
}

/**
 * Diziler / Filmler: o türden vitrin (ana sayfa vitrin adaylarından günlük dönüş, yoksa en popüler) · izlemeye
 * devam · türün Top 10'u · en az 4 başlığı olan her tür için bir satır (çoktan aza) · yeni gelenler · kalkanlar.
 */
function buildTypeLolomo(
  services: Partial<Services>,
  profile: ProfileRecord,
  opts: LolomoOptions,
  type: TitleType,
): Lolomo {
  const category: LolomoCategory = type === 'SHOW' ? 'shows' : 'movies'
  const catalog = services.catalog
  const guid = profile.guid
  const now = opts.now
  const { lists, push, visible } = listBuilder(services, profile, category)
  const trackId = trackIdOf(`lolomo|${guid}:${category}`)
  if (!catalog) return { profileGuid: guid, category, trackId, expires: now.toISOString(), lists }
  const ofType = (id: number) => catalog.getTitle(id)?.type === type
  const titles = catalog.allTitles().filter((t) => t.type === type && visible(t.videoId))

  const candidates = (catalog.homeLayout()?.billboard ?? []).filter((id) => visible(id) && ofType(id))
  const hero = candidates.length
    ? candidates[localDayNumber(now) % candidates.length]
    : [...titles].sort(byPopularity)[0]?.videoId
  if (hero !== undefined) push('billboard', TEXT.billboard, [hero])

  push(
    'continueWatching',
    TEXT.continueWatching,
    (services.progress?.continueWatching(guid) ?? []).map((c) => c.titleId).filter(ofType),
  )

  if (opts.top10Supported) {
    const ctx = type === 'SHOW' ? 'top10Shows' : 'top10Movies'
    push(ctx, type === 'SHOW' ? TEXT.top10Shows : TEXT.top10Movies, top10ForType(services, profile, now, type))
  }

  const genreRows = (Object.keys(GENRES) as GenreKey[])
    .map((g, order) => ({ g, order, items: titles.filter((t) => t.genres.includes(g)).sort(byPopularity) }))
    .filter((x) => x.items.length >= GENRE_ROW_MIN)
    .sort((a, b) => b.items.length - a.items.length || a.order - b.order)

  // Görünen mikro tür satırları (en çok iki; yalnız bu türden başlıklar), tür satırlarından önce
  const recent = (services.progress?.recentTitles(guid) ?? []).filter(visible)
  for (const r of pickMicrogenreRows(services, {
    visible,
    type,
    limit: MICROGENRE_ROWS_CATEGORY,
    signals: profileSignals(services, guid, recent).signals,
    genreSets: genreRows.map((x) => new Set(x.items.map((t) => t.videoId))),
    watched: new Set(services.progress?.recentTitles(guid) ?? []),
  }))
    push('microgenre', r.microgenre.name, r.videoIds, r.microgenre.id, { microgenreId: r.microgenre.id })
  for (const { g, items } of genreRows) {
    const genre = GENRES[g]
    push(
      'genre',
      genre.name,
      items.map((t) => t.videoId),
      genre.genreId,
      { genreId: genre.genreId },
    )
  }

  push(
    'newReleases',
    TEXT.newReleases,
    newestTitles(titles, now)
      .slice(0, 20)
      .map((t) => t.videoId),
  )
  push(
    'leaving',
    TEXT.leaving,
    leavingTitles(titles, now).map((t) => t.videoId),
  )
  return { profileGuid: guid, category, trackId, expires: lolomoExpires(now), lists }
}

/**
 * Yeni ve Popüler: Yeni Gelenler · Top 10 Dizi · Top 10 Film · Son Şans · Herkes Bunları İzliyor (popülerlik +
 * son 24 saatin oynatmaları; iki Top 10 listesinin ilk üçü hariç).
 */
function buildNewPopularLolomo(services: Partial<Services>, profile: ProfileRecord, opts: LolomoOptions): Lolomo {
  const category: LolomoCategory = 'newPopular'
  const catalog = services.catalog
  const guid = profile.guid
  const now = opts.now
  const { lists, push, visible } = listBuilder(services, profile, category)
  const trackId = trackIdOf(`lolomo|${guid}:${category}`)
  if (!catalog) return { profileGuid: guid, category, trackId, expires: now.toISOString(), lists }
  const titles = catalog.allTitles().filter((t) => visible(t.videoId))

  push(
    'newReleases',
    TEXT.newReleasesPage,
    newestTitles(titles, now)
      .slice(0, 20)
      .map((t) => t.videoId),
  )
  const shows = opts.top10Supported ? top10ForType(services, profile, now, 'SHOW') : []
  const movies = opts.top10Supported ? top10ForType(services, profile, now, 'MOVIE') : []
  if (opts.top10Supported) {
    push('top10Shows', TEXT.top10Shows, shows)
    push('top10Movies', TEXT.top10Movies, movies)
  }
  push(
    'leaving',
    TEXT.leavingPage,
    leavingTitles(titles, now).map((t) => t.videoId),
  )
  const excluded = new Set([...shows.slice(0, POPULAR_EXCLUDE_TOP), ...movies.slice(0, POPULAR_EXCLUDE_TOP)])
  push(
    'popular',
    TEXT.popular,
    top10Scores(services, now)
      .filter((x) => !excluded.has(x.titleId) && visible(x.titleId))
      .slice(0, 20)
      .map((x) => x.titleId),
  )
  return { profileGuid: guid, category, trackId, expires: lolomoExpires(now), lists }
}
