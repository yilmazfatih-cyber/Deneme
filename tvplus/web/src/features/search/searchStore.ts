/**
 * Arama durumunun ana pakette kalan küçük kısmı: yanıt önbelleği (TTL) ve son aramalar.
 * Üst çubuktaki kutu (Enter → kaydet) ile tembel yüklenen arama sayfası aynı önbelleği paylaşır.
 */
import { gql } from '../../api/graphql'
import { devbus } from '../../lib/devbus'
import type { SearchResponse } from './searchModel'
import { TtlCache } from './ttlCache'

export const searchCache = new TtlCache<SearchResponse>(60)

/** Boş terim girdileri (son aramaları taşıyanlar) — son aramalar değişince geçersiz kılınır. */
const isEmptyTermKey = (key: string) => key.split('|')[1] === ''

let lastRecorded = ''

/** Aramayı kaydeder (sonuç açıldığında ya da Enter'da; her tuşta değil). Asla fırlatmaz. */
export function recordSearch(term: string): void {
  const t = term.trim()
  if (!t || t === lastRecorded) return
  lastRecorded = t
  gql<{ recordSearch: boolean }, { term: string }>('RecordSearch', { term: t }).then(
    () => searchCache.deleteWhere(isEmptyTermKey),
    () => {
      lastRecorded = ''
    },
  )
}

/** Son aramaları siler; boş arama ekranı bir sonraki açılışta sunucudan yeniden çekilir. */
export async function clearRecentSearches(): Promise<boolean> {
  try {
    await gql<{ clearRecentSearches: boolean }>('ClearRecentSearches')
    searchCache.deleteWhere(isEmptyTermKey)
    lastRecorded = ''
    return true
  } catch (err) {
    devbus.emit('graphql', 'ClearRecentSearches', { error: String(err) }, { ok: false })
    return false
  }
}
