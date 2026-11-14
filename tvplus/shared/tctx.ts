/**
 * Konum izleme bağlamı (Netflix `tctx`): her kart hangi satırın kaçıncı sırasında gösterildiğini taşır.
 *   tctx=1,0,devam,14170286,,,,,,,Video:80010001,
 *        ^ ^ ^     ^               ^
 *        | | |     |               └ varlık kimliği
 *        | | |     └ satırın izleme kimliği (trackId)
 *        | | └ satır kimliği (listId / rowId)
 *        | └ satır içi konum
 *        └ satır indeksi
 * Bağlantılara `?tctx=` olarak eklenir, olaylara aynen taşınır.
 */
export interface Tctx {
  row: number
  rank: number
  rowId: string
  trackId: number
  entityId: string
}

export function formatTctx(t: Tctx): string {
  return `${t.row},${t.rank},${t.rowId},${t.trackId},,,,,,,${t.entityId},`
}

export function parseTctx(s: string | null | undefined): Tctx | null {
  if (!s) return null
  const p = s.split(',')
  if (p.length < 11) return null
  const row = Number(p[0])
  const rank = Number(p[1])
  if (!Number.isFinite(row) || !Number.isFinite(rank)) return null
  return { row, rank, rowId: p[2] ?? '', trackId: Number(p[3]) || 0, entityId: p[10] ?? '' }
}

/** 'Video:80010001' → { kind: 'Video', id: '80010001' } */
export function parseEntityId(id: string): { kind: string; id: string } | null {
  const i = id.indexOf(':')
  if (i <= 0) return null
  return { kind: id.slice(0, i), id: id.slice(i + 1) }
}
export const videoEntityId = (videoId: number) => `Video:${videoId}`
export const channelEntityId = (channelId: number) => `Channel:${channelId}`
export const airingEntityId = (airingId: string) => `Airing:${airingId}`
export const collectionEntityId = (collectionId: number) => `Collection:${collectionId}`
export const personEntityId = (personId: number) => `Person:${personId}`
export const genreEntityId = (genreId: number) => `Genre:${genreId}`
