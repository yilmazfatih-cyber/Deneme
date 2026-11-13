/**
 * TV girişindeki doğrulama adresinin kökü. Telefon QR'ı okuyup bu adresi açacağı için kök, telefondan erişilebilir
 * olmalıdır: istek localhost'tan geldiyse makinenin yerel ağ (IPv4) adresi aynı kapıyla kullanılır.
 * `TVP_PUBLIC_ORIGIN` ortam değişkeni her şeyin önüne geçer.
 */
import { networkInterfaces } from 'node:os'
import type { FastifyRequest } from 'fastify'

export type AddressResolver = () => string | null

/** Makinenin iç olmayan ilk IPv4 adresi (Wi-Fi / Ethernet); yoksa null. */
export function firstLanIPv4(): string | null {
  const ifaces = networkInterfaces()
  for (const list of Object.values(ifaces)) {
    for (const a of list ?? []) {
      // Eski Node sürümlerinde aile sayı (4) olarak gelir.
      const family = String(a.family)
      if ((family === 'IPv4' || family === '4') && !a.internal) return a.address
    }
  }
  return null
}

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1', '0.0.0.0'])

export function isLocalHostname(hostname: string): boolean {
  return LOCAL_HOSTS.has(hostname) || hostname.endsWith('.localhost') || /^127\./.test(hostname)
}

/** İsteğin kendi kökü (x-forwarded-proto/host'a uyar; trustProxy açık), localhost ise ağ adresiyle değiştirilmiş. */
export function publicOrigin(req: FastifyRequest, resolveLan: AddressResolver): string {
  const env = process.env.TVP_PUBLIC_ORIGIN?.trim()
  if (env) {
    try {
      return new URL(env).origin
    } catch {
      /* geçersiz değer yok sayılır */
    }
  }
  const proto = req.protocol === 'https' ? 'https' : 'http'
  const host = req.host || 'localhost'
  let url: URL
  try {
    url = new URL(`${proto}://${host}`)
  } catch {
    return `${proto}://localhost`
  }
  if (isLocalHostname(url.hostname)) {
    const ip = resolveLan()
    if (ip) url.hostname = ip
  }
  return url.origin
}
