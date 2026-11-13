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

/* ───────────── Durağan barındırma (GitHub Pages) ─────────────
 * `config.staticHost` açıkken görseller derleme anında üretilmiş düz dosyalardır (scripts/build-pages-assets.ts).
 * Sorgu dizgisi çeşit seçemez; çeşit yolun içindedir:  img/<tip>/<genişlik>x<yükseklik>/<varlık>.webp
 * Adres GÖRELİDİR (baştaki "/" yok): belge konumuna (site alt yolu, ör. /Deneme/) göre çözülür.
 * Çeşit sayısı sonlu olsun diye genişlik tipin merdivenindeki ilk uygun basamağa yuvarlanır ve biçim hep webp'dir.
 */
export const STATIC_IMG_DIR = 'img'

/** Tip başına üretilen genişlikler (artan). İstenen genişlik ilk büyük-eşit basamağa, yoksa en büyüğe yuvarlanır. */
export const STATIC_WIDTHS: Record<ArtworkTypeName, readonly number[]> = {
  BOXART: [368, 736],
  STORY_ART: [640, 960, 1280],
  BILLBOARD: [1280],
  TITLE_LOGO: [400],
  EPISODE_STILL: [480],
  CHANNEL_LOGO: [128],
  AVATAR: [160, 320],
}

/** İstenen boyutun durağan kipteki karşılığı (merdiven basamağı). */
export function staticSize(
  type: ArtworkTypeName,
  width?: number | null,
  height?: number | null,
): { width: number; height: number } {
  const want = normalizeSize(type, width, height).width
  const ladder = STATIC_WIDTHS[type]
  const w = ladder.find((x) => x >= want) ?? ladder[ladder.length - 1]!
  return normalizeSize(type, w)
}

/** Varlık kimliğini dosya adına çevirir: [A-Za-z0-9.-] dışındaki her UTF-8 bayt `_hh` olur (tersinir, çakışmasız). */
export function staticEntitySlug(entityId: string): string {
  let out = ''
  for (const ch of entityId) {
    if (/^[A-Za-z0-9.-]$/.test(ch)) out += ch
    else for (const b of new TextEncoder().encode(ch)) out += `_${b.toString(16).padStart(2, '0')}`
  }
  return out
}

/** Durağan görselin site yolu (göreli). Derleme betiği dosyayı `pages-assets/<bu yol>` altına yazar. */
export function staticArtworkPath(type: ArtworkTypeName, entityId: string, width: number, height: number): string {
  return `${STATIC_IMG_DIR}/${type.toLowerCase()}/${width}x${height}/${staticEntitySlug(entityId)}.webp`
}

/**
 * Durağan kipte bazı varlıklar önceden sayılabilir bir varlığa eşlenir (ör. `Profile:<guid>` → `Avatar:<anahtar>`,
 * günlük değişen `Airing:<id>` → videosu ya da program adı). Eşleyiciyi görsel eklentisi kaydeder; yoksa kimlik aynen kalır.
 */
export type StaticArtworkAlias = (entityId: string, type: ArtworkTypeName) => string
const staticAliases = new WeakMap<AppConfig, StaticArtworkAlias>()
export function setStaticArtworkAlias(config: AppConfig, fn: StaticArtworkAlias | null): void {
  if (fn) staticAliases.set(config, fn)
  else staticAliases.delete(config)
}

function buildStaticArtwork(
  config: AppConfig,
  type: ArtworkTypeName,
  entityId: string,
  params?: { width?: number | null; height?: number | null } | null,
): ArtworkDescriptor {
  const { width, height } = staticSize(type, params?.width, params?.height)
  let target = entityId
  try {
    target = staticAliases.get(config)?.(entityId, type) ?? entityId
  } catch {
    target = entityId
  }
  const url = staticArtworkPath(type, target, width, height)
  return { key: `${type}|${target}|${width}x${height}`, type, url, width, height }
}

export function buildArtwork(
  config: AppConfig,
  type: ArtworkTypeName,
  entityId: string,
  params?: { width?: number | null; height?: number | null; format?: string | null } | null,
): ArtworkDescriptor {
  if (config.staticHost) return buildStaticArtwork(config, type, entityId, params)
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
