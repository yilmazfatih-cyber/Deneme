/** Çözümleyici yardımcıları: yetki kapıları, saat, istek önbelleği, tarih dönüşümleri. */
import { GraphQLError } from 'graphql'
import type { GqlContext, ProfileRecord } from '../../kernel/context'
import type { AccessDecision } from '../../kernel/services'
import { memo } from '../../services/discovery/memo'
import { top10ForProfile } from '../../services/discovery/top10'

export const gqlError = (message: string, code: string) => new GraphQLError(message, { extensions: { code } })

/** Üyelik ister (anonimde UNAUTHENTICATED) */
export function requireMember(ctx: GqlContext): void {
  if (!ctx.passport.account) throw gqlError('Bu işlem için oturum açmalısın', 'UNAUTHENTICATED')
}
/** Profil ister (seçilmemişse PROFILE_REQUIRED) */
export function requireProfile(ctx: GqlContext): ProfileRecord {
  requireMember(ctx)
  const p = ctx.passport.profile
  if (!p) throw gqlError('Önce bir profil seç', 'PROFILE_REQUIRED')
  return p
}

export const guidOf = (ctx: GqlContext): string | null => ctx.passport.profile?.guid ?? null
export const nowOf = (ctx: GqlContext): Date => memo(ctx.cache, 'now', () => ctx.services.epg?.now() ?? new Date())

export function isGqlContext(x: unknown): x is GqlContext {
  return typeof x === 'object' && x !== null && 'services' in x && 'passport' in x
}
/** __resolveType çağrı biçimi motora göre değişebilir: bağlamı argümanlar arasında bul */
export function findContext(...args: unknown[]): GqlContext | null {
  return (args.find(isGqlContext) as GqlContext | undefined) ?? null
}

export function toDate(v: unknown): Date | null {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v
  if (typeof v === 'string' || typeof v === 'number') {
    const d = new Date(v)
    return Number.isNaN(d.getTime()) ? null : d
  }
  return null
}
export const iso = (v: Date | string): string => (v instanceof Date ? v.toISOString() : new Date(v).toISOString())

export function accessForVideo(ctx: GqlContext, videoId: number): AccessDecision {
  return memo(ctx.cache, `access:v:${videoId}`, () => ctx.services.entitlement.accessForVideo(ctx.passport, videoId))
}
export function accessForChannel(ctx: GqlContext, channelId: number): AccessDecision {
  return memo(ctx.cache, `access:c:${channelId}`, () =>
    ctx.services.entitlement.accessForChannel(ctx.passport, channelId),
  )
}
export function top10List(ctx: GqlContext): number[] {
  return memo(ctx.cache, 'top10', () => top10ForProfile(ctx.services, ctx.passport.profile, nowOf(ctx)))
}

/** Profil bu başlığı görebilir mi (bölüm/ek video üst başlığa göre) */
export const visible = (ctx: GqlContext, videoId: number): boolean =>
  ctx.services.catalog.isVisibleTo(ctx.passport.profile, videoId)
/** Görünür olanlardan başvuru listesi (üst nesne kuralı) */
export const videoRefs = (ctx: GqlContext, ids: number[]): { videoId: number }[] =>
  ids.filter((id) => ctx.services.catalog.videoInfo(id) && visible(ctx, id)).map((videoId) => ({ videoId }))

export function intArg(v: unknown): number | null {
  return typeof v === 'number' && Number.isInteger(v) ? v : null
}
