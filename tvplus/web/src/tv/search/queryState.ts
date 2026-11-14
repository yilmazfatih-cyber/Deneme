/**
 * Arama sorgusu durum makinesi (saf; birim testi queryState.test.ts).
 *
 * Yazı dört kaynaktan gelir: ekran klavyesi, fiziksel klavye, telefonun klavyesi (TEXT komutu: TAM metin) ve
 * tahmin seçimi. Hepsi tek indirgeyiciden geçer; arama terimi yazı durunca (gecikmeli) ya da hemen (tahmin seçimi,
 * telefonda "Ara") işlenir.
 *
 *   durum  { text, term, rev }   text: kutudaki yazı · term: aranan (işlenmiş) terim · rev: her değişimde artar
 *   eylem  char · space · delete · clear · set(text, from) · commit
 */

export const MAX_QUERY_LENGTH = 60
/** Yazı durduktan sonra aramanın çalışması (ms) */
export const SEARCH_DEBOUNCE_MS = 350
/** Tamamlama tahminleri daha çabuk (ms) */
export const PREDICT_DEBOUNCE_MS = 150

export type QuerySource = 'keyboard' | 'physical' | 'phone' | 'prediction'

export interface QueryState {
  text: string
  /** İşlenmiş arama terimi ('' → "Sana Özel Öneriler") */
  term: string
  rev: number
  source: QuerySource | null
}

export type QueryAction =
  | { type: 'char'; ch: string; from?: QuerySource }
  | { type: 'space'; from?: QuerySource }
  | { type: 'delete'; from?: QuerySource }
  | { type: 'clear'; from?: QuerySource }
  | { type: 'set'; text: string; from: QuerySource; commit?: boolean }
  | { type: 'commit' }

export const initialQuery: QueryState = { text: '', term: '', rev: 0, source: null }

/** Kutudaki yazıyı düzenler: baştaki boşluklar ve art arda boşluklar atılır, uzunluk sınırlanır. */
export function normalizeText(raw: string): string {
  return raw.replace(/\s+/g, ' ').replace(/^ /, '').slice(0, MAX_QUERY_LENGTH)
}

/** Aranacak terim: kenar boşlukları atılmış yazı. */
export const termOf = (text: string): string => text.trim()

function withText(s: QueryState, text: string, from: QuerySource | null, commit: boolean): QueryState {
  const t = normalizeText(text)
  // Boşaltma her zaman hemen işlenir: "Sana Özel Öneriler"e gecikmesiz dönülür.
  const term = commit || termOf(t) === '' ? termOf(t) : s.term
  if (t === s.text && term === s.term) return s
  return { text: t, term, rev: s.rev + 1, source: from }
}

export function reduceQuery(s: QueryState, a: QueryAction): QueryState {
  switch (a.type) {
    case 'char':
      return withText(s, s.text + a.ch, a.from ?? 'keyboard', false)
    case 'space':
      return s.text === '' || s.text.endsWith(' ') ? s : withText(s, `${s.text} `, a.from ?? 'keyboard', false)
    case 'delete':
      return withText(s, s.text.slice(0, -1), a.from ?? 'keyboard', false)
    case 'clear':
      return withText(s, '', a.from ?? 'keyboard', true)
    case 'set':
      return withText(s, a.text, a.from, a.commit ?? a.from === 'prediction')
    case 'commit': {
      const term = termOf(s.text)
      return term === s.term ? s : { ...s, term, rev: s.rev + 1 }
    }
  }
}

/** Gecikmeli işleme gerekiyor mu? (yazı değişti ama terim henüz işlenmedi) */
export const needsCommit = (s: QueryState): boolean => termOf(s.text) !== s.term
