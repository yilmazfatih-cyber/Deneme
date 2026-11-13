/**
 * Bildirimler (Netflix `notifications.netflix.com/push` uzun yoklama karşılığı).
 *   GET /push?cursor=<n>&wait=<sn, en çok 25>
 * Profil başına kuyruk; imleç (cursor) sunucu genelinde tekdüze artar ve kalıcıdır. İmleçten yeni olay varsa
 * hemen döner, yoksa yeni bildirim gelene ya da süre dolana dek bekler → `{ events: [], cursor }`.
 * Başlangıç bildirimleri content/notifications.json'dan gelir (dosya yoksa başlangıç bildirimi yoktur).
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { ROUTES } from '../../../../shared/constants'
import { zNotificationsFile } from '../../../../shared/content-schema'
import type { PushEvent, PushResponse } from '../../../../shared/types'
import type { NotificationsService } from '../../kernel/services'
import { createStore } from '../../kernel/store'

const MAX_WAIT_SEC = 25
const TEST_MAX_WAIT_SEC = 1
const QUEUE_LIMIT = 200
const BROADCAST_LIMIT = 50
/** İlk yoklamadan sonra gösterilen tanıtım bildirimi gecikmesi. */
const DEMO_DELAY_MS = 40_000

type Draft = Pick<PushEvent, 'kind' | 'title' | 'body' | 'href'>

interface Template extends Draft {
  id: string
  createdAt: string
}

interface NotificationsState {
  /** Sunucu genelinde son verilen imleç */
  cursor: number
  queues: Record<string, PushEvent[]>
  /** Tüm profillere gönderilmiş bildirimler (sonradan oluşan kuyruklara da eklenir) */
  broadcasts: Template[]
}

export function loadSeeds(contentDir: string, warn: (msg: string, err?: unknown) => void): Template[] {
  const file = join(contentDir, 'notifications.json')
  if (!existsSync(file)) return []
  try {
    const parsed = zNotificationsFile.parse(JSON.parse(readFileSync(file, 'utf8')))
    const createdAt = new Date().toISOString()
    return parsed.map((s) => ({
      id: `seed-${s.id}`,
      kind: 'NEW_CONTENT' as const,
      title: s.title,
      body: s.body,
      href:
        s.videoId !== undefined
          ? `#/detay/${s.videoId}`
          : s.channelId !== undefined
            ? `#/izle/Channel:${s.channelId}`
            : null,
      createdAt,
    }))
  } catch (err) {
    warn('content/notifications.json okunamadı; başlangıç bildirimi yok', err)
    return []
  }
}

export interface NotificationsServiceInternal extends NotificationsService {
  /** imleçten sonraki olaylar (ve istemci ilerideyse düzeltilmiş imleç) */
  since(profileGuid: string, cursor: number): PushResponse
  /** Yeni olay gelince çağrılacak bekleyici ekler; kaldırma işlevi döner. */
  subscribe(profileGuid: string, fn: () => void): () => void
}

export default async function plugin(app: FastifyInstance): Promise<void> {
  const config = app.config
  const seeds = loadSeeds(config.contentDir, (msg, err) => app.log.warn({ err }, msg))
  const store = createStore<NotificationsState>(config, 'notifications', () => ({
    cursor: 0,
    queues: {},
    broadcasts: [],
  }))
  const waiters = new Map<string, Set<() => void>>()
  const demoScheduled = new Set<string>()
  const timers = new Set<NodeJS.Timeout>()

  const notify = (guid: string) => {
    const set = waiters.get(guid)
    if (!set) return
    for (const fn of [...set]) fn()
  }

  /** Kuyruğa ekler (store.update içinde çağrılır). */
  const append = (s: NotificationsState, guid: string, t: Template): PushEvent => {
    const queue = (s.queues[guid] ??= [])
    s.cursor += 1
    const ev: PushEvent = { ...t, cursor: s.cursor, read: false }
    queue.push(ev)
    if (queue.length > QUEUE_LIMIT) queue.splice(0, queue.length - QUEUE_LIMIT)
    return ev
  }

  /** Kuyruk yoksa oluşturur; eksik başlangıç/yayın bildirimlerini ekler. */
  const ensure = (guid: string): PushEvent[] => {
    const s = store.get()
    const queue = s.queues[guid]
    const have = new Set((queue ?? []).map((e) => e.id))
    const missing = [...seeds, ...(queue ? [] : s.broadcasts)].filter((t) => !have.has(t.id))
    if (!queue || missing.length) {
      store.update((st) => {
        st.queues[guid] ??= []
        for (const t of missing) append(st, guid, t)
      })
    }
    return store.get().queues[guid] ?? []
  }

  const service: NotificationsServiceInternal = {
    push(profileGuid, n) {
      const createdAt = new Date().toISOString()
      const touched: string[] = []
      store.update((s) => {
        if (profileGuid === null) {
          const t: Template = { id: `b-${s.cursor + 1}`, ...n, createdAt }
          s.broadcasts.push(t)
          if (s.broadcasts.length > BROADCAST_LIMIT) s.broadcasts.splice(0, s.broadcasts.length - BROADCAST_LIMIT)
          for (const guid of Object.keys(s.queues)) {
            append(s, guid, t)
            touched.push(guid)
          }
        } else {
          s.queues[profileGuid] ??= []
          append(s, profileGuid, { id: `n-${s.cursor + 1}`, ...n, createdAt })
          touched.push(profileGuid)
        }
      })
      for (const guid of touched) notify(guid)
    },
    list(profileGuid) {
      return [...ensure(profileGuid)].reverse().map((e) => ({ ...e }))
    },
    markRead(profileGuid, ids) {
      ensure(profileGuid)
      const wanted = ids ? new Set(ids) : null
      store.update((s) => {
        for (const e of s.queues[profileGuid] ?? []) if (!wanted || wanted.has(e.id)) e.read = true
      })
    },
    since(profileGuid, cursor) {
      const queue = ensure(profileGuid)
      const global = store.get().cursor
      // İstemci sunucudan ilerideyse (veri sıfırlanmış) baştan ver.
      const from = cursor > global ? 0 : cursor
      const events = queue.filter((e) => e.cursor > from).map((e) => ({ ...e }))
      const last = events.length ? events[events.length - 1]!.cursor : from
      return { events, cursor: last }
    },
    subscribe(profileGuid, fn) {
      let set = waiters.get(profileGuid)
      if (!set) {
        set = new Set()
        waiters.set(profileGuid, set)
      }
      set.add(fn)
      return () => {
        set.delete(fn)
        if (set.size === 0 && waiters.get(profileGuid) === set) waiters.delete(profileGuid)
      }
    },
  }
  app.services.notifications = service

  /** Sunucu çalışması başına profil başına bir kez: tanıtım bildirimi (testlerde yok). */
  const scheduleDemo = (guid: string) => {
    if (config.isTest || demoScheduled.has(guid)) return
    demoScheduled.add(guid)
    const t = setTimeout(() => {
      timers.delete(t)
      service.push(guid, {
        kind: 'SYSTEM',
        title: 'Canlı TV hazır',
        body: 'Kanallar ve yayın akışı artık burada.',
        href: '#/canli',
      })
    }, DEMO_DELAY_MS)
    t.unref()
    timers.add(t)
  }

  app.get(ROUTES.PUSH, async (req, reply) => {
    const q = (req.query ?? {}) as Record<string, unknown>
    const rawCursor = Number(q.cursor ?? 0)
    const cursor = Number.isFinite(rawCursor) && rawCursor > 0 ? Math.floor(rawCursor) : 0
    const rawWait = Number(q.wait ?? 0)
    const maxWait = config.isTest ? TEST_MAX_WAIT_SEC : MAX_WAIT_SEC
    const waitSec = Number.isFinite(rawWait) && rawWait > 0 ? Math.min(rawWait, maxWait) : 0
    reply.header('cache-control', 'no-store')

    const guid = req.passport.profile?.guid
    if (!guid) return { events: [], cursor } satisfies PushResponse

    scheduleDemo(guid)
    const first = service.since(guid, cursor)
    if (first.events.length > 0 || waitSec === 0) return first

    await new Promise<void>((resolve) => {
      let done = false
      const finish = () => {
        if (done) return
        done = true
        clearTimeout(timer)
        unsubscribe()
        reply.raw.off('close', finish)
        resolve()
      }
      const timer = setTimeout(finish, waitSec * 1000)
      const unsubscribe = service.subscribe(guid, finish)
      // İstemci bağlantıyı kapatırsa bekleyiciyi hemen temizle.
      reply.raw.on('close', finish)
    })
    return service.since(guid, cursor)
  })

  app.addHook('onClose', async () => {
    for (const t of timers) clearTimeout(t)
    timers.clear()
    for (const set of waiters.values()) for (const fn of [...set]) fn()
    if (!config.isTest) store.flush()
  })
}
