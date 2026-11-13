/**
 * "Kaputun altı" veri yolu: uygulamanın her katmanı yaptığı işi buraya bildirir, panel bunları canlı gösterir.
 * Yayın yapan taraf panelin açık olup olmadığını bilmez; son 600 olay halka tamponda tutulur.
 *
 * Kategori başına `detail` alanı sözleşmesi docs/MIMARI.md §7'de.
 */
export type DevCategory =
  | 'graphql' // kalıcı sorgu isteği
  | 'falcor' // pathEvaluator isteği / önbellekten okuma
  | 'rest' // diğer HTTP
  | 'cache' // istemci önbelleği isabet/ıska (arama TTL, MiniModal, manifest)
  | 'prefetch' // satır ön yüklemesi, manifest ön hazırlığı
  | 'ftl' // ağ yoklaması
  | 'msl' // anahtar sağlama / şifreli zarf
  | 'manifest' // lisanslı manifest
  | 'range' // bayt-aralığı isteği
  | 'abr' // bit hızı kararı
  | 'buffer' // tampon durumu
  | 'cdn' // düğüm seçimi / yük devri
  | 'ttml' // altyazı
  | 'embed' // dış sağlayıcı (YouTube) oynatıcı olayı
  | 'player' // oynatıcı durum geçişi
  | 'event-log' // olay günlüğü gönderimi
  | 'push' // bildirim yoklaması
  | 'session' // kimlik / profil

export interface DevEvent {
  id: number
  at: number // epoch ms
  cat: DevCategory
  label: string
  ok: boolean
  ms?: number
  detail?: Record<string, unknown>
}

const MAX = 600
const buffer: DevEvent[] = []
const listeners = new Set<(e: DevEvent) => void>()
let seq = 0

export const devbus = {
  emit(cat: DevCategory, label: string, detail?: Record<string, unknown>, opts?: { ms?: number; ok?: boolean }): void {
    const e: DevEvent = { id: ++seq, at: Date.now(), cat, label, ok: opts?.ok ?? true, ms: opts?.ms, detail }
    buffer.push(e)
    if (buffer.length > MAX) buffer.shift()
    for (const l of listeners) {
      try {
        l(e)
      } catch {
        /* dinleyici hatası yayını durdurmaz */
      }
    }
  },
  subscribe(listener: (e: DevEvent) => void): () => void {
    listeners.add(listener)
    return () => listeners.delete(listener)
  },
  snapshot(): DevEvent[] {
    return buffer.slice()
  },
  clear(): void {
    buffer.length = 0
  },
}
