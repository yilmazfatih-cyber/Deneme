/**
 * "Telefonla Kontrol Et" ekranının saf yardımcıları (testli: model.test.ts).
 *   phoneRemoteUrl     telefonun açacağı kumanda adresi (`<kök>/#/kumanda`)
 *   isLocalHostname    localhost / 127.x — telefondan erişilemez
 *   lanOriginOf        sunucunun giriş QR'ı için kurduğu doğrulama adresinden (yerel ağ adresi) kök
 *   remoteKeyOf        devbus "komut ←" olayından kumanda tuşu ve gönderen
 *   keyLabel           tuşun Türkçe adı
 */
import type { RemoteKey } from '../../../../shared/devices'
import type { DevEvent } from '../../lib/devbus'

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1', '0.0.0.0'])

export function isLocalHostname(hostname: string): boolean {
  return LOCAL_HOSTS.has(hostname) || hostname.endsWith('.localhost') || /^127\./.test(hostname)
}

/** `http://192.168.1.20:5200` → `http://192.168.1.20:5200/#/kumanda` */
export function phoneRemoteUrl(origin: string): string {
  return `${origin.replace(/\/+$/, '')}/#/kumanda`
}

/** Doğrulama adresinin kökü; çözülemezse ya da hâlâ yerelse null. */
export function lanOriginOf(verificationUrl: string): string | null {
  try {
    const u = new URL(verificationUrl)
    return isLocalHostname(u.hostname) ? null : u.origin
  } catch {
    return null
  }
}

export interface RemoteKeyEvent {
  key: RemoteKey
  from: string
  at: number
}

/** Bu cihaza telefondan gelen KEY komutu (cihaz istemcisi devbus'a "komut ← ‹ad›" yayınlar). */
export function remoteKeyOf(e: Pick<DevEvent, 'cat' | 'label' | 'detail' | 'at'>): RemoteKeyEvent | null {
  if (e.cat !== 'device' || !e.label.startsWith('komut ←')) return null
  const d = e.detail as { command?: { type?: string; key?: unknown }; from?: { name?: unknown } } | undefined
  if (d?.command?.type !== 'KEY' || typeof d.command.key !== 'string') return null
  return {
    key: d.command.key as RemoteKey,
    from: typeof d.from?.name === 'string' ? d.from.name : 'Telefon',
    at: e.at,
  }
}

const LABELS: Partial<Record<RemoteKey, string>> = {
  UP: 'Yukarı',
  DOWN: 'Aşağı',
  LEFT: 'Sol',
  RIGHT: 'Sağ',
  OK: 'Tamam',
  BACK: 'Geri',
  HOME: 'Ana Sayfa',
  SEARCH: 'Ara',
  GUIDE: 'Rehber',
  PLAY_PAUSE: 'Oynat / Duraklat',
  REWIND: 'Geri sar',
  FORWARD: 'İleri sar',
  CHANNEL_UP: 'Kanal +',
  CHANNEL_DOWN: 'Kanal −',
  VOLUME_UP: 'Ses +',
  VOLUME_DOWN: 'Ses −',
  MUTE: 'Sessiz',
  SUBTITLES: 'Altyazı',
}

export function keyLabel(key: RemoteKey): string {
  if (key.startsWith('DIGIT_')) return `Rakam ${key.slice(6)}`
  return LABELS[key] ?? key
}
