/**
 * Görsel servisi adresleri (Netflix /dnm/api/v6/ karşılığı). Saf işlevler: çözümleyiciler adres üretir,
 * görsel eklentisi aynı işlevle doğrular. Biçim:
 *   /img/v1/<tip>/<genişlik>x<yükseklik>/<varlık kimliği>.<webp|jpg>?r=<imza>
 * `r` kısa bir imzadır: tip + boyut + varlık + biçim üzerinden HMAC'in ilk 6 baytı (base64url).
 */
import { createHmac, timingSafeEqual } from 'node:crypto'
import { ROUTES } from '../../../shared/constants'
import { deriveKey, type AppConfig } from './config'

export type ArtworkTypeName =
  'BOXART' | 'STORY_ART' | 'BILLBOARD' | 'TITLE_LOGO' | 'EPISODE_STILL' | 'CHANNEL_LOGO' | 'AVATAR'

/** Tip başına en-boy oranı (genişlik / yükseklik) ve varsayılan genişlik. */
export const ARTWORK_SPECS: Record<ArtworkTypeName, { ratio: number; defaultWidth: number; maxWidth: number }> = {
  BOXART: { ratio: 2 / 3, defaultWidth: 368, maxWidth: 800 },
  STORY_ART: { ratio: 16 / 9, defaultWidth: 600, maxWidth: 1280 },
  BILLBOARD: { ratio: 16 / 9, defaultWidth: 1280, maxWidth: 1920 },
  TITLE_LOGO: { ratio: 5 / 2, defaultWidth: 400, maxWidth: 800 },
  EPISODE_STILL: { ratio: 16 / 9, defaultWidth: 480, maxWidth: 1280 },
  CHANNEL_LOGO: { ratio: 1, defaultWidth: 128, maxWidth: 512 },
  AVATAR: { ratio: 1, defaultWidth: 160, maxWidth: 512 },
}

export interface ImageRequest {
  type: ArtworkTypeName
  entityId: string // 'Video:80010001' | 'Channel:1' | 'Collection:9001' | 'Profile:<guid>' | 'Airing:<id>'
  width: number
  height: number
  format: 'webp' | 'jpg'
}
export interface ArtworkDescriptor {
  key: string
  type: ArtworkTypeName
  url: string
  width: number
  height: number
}

const sign = (config: AppConfig, r: ImageRequest) =>
  createHmac('sha256', deriveKey(config, 'image-url'))
    .update(`${r.type}|${r.width}x${r.height}|${r.entityId}|${r.format}`)
    .digest()
    .subarray(0, 6)
    .toString('base64url')

/** İstenen genişlik/yükseklikten (biri verilse yeter) tip oranına uygun boyut çıkarır; genişlik 16'nın katına yuvarlanır. */
export function normalizeSize(
  type: ArtworkTypeName,
  width?: number | null,
  height?: number | null,
): { width: number; height: number } {
  const spec = ARTWORK_SPECS[type]
  let w = width ?? (height ? Math.round(height * spec.ratio) : spec.defaultWidth)
  w = Math.min(spec.maxWidth, Math.max(32, Math.ceil(w / 16) * 16))
  return { width: w, height: Math.round(w / spec.ratio) }
}

export function buildArtwork(
  config: AppConfig,
  type: ArtworkTypeName,
  entityId: string,
  params?: { width?: number | null; height?: number | null; format?: string | null } | null,
): ArtworkDescriptor {
  const { width, height } = normalizeSize(type, params?.width, params?.height)
  const format = params?.format === 'jpg' ? 'jpg' : 'webp'
  const req: ImageRequest = { type, entityId, width, height, format }
  const url = `${ROUTES.IMAGE_PREFIX}/${type.toLowerCase()}/${width}x${height}/${encodeURIComponent(entityId)}.${format}?r=${sign(config, req)}`
  return { key: `${type}|${entityId}|${width}x${height}`, type, url, width, height }
}

export function verifyImageSignature(config: AppConfig, req: ImageRequest, r: string | undefined): boolean {
  if (!r) return false
  const a = Buffer.from(sign(config, req))
  const b = Buffer.from(r)
  return a.length === b.length && timingSafeEqual(a, b)
}
