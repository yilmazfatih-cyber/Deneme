/**
 * Olay günlüğü istemcisi (Netflix Ichnaea karşılığı): olaylar kuyruğa alınır, toplu gönderilir;
 * arayüzü asla bekletmez. Sayfa kapanırken sendBeacon ile boşaltılır.
 */
import { ROUTES } from '../../../shared/constants'
import type { ClientEvent, ClientEventName, EventBatch } from '../../../shared/types'
import { devbus } from '../lib/devbus'
import { apiUrl, sessionHeaders } from '../api/session'

const FLUSH_MS = 5000
const MAX_BATCH = 25
const sessionId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
let seq = 0
let queue: ClientEvent[] = []
let timer: number | null = null

export function logEvent(name: ClientEventName, data: Record<string, unknown> = {}, tctx?: string | null): void {
  queue.push({ name, ts: Date.now(), seq: ++seq, tctx: tctx ?? undefined, data })
  if (queue.length >= MAX_BATCH) void flushEvents()
  else if (timer === null) timer = window.setTimeout(() => void flushEvents(), FLUSH_MS)
}

export async function flushEvents(useBeacon = false): Promise<void> {
  if (timer !== null) {
    clearTimeout(timer)
    timer = null
  }
  if (!queue.length) return
  const events = queue
  queue = []
  const batch: EventBatch = { sessionId, sentAt: Date.now(), events }
  const body = JSON.stringify(batch)
  if (useBeacon && navigator.sendBeacon) {
    const ok = navigator.sendBeacon(apiUrl(ROUTES.EVENT_LOG), new Blob([body], { type: 'application/json' }))
    devbus.emit('event-log', `${events.length} olay (beacon)`, { names: events.map((e) => e.name) }, { ok })
    return
  }
  const t0 = performance.now()
  try {
    const res = await fetch(ROUTES.EVENT_LOG, {
      method: 'POST',
      credentials: 'same-origin',
      keepalive: true,
      headers: { 'content-type': 'application/json', ...sessionHeaders() },
      body,
    })
    devbus.emit(
      'event-log',
      `${events.length} olay`,
      { names: events.map((e) => e.name), status: res.status, rate: res.headers.get('x-tvplus-izci') },
      { ms: performance.now() - t0, ok: res.ok },
    )
  } catch (err) {
    devbus.emit('event-log', `${events.length} olay gönderilemedi`, { error: String(err) }, { ok: false })
  }
}

export function installEventFlushOnExit(): void {
  window.addEventListener('pagehide', () => void flushEvents(true))
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void flushEvents(true)
  })
}

export const telemetrySessionId = sessionId
