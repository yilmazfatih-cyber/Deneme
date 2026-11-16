/**
 * `GET /api/events`: anlık dürtme akışı (Server-Sent Events). Oturum ister.
 *
 * Akış:  `event: ready` (bağlandı)  →  her alan değişikliğinde `event: poke` + `data: {"workspaceId","rev","clientId"}`
 *        →  her SSE_HEARTBEAT (25 sn) bir yorum satırı (`: nabız`) ki vekiller bağlantıyı boşta sayıp kesmesin.
 * İstemci `poke` gelince eşitler; `clientId` kendisininse yok sayar. Bağlantı koparsa tarayıcının EventSource'u
 * `retry` süresi sonra kendiliğinden yeniden bağlanır. Oturum kapanınca (çıkış, şifre değişimi) akış sunucuca kesilir.
 * Not: EventSource başlık gönderemez; `Authorization: Bearer` kullanan istemci akışı fetch ile okumalıdır.
 *
 * Genişletme: yeni olay türü için hub.ts başlığına bakın; istemci tarafında `addEventListener('<ad>')`.
 */
import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import type { AppContext } from '../../context.ts'
import { RATE_RULES } from '../../http/rateLimit.ts'
import { ROUTES } from '../../http/routes.ts'
import type { AppEnv } from '../../http/types.ts'
import { requireUser } from '../auth/session.ts'

/** İstemcinin koptuktan sonra yeniden bağlanmadan önce bekleyeceği süre (ms). */
export const SSE_RETRY_MS = 5000

/**
 * İstemcinin henüz okumadığı en çok olay (dürtme + nabız) sayısı. Her yazma, istemci okuyana dek sunucu
 * belleğinde bekler; okumayan (ya da TCP penceresini kapalı tutan) bir istemcide kuyruk sınırsız büyür ve
 * sunucuyu bellekten düşürürdü. Sınır aşılınca akış kesilir (tarayıcının EventSource'u yeniden bağlanır).
 * Tek bir eşitleme en çok 100 alana dokunur ve dürtmeleri aynı anda kuyruğa girer: sınır bunun epey üstünde
 * olmalı ki okuyan istemci yanlışlıkla kesilmesin.
 */
export const SSE_MAX_PENDING_WRITES = 256

export function eventRoutes(ctx: AppContext): Hono<AppEnv> {
  const app = new Hono<AppEnv>()

  app.get(ROUTES.events, (c) => {
    const { user, session } = requireUser(c)
    // Hono HEAD isteğini bu işleyiciye yollar ve gövdeyi atar: akış açılırsa hiç okunmaz ve kapanmaz (sızıntı).
    if (c.req.method === 'HEAD') return c.body(null, 200, { 'Content-Type': 'text/event-stream' })
    ctx.limiter.consume(RATE_RULES.events, user.id)
    c.header('X-Accel-Buffering', 'no') // nginx arabelleğe alıp olayları geciktirmesin
    c.header('Cache-Control', 'no-cache, no-transform')
    return streamSSE(c, async (stream) => {
      let finish = () => {}
      const finished = new Promise<void>((resolve) => {
        finish = resolve
      })
      let pending = 0
      const write = (send: () => Promise<unknown>) => {
        if (pending >= SSE_MAX_PENDING_WRITES) {
          stream.abort() // bekleyen kuyruğu atar ve yanıtı bitirir; onAbort → finish
          return
        }
        pending += 1
        void send().finally(() => {
          pending -= 1
        })
      }
      const connection = ctx.hub.connect({
        userId: user.id,
        sessionId: session.id,
        send: (message) => write(() => stream.writeSSE(message)),
        close: () => finish(),
      })
      stream.onAbort(() => finish())
      const heartbeat = setInterval(() => write(() => stream.write(': nabız\n\n')), ctx.config.sseHeartbeatMs)
      try {
        await stream.writeSSE({ event: 'ready', data: '{}', retry: SSE_RETRY_MS })
        await finished
      } finally {
        clearInterval(heartbeat)
        ctx.hub.disconnect(connection)
      }
    })
  })

  return app
}
