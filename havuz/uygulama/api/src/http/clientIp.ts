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
 * Hız sınırı IP'nin kendisiyle değil `rateLimitKey(ip)` ile sayar: IPv6'da bütün /64 bloğu tek kaynaktır.
 *
 * Genişletme: Cloudflare gibi özel başlık (CF-Connecting-IP) kullanan bir ortamda bu işleve dal eklenir.
 */
import { isIPv6 } from 'node:net'
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

/** IPv6 adresini 8 gruba açar ("2001:DB8::1" → ["2001","db8","0",…,"1"]); gömülü IPv4 (a.b.c.d) iki grup sayılır. */
function ipv6Groups(ip: string): string[] {
  const [head, tail] = ip.toLowerCase().split('::')
  const parts = (text: string | undefined) => (text ? text.split(':') : [])
  const width = (groups: string[]) => groups.reduce((sum, group) => sum + (group.includes('.') ? 2 : 1), 0)
  const headGroups = parts(head)
  const tailGroups = parts(tail)
  const zeros = tail === undefined ? 0 : 8 - width(headGroups) - width(tailGroups)
  return [...headGroups, ...Array<string>(zeros).fill('0'), ...tailGroups].map((group) =>
    group.includes('.') ? group : Number.parseInt(group, 16).toString(16),
  )
}

/**
 * Hız sınırı anahtarı: IPv4 adresi olduğu gibi; IPv6 adresinin ilk 64 biti (`2001:db8:aa:bb::/64`).
 * Neden: bir ev aboneliği ya da kiralık sunucu genellikle bütün bir /64 bloğu alır; adrese göre saymak, blok
 * içinde adres değiştirerek (2^64 seçenek) bütün IP sınırlarını atlatmaya izin verirdi. İçinde IPv4 adresi
 * taşıyan biçimler (::ffff:a.b.c.d, NAT64, Teredo) toplanmaz: yoksa ilgisiz herkes tek kovaya düşerdi.
 * Günlüğe ve denetim kaydına tam adres yazılır; bu anahtar yalnız sayaç içindir.
 */
export function rateLimitKey(ip: string): string {
  if (!isIPv6(ip)) return ip
  const prefix = ipv6Groups(ip).slice(0, 4)
  const embedsIpv4 =
    prefix.every((group) => group === '0') ||
    (prefix[0] === '64' && prefix[1] === 'ff9b') ||
    (prefix[0] === '2001' && prefix[1] === '0')
  return embedsIpv4 ? ip.toLowerCase() : `${prefix.join(':')}::/64`
}
