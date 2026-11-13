/**
 * Göz atma sayfaları (Ana Sayfa, Diziler, Filmler, Yeni ve Popüler) — saf mantık: Falcor yol planlayıcısı ve
 * JSON Graph → satır görünüm modeli. Yollar docs/MIMARI.md §6 ve §9.4. DOM yok; birim testi lolomo.test.ts.
 *
 * Yükleme planı (eski sistemin amaçladığı gibi yol yol):
 *   1. [kök,'summary']                                  → satır sayısı
 *   2. satırlar görünüme yaklaştıkça 3'lü gruplar:      [kök,{a..b},'summary'] + ilk 10 öğenin kart yaprakları + itemTctx
 *   3. satırın bağlamına özel ek yapraklar (vitrin, devam et) ve yatay kaydırmayla sonraki 10'luk aralıklar: ['lists',id,…]
 * Kök: ana sayfa `lolomo` (açılış tohumu bu yolla gelir), diğerleri `lolomoByCategory[kategori]`.
 * Kart yaprakları ekran biçimine göre değişir: masaüstünde 16:9 `storyArt`, mobilde 2:3 `boxart` (UX_SPEC §7 kural 2).
 */
import type { FalcorPath } from '../../../../shared/types'
import { formatTctx, videoEntityId } from '../../../../shared/tctx'
import { formatEpisodeCode, formatTimeLeft, joinDot } from '../../ui/format'
import { playPath } from '../preview/links'
import { isInProgress, lockedTextOf } from '../preview/meta'

export const ITEM_PAGE = 10
export const ROW_BATCH = 3
/** Yatay kaydırmada son görünen kart, yüklü sonun bu kadar yakınına gelince sonraki aralık istenir */
export const ITEM_PREFETCH_GAP = 3

export type LolomoCategory = 'home' | 'shows' | 'movies' | 'newPopular'
/** Kartların çizildiği ekran: masaüstü 16:9, mobil 2:3 */
export type Screen = 'desktop' | 'mobile'

/** Lolomo'nun kök yolu. Ana sayfa eski `lolomo` yolunu kullanır: açılış tohumu (boot.falcorCache) bu yolla gelir. */
export function lolomoRoot(category: LolomoCategory): FalcorPath {
  return category === 'home' ? ['lolomo'] : ['lolomoByCategory', category]
}

/* ───────────── Tel biçimleri (Falcor atomları) ───────────── */

export interface LolomoSummary {
  length: number
  trackId: number
  expires: string
}

export interface ListSummary {
  id: string
  context: string
  displayName: string
  length: number
  trackId: number
  genreId?: number
  collectionId?: number
  /** becauseYouWatched: ortak mikro tür adı */
  reason?: string
  /** microgenre satırı: mg_… */
  microgenreId?: string
  /** tasteCommunity satırı: tc_… */
  communityId?: string
}

export interface ArtAtom {
  url: string
  width: number
  height: number
  key: string
}

export interface VideoNode {
  summary?: {
    id: number
    type: 'movie' | 'show' | 'episode' | 'supplemental'
    isPlayable: boolean
    isKids: boolean
    unifiedEntityId: string
  }
  title?: string
  shortSynopsis?: string
  boxart?: ArtAtom
  storyArt?: ArtAtom
  billboardArt?: ArtAtom
  titleLogo?: ArtAtom
  badge?: { kind: string; text: string }
  displayRuntime?: string
  maturity?: { certificationValue: string; maturityLevel: number; reasons: string[] }
  access?: { state: string; reasonText: string | null; requiredProduct: string | null }
  watchStatus?: string
  bookmark?: { positionSec: number; runtimeSec: number | null; progress: number }
  top10Rank?: number | null
  tags?: string[]
  queue?: boolean
  matchScore?: number | null
  promoVideo?: { viewableId: string; computeId: string; offset: number; sourceKind: string }
  current?: VideoNode
}

/** `lists[listId]` dalının düz JSON biçimi (sayısal anahtarlar dizge) */
export interface ListNode {
  summary?: ListSummary
  itemTctx?: Record<string, string>
  [index: string]: VideoNode | ListSummary | Record<string, string> | undefined
}

/* ───────────── Bağlamlar ───────────── */

/**
 * Satırın çizim biçimi:
 *   hero      vitrin (billboard)                     · continue  İzlemeye Devam Et (ilerleme + kalan süre)
 *   top10     dikey afiş + dış hat rakam              · standard  16:9 kart (mobilde afiş), en çok bir rozet
 *   bridge    Canlı TV köprüsü (kanal kartları; öğeler GraphQL'den)
 */
export type RowKind = 'hero' | 'continue' | 'top10' | 'standard' | 'bridge'

const TOP10_CONTEXTS = ['top10', 'top10Shows', 'top10Movies']

/** Bağlam → çizim biçimi. Bilinmeyen (yeni) bağlamlar standart satır olarak çizilir; bağlamı olmayan satır atlanır. */
export function rowKindOf(context: string | undefined): RowKind | null {
  if (!context) return null
  if (context === 'billboard') return 'hero'
  if (context === 'continueWatching') return 'continue'
  if (context === 'bridge') return 'bridge'
  if (TOP10_CONTEXTS.includes(context)) return 'top10'
  return 'standard'
}

/** Her kartın ortak yaprakları (açılış tohumunun afiş kümesiyle aynı + görsel) */
export const CARD_LEAVES = ['summary', 'title', 'badge', 'access', 'top10Rank', 'tags'] as const
/** Devam et kartı: ilerleme + kalan süre */
export const CONTINUE_LEAVES = [
  'summary',
  'title',
  'access',
  'displayRuntime',
  'bookmark',
  'watchStatus',
  'tags',
] as const
/** Vitrin */
export const HERO_LEAVES = [
  'summary',
  'title',
  'shortSynopsis',
  'billboardArt',
  'titleLogo',
  'storyArt',
  'maturity',
  'access',
  'displayRuntime',
  'watchStatus',
  'bookmark',
  'promoVideo',
  'tags',
] as const
/**
 * Vitrinin açılış tohumunda olmayan, ilk boyamayı beklememesi gereken yaprakları: masaüstünde Top 10 satırı,
 * mobilde Listem düğmesinin durumu. Ana sayfada ilk etkileşimde (kaydırma, dokunma, tuş) istenir; diğer
 * sayfalarda satırla birlikte.
 */
export function heroDeferredLeaves(screen: Screen): string[] {
  return screen === 'mobile' ? ['queue'] : ['top10Rank']
}
/** Dizilerde devam edilecek bölüm (videos[id].current → ref) */
export const CURRENT_LEAVES = ['summary', 'displayRuntime', 'bookmark'] as const

/** Kart görseli: masaüstünde 16:9, mobilde 2:3 (Top 10 her yerde dikey). */
export function artLeafOf(kind: RowKind, screen: Screen): 'storyArt' | 'boxart' {
  if (kind === 'top10') return 'boxart'
  return screen === 'mobile' ? 'boxart' : 'storyArt'
}

export function leavesFor(kind: RowKind, screen: Screen): string[] {
  if (kind === 'bridge') return []
  // Mobil vitrin kartı 2:3 afiş (Listem / Top 10 durumu: heroDeferredLeaves)
  if (kind === 'hero') return screen === 'mobile' ? [...HERO_LEAVES, 'boxart'] : [...HERO_LEAVES]
  if (kind === 'continue') return [...CONTINUE_LEAVES, artLeafOf(kind, screen)]
  return [...CARD_LEAVES, artLeafOf(kind, screen)]
}

/* ───────────── Yol planlayıcı ───────────── */

export function summaryPath(root: FalcorPath): FalcorPath {
  return [...root, 'summary']
}

/** i. satırın grubu: [başlangıç, bitiş] (dahil; satır sayısına kıstırılır) */
export function rowBatchOf(index: number, rowCount: number, size = ROW_BATCH): { from: number; to: number } {
  const from = Math.floor(index / size) * size
  return { from, to: Math.max(from, Math.min(rowCount - 1, from + size - 1)) }
}

/**
 * Bağlamı henüz bilinmeyen satırlar için grup isteği: özetler + ilk 10 öğenin standart kart yaprakları + konum
 * bağlamları — tek POST. Vitrin / devam et ek yaprakları satırın kendi planında istenir.
 */
export function planRowBatch(
  root: FalcorPath,
  from: number,
  to: number,
  screen: Screen,
  items = ITEM_PAGE,
): FalcorPath[] {
  if (to < from) return []
  const rows = from === to ? from : { from, to }
  return [
    [...root, rows, 'summary'],
    [...root, rows, { from: 0, to: items - 1 }, leavesFor('standard', screen)],
    [...root, rows, 'itemTctx', { from: 0, to: items - 1 }],
  ]
}

/** Bir satırın [from..to] öğeleri için gereken yollar (lists[listId] üzerinden: sıra kaysa da kararlı). */
export function planRowItems(listId: string, kind: RowKind, screen: Screen, from: number, to: number): FalcorPath[] {
  if (to < from || kind === 'bridge') return []
  const range = from === to ? from : { from, to }
  const paths: FalcorPath[] = [
    ['lists', listId, range, leavesFor(kind, screen)],
    ['lists', listId, 'itemTctx', range],
  ]
  if (kind === 'hero' || kind === 'continue') paths.push(['lists', listId, range, 'current', [...CURRENT_LEAVES]])
  return paths
}

/** Satırda başta yüklenecek öğe sayısı */
export function initialItemCount(kind: RowKind, length: number): number {
  if (kind === 'bridge') return 0
  if (kind === 'hero') return Math.min(1, length)
  return Math.min(ITEM_PAGE, length)
}

/** Yatay kaydırma sona yaklaştıysa yeni yüklü öğe sayısı; gerek yoksa null. */
export function nextItemCount(
  loaded: number,
  length: number,
  lastVisible: number,
  page = ITEM_PAGE,
  gap = ITEM_PREFETCH_GAP,
): number | null {
  if (loaded >= length || lastVisible < 0) return null
  if (lastVisible < loaded - gap) return null
  return Math.min(length, loaded + page)
}

/* ───────────── Görünüm modeli ───────────── */

export interface CardBadge {
  /** 'new' | 'episode' | 'leaving' | 'lock' */
  tone: 'accent' | 'lock'
  text: string
}

export interface CardVM {
  index: number
  videoId: number
  entityId: string
  title: string
  isShow: boolean
  tctx: string
  /** tctx sunucudan mı (itemTctx) yoksa istemcide mi kuruldu */
  tctxFromServer: boolean
  /** Oynatılabilirse oynatıcı yolu (dizide devam edilecek bölüm) */
  playTo: string | null
  playVideoId: number | null
  posterUrl: string | null
  landscapeUrl: string | null
  /** Kart başına en çok bir rozet (kilit diğerlerini bastırır) */
  badge: CardBadge | null
  lockedText: string | null
  /** Top 10 satırındaki rakam (1–10) */
  rank: number | null
  progress: number | null
  /** İzlemeye Devam Et altyazısı: "S1:B3 · 23 dk kaldı" */
  caption: string | null
  tags: string[]
}

export interface RowVM {
  listId: string
  rowIndex: number
  context: string
  kind: RowKind
  title: string
  length: number
  trackId: number
  /** "Tümünü Gör" hedefi */
  seeAllTo: string | null
  /** 0..loaded-1; henüz gelmemiş öğe null (iskelet) */
  items: (CardVM | null)[]
}

export interface HeroVM extends CardVM {
  synopsis: string
  artUrl: string | null
  logoUrl: string | null
  maturity: { certificationValue: string; reasons: string[] } | null
  playable: boolean
  resume: boolean
  primaryLabel: 'Oynat' | 'Devam Et'
  promo: { viewableId: string; offset: number } | null
  /** Manifest ön hazırlığı için oynatılabilir kimlik */
  prefetchViewableId: string | null
  /** Kendi türünün Top 10'undaki sırası (vitrinin "Bugün Dizilerde 3 Numara" satırı) */
  top10Rank: number | null
  inMyList: boolean
}

/** "Tümünü Gör" hedefi: tür, mikro tür, koleksiyon, Listem, Yeni Gelenler. Yoksa null. */
export function seeAllPath(summary: Partial<ListSummary>, category: LolomoCategory = 'home'): string | null {
  if (summary.genreId !== undefined) return `/tur/${summary.genreId}`
  if (summary.microgenreId !== undefined) return `/tur/${encodeURIComponent(summary.microgenreId)}`
  if (summary.collectionId !== undefined) return `/koleksiyon/${summary.collectionId}`
  if (summary.context === 'queue') return '/listem'
  if (summary.context === 'newReleases' && category !== 'newPopular') return '/yeni-ve-populer'
  return null
}

/** "S1 B3 · 22 dk" → "S1:B3" */
export function episodeCodeOf(displayRuntime: string | undefined): string | null {
  if (!displayRuntime) return null
  const m = /^S(\d+) B(\d+)$/.exec(displayRuntime.split(' · ')[0] ?? '')
  return m ? formatEpisodeCode(Number(m[1]), Number(m[2])) : null
}

/** Sunucu rozeti → kart rozeti (kart başına bir; kilit önce). Top 10 rozet değildir (rakam ya da vitrin satırı). */
export function cardBadgeOf(
  badge: { kind: string; text: string } | null | undefined,
  locked: boolean,
): CardBadge | null {
  if (locked) return { tone: 'lock', text: 'Kilitli' }
  if (!badge) return null
  switch (badge.kind) {
    case 'NEW':
      return { tone: 'accent', text: 'Yeni' }
    case 'NEW_EPISODE':
      return { tone: 'accent', text: 'Yeni Bölüm' }
    case 'LEAVING_SOON': {
      const days = /(\d+)/.exec(badge.text)?.[1]
      return { tone: 'accent', text: days ? `Son ${days} Gün` : badge.text }
    }
    case 'LOCKED':
    case 'TOP10':
      return null
    default:
      return badge.text ? { tone: 'accent', text: badge.text } : null
  }
}

/** Tek öğe → kart görünüm modeli; video düğümü yoksa (henüz gelmedi / görünmez) null. */
export function mapCard(list: ListNode, summary: ListSummary, rowIndex: number, index: number): CardVM | null {
  const node = list[String(index)] as VideoNode | undefined
  const s = node?.summary
  if (!node || !s || !node.title) return null
  const entityId = videoEntityId(s.id)
  const serverTctx = list.itemTctx?.[String(index)]
  const tctx =
    serverTctx ?? formatTctx({ row: rowIndex, rank: index, rowId: summary.id, trackId: summary.trackId, entityId })
  const isShow = s.type === 'show'
  const playable = (node.access?.state ?? (s.isPlayable ? 'PLAYABLE' : 'BLOCKED')) === 'PLAYABLE'
  const cur = isShow ? node.current : undefined
  const playVideoId = playable ? (isShow ? (cur?.summary?.id ?? null) : s.id) : null
  const locked = lockedTextOf(
    node.access ? { state: node.access.state, reasonText: node.access.reasonText } : null,
    node.badge?.kind === 'LOCKED' ? `${node.badge.text} ile` : null,
  )
  const bm = isShow ? cur?.bookmark : node.bookmark
  const kind = rowKindOf(summary.context)
  let caption: string | null = null
  if (kind === 'continue') {
    const code = isShow ? episodeCodeOf(cur?.displayRuntime) : null
    const left = bm && bm.runtimeSec ? formatTimeLeft(bm.runtimeSec - bm.positionSec) : ''
    caption = joinDot([code, left || (code ? null : (node.displayRuntime ?? null))]) || null
  }
  return {
    index,
    videoId: s.id,
    entityId,
    title: node.title,
    isShow,
    tctx,
    tctxFromServer: serverTctx !== undefined,
    playTo: playVideoId !== null ? playPath(playVideoId, tctx) : null,
    playVideoId,
    posterUrl: node.boxart?.url ?? null,
    landscapeUrl: node.storyArt?.url ?? null,
    // Top 10'da rakam, "Yeni Gelenler"de satırın kendisi zaten "yeni" der: o satırlarda "Yeni" rozeti tekrarlanmaz.
    badge:
      !locked && (kind === 'top10' || (summary.context === 'newReleases' && node.badge?.kind === 'NEW'))
        ? null
        : cardBadgeOf(node.badge, !!locked),
    lockedText: locked,
    rank: kind === 'top10' ? index + 1 : null,
    progress: kind === 'continue' && bm ? bm.progress : null,
    caption,
    tags: Array.isArray(node.tags) ? node.tags.slice(0, 3) : [],
  }
}

/** lists[listId] → satır görünüm modeli (bağlamı olmayan satır null). */
export function mapRow(
  list: ListNode | undefined,
  rowIndex: number,
  loaded: number,
  category: LolomoCategory = 'home',
): RowVM | null {
  const summary = list?.summary
  const kind = rowKindOf(summary?.context)
  if (!list || !summary || !kind) return null
  const count = Math.min(loaded, summary.length)
  const items: (CardVM | null)[] = []
  for (let i = 0; i < count; i++) items.push(mapCard(list, summary, rowIndex, i))
  return {
    listId: summary.id,
    rowIndex,
    context: summary.context,
    kind,
    title: summary.displayName,
    length: summary.length,
    trackId: summary.trackId,
    seeAllTo: seeAllPath(summary, category),
    items,
  }
}

/** Vitrin görünüm modeli (satırın 0. öğesi). */
export function mapHero(list: ListNode | undefined, rowIndex: number): HeroVM | null {
  const summary = list?.summary
  if (!list || !summary) return null
  const card = mapCard(list, summary, rowIndex, 0)
  const node = list['0'] as VideoNode | undefined
  if (!card || !node) return null
  const playable = card.playVideoId !== null
  const bm = card.isShow ? node.current?.bookmark : node.bookmark
  const resume = playable && isInProgress(bm)
  const rank = typeof node.top10Rank === 'number' && node.top10Rank > 0 && node.top10Rank <= 10 ? node.top10Rank : null
  return {
    ...card,
    synopsis: node.shortSynopsis ?? '',
    artUrl: node.billboardArt?.url ?? node.storyArt?.url ?? null,
    logoUrl: node.titleLogo?.url ?? null,
    maturity: node.maturity
      ? { certificationValue: node.maturity.certificationValue, reasons: node.maturity.reasons ?? [] }
      : null,
    playable,
    resume,
    primaryLabel: resume ? 'Devam Et' : 'Oynat',
    promo:
      playable && node.promoVideo ? { viewableId: node.promoVideo.viewableId, offset: node.promoVideo.offset } : null,
    prefetchViewableId: card.playVideoId !== null ? videoEntityId(card.playVideoId) : null,
    top10Rank: rank,
    inMyList: node.queue === true,
  }
}

/** Genre satırları (Türler ▾ listesi): özetlerden genreId taşıyanlar, sıra korunur, tekrarsız. */
export function genreLinksOf(summaries: readonly (Partial<ListSummary> | undefined)[]): { to: string; name: string }[] {
  const out: { to: string; name: string }[] = []
  const seen = new Set<string>()
  for (const s of summaries) {
    if (!s || s.context !== 'genre' || s.genreId === undefined || !s.displayName) continue
    const to = `/tur/${s.genreId}`
    if (seen.has(to)) continue
    seen.add(to)
    out.push({ to, name: s.displayName })
  }
  return out
}

/* ───────────── Gösterim izleme ───────────── */

/** Satır başına görülmüş sıraları tutar; yalnız YENİ görünenleri döndürür (gösterim olayı tekrarlanmaz). */
export class ImpressionTracker {
  private readonly seen = new Map<string, Set<number>>()

  /** [first..last] aralığında daha önce kaydedilmemiş sıralar */
  record(listId: string, first: number, last: number): number[] {
    if (first < 0 || last < first) return []
    const set = this.seen.get(listId) ?? new Set<number>()
    this.seen.set(listId, set)
    const fresh: number[] = []
    for (let i = first; i <= last; i++) {
      if (!set.has(i)) {
        set.add(i)
        fresh.push(i)
      }
    }
    return fresh
  }

  reset(): void {
    this.seen.clear()
  }
}

/** Ardışık sıraları aralığa çevirir: [0,1,2,5] → "0-2,5" (olay gövdesi için kısa) */
export function rangeLabel(ranks: readonly number[]): string {
  const s = [...ranks].sort((a, b) => a - b)
  const parts: string[] = []
  for (let i = 0; i < s.length;) {
    let j = i
    while (j + 1 < s.length && s[j + 1] === s[j]! + 1) j++
    parts.push(j > i ? `${s[i]}-${s[j]}` : `${s[i]}`)
    i = j + 1
  }
  return parts.join(',')
}
