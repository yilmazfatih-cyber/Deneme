/**
 * Uygulama içi bağlantılar ve konum izleme (tctx). Her kart bağlantısı `?tctx=` taşır (shared/tctx.ts).
 * Saf işlevler: DOM yok, birim testi links.test.ts.
 */
import { formatTctx, videoEntityId } from '../../../../shared/tctx'

/** Yola sorgu parametreleri ekler (boş değerler atlanır). */
export function withQuery(path: string, params: Record<string, string | null | undefined>): string {
  const q = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) if (v) q.set(k, v)
  const s = q.toString()
  return s ? `${path}?${s}` : path
}

export const detailPath = (videoId: number, tctx?: string | null) => withQuery(`/detay/${videoId}`, { tctx })

/** Oynatıcı: `#/izle/Video:<id>?tctx=…` (dizide bölüm kimliği verilir; dizinin kendisi oynatılabilir değildir). */
export function playPath(videoId: number, tctx?: string | null, opts: { fromStart?: boolean } = {}): string {
  return withQuery(`/izle/${videoEntityId(videoId)}`, { tctx, baslat: opts.fromStart ? 'bastan' : null })
}

export const channelPlayPath = (channelId: number) => `/izle/Channel:${channelId}`
export const genrePath = (genreId: number) => `/tur/${genreId}`
export const collectionPath = (collectionId: number) => `/koleksiyon/${collectionId}`
export const personPath = (personId: number) => `/kisi/${personId}`

/**
 * Sunucunun tctx'i olmayan listeler (GraphQL ızgaraları) için istemcide konum bağlamı:
 * satır 0, sıra = ızgaradaki konum, satır kimliği = sayfa kimliği ("tur_783", "benzer_80010001").
 */
export function localTctx(rowId: string, rank: number, videoId: number, row = 0, trackId = 0): string {
  return formatTctx({ row, rank, rowId, trackId, entityId: videoEntityId(videoId) })
}

/** Sunucu duyuru bağlantısı ("#/canli") → yönlendirici yolu ("/canli"); dış adres ise null. */
export function appPathOfHref(href: string): string | null {
  if (href.startsWith('#/')) return href.slice(1)
  if (href.startsWith('/')) return href
  return null
}
