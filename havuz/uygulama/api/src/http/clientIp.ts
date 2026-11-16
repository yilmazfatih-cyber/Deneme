/**
 * İsteği yapanın IP adresi (hız sınırı ve denetim günlüğü için).
 *
 * TRUST_PROXY = önümüzdeki GÜVENİLEN vekil sayısı (Render/Fly/nginx gibi). Her vekil X-Forwarded-For'un SONUNA
 * gördüğü adresi ekler; bu yüzden gerçek istemci, listenin sağından TRUST_PROXY'inci öğedir. Soldaki öğeler
 * istemcinin kendisinin yazabileceği (sahte olabilecek) değerlerdir ve kullanılmaz.
 *
 * Yanlış ayarın riski (docs/GUVENLIK.md): vekil yokken TRUST_PROXY>0 → saldırgan başlığı uydurup hız sınırını
 * atlatır; vekil varken TRUST_PROXY=0 → herkes vekilin IP'si sayılır, bir kişinin hatası herkesi kilitler.
 *
 * Genişletme: Cloudflare gibi özel başlık (CF-Connecting-IP) kullanan bir ortamda bu işleve dal eklenir.
 */
import type { Context } from 'hono'
import type { AppEnv } from './types.ts'

const IP_PATTERN = /^[0-9a-fA-F.:]{2,45}$/

function normalize(address: string | undefined): string | null {
  if (!address) return null
  const trimmed = address.trim().replace(/^::ffff:(?=\d+\.\d+\.\d+\.\d+$)/, '')
  return IP_PATTERN.test(trimmed) ? trimmed : null
}

export function clientIp(c: Context<AppEnv>, trustProxy: number): string {
  if (trustProxy > 0) {
    const forwarded = (c.req.header('x-forwarded-for') ?? '')
      .split(',')
      .map((item) => item.trim())
      .filter((item) => item !== '')
    if (forwarded.length > 0) {
      const index = Math.max(0, forwarded.length - trustProxy)
      const ip = normalize(forwarded[index])
      if (ip) return ip
    }
  }
  return normalize(c.env?.incoming?.socket?.remoteAddress) ?? 'unknown'
}
