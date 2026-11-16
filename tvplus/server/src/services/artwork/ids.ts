/**
 * Afiş çeşidi kimlikleri (saf işlevler; tarayıcıdaki sunucu da yükler).
 *   Video:<videoId>          varsayılan (editoryal) görsel
 *   Video:<videoId>~<anahtar> içerikteki `artwork.alternates[].key` adayı
 * Kimlik görsel adresine olduğu gibi girer (imza, disk önbelleği ve durağan dosya adı çeşide göre ayrılır).
 */
import type { ContentTitle } from '../../../../shared/content-schema'
import type { ArtworkTypeName } from '../../kernel/imageUrls'

/** Çeşit anahtarı biçimi (shared/content-schema.ts zArtwork.alternates[].key ile aynı) */
export const ARTWORK_KEY_RE = /^[a-z0-9]{1,8}$/

/** Kişiselleştirilen görsel tipleri: yalnız başlık (film/dizi) kartlarının yatay ve dikey görselleri */
export const PERSONALISED_TYPES: readonly ArtworkTypeName[] = ['STORY_ART', 'BOXART']

/** Aday anahtarı '' → varsayılan görselin kimliği */
export const artworkEntityId = (videoId: number, key: string): string =>
  key ? `Video:${videoId}~${key}` : `Video:${videoId}`

/** 'Video:80010001~k2' → { videoId: 80010001, key: 'k2' } · 'Video:80010001' → key ''. Başka biçimde null. */
export function parseVideoEntity(entityId: string): { videoId: number; key: string } | null {
  const m = /^Video:(\d{1,12})(?:~([a-z0-9]{1,8}))?$/.exec(entityId)
  if (!m) return null
  const videoId = Number(m[1])
  return Number.isSafeInteger(videoId) ? { videoId, key: m[2] ?? '' } : null
}

/** Başlığın adayı (anahtar tekil değilse ilki geçerlidir); yoksa null. */
export function alternateOf(t: ContentTitle | null, key: string): ContentTitle['artwork']['alternates'][number] | null {
  if (!t || !key) return null
  return t.artwork.alternates.find((a) => a.key === key) ?? null
}

/**
 * Bu tipte bu başlığın görseli kişiselleşir mi: tip STORY_ART ya da (başlığın elle verilmiş dikey afişi yoksa)
 * BOXART olmalı ve başlığın en az bir adayı bulunmalı. Elle verilmiş `boxart` varsa dikey afiş kişiselleşmez.
 */
export function isPersonalisable(t: ContentTitle | null, type: ArtworkTypeName): boolean {
  if (!t || t.artwork.alternates.length === 0) return false
  if (type === 'STORY_ART') return true
  return type === 'BOXART' && !t.artwork.boxart
}

/**
 * Çeşit kimliğinin geçerli karşılığı: aday bu tipte kullanılabiliyorsa kimliğin kendisi, değilse (bilinmeyen anahtar,
 * kişiselleşmeyen tip, bölüm) varsayılan `Video:<id>`. Durağan kipte yalnız gerçekten üretilen dosyalara başvurulsun
 * diye eşleyici bunu kullanır.
 */
export function canonicalVideoEntity(
  title: (videoId: number) => ContentTitle | null,
  entityId: string,
  type: ArtworkTypeName,
): string {
  const p = parseVideoEntity(entityId)
  if (!p || !p.key) return entityId
  const t = title(p.videoId)
  return t && t.videoId === p.videoId && isPersonalisable(t, type) && alternateOf(t, p.key)
    ? entityId
    : artworkEntityId(p.videoId, '')
}
