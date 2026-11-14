/**
 * Arama durumunun ana pakette kalan küçük kısmı: yanıt önbelleği (TTL), son aramalar ve aramanın başladığı sayfa.
 * Üst çubuktaki kutu ile tembel yüklenen arama sayfası aynı önbelleği paylaşır.
 */
import { gql } from '../../api/graphql'
import { devbus } from '../../lib/devbus'
import type { SearchResponse } from './searchModel'
import { normalizeTerm, termOfKey, TtlCache } from './ttlCache'

export const searchCache = new TtlCache<SearchResponse>(60)

/** Boş terim girdileri (son aramaları ve kişisel önerileri taşıyanlar). */
const isEmptyTermKey = (key: string) => termOfKey(key) === ''

/**
 * Bir terimin tüm girdilerini siler (her yetenek / açıklama biçimiyle). Geri bildirimden sonra çağrılır: model
 * güncellendi, bu terimin eski sırası bir daha gösterilmez. Boş terim de silinir (kişisel öneriler değişir).
 */
export function invalidateTerm(term: string): void {
  const t = normalizeTerm(term)
  searchCache.deleteWhere((k) => {
    const kt = termOfKey(k)
    return kt === t || kt === ''
  })
}

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

/* ───────────── Aramanın başladığı yer ───────────── */

/**
 * Masaüstünde ilk tuşta arama sayfasına İLERİ gidilir; kutu boşalınca buraya dönülür (UX_SPEC §2).
 * `idx`: React Router'ın geçmiş sırası — geçmiş bozulmadıysa "geri" ile dönülür (fazladan girdi kalmaz).
 */
export interface SearchOrigin {
  path: string
  idx: number | null
}

let origin: SearchOrigin | null = null

export function setSearchOrigin(o: SearchOrigin | null): void {
  origin = o
}

export function searchOrigin(): SearchOrigin | null {
  return origin
}

/** window.history.state.idx (React Router) — yoksa null. */
export function historyIndex(): number | null {
  const st = (typeof window !== 'undefined' ? window.history.state : null) as { idx?: unknown } | null
  return typeof st?.idx === 'number' ? st.idx : null
}
