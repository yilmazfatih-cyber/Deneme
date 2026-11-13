/**
 * Yetki servisi: her oynatılabilir öğeye ve kanala `access` kararı (netflix_patterns §2.5).
 * İçerik gizlenmez; karar kartta tek satır gerekçe + eylem olarak gösterilir.
 * Sıra: paket (UPSELL) → profil uygunluğu (BLOCKED) → yayın penceresi (OUT_OF_WINDOW) → kaynak (BLOCKED) → PLAYABLE.
 */
import { PRODUCTS, type ProductKey } from '../../../../shared/taxonomy'
import type { Passport } from '../../kernel/context'
import type { AccessDecision, EntitlementService, Services } from '../../kernel/services'
import { parseLocalDate } from '../epg/time'

export const productName = (key: string): string => (key in PRODUCTS ? PRODUCTS[key as ProductKey].name : key)

const decision = (
  state: AccessDecision['state'],
  reasonText: string | null,
  requiredProduct: string | null = null,
  cta: string | null = null,
): AccessDecision => ({
  state,
  reasonText,
  requiredProduct,
  requiredProductName: requiredProduct ? productName(requiredProduct) : null,
  cta,
})

export const TEXT = {
  upsell: (name: string) => `${name} ile izlenir`,
  upsellCta: 'Paketi incele',
  blockedProfile: 'Bu profil için uygun değil',
  outOfWindow: 'Yayından kalktı',
  noSource: 'Şu an izlenemiyor',
  notFound: 'Bulunamadı',
} as const

export function createEntitlementService(services: () => Partial<Services>): EntitlementService {
  const now = () => services().epg?.now() ?? new Date()
  const owns = (p: Passport, product: string) => p.account?.products.includes(product) ?? false

  return {
    accessForVideo(passport: Passport, videoId: number): AccessDecision {
      const catalog = services().catalog
      const vi = catalog?.videoInfo(videoId)
      if (!catalog || !vi) return decision('BLOCKED', TEXT.notFound)
      const t = vi.title
      const product = t.availability.requiredProduct
      if (product && !owns(passport, product))
        return decision('UPSELL', TEXT.upsell(productName(product)), product, TEXT.upsellCta)
      if (!catalog.isVisibleTo(passport.profile, t.videoId)) return decision('BLOCKED', TEXT.blockedProfile, product)
      const leaving = parseLocalDate(t.availability.leavingAt)
      if (leaving && leaving.getTime() <= now().getTime()) return decision('OUT_OF_WINDOW', TEXT.outOfWindow, product)
      const leaves = vi.kind === 'SHOW' ? catalog.listPlayables(t.videoId) : [catalog.getPlayable(videoId)]
      if (!leaves.some((p) => p && p.sources.length > 0)) return decision('BLOCKED', TEXT.noSource, product)
      return decision('PLAYABLE', null, product)
    },

    accessForChannel(passport: Passport, channelId: number): AccessDecision {
      const ch = services().catalog?.getChannel(channelId)
      if (!ch) return decision('BLOCKED', TEXT.notFound)
      const product = ch.requiredProduct
      if (product && !owns(passport, product))
        return decision('UPSELL', TEXT.upsell(productName(product)), product, TEXT.upsellCta)
      if (passport.profile?.isKids && !ch.kids) return decision('BLOCKED', TEXT.blockedProfile, product)
      return decision('PLAYABLE', null, product)
    },
  }
}
