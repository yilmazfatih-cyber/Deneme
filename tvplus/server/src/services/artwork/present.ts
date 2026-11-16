/**
 * Başlık görseli adresi (Falcor `videos[id].boxart|storyArt`, GraphQL `Video.artwork`, arama sonuçları): STORY_ART ve
 * BOXART için isteği yapan profile seçilen afiş çeşidi (services/artwork), diğer tiplerde ve bölüm/ek videolarda
 * varsayılan görsel. Başlığın elle verilmiş `boxart`'ı varsa BOXART kişiselleşmez.
 */
import { videoEntityId } from '../../../../shared/tctx'
import type { AppConfig } from '../../kernel/config'
import type { Passport } from '../../kernel/context'
import { buildArtwork, type ArtworkDescriptor, type ArtworkTypeName } from '../../kernel/imageUrls'
import type { Services } from '../../kernel/services'
import { artworkEntityId, isPersonalisable } from './ids'

export interface TitleArtworkContext {
  config: AppConfig
  services: Partial<Services>
  passport: Pick<Passport, 'profile'>
}
export type ArtworkParams = { width?: number | null; height?: number | null; format?: string | null } | null

/** Profile göre görsel çeşidinin varlık kimliği: 'Video:<id>' ya da 'Video:<id>~<anahtar>'. */
export function titleArtworkEntityId(ctx: TitleArtworkContext, type: ArtworkTypeName, videoId: number): string {
  const svc = ctx.services.artwork
  if (!svc || !svc.enabled() || (type !== 'STORY_ART' && type !== 'BOXART')) return videoEntityId(videoId)
  const title = ctx.services.catalog?.getTitle(videoId) ?? null
  if (!isPersonalisable(title, type)) return videoEntityId(videoId)
  const { key } = svc.pick(ctx.passport.profile?.guid ?? null, videoId)
  return artworkEntityId(videoId, key)
}

/** `buildArtwork` ile aynı sonuç; yalnız varlık kimliği profile seçilen çeşittir. */
export function titleArtwork(
  ctx: TitleArtworkContext,
  type: ArtworkTypeName,
  videoId: number,
  params?: ArtworkParams,
): ArtworkDescriptor {
  return buildArtwork(ctx.config, type, titleArtworkEntityId(ctx, type, videoId), params)
}
