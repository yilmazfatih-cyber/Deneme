/**
 * Yayın hedefi: sitenin tam adresi ve (varsa) alt klasörü. Ortam değişkenlerinden okunur, şemayla doğrulanır.
 * Kim kullanır: astro.config.ts (site/base), scripts/ altındaki denetim betikleri, testler (saf modül).
 *
 *   SITE_URL=https://www.ornek.com                      → kökte yayın
 *   SITE_URL=https://kullanici.github.io/depo-adi/      → alt klasör adresten çıkarılır
 *   SITE_URL=https://kullanici.github.io SITE_BASE=/depo-adi/  → aynı sonuç
 *
 * Genişletme: yeni bir yayın değişkeni gerekiyorsa şemaya ekleyin ve .env.example ile docs/YAYINLAMA.md'yi güncelleyin.
 */
import { z } from './zod-tr.ts'
import { normalizeBase } from './paths.ts'

export interface DeployTarget {
  /** Kök adres, sonda "/" olmadan: "https://www.ornek.com" */
  site: string
  /** Alt klasör, başta ve sonda "/" ile: "/" ya da "/depo-adi/" */
  base: string
}

const emptyToUndefined = (value: unknown) => (typeof value === 'string' && value.trim() === '' ? undefined : value)

const envSchema = z.object({
  SITE_URL: z.preprocess(
    emptyToUndefined,
    z
      .string()
      .trim()
      .regex(/^https?:\/\/[^\s/]+(\/[^\s?#]*)?$/u, {
        error: 'SITE_URL "https://www.ornek.com" gibi tam bir adres olmalı (http/https ile başlar, boşluk içermez).',
      })
      .optional(),
  ),
  SITE_BASE: z.preprocess(
    emptyToUndefined,
    z
      .string()
      .trim()
      .regex(/^\/?[A-Za-z0-9._~-]+(\/[A-Za-z0-9._~-]+)*\/?$|^\/$/u, {
        error: 'SITE_BASE "/depo-adi/" gibi bir klasör yolu olmalı (harf, rakam, tire; boşluk ve Türkçe harf olmaz).',
      })
      .optional(),
  ),
})

/**
 * Ortam değişkenlerini okuyup yayın hedefini verir. `fallbackUrl`, site.config.ts içindeki `url` değeridir.
 * Hatalı değer anlaşılır bir Türkçe iletiyle durdurur.
 */
export function resolveDeployTarget(env: Record<string, string | undefined>, fallbackUrl: string): DeployTarget {
  const parsed = envSchema.safeParse({ SITE_URL: env.SITE_URL, SITE_BASE: env.SITE_BASE })
  if (!parsed.success) {
    const lines = parsed.error.issues.map((issue) => `  - ${issue.message}`)
    throw new Error(`Yayın ayarı hatalı (ortam değişkenleri):\n${lines.join('\n')}\nAyrıntı: docs/YAYINLAMA.md`)
  }
  const url = new URL(parsed.data.SITE_URL ?? fallbackUrl)
  const baseFromUrl = url.pathname
  const base = normalizeBase(parsed.data.SITE_BASE ?? baseFromUrl)
  return { site: url.origin, base }
}
