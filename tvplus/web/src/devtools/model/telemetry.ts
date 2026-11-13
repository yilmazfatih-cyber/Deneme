/**
 * "Olaylar" sekmesinin görünüm modeli (Netflix'te Ichnaea): gönderilen olay paketleri,
 * bu oturumda olay adına göre sayım ve hız sınırı başlığından okunan kalan kota.
 */
import type { DevEvent } from '../../lib/devbus'
import { arr, field, num, str } from './read'

export interface EventBatchView {
  id: number
  at: number
  count: number
  names: string[]
  status: number | null
  /** x-tvplus-izci ham değeri, ör. "~0=true~RL=2212" */
  rate: string | null
  remaining: number | null
  beacon: boolean
  ok: boolean
  ms: number | null
  error: string | null
}
export interface TelemetryState {
  batches: EventBatchView[] // en yeni başta
  tally: Record<string, number>
  batchesSent: number
  eventsSent: number
  failed: number
  lastRemaining: number | null
  lastRate: string | null
}

export const BATCH_LIST_MAX = 100

export function initialTelemetry(): TelemetryState {
  return { batches: [], tally: {}, batchesSent: 0, eventsSent: 0, failed: 0, lastRemaining: null, lastRate: null }
}

/** "~0=true~RL=2212" → 2212 */
export function parseRateLimit(header: string | null): number | null {
  if (!header) return null
  const m = /RL=(\d+)/.exec(header)
  return m ? Number(m[1]) : null
}

export function reduceTelemetry(s: TelemetryState, e: DevEvent): TelemetryState {
  if (e.cat !== 'event-log') return s
  const d = e.detail
  const names = arr(field(d, 'names')).flatMap((n) => str(n) ?? [])
  const labelCount = /^(\d+)/.exec(e.label)
  const count = names.length || (labelCount ? Number(labelCount[1]) : 0)
  const rate = str(field(d, 'rate'))
  const remaining = parseRateLimit(rate)
  const batch: EventBatchView = {
    id: e.id,
    at: e.at,
    count,
    names,
    status: num(field(d, 'status')),
    rate,
    remaining,
    beacon: /beacon/i.test(e.label),
    ok: e.ok,
    ms: e.ms ?? null,
    error: str(field(d, 'error')),
  }
  let tally = s.tally
  if (e.ok && names.length) {
    tally = { ...tally }
    for (const n of names) tally[n] = (tally[n] ?? 0) + 1
  }
  return {
    batches: [batch, ...s.batches].slice(0, BATCH_LIST_MAX),
    tally,
    batchesSent: s.batchesSent + (e.ok ? 1 : 0),
    eventsSent: s.eventsSent + (e.ok ? count : 0),
    failed: s.failed + (e.ok ? 0 : 1),
    lastRemaining: remaining ?? s.lastRemaining,
    lastRate: rate ?? s.lastRate,
  }
}

/** Sayıma göre azalan sıralı [ad, adet] listesi. */
export function sortedTally(t: Record<string, number>): [string, number][] {
  return Object.entries(t).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
}
