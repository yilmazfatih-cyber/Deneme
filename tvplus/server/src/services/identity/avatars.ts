/**
 * Profil avatarları. İki tür anahtar vardır:
 *   · `avatar-1`, `avatar-2` → web/public/brand altındaki hazır PNG dosyaları (tohum profilleri bunları kullanır)
 *   · `yuz-01` … `yuz-10`   → görsel servisinin vektörden ürettiği yüz karoları (`Avatar:yuz-NN` varlığı)
 * ProfileRecord.avatar alanında PNG için dosya adı (`avatar-1.png`), üretilen için anahtarın kendisi saklanır.
 */
import type { AvatarOption } from '../../../../shared/devices'
import type { AppConfig } from '../../kernel/config'
import type { ProfileRecord } from '../../kernel/context'
import { buildArtwork, type ArtworkDescriptor } from '../../kernel/imageUrls'

export const FILE_AVATARS = ['avatar-1', 'avatar-2'] as const
export const GENERATED_AVATARS = Array.from({ length: 10 }, (_, i) => `yuz-${String(i + 1).padStart(2, '0')}`)
export const AVATAR_KEYS: readonly string[] = [...FILE_AVATARS, ...GENERATED_AVATARS]
export const DEFAULT_AVATAR = 'avatar-1'
/** Avatar seçici ve profil yönetimi için görsel genişliği */
export const AVATAR_PICKER_WIDTH = 320

export const isAvatarKey = (key: string): boolean => AVATAR_KEYS.includes(key)
export const isGeneratedAvatar = (key: string): boolean => GENERATED_AVATARS.includes(key)

/** ProfileRecord.avatar → anahtar ('avatar-1.png' → 'avatar-1'); tanınmayan değer varsayılana düşer. */
export function avatarKeyOf(avatar: string | null | undefined): string {
  const key = (avatar ?? '').replace(/\.png$/i, '')
  return isAvatarKey(key) ? key : DEFAULT_AVATAR
}

/** Anahtar → ProfileRecord.avatar değeri */
export const avatarFieldOf = (key: string): string => (isGeneratedAvatar(key) ? key : `${key}.png`)

/** Görsel servisi kaynağı: PNG ise web/public'e göreli dosya, üretilense null (tohum `Avatar:<anahtar>`). */
export function avatarSourceOf(key: string): { localFile: string | null; seed: string } {
  return isGeneratedAvatar(key)
    ? { localFile: null, seed: `Avatar:${key}` }
    : { localFile: `brand/${avatarKeyOf(key)}.png`, seed: `Avatar:${avatarKeyOf(key)}` }
}

export function avatarOptions(config: AppConfig): AvatarOption[] {
  return AVATAR_KEYS.map((key) => ({
    key,
    url: buildArtwork(config, 'AVATAR', `Avatar:${key}`, { width: AVATAR_PICKER_WIDTH }).url,
  }))
}

/**
 * Profilin avatar görseli. Adres `Profile:<guid>` varlığıdır; avatar değişince tarayıcının değişmez önbelleği eski
 * görseli göstermesin diye anahtar `&v=` ile adrese eklenir (imza yalnız `r` parametresine bakar).
 */
export function profileAvatarArtwork(
  config: AppConfig,
  p: Pick<ProfileRecord, 'guid' | 'avatar'>,
  params?: { width?: number | null; height?: number | null; format?: string | null } | null,
): ArtworkDescriptor {
  // Durağan kipte (GitHub Pages) profil görseli doğrudan avatar anahtarının önceden üretilmiş dosyasıdır
  if (config.staticHost) return buildArtwork(config, 'AVATAR', `Avatar:${avatarKeyOf(p.avatar)}`, params)
  const a = buildArtwork(config, 'AVATAR', `Profile:${p.guid}`, params)
  return { ...a, url: `${a.url}&v=${avatarKeyOf(p.avatar)}` }
}
