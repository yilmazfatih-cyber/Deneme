// Dış sistemlerden gelen çağrılar (oturum yok; imza / gizli anahtarla doğrulanır).
// - WhatsApp Cloud API: GET doğrulama (hub.challenge), POST mesajlar (X-Hub-Signature-256)
// - SMS ve e-posta: genel JSON webhook (X-Kahya-Secret)
// - PayTR ödeme bildirimi: hash doğrulama, idempotent işleme, düz metin "OK"
import { timingSafeEqual } from 'node:crypto'
import { Hono } from 'hono'
import { z } from 'zod'
import { background } from '../background.ts'
import { verifyMetaSignature } from '../integrations/messaging.ts'
import { fail, type Deps, type Env } from '../http.ts'
import { receiveInbound } from '../services/inbox.ts'
import { completeIntent } from '../services/online.ts'

type WaPayload = {
  entry?: {
    changes?: {
      value?: {
        messages?: {
          from?: string
          user_id?: string
          id: string
          type: string
          text?: { body: string }
          button?: { text: string }
          interactive?: { button_reply?: { title: string }; list_reply?: { title: string } }
        }[]
        contacts?: { wa_id?: string; profile?: { name?: string } }[]
      }
    }[]
  }[]
}

const safeEqual = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b))

export function webhookRoutes(deps: Deps) {
  const r = new Hono<Env>()

  r.get('/whatsapp', (c) => {
    const mode = c.req.query('hub.mode')
    const token = c.req.query('hub.verify_token')
    const challenge = c.req.query('hub.challenge')
    const expected = deps.config.whatsapp.verifyToken
    if (mode === 'subscribe' && expected && token && safeEqual(token, expected) && challenge) return c.text(challenge)
    return c.text('Doğrulanamadı', 403)
  })

  r.post('/whatsapp', async (c) => {
    const raw = await c.req.text()
    const secret = deps.config.whatsapp.appSecret
    if (secret) {
      if (!verifyMetaSignature(raw, c.req.header('x-hub-signature-256'), secret)) return c.text('İmza geçersiz', 401)
    } else if (!deps.config.demo) {
      return c.text('WHATSAPP_APP_SECRET tanımlı değil', 503)
    }
    let payload: WaPayload
    try {
      payload = JSON.parse(raw) as WaPayload
    } catch {
      return c.text('Geçersiz JSON', 400)
    }
    let accepted = 0
    for (const entry of payload.entry ?? []) {
      for (const change of entry.changes ?? []) {
        const value = change.value
        for (const m of value?.messages ?? []) {
          const text =
            m.text?.body ??
            m.button?.text ??
            m.interactive?.button_reply?.title ??
            m.interactive?.list_reply?.title ??
            null
          const from = m.from ?? value?.contacts?.[0]?.wa_id
          if (!from) continue
          const bodyText =
            text ?? `[${m.type} türünde mesaj — metin dışı içerik WhatsApp Business panelinden görüntülenmeli]`
          accepted++
          background(
            () =>
              receiveInbound(deps, {
                channel: 'whatsapp',
                from: `+${from.replace(/^\+/, '')}`,
                body: bodyText,
                provider: 'whatsapp',
                providerId: m.id,
              }),
            `whatsapp ${m.id}`,
          )
        }
      }
    }
    return c.json({ ok: true, accepted })
  })

  const checkSecret = (header: string | undefined) => {
    const secret = deps.config.webhookSecret
    if (!secret) fail(404, 'Webhook kapalı (KAHYA_WEBHOOK_SECRET tanımlı değil)')
    if (!header || !safeEqual(header, secret)) fail(401, 'Gizli anahtar geçersiz')
  }

  const Inbound = z.object({
    from: z.string().min(3).max(200),
    text: z.string().min(1).max(10_000),
    subject: z.string().max(300).nullable().optional(),
    id: z.string().max(200).nullable().optional(),
  })

  r.post('/sms', async (c) => {
    checkSecret(c.req.header('x-kahya-secret'))
    const p = Inbound.parse(await c.req.json())
    const out = await receiveInbound(deps, {
      channel: 'sms',
      from: p.from,
      body: p.text,
      provider: 'sms-webhook',
      providerId: p.id ?? null,
    })
    return c.json({ ok: true, messageId: out.messageId, duplicate: out.duplicate })
  })

  r.post('/email', async (c) => {
    checkSecret(c.req.header('x-kahya-secret'))
    const p = Inbound.parse(await c.req.json())
    const email = /<([^>]+)>/.exec(p.from)?.[1] ?? p.from
    const out = await receiveInbound(deps, {
      channel: 'email',
      from: email,
      body: p.text,
      subject: p.subject,
      provider: 'email-webhook',
      providerId: p.id ?? null,
    })
    return c.json({ ok: true, messageId: out.messageId, duplicate: out.duplicate })
  })

  r.post('/paytr', async (c) => {
    const paytr = deps.payments.paytr
    if (!paytr) return c.text('PayTR yapılandırılmamış', 404)
    const form = Object.fromEntries(new URLSearchParams(await c.req.text())) as Record<string, string>
    if (!paytr.verifyCallback(form)) return c.text('PAYTR notification failed: bad hash', 400)
    if (form.test_mode === '1' && !deps.config.paytr.testMode) return c.text('OK') // canlı modda test bildirimi işlenmez
    completeIntent(deps.db, form.merchant_oid!, form.status === 'success', deps.now(), form.failed_reason_msg)
    return c.text('OK')
  })

  return r
}
