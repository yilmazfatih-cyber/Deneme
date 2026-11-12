// Aşama 7 — İstemci/sunucu ayrımı (HTTP + SSE)
//
// opencode'da ajan bir arka plan sunucusunda çalışır; TUI, web, masaüstü, ACP ve SDK aynı HTTP API'nin
// istemcisidir (VS Code eklentisi ise TUI'yi VS Code terminalinde açan ince bir başlatıcıdır).
// API packages/protocol/src/groups/*.ts'de Effect HttpApi grupları olarak tanımlı
// (ör. POST /api/session/:id/prompt), canlı olaylar GET /api/event akışından gelir. İstemci kodu bu
// HttpApi sözleşmesinden kod üretimiyle çıkar (packages/client/script/generate.ts,
// @opencode/httpapi-codegen); packages/protocol/openapi.json aynı sözleşmeden ayrıca üretilir.
// İzin soruları da olay olarak yayınlanır; istemci yanıtı ayrı bir uç noktaya gönderir.
// Buradaki sunucu bu ayrımın en küçük çalışan hâlidir.

import http from 'node:http'
import { runAgent } from './asama4_dongu.js'
import { createPermissionService } from './asama3_izinler.js'

/**
 * @param {{ store: object, provider: object, tools: object[], agents: Record<string, object>, root: string, maxSteps?: number }} options
 */
export function createAgentServer(options) {
  const subscribers = new Set()
  const pendingPermissions = new Map()
  const savedRules = new Map() // oturum başına "always" onayları
  const running = new Map()
  let closing = false

  const broadcast = (event) => {
    const frame = `data: ${JSON.stringify(event)}\n\n`
    for (const response of subscribers) response.write(frame)
  }

  /** İzin sorusunu olay olarak yayınlar; yanıt POST /permission/:id/reply ile gelir. */
  const askOverEvents = (sessionID) => (request) =>
    new Promise((resolve) => {
      // Kapanırken yeni soru beklemeye alınmaz, hemen reddedilir (opencode Permission servisi de öyle).
      if (closing) return resolve({ reply: 'reject' })
      pendingPermissions.set(request.id, resolve)
      broadcast({ type: 'permission.asked', sessionID, ...request })
    })

  /** Hiç reddedilmez: her hata session.error olayına dönüşür, süreç çökmez. */
  async function startPrompt(session, text) {
    try {
      const agent = options.agents[session.agent]
      if (!agent) throw new Error(`Bilinmeyen ajan: ${session.agent}`)
      if (!savedRules.has(session.id)) savedRules.set(session.id, [])
      const permission = createPermissionService({
        rules: agent.rules,
        saved: savedRules.get(session.id),
        ask: askOverEvents(session.id),
      })
      const result = await runAgent({
        provider: options.provider,
        store: options.store,
        sessionID: session.id,
        prompt: text,
        tools: options.tools,
        agent,
        permission,
        root: options.root,
        maxSteps: options.maxSteps,
        retryDelayMs: 0,
        onEvent: broadcast,
      })
      broadcast({ type: 'session.idle', sessionID: session.id, result })
    } catch (error) {
      broadcast({ type: 'session.error', sessionID: session.id, message: error.message })
    }
  }

  const routes = [
    ['GET', /^\/session$/, async () => [200, await options.store.list()]],
    [
      'POST',
      /^\/session$/,
      async (_match, body) => {
        // Ajan verilmezse varsayılan "build" kullanılır; o da bu sunucuda tanımlı olmalı.
        const agent = body.agent ?? 'build'
        if (!options.agents[agent]) return [400, { error: `Bilinmeyen ajan: ${agent}` }]
        return [201, await options.store.create({ agent, title: body.title })]
      },
    ],
    [
      'GET',
      /^\/session\/([^/]+)$/,
      async (match) => {
        const session = await options.store.get(match[1]).catch(() => undefined)
        return session ? [200, session] : [404, { error: 'Oturum yok' }]
      },
    ],
    [
      'POST',
      /^\/session\/([^/]+)\/prompt$/,
      async (match, body) => {
        const session = await options.store.get(match[1]).catch(() => undefined)
        if (!session) return [404, { error: 'Oturum yok' }]
        if (running.has(session.id)) return [409, { error: 'Oturum meşgul' }]
        if (typeof body.text !== 'string') return [400, { error: 'text alanı gerekli' }]
        // İstem kabul edilir, iş arka planda sürer; sonuç olay akışından gelir. Kayıt silme işi
        // .finally'ye bırakılır: iş anında bitse bile silme, kayıttan SONRA çalışır.
        const task = startPrompt(session, body.text).finally(() => running.delete(session.id))
        running.set(session.id, task)
        return [202, { accepted: true }]
      },
    ],
    [
      'POST',
      /^\/permission\/([^/]+)\/reply$/,
      async (match, body) => {
        const resolve = pendingPermissions.get(match[1])
        if (!resolve) return [404, { error: 'Bekleyen izin isteği yok' }]
        pendingPermissions.delete(match[1])
        resolve(body.reply === 'reject' ? { reply: 'reject', message: body.message } : body.reply)
        broadcast({ type: 'permission.replied', requestID: match[1], reply: body.reply })
        return [200, { ok: true }]
      },
    ],
  ]

  const server = http.createServer(async (request, response) => {
    const url = new URL(request.url, 'http://localhost')
    if (request.method === 'GET' && url.pathname === '/event') {
      response.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' })
      response.write(': bağlandı\n\n')
      subscribers.add(response)
      request.on('close', () => subscribers.delete(response))
      return
    }
    for (const [method, pattern, handler] of routes) {
      const match = request.method === method && pattern.exec(url.pathname)
      if (!match) continue
      try {
        const [status, payload] = await handler(match, await readJson(request))
        sendJson(response, status, payload)
      } catch (error) {
        sendJson(response, 500, { error: error.message })
      }
      return
    }
    sendJson(response, 404, { error: 'Yol yok' })
  })

  return {
    server,
    /** Sunucuyu başlatır ve taban URL'yi döndürür. 0 portu = işletim sistemi boş port seçer. */
    listen(port = 0) {
      return new Promise((resolve) => {
        server.listen(port, '127.0.0.1', () => resolve(`http://127.0.0.1:${server.address().port}`))
      })
    },
    /**
     * Bekleyen izin sorularını reddeder, çalışan işlerin bitmesini bekler ve sunucuyu kapatır.
     * Reddetmeden beklemek, yanıtlanmamış bir soru yüzünden kapanışın sonsuza dek sürmesi demektir.
     */
    async close() {
      closing = true
      for (const [requestID, resolve] of pendingPermissions) {
        resolve({ reply: 'reject' })
        broadcast({ type: 'permission.replied', requestID, reply: 'reject' })
      }
      pendingPermissions.clear()
      await Promise.allSettled(running.values())
      for (const response of subscribers) response.end()
      subscribers.clear()
      await new Promise((resolve) => {
        server.close(resolve)
        // İşler bitti; boşta kalan ya da hiç istek göndermemiş bağlantılar (ör. istemcinin önden
        // açtığı yedek soket) kapanışı saniyelerce bekletmesin.
        server.closeAllConnections()
      })
    },
  }
}

async function readJson(request) {
  let raw = ''
  for await (const chunk of request) raw += chunk
  return raw ? JSON.parse(raw) : {}
}

function sendJson(response, status, payload) {
  response.writeHead(status, { 'content-type': 'application/json' })
  response.end(JSON.stringify(payload))
}

/** Sunucunun küçük istemcisi: TUI, web arayüzü ya da ACP köprüsü bunu kullanırdı. */
export function createClient(baseURL) {
  const call = async (method, pathname, body) => {
    const response = await fetch(baseURL + pathname, {
      method,
      headers: { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    const payload = await response.json()
    if (!response.ok) throw new Error(`${response.status}: ${payload.error}`)
    return payload
  }
  return {
    createSession: (body = {}) => call('POST', '/session', body),
    listSessions: () => call('GET', '/session'),
    getSession: (id) => call('GET', `/session/${id}`),
    prompt: (id, text) => call('POST', `/session/${id}/prompt`, { text }),
    replyPermission: (id, reply, message) => call('POST', `/permission/${id}/reply`, { reply, message }),
    /** SSE akışını async iterator olarak okur. `signal` ile kapatılır. */
    async *events(signal) {
      const response = await fetch(baseURL + '/event', { signal })
      const decoder = new TextDecoder()
      let buffer = ''
      try {
        for await (const chunk of response.body) {
          buffer += decoder.decode(chunk, { stream: true })
          let boundary
          while ((boundary = buffer.indexOf('\n\n')) !== -1) {
            const frame = buffer.slice(0, boundary)
            buffer = buffer.slice(boundary + 2)
            const data = frame
              .split('\n')
              .filter((line) => line.startsWith('data: '))
              .map((line) => line.slice(6))
              .join('\n')
            if (data) yield JSON.parse(data)
          }
        }
      } catch (error) {
        if (error.name !== 'AbortError') throw error
      }
    },
  }
}
