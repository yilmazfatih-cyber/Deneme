/**
 * Yazdıkça arama: sorgu durum makinesi (saf; useSearch ve usePredictions kullanır, search.test.ts sınar).
 *
 *   yazıldı ──(gecikme)──► istendi(seq) ──yanıt(seq)──► gösteriliyor
 *        ▲                      │
 *        └── yeni tuş: eski istek iptal, seq artar; geç gelen eski yanıt (seq ≠ son) DÜŞÜRÜLÜR
 *
 * Yeni istek sürerken eski sonuç ekranda kalır (Netflix: ızgara titremez), yalnız `loading` doğrudur.
 * Önbellek isabeti ağa çıkmadan uygulanır.
 */

export interface QueryState<T> {
  /** Son istenen anahtar */
  key: string | null
  /** Son verilen istek numarası; yalnız bu numaralı yanıt uygulanır */
  seq: number
  data?: T
  /** Ekrandaki verinin anahtarı (eski veri gösteriliyorsa `key`'den farklıdır) */
  dataKey: string | null
  loading: boolean
  error: Error | null
  fromCache: boolean
}

export type QueryAction<T> =
  | { type: 'request'; key: string; seq: number }
  | { type: 'cache'; key: string; seq: number; data: T }
  | { type: 'response'; key: string; seq: number; data: T }
  | { type: 'error'; seq: number; error: Error }

export function initialQueryState<T>(): QueryState<T> {
  return { key: null, seq: 0, dataKey: null, loading: true, error: null, fromCache: false }
}

export function queryReducer<T>(s: QueryState<T>, a: QueryAction<T>): QueryState<T> {
  switch (a.type) {
    case 'request':
      return { ...s, key: a.key, seq: a.seq, loading: true, error: null }
    case 'cache':
      // Önbellek isabeti: bekleyen istek varsa geçersizdir (seq ilerler, geç gelen yanıt düşer).
      return {
        ...s,
        key: a.key,
        seq: a.seq,
        data: a.data,
        dataKey: a.key,
        loading: false,
        error: null,
        fromCache: true,
      }
    case 'response':
      if (a.seq !== s.seq || a.key !== s.key) return s // eski yanıt
      return { ...s, data: a.data, dataKey: a.key, loading: false, error: null, fromCache: false }
    case 'error':
      if (a.seq !== s.seq) return s
      return { ...s, loading: false, error: a.error }
  }
}

/** Yanıt uygulanır mı (saf; yan etkiler — önbelleğe yazma, olaylar — yalnız güncel yanıtta yapılır). */
export function isCurrent<T>(s: QueryState<T>, seq: number, key: string): boolean {
  return s.seq === seq && s.key === key
}

/**
 * Gecikme: ekranda hiç veri yokken (ilk açılış) beklemeden; sonra her tuşta `debounceMs`.
 * Boş terime dönüş de beklemeden (kutu temizlendi: öneriler hemen).
 */
export function debounceFor(hasData: boolean, term: string, debounceMs: number): number {
  if (!hasData || !term.trim()) return 0
  return debounceMs
}
