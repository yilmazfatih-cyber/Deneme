/**
 * Olay günlüğü (Netflix Ichnaea karşılığı): POST /log/web/cl/1
 *  - Gövde EventBatch; application/json ya da text/plain (navigator.sendBeacon) olarak gelir.
 *  - Her olay ayrı doğrulanır; geçersiz olan düşürülür, gövde bozuksa 400 (asla 500 değil).
 *  - Cihaz başına jeton kovası (5 dakikada 3000 olay); her yanıtta `x-tvplus-izci: ~0=true~RL=<kalan>`.
 *  - Son 5000 olay bellekte, tümü dataDir/events.ndjson'a eklenir; oynatma sayaçları kalıcıdır (Top 10).
 */
import { appendFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { FastifyInstance, FastifyReply } from 'fastify'
import { z } from 'zod'
import { HEADERS, ROUTES } from '../../../../shared/constants'
import type { ClientEvent, ClientEventName, EventBatch, EventBatchResponse } from '../../../../shared/types'
import { httpError } from '../../gateway/errors'
import type { EventsService } from '../../kernel/services'
import { createStore } from '../../kernel/store'

export const RATE_CAPACITY = 3000
export const RATE_WINDOW_MS = 5 * 60 * 1000
const RECENT_LIMIT = 5000
const MAX_EVENTS_PER_BATCH = 500
/** Oynatma kayıtları en çok bu kadar geriye tutulur. */
const PLAY_RETENTION_MS = 30 * 24 * 60 * 60 * 1000
const PLAY_MAX_ENTRIES = 100_000

const EVENT_NAMES = [
  'navigate',
  'impression',
  'focus',
  'click',
  'search',
  'playlist',
  'rating',
  'ftl.result',
  'playback.intent',
  'playback.start',
  'playback.heartbeat',
  'playback.rebuffer',
  'playback.bitrateSwitch',
  'playback.cdnSwitch',
  'playback.error',
  'playback.end',
  'preview.start',
  'notification.open',
] as const satisfies readonly ClientEventName[]

const zEvent = z.object({
  name: z.enum(EVENT_NAMES),
  ts: z.number().finite(),
  seq: z.number().int().nonnegative(),
  tctx: z.string().max(512).optional(),
  data: z.record(z.string(), z.unknown()),
})

const zBatchShell = z.object({
  sessionId: z.string().max(128).optional(),
  sentAt: z.number().finite().optional(),
  events: z.array(z.unknown()).max(MAX_EVENTS_PER_BATCH),
})

/** Bellekte ve debug panelinde tutulan kayıt. */
export interface StoredEvent extends ClientEvent {
  sessionId: string
  profileGuid: string | null
  deviceId: string | null
  /** Sunucunun aldığı an (ISO) */
  receivedAt: string
  /** Saat kayması düzeltilmiş olay anı (epoch ms, sunucu saati) */
  serverTs: number
}

interface CounterState {
  total: number
  lastBatchAt: string | null
  byName: Record<string, number>
  /** [videoId, epoch ms] — playback.start olayları */
  plays: [number, number][]
}

interface Bucket {
  tokens: number
  updatedAt: number
}

/** Jeton kovası: kapasite RATE_CAPACITY, pencere başına tam dolum. */
export function createRateLimiter(capacity = RATE_CAPACITY, windowMs = RATE_WINDOW_MS, now: () => number = Date.now) {
  const buckets = new Map<string, Bucket>()
  const refill = (key: string): Bucket => {
    const t = now()
    let b = buckets.get(key)
    if (!b) {
      b = { tokens: capacity, updatedAt: t }
      buckets.set(key, b)
      if (buckets.size > 50_000) {
        // Eski kovaları ayıkla (dolu olanlar bilgi taşımaz)
        for (const [k, v] of buckets) if (t - v.updatedAt > windowMs) buckets.delete(k)
      }
    } else {
      b.tokens = Math.min(capacity, b.tokens + ((t - b.updatedAt) * capacity) / windowMs)
      b.updatedAt = t
    }
    return b
  }
  return {
    /** n jeton harcamayı dener. */
    take(key: string, n: number): { ok: boolean; remaining: number } {
      const b = refill(key)
      if (b.tokens < n) return { ok: false, remaining: Math.floor(b.tokens) }
      b.tokens -= n
      return { ok: true, remaining: Math.floor(b.tokens) }
    },
    peek(key: string): number {
      return Math.floor(refill(key).tokens)
    },
  }
}

const izci = (remaining: number) => `~0=true~RL=${remaining}`

export interface EventsServiceInternal extends EventsService {
  recent(limit: number): StoredEvent[]
  /** HTTP ucu: hız sınırı uygulanmış alım. */
  ingestFrom(
    batch: unknown,
    profileGuid: string | null,
    deviceId: string,
  ): { status: number; body: EventBatchResponse | null; remaining: number }
}

export default async function plugin(app: FastifyInstance): Promise<void> {
  const config = app.config
  const limiter = createRateLimiter()
  const counters = createStore<CounterState>(config, 'events-counters', () => ({
    total: 0,
    lastBatchAt: null,
    byName: {},
    plays: [],
  }))
  const recent: StoredEvent[] = []
  const ndjsonFile = join(config.dataDir, 'events.ndjson')
  let writeChain: Promise<void> = Promise.resolve()

  function persistLines(lines: StoredEvent[]): void {
    if (config.isTest || lines.length === 0) return
    const text = lines.map((e) => JSON.stringify(e)).join('\n') + '\n'
    writeChain = writeChain
      .then(() => appendFile(ndjsonFile, text))
      .catch((err: unknown) => app.log.warn({ err }, 'olay günlüğü dosyaya yazılamadı'))
  }

  /** Doğrulama + kayıt; hız sınırını çağıran uygular. */
  function accept(
    batch: { sessionId?: string; sentAt?: number; events: unknown[] },
    profileGuid: string | null,
    deviceId: string | null,
  ) {
    const now = Date.now()
    const skew = typeof batch.sentAt === 'number' ? now - batch.sentAt : 0
    const receivedAt = new Date(now).toISOString()
    const good: StoredEvent[] = []
    let dropped = 0
    for (const raw of batch.events) {
      const r = zEvent.safeParse(raw)
      if (!r.success) {
        dropped++
        continue
      }
      const ev: StoredEvent = {
        ...(r.data as ClientEvent),
        sessionId: batch.sessionId ?? '',
        profileGuid,
        deviceId,
        receivedAt,
        serverTs: Math.round(r.data.ts + skew),
      }
      good.push(ev)
    }
    if (good.length) {
      recent.push(...good)
      if (recent.length > RECENT_LIMIT) recent.splice(0, recent.length - RECENT_LIMIT)
      counters.update((s) => {
        s.total += good.length
        s.lastBatchAt = receivedAt
        for (const e of good) {
          s.byName[e.name] = (s.byName[e.name] ?? 0) + 1
          const vid = e.data.videoId
          if (e.name === 'playback.start' && typeof vid === 'number' && Number.isInteger(vid)) {
            s.plays.push([vid, Math.min(e.serverTs, now)])
          }
        }
        const cutoff = now - PLAY_RETENTION_MS
        if (s.plays.length > PLAY_MAX_ENTRIES || (s.plays[0] && s.plays[0][1] < cutoff)) {
          s.plays = s.plays.filter(([, t]) => t >= cutoff).slice(-PLAY_MAX_ENTRIES)
        }
      })
      persistLines(good)
    }
    return { accepted: good.length, dropped }
  }

  const service: EventsServiceInternal = {
    playCounts(windowHours) {
      const since = Date.now() - windowHours * 60 * 60 * 1000
      const out = new Map<number, number>()
      for (const [vid, t] of counters.get().plays) if (t >= since) out.set(vid, (out.get(vid) ?? 0) + 1)
      return out
    },
    ingest(batch: EventBatch, profileGuid) {
      const events = Array.isArray(batch?.events) ? batch.events : []
      const r = accept({ sessionId: batch?.sessionId, sentAt: batch?.sentAt, events }, profileGuid, null)
      return { ...r, rateLimitRemaining: RATE_CAPACITY }
    },
    stats() {
      const s = counters.get()
      return { total: s.total, lastBatchAt: s.lastBatchAt, byName: { ...s.byName } }
    },
    recent(limit) {
      const n = Math.max(0, Math.min(limit, RECENT_LIMIT))
      return recent.slice(-n).reverse()
    },
    ingestFrom(body, profileGuid, deviceId) {
      const shell = zBatchShell.safeParse(body)
      if (!shell.success) return { status: 400, body: null, remaining: limiter.peek(deviceId) }
      const n = shell.data.events.length
      const quota = limiter.take(deviceId, n)
      if (!quota.ok) {
        return {
          status: 429,
          body: { accepted: 0, dropped: n, rateLimitRemaining: quota.remaining },
          remaining: quota.remaining,
        }
      }
      const r = accept(shell.data, profileGuid, deviceId)
      return { status: 200, body: { ...r, rateLimitRemaining: quota.remaining }, remaining: quota.remaining }
    },
  }
  app.services.events = service

  const setIzci = (reply: FastifyReply, remaining: number) => reply.header(HEADERS.EVENT_RATE, izci(remaining))

  app.post(
    ROUTES.EVENT_LOG,
    {
      // Gövde ayrıştırma hatasında (bozuk JSON) da başlık bulunsun diye önceden yazılır.
      onRequest: async (req, reply) => {
        setIzci(reply, limiter.peek(req.passport.deviceId))
      },
    },
    async (req, reply) => {
      let body: unknown = req.body
      if (typeof body === 'string' || Buffer.isBuffer(body)) {
        try {
          body = JSON.parse(body.toString())
        } catch {
          throw httpError(400, 'INVALID_BODY', 'Olay paketi okunamadı.')
        }
      }
      const r = service.ingestFrom(body, req.passport.profile?.guid ?? null, req.passport.deviceId)
      setIzci(reply, r.remaining)
      if (r.status === 400) throw httpError(400, 'INVALID_BATCH', 'Olay paketi geçersiz.')
      if (r.status === 429) return reply.code(429).send(r.body)
      return r.body
    },
  )

  app.get(`${ROUTES.DEBUG_PREFIX}/events`, async (req) => {
    const q = (req.query ?? {}) as Record<string, unknown>
    const limit = Number(q.limit ?? 100)
    // En yeni olay başta.
    return service.recent(Number.isFinite(limit) ? limit : 100)
  })

  app.addHook('onClose', async () => {
    if (!config.isTest) counters.flush()
    await writeChain
  })
}
