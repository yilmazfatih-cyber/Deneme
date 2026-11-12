// Gateway — her şeyi bağlayan tek uzun ömürlü süreç (mini sürüm).
//
// Gerçek karşılığı: src/gateway/ (sunucu, yöntemler, olaylar), src/channels/ (gelen mesaj hattı),
// docs/concepts/architecture.md. Gerçek Gateway; kanalları, oturumları, araçları, otomasyonları ve
// istemci bağlantılarını (CLI, Control UI, macOS/iOS/Android düğümleri) tek süreçte toplar.
//
// Gelen mesaj hattı: kanal → zarf → erişim (dmPolicy / eşleştirme / anılma) → yönlendirme (ajan + oturum)
//                    → oturum şeridinde ajan turu → cevap aynı kanala → olaylar kontrol düzlemine.

import { createServer } from 'node:http'
import { ControlPlane } from './asama1_protokol.js'
import { sendJson } from './asama2_kanallar.js'
import { decideDmAccess, PairingStore, passesMentionGate, resolveAgentRoute } from './asama3_yonlendirme.js'
import { AgentRuntime } from './asama4_ajan.js'
import { CronService } from './asama6_zamanlayici.js'

/**
 * @param {{config: any, channels: any[], agents: Record<string, any>, registry: any, token: string,
 *          skillsPrompt?: (agentId: string) => Promise<string>, now?: () => number}} options
 */
export function createGateway({ config, channels, agents, registry, token, skillsPrompt, now = Date.now }) {
  const plane = new ControlPlane({ token, now })
  const pairing = new PairingStore({ now })
  const runtime = new AgentRuntime({ agents, registry, skillsPrompt, sandboxMode: config.sandboxMode ?? 'non-main' })
  const channelMap = new Map(channels.map((c) => [c.id, c]))
  const routes = new Map() // "POST /yol" → işleyici
  const log = [] // gelen mesajların ne olduğunu gösteren kısa kayıt (testler ve demo için)

  async function deliver(target, text) {
    const channel = channelMap.get(target.channel)
    if (!channel) throw new Error(`kanal yok: ${target.channel}`)
    return channel.send({ to: target.to, text })
  }

  const cron = new CronService({ runtime, deliver, now })

  async function handleInbound(env) {
    const account = config.channels?.[env.channel] ?? {}
    const channel = channelMap.get(env.channel)
    if (env.peerKind === 'direct' && env.channel !== 'cli') {
      const access = decideDmAccess({
        dmPolicy: account.dmPolicy,
        allowFrom: account.allowFrom ?? [],
        storeAllowFrom: pairing.allowFrom(env.channel, env.accountId),
        senderId: env.senderId,
      })
      if (access.decision === 'pairing') {
        const req = pairing.request(env.channel, env.accountId, env.senderId)
        if (req?.created) {
          await channel.send({
            to: env.peerId,
            text:
              `Bu asistana erişim onay gerektiriyor. Sahibine şu kodu ilet: ${req.code}\n` +
              `(onay: openclaw pairing approve ${env.channel} ${req.code})`,
          })
        }
        log.push({ ...env, outcome: 'pairing' })
        return { status: 'pairing' } // mesaj ajana ULAŞMAZ
      }
      if (access.decision === 'block') {
        log.push({ ...env, outcome: 'blocked' })
        return { status: 'blocked', reason: access.reason }
      }
    }
    if (env.peerKind !== 'direct') {
      const groups = account.groups ?? []
      if (!groups.includes('*') && !groups.includes(env.peerId))
        return { status: 'blocked', reason: 'group-not-allowed' }
      if (
        !passesMentionGate({
          peerKind: env.peerKind,
          requireMention: account.requireMention,
          wasMentioned: env.wasMentioned,
        })
      ) {
        log.push({ ...env, outcome: 'ignored' })
        return { status: 'ignored', reason: 'no-mention' }
      }
    }
    // Yerel CLI (gerçekte WebChat / Control UI) sahibin kendisidir ve her zaman ajanın ana oturumuna gider.
    const defaultAgent = config.defaultAgentId ?? 'main'
    const route =
      env.channel === 'cli'
        ? { agentId: defaultAgent, sessionKey: `agent:${defaultAgent}:main`, matchedBy: 'internal' }
        : resolveAgentRoute(config, env)
    if (env.text.trim() === '/new') {
      runtime.resetSession(route.sessionKey)
      await channel.send({ to: env.peerId, text: 'Yeni oturum başladı.' })
      return { status: 'reset', ...route }
    }
    plane.broadcast('chat', { direction: 'in', channel: env.channel, sessionKey: route.sessionKey, text: env.text })
    const result = await runtime.runTurn({
      agentId: route.agentId,
      sessionKey: route.sessionKey,
      text: env.text,
      onEvent: (event) => plane.broadcast('agent', { sessionKey: route.sessionKey, ...event }),
    })
    if (!result.silent) await channel.send({ to: env.peerId, text: result.text }) // cevap geldiği yere döner
    log.push({ ...env, outcome: result.silent ? 'silent' : 'replied', sessionKey: route.sessionKey })
    return { status: result.silent ? 'silent' : 'replied', ...route, text: result.text }
  }

  // ---------------------------------------------------------------- kontrol düzlemi yöntemleri
  plane.method('health', { roles: ['operator', 'node'] }, () => ({ ok: true, channels: [...channelMap.keys()] }))
  plane.method(
    'send',
    {
      sideEffect: true,
      schema: {
        type: 'object',
        required: ['channel', 'to', 'text', 'idempotencyKey'],
        properties: { channel: { type: 'string' }, to: { type: 'string' }, text: { type: 'string' } },
      },
    },
    async (p) => ({ sent: (await deliver({ channel: p.channel, to: p.to }, p.text)).ok }),
  )
  plane.method(
    'agent',
    {
      sideEffect: true,
      schema: { type: 'object', required: ['message', 'idempotencyKey'], properties: { message: { type: 'string' } } },
    },
    async (p) => {
      const agentId = p.agentId ?? config.defaultAgentId ?? 'main'
      const sessionKey = p.sessionKey ?? `agent:${agentId}:main`
      const r = await runtime.runTurn({ agentId, sessionKey, text: p.message })
      return { sessionKey, text: r.text, turns: r.turns }
    },
  )
  plane.method('pairing.list', { schema: { type: 'object' } }, (p) => pairing.list(p.channel))
  plane.method(
    'pairing.approve',
    { schema: { type: 'object', required: ['channel', 'code'], properties: { code: { type: 'string' } } } },
    (p) => {
      const req = pairing.approve(p.channel, p.code)
      return req ? { approved: true, senderId: req.senderId } : { approved: false }
    },
  )
  plane.method('cron.list', {}, () =>
    cron.list().map(({ id, name, nextRunAt, enabled }) => ({ id, name, nextRunAt, enabled })),
  )
  plane.method('cron.add', { schema: { type: 'object', required: ['name', 'schedule', 'message'] } }, (p) => {
    const { id, nextRunAt } = cron.add(p)
    return { id, nextRunAt }
  })
  plane.method('node.event', { roles: ['node'] }, (p, conn) => {
    plane.broadcast('node', { from: conn.client?.name ?? conn.id, ...p }, (c) => c.role === 'operator')
    return { accepted: true }
  })

  // ---------------------------------------------------------------- HTTP (kanal webhook'ları)
  const server = createServer(async (req, res) => {
    const handler = routes.get(`${req.method} ${req.url}`)
    if (!handler) return sendJson(res, 404, { ok: false })
    try {
      await handler(req, res)
    } catch (err) {
      if (!res.headersSent) sendJson(res, 500, { ok: false, error: err.message })
    }
  })

  const gateway = {
    plane,
    pairing,
    runtime,
    cron,
    log,
    deliver,
    handleInbound,
    url: '',
    /** Süreç içi istemci (gerçekte WebSocket üzerinden bağlanan CLI / Control UI / düğüm). */
    async connectClient({ role = 'operator', clientToken = token, name = 'test' } = {}) {
      const events = []
      const conn = plane.openConnection((frame) => events.push(frame))
      let n = 0
      const request = async (method, params = {}) =>
        plane.handleFrame(conn, { type: 'req', id: String(++n), method, params })
      const hello = await request('connect', { auth: { token: clientToken }, role, client: { name } })
      return { conn, events, request, hello }
    },
    async start() {
      for (const channel of channels) {
        await channel.start({
          onInbound: handleInbound,
          registerHttpRoute: (m, path, h) => routes.set(`${m} ${path}`, h),
        })
      }
      await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve)) // gerçek varsayılan: 127.0.0.1:18789
      gateway.url = `http://127.0.0.1:${server.address().port}`
      return gateway
    },
    stop: () => new Promise((resolve) => server.close(resolve)),
  }
  return gateway
}
