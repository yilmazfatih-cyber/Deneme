/**
 * TV Ana Sayfa / kategori ekranları — saf satır modeli (DOM yok; birim testi model.test.ts).
 *
 * Yollar (docs/MIMARI.md §6, §9.4, §10.1):
 *   kök       Ana Sayfa ['lolomo'] (açılış tohumu bu yolla gelir) · kategori ['lolomoByCategory', <kategori>]
 *   özet      [...kök, 'summary']                        → { length }
 *   satırlar  [...kök, {a..b}, 'summary']                → lists[..].summary (bağlam, ad, uzunluk, reason)
 *   öğeler    [...kök, satır, {a..b}, <yapraklar>]       + itemTctx; devam et için 'current' bölümü
 *   üst alan  ['videos', id, HERO_LEAVES]               (odaktaki başlık; satırın yakın öğeleri için önden)
 * Satırlar odak yaklaştıkça 3'erli, öğeler satırda ilerledikçe 10'ar 10'ar istenir.
 */
import type { FalcorPath } from '../../../../shared/types'
import { formatTctx, videoEntityId } from '../../../../shared/tctx'

export const ROW_BATCH = 3
/** Açılışta özeti istenen satır sayısı */
export const INITIAL_ROWS = 6
export const ITEM_PAGE = 10
/** Odak yüklü sonun bu kadar yakınına gelince sonraki aralık istenir */
export const ITEM_PREFETCH_GAP = 4

export type BrowseCategory = 'home' | 'shows' | 'movies' | 'newPopular'

export const CATEGORY_TITLES: Record<Exclude<BrowseCategory, 'home'>, string> = {
  shows: 'Diziler',
  movies: 'Filmler',
  newPopular: 'Yeni ve Popüler',
}

export const isBrowseCategory = (x: string): x is Exclude<BrowseCategory, 'home'> =>
  x === 'shows' || x === 'movies' || x === 'newPopular'

/* ───────────── Tel biçimleri (Falcor atomları) ───────────── */

export interface ArtAtom {
  url: string
  width?: number
  height?: number
}

export interface ListSummary {
  id: string
  context: string
  displayName: string
  length: number
  trackId: number
  reason?: string
  genreId?: number
  collectionId?: number
  microgenreId?: string
  communityId?: string
}

export interface BookmarkAtom {
  positionSec: number
  runtimeSec: number | null
  progress: number
}

export interface VideoNode {
  summary?: { id: number; type: 'movie' | 'show' | 'episode' | 'supplemental'; isPlayable: boolean }
  title?: string
  shortSynopsis?: string
  boxart?: ArtAtom
  storyArt?: ArtAtom
  billboardArt?: ArtAtom
  badge?: { kind: string; text: string }
  displayRuntime?: string
  releaseYear?: number
  seasonCount?: number
  maturity?: { certificationValue: string; maturityLevel: number; reasons?: string[] }
  access?: { state: string; reasonText: string | null }
  bookmark?: BookmarkAtom
  top10Rank?: number | null
  tags?: string[]
  promoVideo?: { viewableId: string; offset: number; sourceKind?: string }
  current?: VideoNode
}

/** Bir satırın düz JSON'u (sayısal anahtarlar dizge) */
export interface RowNode {
  summary?: ListSummary
  itemTctx?: Record<string, string>
  [index: string]: VideoNode | ListSummary | Record<string, string> | undefined
}

/* ───────────── Bağlam → kart biçimi ───────────── */

/**
 * poster   Top 10: rakam + 16:9 görsel + ad (TvRankedCard)
 * resume   İzlemeye Devam Et: ilerleme + alt yazı; OK doğrudan oynatır
 * channel  Canlı TV köprüsü: kanal kartları (GraphQL'den)
 * standard 16:9 başlık kartı (mikro tür, zevk topluluğu, tür, editoryal, Listem…)
 * skip     vitrin: TV'de üst alan odaktaki başlığı izler, ayrı satır çizilmez
 */
export type CardKind = 'poster' | 'resume' | 'channel' | 'standard' | 'skip'

const POSTER_CONTEXTS = new Set(['top10', 'top10Shows', 'top10Movies'])

export function cardKindOf(context: string | undefined): CardKind {
  if (!context || context === 'billboard') return 'skip'
  if (POSTER_CONTEXTS.has(context)) return 'poster'
  if (context === 'continueWatching') return 'resume'
  if (context === 'bridge') return 'channel'
  return 'standard'
}

/** Kartın yaprakları (satır öğeleri için) */
export const CARD_LEAVES = ['summary', 'title', 'storyArt', 'badge', 'access', 'displayRuntime'] as const
export const POSTER_LEAVES = ['summary', 'title', 'storyArt', 'badge', 'access', 'top10Rank'] as const
export const RESUME_LEAVES = ['summary', 'title', 'storyArt', 'access', 'displayRuntime', 'bookmark'] as const
/** Dizide devam edilecek bölüm (videos[id].current → ref) */
export const CURRENT_LEAVES = ['summary', 'displayRuntime', 'bookmark'] as const
/** Üst alanın yaprakları (odaktaki başlık) */
export const HERO_LEAVES = [
  'summary',
  'title',
  'shortSynopsis',
  'releaseYear',
  'maturity',
  'seasonCount',
  'displayRuntime',
  'tags',
  'billboardArt',
  'storyArt',
  'promoVideo',
  'top10Rank',
] as const

export function leavesFor(kind: CardKind): readonly string[] {
  if (kind === 'poster') return POSTER_LEAVES
  if (kind === 'resume') return RESUME_LEAVES
  if (kind === 'standard') return CARD_LEAVES
  return []
}

/* ───────────── Yol planı ───────────── */

export function rootPath(category: BrowseCategory): FalcorPath {
  return category === 'home' ? ['lolomo'] : ['lolomoByCategory', category]
}

const range = (from: number, to: number) => (from === to ? from : { from, to })

/** Satır özetleri: [0..rows-1] */
export function planRowSummaries(category: BrowseCategory, rows: number): FalcorPath[] {
  if (rows <= 0) return []
  return [[...rootPath(category), range(0, rows - 1), 'summary']]
}

/** Bir satırın [0..count-1] öğeleri (kart biçimine göre yapraklar) */
export function planRowItems(category: BrowseCategory, row: number, kind: CardKind, count: number): FalcorPath[] {
  if (count <= 0) return []
  const leaves = leavesFor(kind)
  if (!leaves.length) return []
  const root = rootPath(category)
  const r = range(0, count - 1)
  const paths: FalcorPath[] = [
    [...root, row, r, [...leaves]],
    [...root, row, 'itemTctx', r],
  ]
  if (kind === 'resume') paths.push([...root, row, r, 'current', [...CURRENT_LEAVES]])
  return paths
}

/** Odaktaki satıra göre özeti istenecek satır sayısı (3'erli gruplar; yalnız büyür). */
export function rowsToLoad(focusRow: number, loaded: number, total: number): number {
  // Odaktan sonra en az ROW_BATCH satır hazır olsun; 3'erli gruplara yuvarlanır.
  const need = Math.ceil((Math.max(0, focusRow) + ROW_BATCH + 1) / ROW_BATCH) * ROW_BATCH
  return Math.max(0, Math.min(total, Math.max(INITIAL_ROWS, loaded, need)))
}

/** Satırda yüklenecek öğe sayısı: odak sona yaklaşınca bir sayfa daha (yalnız büyür). */
export function itemsToLoad(focusIndex: number, loaded: number, length: number): number {
  const base = Math.max(Math.min(ITEM_PAGE, length), loaded)
  if (focusIndex >= base - ITEM_PREFETCH_GAP && base < length) return Math.min(length, base + ITEM_PAGE)
  return Math.min(length, base)
}

/* ───────────── Görünüm modeli ───────────── */

export interface CardVM {
  /** Satırda tekil anahtar (odak kimliği bundan kurulur) */
  key: string
  index: number
  videoId: number
  entityId: string
  title: string
  isShow: boolean
  tctx: string
  imageUrl: string | null
  rank: number | null
  progress: number | null
  caption: string | null
  badge: string | null
  locked: boolean
  /** Devam et: doğrudan oynatılacak kimlik ve konum */
  play: { viewableId: string; positionSec: number | null } | null
}

export interface RowVM {
  listId: string
  rowIndex: number
  context: string
  kind: CardKind
  title: string
  reason: string | null
  length: number
  trackId: number
  /** 0..length-1; yüklenmemiş öğe null */
  items: (CardVM | null)[]
}

/** "S1 B3 · 22 dk" → "S1:B3" */
export function episodeLabelOf(displayRuntime: string | undefined): string | null {
  if (!displayRuntime) return null
  const m = /^S(\d+) B(\d+)/.exec(displayRuntime.split(' · ')[0] ?? '')
  return m ? `S${m[1]}:B${m[2]}` : null
}

/** Kalan süre: "23 dk kaldı" · "1 sa 5 dk kaldı"; bilinmiyorsa null. */
export function remainingText(positionSec: number | null | undefined, runtimeSec: number | null | undefined) {
  if (!runtimeSec || runtimeSec <= 0 || positionSec === null || positionSec === undefined) return null
  const left = runtimeSec - positionSec
  if (left <= 0) return null
  const m = Math.max(1, Math.round(left / 60))
  if (m < 60) return `${m} dk kaldı`
  const h = Math.floor(m / 60)
  const r = m % 60
  return r ? `${h} sa ${r} dk kaldı` : `${h} sa kaldı`
}

export const joinMeta = (parts: (string | number | null | undefined | false)[]): string =>
  parts.filter((p) => p !== null && p !== undefined && p !== false && p !== '').join(' · ')

/** Kart rozeti: kilitliyse ya da Top 10 / kilit türündeyse yok (kart başına tek işaret). */
export function badgeTextOf(badge: { kind: string; text: string } | undefined, locked: boolean): string | null {
  if (!badge || locked || badge.kind === 'LOCKED' || badge.kind === 'TOP10') return null
  return badge.text
}

export function mapCard(row: RowNode, summary: ListSummary, rowIndex: number, index: number): CardVM | null {
  const node = row[String(index)] as VideoNode | undefined
  const s = node?.summary
  if (!node || !s || typeof node.title !== 'string') return null
  const kind = cardKindOf(summary.context)
  const entityId = videoEntityId(s.id)
  const tctx =
    row.itemTctx?.[String(index)] ??
    formatTctx({ row: rowIndex, rank: index, rowId: summary.id, trackId: summary.trackId, entityId })
  const isShow = s.type === 'show'
  const locked = (node.access?.state ?? (s.isPlayable ? 'PLAYABLE' : 'BLOCKED')) !== 'PLAYABLE'
  let progress: number | null = null
  let caption: string | null = null
  let play: CardVM['play'] = null
  if (kind === 'resume') {
    const cur = isShow ? node.current : undefined
    const bm = isShow ? cur?.bookmark : node.bookmark
    progress = bm ? bm.progress : null
    const label = isShow ? episodeLabelOf(cur?.displayRuntime) : null
    caption = joinMeta([label, bm ? remainingText(bm.positionSec, bm.runtimeSec) : null]) || null
    const playId = isShow ? cur?.summary?.id : s.id
    if (!locked && playId !== undefined)
      play = { viewableId: videoEntityId(playId), positionSec: bm && bm.progress < 0.95 ? bm.positionSec : null }
  }
  return {
    key: String(s.id),
    index,
    videoId: s.id,
    entityId,
    title: node.title,
    isShow,
    tctx,
    imageUrl: node.storyArt?.url ?? node.boxart?.url ?? null,
    rank: kind === 'poster' ? (node.top10Rank ?? index + 1) : null,
    progress,
    caption,
    badge: kind === 'resume' ? null : badgeTextOf(node.badge, locked),
    locked,
    play,
  }
}

/** Satır görünüm modeli; çizilmeyecek satır (vitrin, özeti yok) null. */
export function mapRow(row: RowNode | undefined, rowIndex: number, loaded: number): RowVM | null {
  const summary = row?.summary
  if (!row || !summary) return null
  const kind = cardKindOf(summary.context)
  if (kind === 'skip') return null
  const items: (CardVM | null)[] = []
  const count = kind === 'channel' ? 0 : Math.min(loaded, summary.length)
  const seen = new Set<string>()
  for (let i = 0; i < count; i++) {
    const card = mapCard(row, summary, rowIndex, i)
    // Aynı başlık satırda iki kez gelirse odak kimliği tekil kalsın.
    if (card && seen.has(card.key)) card.key = `${card.key}-${i}`
    if (card) seen.add(card.key)
    items.push(card)
  }
  return {
    listId: summary.id,
    rowIndex,
    context: summary.context,
    kind,
    title: summary.displayName,
    reason: summary.reason ?? null,
    length: kind === 'channel' ? 0 : summary.length,
    trackId: summary.trackId,
    items,
  }
}

/* ───────────── Üst alan (odaktaki başlık) ───────────── */

export interface HeroVM {
  key: string
  eyebrow: string
  title: string
  /** "%97 Eşleşme" yeşil; ayrı tutulur */
  match: string | null
  meta: string[]
  /** Yaş işareti (çerçeveli) */
  maturity: string | null
  /** "Bugün Dizilerde 3 Numara" */
  rankLine: string | null
  synopsis: string
  tags: string[]
  artUrl: string | null
  promo: { viewableId: string; offset: number } | null
}

export function typeLabel(type: string | undefined): string {
  if (type === 'show') return 'DİZİ'
  if (type === 'movie') return 'FİLM'
  return 'BAŞLIK'
}

/** Odaktaki başlığın üst alan modeli: kart (anında) + üst alan yaprakları (gelince) + eşleşme (gelince). */
export function heroOf(card: CardVM, node: VideoNode | undefined, matchScore: number | null | undefined): HeroVM {
  const type = node?.summary?.type ?? (card.isShow ? 'show' : 'movie')
  const runtime = type === 'show' && node?.seasonCount ? `${node.seasonCount} Sezon` : (node?.displayRuntime ?? null)
  const rank = node?.top10Rank ?? null
  return {
    key: card.key,
    eyebrow: typeLabel(type),
    title: card.title,
    match: typeof matchScore === 'number' ? `%${matchScore} Eşleşme` : null,
    meta: [node?.releaseYear ? String(node.releaseYear) : null, runtime].filter((x): x is string => !!x),
    maturity: node?.maturity?.certificationValue ?? null,
    rankLine: rank ? `Bugün ${type === 'show' ? 'Dizilerde' : 'Filmlerde'} ${rank} Numara` : null,
    synopsis: node?.shortSynopsis ?? '',
    tags: (node?.tags ?? []).slice(0, 3),
    artUrl: node?.billboardArt?.url ?? node?.storyArt?.url ?? card.imageUrl,
    promo:
      node?.promoVideo && !card.locked
        ? { viewableId: node.promoVideo.viewableId, offset: node.promoVideo.offset }
        : null,
  }
}

/* ───────────── Pencereleme ───────────── */

/** Satırda çizilecek aralık [from, to): odaktan önce `overscan`, sonra görünen + `overscan`. */
export function windowRange(
  index: number,
  length: number,
  visible: number,
  overscan: number,
): { from: number; to: number } {
  if (length <= 0) return { from: 0, to: 0 }
  const i = Math.min(Math.max(0, index), length - 1)
  return { from: Math.max(0, i - overscan), to: Math.min(length, i + visible + overscan) }
}

/* ───────────── Canlı TV köprüsü (kanal kartları) ───────────── */

export interface ChannelData {
  channelId: number
  unifiedEntityId: string
  name: string
  number: number
  access?: { state: string; reasonText: string | null } | null
  logo?: { url: string } | null
  now?: {
    title: string
    startAt: string
    endAt: string
    synopsis?: string | null
    art?: { url: string } | null
  } | null
}

export interface ChannelVM {
  key: string
  channelId: number
  entityId: string
  name: string
  number: number
  logoUrl: string | null
  imageUrl: string | null
  program: string | null
  synopsis: string
  startAt: string | null
  endAt: string | null
  progress: number | null
  locked: boolean
}

/** Şimdiki yayının ilerlemesi (0–1); yayın yoksa null. */
export function airingProgress(startAt: string, endAt: string, now: number): number | null {
  const s = Date.parse(startAt)
  const e = Date.parse(endAt)
  if (!Number.isFinite(s) || !Number.isFinite(e) || e <= s) return null
  return Math.min(1, Math.max(0, (now - s) / (e - s)))
}

export function mapChannel(c: ChannelData, now: number): ChannelVM {
  return {
    key: `kanal-${c.channelId}`,
    channelId: c.channelId,
    entityId: c.unifiedEntityId,
    name: c.name,
    number: c.number,
    logoUrl: c.logo?.url ?? null,
    imageUrl: c.now?.art?.url ?? null,
    program: c.now?.title ?? null,
    synopsis: c.now?.synopsis ?? '',
    startAt: c.now?.startAt ?? null,
    endAt: c.now?.endAt ?? null,
    progress: c.now ? airingProgress(c.now.startAt, c.now.endAt, now) : null,
    locked: !!c.access && c.access.state !== 'PLAYABLE',
  }
}
