/**
 * Detay ve kişisel sayfaların bağlantıları (saf işlevler). Başlık bağlantısı için app `titleHref` / `useTitleHref`
 * kullanılır (masaüstünde `?jbv=` penceresi, mobilde /baslik/:id).
 */
import { formatTctx, videoEntityId } from '../../../../shared/tctx'

/** Yola sorgu parametreleri ekler (boş değerler atlanır). */
export function withQuery(path: string, params: Record<string, string | null | undefined>): string {
  const q = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) if (v) q.set(k, v)
  const s = q.toString()
  return s ? `${path}?${s}` : path
}

/** Oynatıcı: `/izle/Video:<id>?tctx=…` (dizide bölüm kimliği verilir). */
export function playPath(videoId: number, tctx?: string | null, opts: { fromStart?: boolean } = {}): string {
  return withQuery(`/izle/${videoEntityId(videoId)}`, { tctx, baslat: opts.fromStart ? 'bastan' : null })
}

export const genrePath = (genreId: number | string) => `/tur/${encodeURIComponent(String(genreId))}`
export const personPath = (personId: number) => `/kisi/${personId}`
export const collectionPath = (collectionId: number) => `/koleksiyon/${collectionId}`

/**
 * Sunucunun tctx'i olmayan ızgaralar için istemcide konum bağlamı:
 * satır 0, sıra = ızgaradaki konum, satır kimliği = bölüm kimliği ("benzer_80010001", "listem").
 */
export function localTctx(rowId: string, rank: number, videoId: number): string {
  return formatTctx({ row: 0, rank, rowId, trackId: 0, entityId: videoEntityId(videoId) })
}
