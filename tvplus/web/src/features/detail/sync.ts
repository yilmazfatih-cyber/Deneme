/**
 * Kişisel değişikliklerden sonra ekranları dürüst tutmak (Listem, beğeni, oynatmadan dönüş).
 *   - GraphQL: Library / DetailModal / DetailInsights girdileri geçersiz kılınır (bağlı kancalar yeniden çeker).
 *   - Falcor: ana sayfa lolomo'su (Listem satırı ilk eklemede belirir, son çıkarmada kaybolur), etkilenen listeler
 *     (queue / continueWatching) ve değişen videonun kişisel yaprakları.
 * Saf çekirdek `invalidationPaths` birim testlidir (model.test.ts).
 */
import { useEffect } from 'react'
import type { FalcorPath, JsonGraph, JsonGraphLeaf } from '../../../../shared/types'
import { falcor } from '../../api/falcor'
import { queryCache } from '../../api/hooks'
import { peekBoot } from '../../api/session'
import { afterBookmarkSaves, notePlayback, playbackSince } from '../../lib/playbackNotes'

const PERSONAL_LEAVES = ['queue', 'bookmark', 'watchStatus', 'userRating', 'current']

const isLeaf = (n: unknown): n is JsonGraphLeaf => typeof n === 'object' && n !== null && '$type' in n

/** Önbellekteki listelerden bağlamı verilenlerin kimlikleri */
function cachedListIds(graph: JsonGraph, contexts: readonly string[]): string[] {
  const lists = graph.lists
  if (!lists || isLeaf(lists)) return []
  const out: string[] = []
  for (const [listId, node] of Object.entries(lists)) {
    if (isLeaf(node)) continue
    const summary = (node as Record<string, unknown>).summary
    const ctx =
      isLeaf(summary) && summary.$type === 'atom'
        ? (summary.value as { context?: string } | undefined)?.context
        : undefined
    if (ctx && contexts.includes(ctx)) out.push(listId)
  }
  return out
}

/** Geçersiz kılınacak Falcor yol kümeleri (saf). */
export function invalidationPaths(
  graph: JsonGraph,
  guid: string | null,
  contexts: readonly string[],
  videoIds: readonly number[],
): FalcorPath[] {
  const paths: FalcorPath[] = []
  if (guid) paths.push(['lolomos', guid])
  for (const id of cachedListIds(graph, contexts)) paths.push(['lists', id])
  for (const v of new Set(videoIds)) paths.push(['videos', v, PERSONAL_LEAVES])
  return paths
}

function invalidateFalcor(contexts: readonly string[], videoIds: readonly number[]): void {
  try {
    const guid = peekBoot()?.activeProfile?.guid ?? null
    const paths = invalidationPaths(falcor.getCache(), guid, contexts, videoIds)
    if (paths.length) falcor.invalidate(...paths)
  } catch {
    /* Falcor önbelleği yoksa yapacak bir şey yok */
  }
}

/** Listem değişti (mutasyon başarılı). */
export function afterMyListChange(videoId: number): void {
  invalidateFalcor(['queue'], [videoId])
  queryCache.invalidate('Library')
  queryCache.invalidate('DetailModal')
  queryCache.invalidate('DetailInsights')
}

/** Beğeni değişti. */
export function afterRatingChange(videoId: number): void {
  invalidateFalcor([], [videoId])
  queryCache.invalidate('Library')
  queryCache.invalidate('DetailModal')
}

/* ───────────── Oynatıcıdan dönüş ───────────── */

/** Bu modülün okuduğu son oynatma notu (bkz. lib/playbackNotes: notlar keşif ekranlarıyla ortaktır). */
let seen = 0

/** Oynat bağlantısına basıldı: dönüşte yer imi ve "İzlemeye Devam Et" tazelenir. */
export function notePlaybackIntent(videoId: number, parentId?: number | null): void {
  notePlayback(videoId, parentId)
}

/**
 * Bekleyen oynatma varsa önbellekleri geçersiz kılar; döndürdüğü değer: tazeleme gerekti mi.
 * Oynatıcının son yer imi kaydı yoldaysa tazeleme onun bitmesini bekler.
 */
export function flushPlaybackChanges(): boolean {
  const { ids, cursor } = playbackSince(seen)
  if (!ids.length) return false
  seen = cursor
  afterBookmarkSaves(() => {
    invalidateFalcor(['continueWatching'], ids)
    queryCache.invalidate('Library')
    queryCache.invalidate('DetailModal')
  })
  return true
}

/** Detay ve kişisel sayfalar açılırken: oynatıcıdan dönülüyorsa veriyi tazele. */
export function useFreshAfterPlayback(): void {
  useEffect(() => {
    flushPlaybackChanges()
  }, [])
}
