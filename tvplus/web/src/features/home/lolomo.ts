/**
 * Film & Dizi ana sayfası (lolomo) — saf mantık: Falcor yol planlayıcısı ve JSON Graph → satır görünüm modeli.
 * Yollar docs/MIMARI.md §6. DOM yok; birim testi lolomo.test.ts.
 *
 * Yükleme planı (eski sistemin amaçladığı gibi yol yol):
 *   1. ['lolomo','summary']                              → satır sayısı
 *   2. satırlar görünüme yaklaştıkça 3'lü gruplar:      ['lolomo',{a..b},'summary'] + ilk 10 öğenin afiş yaprakları + itemTctx
 *   3. satırın bağlamına özel ek yapraklar (vitrin, devam et) ve yatay kaydırmayla sonraki 10'luk aralıklar: ['lists',id,…]
 */
import type { FalcorPath } from '../../../../shared/types'
import { formatTctx, videoEntityId } from '../../../../shared/tctx'
import { badgeTextOf, detailPath, isInProgress, joinMeta, lockedTextOf, playPath, remainingText } from '../preview'

export const ITEM_PAGE = 10
export const ROW_BATCH = 3
/** Yatay kaydırmada son görünen kart, yüklü sonun bu kadar yakınına gelince sonraki aralık istenir */
export const ITEM_PREFETCH_GAP = 3

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
  sourceKinds?: string[]
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

export type RowKind = 'hero' | 'landscape' | 'poster' | 'bridge'

const POSTER_CONTEXTS = [
  'top10',
  'queue',
  'becauseYouWatched',
  'gems',
  'newReleases',
  'genre',
  'collection',
  'curated',
  'exclusive',
  'leaving',
]

/** Bağlam → çizim biçimi; bilinmeyen bağlam null (sessizce atlanır). */
export function rowKindOf(context: string | undefined): RowKind | null {
  if (!context) return null
  if (context === 'billboard') return 'hero'
  if (context === 'continueWatching') return 'landscape'
  if (context === 'bridge') return 'bridge'
  return POSTER_CONTEXTS.includes(context) ? 'poster' : null
}

/** Afiş kartının yaprakları (toplu satır isteğinde tüm satırlar için istenir) */
export const POSTER_LEAVES = ['summary', 'title', 'boxart', 'badge', 'access', 'top10Rank'] as const
/** Devam et kartı: 16:9 görsel + ilerleme + kalan süre */
export const LANDSCAPE_LEAVES = [
  'summary',
  'title',
  'storyArt',
  'access',
  'displayRuntime',
  'bookmark',
  'watchStatus',
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
] as const
/** Dizilerde devam edilecek bölüm (videos[id].current → ref) */
export const CURRENT_LEAVES = ['summary', 'displayRuntime', 'bookmark'] as const

export function leavesFor(kind: RowKind): readonly string[] {
  if (kind === 'hero') return HERO_LEAVES
  if (kind === 'landscape') return LANDSCAPE_LEAVES
  if (kind === 'poster') return POSTER_LEAVES
  return []
}

/* ───────────── Yol planlayıcı ───────────── */

export const LOLOMO_SUMMARY_PATH: FalcorPath = ['lolomo', 'summary']

/** i. satırın grubu: [başlangıç, bitiş] (dahil; satır sayısına kıstırılır) */
export function rowBatchOf(index: number, rowCount: number, size = ROW_BATCH): { from: number; to: number } {
  const from = Math.floor(index / size) * size
  return { from, to: Math.max(from, Math.min(rowCount - 1, from + size - 1)) }
}

/**
 * Satır grubu isteği: özetler + ilk 10 öğenin afiş yaprakları + konum bağlamları — tek POST.
 * Bağlam henüz bilinmediği için ortak (afiş) yapraklar istenir; vitrin/devam et ek yaprakları satırın kendi planında.
 */
export function planRowBatch(from: number, to: number, items = ITEM_PAGE): FalcorPath[] {
  if (to < from) return []
  const rows = from === to ? from : { from, to }
  return [
    ['lolomo', rows, 'summary'],
    ['lolomo', rows, { from: 0, to: items - 1 }, [...POSTER_LEAVES]],
    ['lolomo', rows, 'itemTctx', { from: 0, to: items - 1 }],
  ]
}

/** Bir satırın [from..to] öğeleri için gereken yollar (lists[listId] üzerinden: sıra kaysa da kararlı). */
export function planRowItems(listId: string, kind: RowKind, from: number, to: number): FalcorPath[] {
  if (to < from || kind === 'bridge') return []
  const range = from === to ? from : { from, to }
  const paths: FalcorPath[] = [
    ['lists', listId, range, [...leavesFor(kind)]],
    ['lists', listId, 'itemTctx', range],
  ]
  if (kind === 'hero' || kind === 'landscape') paths.push(['lists', listId, range, 'current', [...CURRENT_LEAVES]])
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

export interface CardVM {
  index: number
  videoId: number
  entityId: string
  title: string
  isShow: boolean
  tctx: string
  /** tctx sunucudan mı (itemTctx) yoksa istemcide mi kuruldu */
  tctxFromServer: boolean
  detailTo: string
  /** Oynatılabilirse oynatıcı yolu (dizide devam edilecek bölüm) */
  playTo: string | null
  playVideoId: number | null
  posterUrl: string | null
  landscapeUrl: string | null
  badge: string | null
  lockedText: string | null
  rank: number | null
  progress: number | null
  meta: string | null
}

export interface RowVM {
  listId: string
  rowIndex: number
  context: string
  kind: RowKind
  title: string
  length: number
  trackId: number
  /** "Tümü" hedefi */
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
  accessText: string | null
  resume: boolean
  primaryLabel: 'İzle' | 'Devam et'
  promo: { viewableId: string; offset: number } | null
  /** Manifest ön hazırlığı için oynatılabilir kimlik */
  prefetchViewableId: string | null
}

export function seeAllPath(summary: Pick<ListSummary, 'genreId' | 'collectionId'>): string | null {
  if (summary.genreId !== undefined) return `/tur/${summary.genreId}`
  if (summary.collectionId !== undefined) return `/koleksiyon/${summary.collectionId}`
  return null
}

/** "S1 B3 · 22 dk" → "S1 B3" */
function episodeLabelOf(displayRuntime: string | undefined): string | null {
  if (!displayRuntime) return null
  const first = displayRuntime.split(' · ')[0] ?? ''
  return /^S\d+ B\d+$/.test(first) ? first : null
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
  const label = isShow ? episodeLabelOf(cur?.displayRuntime) : null
  const left = bm ? remainingText(bm.positionSec, bm.runtimeSec) : null
  return {
    index,
    videoId: s.id,
    entityId,
    title: node.title,
    isShow,
    tctx,
    tctxFromServer: serverTctx !== undefined,
    detailTo: detailPath(s.id, tctx),
    playTo: playVideoId !== null ? playPath(playVideoId, tctx) : null,
    playVideoId,
    posterUrl: node.boxart?.url ?? null,
    landscapeUrl: node.storyArt?.url ?? null,
    badge: badgeTextOf(node.badge, !!locked),
    lockedText: locked,
    rank: summary.context === 'top10' ? (node.top10Rank ?? index + 1) : null,
    progress: bm ? bm.progress : null,
    meta: joinMeta([label, left ?? (label ? null : (node.displayRuntime ?? null))]) || null,
  }
}

/** lists[listId] → satır görünüm modeli (yalnız bilinen bağlamlar; bilinmeyen null). */
export function mapRow(list: ListNode | undefined, rowIndex: number, loaded: number): RowVM | null {
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
    seeAllTo: seeAllPath(summary),
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
  const resume = playable && (isInProgress(bm) || (node.watchStatus === 'STARTED' && !!bm))
  return {
    ...card,
    synopsis: node.shortSynopsis ?? '',
    artUrl: node.billboardArt?.url ?? node.storyArt?.url ?? null,
    logoUrl: node.titleLogo?.url ?? null,
    maturity: node.maturity
      ? { certificationValue: node.maturity.certificationValue, reasons: node.maturity.reasons ?? [] }
      : null,
    playable,
    accessText: card.lockedText,
    resume,
    primaryLabel: resume ? 'Devam et' : 'İzle',
    promo:
      playable && node.promoVideo ? { viewableId: node.promoVideo.viewableId, offset: node.promoVideo.offset } : null,
    prefetchViewableId: card.playVideoId !== null ? videoEntityId(card.playVideoId) : null,
  }
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
