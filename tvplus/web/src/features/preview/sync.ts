/**
 * Lolomo'yu dürüst tutmak: Listem ya da yer imi değişince etkilenen Falcor yolları ve GraphQL girdileri geçersiz kılınır,
 * bağlı satırlar (useFalcorView) eksik yollarını yeniden ister.
 *   - lolomos[guid(:kategori)] → satır sayısı + sıra (Listem satırı ilk eklemede ortaya çıkar, son çıkarmada kaybolur)
 *   - lists[<bağlam>]         → yalnız etkilenen listeler (queue / continueWatching)
 *   - videos[id].{queue,…}    → değişen videonun kişisel yaprakları
 * Oynatıcıdan dönüş: oynat bağlantısı ve oynatıcının kendisi videoyu not eder (lib/playbackNotes); keşif sayfası
 * yeniden açılınca geçersiz kılınır.
 */
import { useEffect } from 'react'
import type { FalcorPath, JsonGraph, JsonGraphLeaf } from '../../../../shared/types'
import { falcor } from '../../api/falcor'
import { queryCache } from '../../api/hooks'
import { peekBoot } from '../../api/session'
import { afterBookmarkSaves, notePlayback, playbackSince } from '../../lib/playbackNotes'
import { clearPreviews } from './store'

const LOLOMO_CATEGORY_KEYS = ['shows', 'movies', 'newPopular'] as const
const PERSONAL_LEAVES = ['queue', 'bookmark', 'watchStatus', 'userRating', 'current']

const isLeaf = (n: unknown): n is JsonGraphLeaf => typeof n === 'object' && n !== null && '$type' in n

/** Önbellekteki listelerden bağlamı verilenlerin kimlikleri */
export function cachedListIds(graph: JsonGraph, contexts: readonly string[]): string[] {
  const lists = graph.lists
  if (!lists || isLeaf(lists)) return []
  const out: string[] = []
  for (const [listId, node] of Object.entries(lists)) {
    if (isLeaf(node)) continue
    const summary = node.summary
    const ctx =
      isLeaf(summary) && summary.$type === 'atom'
        ? (summary.value as { context?: string } | undefined)?.context
        : undefined
    if (ctx && contexts.includes(ctx)) out.push(listId)
  }
  return out
}

/** Geçersiz kılınacak yol kümeleri (saf; test edilir). */
export function invalidationPaths(
  graph: JsonGraph,
  guid: string | null,
  contexts: readonly string[],
  videoIds: readonly number[],
): FalcorPath[] {
  const paths: FalcorPath[] = []
  // Ana sayfa ve kategori lolomoları (Diziler, Filmler, Yeni ve Popüler: "<guid>:<kategori>")
  if (guid) paths.push(['lolomos', [guid, ...LOLOMO_CATEGORY_KEYS.map((c) => `${guid}:${c}`)]])
  for (const id of cachedListIds(graph, contexts)) paths.push(['lists', id])
  for (const v of new Set(videoIds)) paths.push(['videos', v, PERSONAL_LEAVES])
  return paths
}

function invalidate(contexts: readonly string[], videoIds: readonly number[]): void {
  const guid = peekBoot()?.activeProfile?.guid ?? null
  const paths = invalidationPaths(falcor.getCache(), guid, contexts, videoIds)
  if (paths.length) falcor.invalidate(...paths)
}

/** Listem değişti (bizim mutasyonumuz başarılı oldu). */
export function onMyListChanged(videoId: number): void {
  invalidate(['queue'], [videoId])
  queryCache.invalidate('Library')
  queryCache.invalidate('DetailModal')
}

/** Beğeni değişti: "Sana özel" gibi satırlar sonraki açılışta yenilenir; Kitaplığım hemen. */
export function onRatingChanged(videoId: number): void {
  invalidate([], [videoId])
  queryCache.invalidate('Library')
}

/* ───────────── Oynatıcıdan dönüş ───────────── */

/** Bu modülün okuduğu son oynatma notu (bkz. lib/playbackNotes: notlar detay ekranlarıyla ortaktır). */
let seen = 0

/** Oynat bağlantısına basıldı: dönüşte yer imi/devam et satırı tazelenecek. */
export function notePlaybackIntent(videoId: number, parentId?: number | null): void {
  notePlayback(videoId, parentId)
}

/**
 * Bekleyen oynatma varsa yolları geçersiz kılar; döndürdüğü değer: tazeleme gerekti mi.
 * Oynatıcının son yer imi kaydı yoldaysa tazeleme onun bitmesini bekler (yoksa eski veri yeniden çekilir).
 */
export function flushPlaybackChanges(): boolean {
  const { ids, cursor } = playbackSince(seen)
  if (!ids.length) return false
  seen = cursor
  afterBookmarkSaves(() => {
    invalidate(['continueWatching'], ids)
    queryCache.invalidate('Library')
    queryCache.invalidate('DetailModal')
    clearPreviews()
  })
  return true
}

/** Keşif sayfaları açılırken: oynatıcıdan dönülüyorsa veriyi tazele. */
export function useFreshAfterPlayback(): void {
  useEffect(() => {
    flushPlaybackChanges()
  }, [])
}
