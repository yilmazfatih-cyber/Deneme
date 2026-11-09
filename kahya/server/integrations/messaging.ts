// Giden mesaj sağlayıcıları. Yapılandırılmamış kanal "kayıt" sağlayıcısına düşer: mesaj veritabanına ve
// sunucu günlüğüne yazılır ama dışarı gönderilmez (demo ve geliştirme için).
//
// WhatsApp Cloud API: POST graph.facebook.com/{sürüm}/{phone_number_id}/messages. Sakinin son mesajından sonraki
// 24 saat içinde serbest metin, dışında yalnız Meta'da onaylı şablon gönderilebilir (hata 131047).
// Netgsm: REST v2 (POST api.netgsm.com.tr/sms/rest/v2/send, Basic auth). iysfilter "0" = bilgilendirme iletisi.
// E-posta: Resend HTTP API.
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto'
import type { Channel } from '../../shared/labels.ts'
import type { Config } from '../config.ts'

export type SendInput = { to: string; body: string; subject?: string; inSessionWindow?: boolean }
export type SendResult = { ok: boolean; provider: string; providerId?: string; error?: string }

export interface ChannelProvider {
  readonly name: string
  readonly live: boolean
  send(input: SendInput): Promise<SendResult>
}

type Fetch = typeof fetch
type Log = (line: string) => void

class LogProvider implements ChannelProvider {
  readonly live = false
  readonly name: string
  private log: Log
  constructor(name: string, log: Log) {
    this.name = name
    this.log = log
  }
  async send(input: SendInput): Promise<SendResult> {
    this.log(`[${this.name}] → ${input.to}: ${input.body.replace(/\s+/g, ' ').slice(0, 160)}`)
    return { ok: true, provider: this.name, providerId: `kayit-${randomUUID()}` }
  }
}

/** WhatsApp şablon parametresi satır sonu, sekme ve 4'ten fazla ardışık boşluk içeremez. */
export const templateSafe = (s: string) =>
  s
    .replace(/[\r\n\t]+/g, ' · ')
    .replace(/ {4,}/g, ' ')
    .trim()
    .slice(0, 1000)

class WhatsAppCloudProvider implements ChannelProvider {
  readonly name = 'whatsapp-cloud'
  readonly live = true
  private cfg: Config['whatsapp']
  private fetchImpl: Fetch
  private template: { name: string; lang: string }
  constructor(cfg: Config['whatsapp'], fetchImpl: Fetch, template: { name: string; lang: string }) {
    this.cfg = cfg
    this.fetchImpl = fetchImpl
    this.template = template
  }
  async send({ to, body, inSessionWindow }: SendInput): Promise<SendResult> {
    const recipient = to.replace(/^\+/, '')
    const payload = inSessionWindow
      ? {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: recipient,
          type: 'text',
          text: { preview_url: false, body: body.slice(0, 4096) },
        }
      : {
          messaging_product: 'whatsapp',
          to: recipient,
          type: 'template',
          template: {
            name: this.template.name,
            language: { code: this.template.lang },
            components: [{ type: 'body', parameters: [{ type: 'text', text: templateSafe(body) }] }],
          },
        }
    try {
      const res = await this.fetchImpl(
        `https://graph.facebook.com/${this.cfg.apiVersion}/${this.cfg.phoneNumberId}/messages`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${this.cfg.token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        },
      )
      const data = (await res.json().catch(() => ({}))) as {
        messages?: { id: string }[]
        error?: { message?: string; code?: number }
      }
      if (!res.ok) {
        const code = data.error?.code
        const hint = code === 131047 ? ' (24 saat penceresi dışında: onaylı şablon gerekir)' : ''
        return { ok: false, provider: this.name, error: `${data.error?.message ?? `HTTP ${res.status}`}${hint}` }
      }
      return { ok: true, provider: this.name, providerId: data.messages?.[0]?.id }
    } catch (e) {
      return { ok: false, provider: this.name, error: (e as Error).message }
    }
  }
}

export const NETGSM_ERRORS: Record<string, string> = {
  '20': 'Mesaj metni hatalı veya çok uzun',
  '30': 'Kullanıcı adı / şifre hatalı, API yetkisi ya da IP izni yok',
  '40': 'Mesaj başlığı (gönderici adı) tanımlı değil',
  '50': 'Hesap İYS kontrollü gönderim yapamıyor',
  '51': 'Hesapta İYS marka bilgisi yok',
  '70': 'Hatalı veya eksik parametre',
  '80': 'Gönderim hız sınırı aşıldı',
  '85': 'Aynı numaraya 1 dakikada 20’den fazla gönderim',
  '100': 'Netgsm sistem hatası',
  '101': 'Netgsm sistem hatası',
}

class NetgsmProvider implements ChannelProvider {
  readonly name = 'netgsm'
  readonly live = true
  private cfg: Config['netgsm']
  private fetchImpl: Fetch
  constructor(cfg: Config['netgsm'], fetchImpl: Fetch) {
    this.cfg = cfg
    this.fetchImpl = fetchImpl
  }
  async send({ to, body }: SendInput): Promise<SendResult> {
    const no = to.replace(/^\+90/, '')
    const auth = Buffer.from(`${this.cfg.usercode}:${this.cfg.password}`).toString('base64')
    try {
      const res = await this.fetchImpl('https://api.netgsm.com.tr/sms/rest/v2/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Basic ${auth}` },
        body: JSON.stringify({
          msgheader: this.cfg.header,
          encoding: 'TR',
          iysfilter: '0',
          appname: this.cfg.appName ?? 'kahya',
          messages: [{ msg: body, no }],
        }),
      })
      const data = (await res.json().catch(() => null)) as {
        code?: string
        jobid?: string
        description?: string
      } | null
      const code = String(data?.code ?? '')
      if (['00', '01', '02'].includes(code)) return { ok: true, provider: this.name, providerId: data?.jobid }
      return {
        ok: false,
        provider: this.name,
        error: `Netgsm ${code || `HTTP ${res.status}`}: ${NETGSM_ERRORS[code] ?? data?.description ?? 'bilinmeyen hata'}`,
      }
    } catch (e) {
      return { ok: false, provider: this.name, error: (e as Error).message }
    }
  }
}

class ResendEmailProvider implements ChannelProvider {
  readonly name = 'resend'
  readonly live = true
  private cfg: Config['email']
  private fetchImpl: Fetch
  constructor(cfg: Config['email'], fetchImpl: Fetch) {
    this.cfg = cfg
    this.fetchImpl = fetchImpl
  }
  async send({ to, body, subject }: SendInput): Promise<SendResult> {
    try {
      const res = await this.fetchImpl('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.cfg.resendApiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: this.cfg.from,
          to: [to],
          subject: subject ?? 'Site yönetiminden bilgilendirme',
          text: body,
        }),
      })
      const data = (await res.json().catch(() => ({}))) as { id?: string; message?: string }
      return res.ok
        ? { ok: true, provider: this.name, providerId: data.id }
        : { ok: false, provider: this.name, error: data.message ?? `HTTP ${res.status}` }
    } catch (e) {
      return { ok: false, provider: this.name, error: (e as Error).message }
    }
  }
}

export class Messaging {
  readonly whatsapp: ChannelProvider
  readonly sms: ChannelProvider
  readonly email: ChannelProvider

  constructor(
    config: Config,
    opts: { fetch?: Fetch; log?: Log; whatsappTemplate?: { name: string; lang: string } } = {},
  ) {
    const f = opts.fetch ?? fetch
    const log = opts.log ?? ((line: string) => console.info(line))
    const w = config.whatsapp
    this.whatsapp =
      w.token && w.phoneNumberId
        ? new WhatsAppCloudProvider(
            w,
            f,
            opts.whatsappTemplate ?? {
              name: process.env.WHATSAPP_TEMPLATE_NAME || 'kahya_bilgilendirme',
              lang: process.env.WHATSAPP_TEMPLATE_LANG || 'tr',
            },
          )
        : new LogProvider('whatsapp-kayit', log)
    const n = config.netgsm
    this.sms = n.usercode && n.password && n.header ? new NetgsmProvider(n, f) : new LogProvider('sms-kayit', log)
    const e = config.email
    this.email = e.resendApiKey && e.from ? new ResendEmailProvider(e, f) : new LogProvider('eposta-kayit', log)
  }

  provider(channel: Channel): ChannelProvider | null {
    if (channel === 'whatsapp') return this.whatsapp
    if (channel === 'sms') return this.sms
    if (channel === 'email') return this.email
    return null
  }

  status() {
    return {
      whatsapp: { provider: this.whatsapp.name, live: this.whatsapp.live },
      sms: { provider: this.sms.name, live: this.sms.live },
      email: { provider: this.email.name, live: this.email.live },
    }
  }
}

/** Meta X-Hub-Signature-256: "sha256=" + HMAC-SHA256(ham gövde, uygulama gizli anahtarı) (küçük harf hex). */
export function verifyMetaSignature(rawBody: string, header: string | undefined, appSecret: string): boolean {
  if (!header) return false
  const expected = `sha256=${createHmac('sha256', appSecret).update(rawBody, 'utf8').digest('hex')}`
  return header.length === expected.length && timingSafeEqual(Buffer.from(header), Buffer.from(expected))
}
