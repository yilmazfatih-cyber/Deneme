// Aşama 2 — Kanal eklentileri: CLI ve HTTP webhook ile konuşan "sahte sohbet uygulaması".
//
// Gerçek karşılığı: extensions/<telegram|discord|slack|whatsapp|…>/ (her kanal bir eklenti, kimliği
// openclaw.plugin.json'da), src/channels/ (ortak kanal sözleşmesi), docs/channels/index.md.
// Gerçek Telegram eklentisi grammY ile Bot API'ye bağlanır; hem uzun yoklama (polling-lease.ts) hem webhook
// (webhook-route.ts) kipi vardır. Webhook kipinde Telegram her güncellemeyi Gateway'e POST eder (Bot API,
// webhook'u gizli bir başlıkla doğrulamaya izin verir), cevaplar Bot API'ye POST edilir.
// Burada aynı şekli yerel, ağsız (127.0.0.1) bir sahte uygulamayla kuruyoruz.
//
// Kanal sözleşmesi:  { id, start(ctx), send({ to, text }) }
//   ctx.onInbound(zarf)        → Gateway'e normalize edilmiş gelen mesaj
//   ctx.registerHttpRoute(...) → Gateway'in HTTP sunucusuna rota ekle (webhook için)
// Zarf (envelope): { channel, accountId, peerKind: 'direct'|'group', peerId, senderId, senderName, text, wasMentioned }

import { timingSafeEqual } from 'node:crypto'
import { createServer } from 'node:http'

/** HTTP gövdesini JSON olarak oku (boyut sınırıyla: sınırsız gövde bellek saldırısıdır). */
export function readJsonBody(req, limit = 64 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > limit) {
        reject(new Error('gövde çok büyük'))
        req.destroy()
      } else chunks.push(chunk)
    })
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'))
      } catch {
        reject(new Error('geçersiz JSON'))
      }
    })
    req.on('error', reject)
  })
}

export function sendJson(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(body))
}

/** Bellek içi CLI kanalı: yerel kullanıcı daima "sahip"tir (gerçekte de yerel CLI/TUI güvenilir istemcidir). */
export function createCliChannel() {
  /** @type {any} */
  let ctx = null
  const outbox = []
  return {
    id: 'cli',
    outbox,
    start(context) {
      ctx = context
    },
    /** @param {string} text */
    say(text) {
      return ctx.onInbound({
        channel: 'cli',
        accountId: 'default',
        peerKind: 'direct',
        peerId: 'local',
        senderId: 'owner',
        senderName: 'Sahip',
        text,
        wasMentioned: true,
      })
    },
    async send({ to, text }) {
      outbox.push({ to, text })
      return { ok: true }
    },
  }
}

/**
 * Sahte sohbet uygulamasına bağlanan kanal. Gelen: webhook (gizli başlık doğrulanır). Giden: uygulamanın API'si.
 * @param {{apiBaseUrl: string, webhookSecret: string, botUsername?: string}} options
 */
export function createFakeChatChannel({ apiBaseUrl, webhookSecret, botUsername = 'claw' }) {
  const expected = Buffer.from(webhookSecret)
  return {
    id: 'fakechat',
    start(ctx) {
      ctx.registerHttpRoute('POST', '/channels/fakechat/webhook', async (req, res) => {
        const given = Buffer.from(String(req.headers['x-fakechat-secret'] ?? ''))
        if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
          return sendJson(res, 401, { ok: false, error: 'imza geçersiz' })
        }
        const update = await readJsonBody(req)
        const msg = update.message
        if (!msg?.chat?.id || !msg?.from?.id || typeof msg.text !== 'string') {
          return sendJson(res, 400, { ok: false, error: 'beklenmeyen güncelleme' })
        }
        sendJson(res, 200, { ok: true }) // önce hızlıca onayla; ajan cevabı ayrıca gönderilir
        await ctx.onInbound({
          channel: 'fakechat',
          accountId: 'default',
          peerKind: msg.chat.type === 'group' ? 'group' : 'direct',
          peerId: String(msg.chat.id),
          senderId: String(msg.from.id),
          senderName: msg.from.name ?? '',
          text: msg.text,
          wasMentioned: msg.text.includes(`@${botUsername}`),
        })
      })
    },
    async send({ to, text }) {
      const res = await fetch(`${apiBaseUrl}/sendMessage`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ chat_id: to, text }),
      })
      return { ok: res.ok }
    },
  }
}

/**
 * Yerel "sohbet platformu" (Telegram benzeri). Testlerde ve demoda kullanıcıyı taklit eder.
 * @param {{webhookUrl?: string, secret: string}} options webhookUrl sonradan da atanabilir
 */
export async function startFakeChatApp({ webhookUrl, secret }) {
  const outbox = [] // botun kullanıcılara gönderdikleri
  const waiters = []
  const server = createServer(async (req, res) => {
    if (req.method === 'POST' && req.url === '/sendMessage') {
      const body = await readJsonBody(req)
      outbox.push({ chatId: String(body.chat_id), text: body.text })
      waiters.splice(0).forEach((resolve) => resolve())
      return sendJson(res, 200, { ok: true })
    }
    sendJson(res, 404, { ok: false })
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const app = {
    url: `http://127.0.0.1:${server.address().port}`,
    webhookUrl,
    outbox,
    /** Kullanıcı bir mesaj yazar → platform webhook'u Gateway'e POST eder. */
    async userSays({ chatId, fromId, text, chatType = 'private', fromName = '', useSecret = secret }) {
      const res = await fetch(app.webhookUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-fakechat-secret': useSecret },
        body: JSON.stringify({
          message: { chat: { id: chatId, type: chatType }, from: { id: fromId, name: fromName }, text },
        }),
      })
      return res.status
    },
    /** Bot belirtilen sayıda mesaj gönderene kadar bekle (zaman aşımıyla). */
    async waitForMessages(count, timeoutMs = 2000) {
      const deadline = Date.now() + timeoutMs
      while (outbox.length < count) {
        if (Date.now() > deadline) throw new Error(`bekleme zaman aşımı: ${outbox.length}/${count}`)
        await new Promise((resolve) => {
          waiters.push(resolve)
          setTimeout(resolve, 50)
        })
      }
      return outbox
    },
    close: () => new Promise((resolve) => server.close(resolve)),
  }
  return app
}
