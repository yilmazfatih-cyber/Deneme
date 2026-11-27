// İmzası doğrulanmış işlemin yük denetimi (alan adları: Apple "JWSTransactionDecodedPayload").

import type { Ayarlar } from './ayarlar'

export type Ortam = 'Production' | 'Sandbox'

export interface Abonelik {
  /** `originalTransactionId`: aboneliğin yenilemeler boyunca değişmeyen kimliği. Hiçbir kayda ya da yanıta yazılmaz. */
  asilIslemKimligi: string
  /** `expiresDate` (ms): bu işlemin kapsadığı abonelik döneminin bittiği an. Production'da bütçe dönemini belirler. */
  bitisMs: number
  ortam: Ortam
}

const ABONELIK_TURU = 'Auto-Renewable Subscription'
/** `expiresDate` için hoş görülen saat kayması. */
const SAAT_KAYMASI_MS = 60_000
const KIMLIK_EN_UZUN = 64

/**
 * Yük geçerli, süresi dolmamış, iptal edilmemiş doğru aboneliği gösteriyorsa aboneliği, yoksa `null` döndürür.
 * Hangi koşulun tutmadığı bilerek bildirilmez.
 */
export function yukuDenetle(yuk: Record<string, unknown>, ayarlar: Ayarlar, simdi: number): Abonelik | null {
  if (yuk.bundleId !== ayarlar.paketKimligi) return null
  if (yuk.productId !== ayarlar.urunKimligi) return null
  if (yuk.type !== ABONELIK_TURU) return null

  const bitis = yuk.expiresDate
  if (typeof bitis !== 'number' || !Number.isFinite(bitis) || bitis + SAAT_KAYMASI_MS <= simdi) return null

  // İade edilen ya da Aile Paylaşımı'ndan geri alınan işlemde `revocationDate` bulunur.
  if (yuk.revocationDate !== undefined && yuk.revocationDate !== null) return null

  const ortam = yuk.environment
  if (ortam !== 'Production' && !(ortam === 'Sandbox' && ayarlar.sandboxIzinli)) return null

  const kimlik = yuk.originalTransactionId
  if (typeof kimlik !== 'string' || kimlik.length === 0 || kimlik.length > KIMLIK_EN_UZUN) return null

  return { asilIslemKimligi: kimlik, bitisMs: bitis, ortam }
}
