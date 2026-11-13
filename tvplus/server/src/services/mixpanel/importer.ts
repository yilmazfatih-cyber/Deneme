/**
 * Akışlı içe aktarıcı: Mixpanel ham dışa aktarımı (JSONL; düz ya da gzip — sihirli baytlardan anlaşılır) satır satır
 * okunur, eşlemeyle çevrilir ve 5000'lik paketlerle depoya eklenir. Dosya hiçbir zaman bütünüyle belleğe alınmaz.
 * Boş satırlar sayılmaz; bozuk satırlar `rejected` olur ve içe aktarma sürer. Ham satır saklanmaz, günlüğe yazılmaz.
 * Yeniden çalıştırmak güvenlidir: aynı olay ikinci kez `duplicates` sayılır.
 */
import { setImmediate as yieldLoop } from 'node:timers/promises'
import { pipeline, Readable } from 'node:stream'
import { StringDecoder } from 'node:string_decoder'
import { createGunzip } from 'node:zlib'
import type { ImportReport, ViewingEvent, ViewingSource } from '../../../../shared/intelligence'
import { IdSet } from '../viewing/hashset'
import { eventIdOf, pseudonymizer } from '../viewing/ids'
import type { TitleResolver } from '../viewing/resolve'
import { convertRow, type CompiledMapping } from './mapping'

export const DEFAULT_MAX_IMPORT_BYTES = 1024 * 1024 * 1024
const MAX_LINE_CHARS = 4 * 1024 * 1024
const MAX_UNMAPPED_NAMES = 500
const MAX_UNKNOWN_IDS = 50_000
const UNKNOWN_REPORT = 50

export class ImportTooLargeError extends Error {
  constructor(limit: number) {
    super(`Gövde ${Math.round(limit / 1024 / 1024)} MB sınırını aşıyor.`)
    this.name = 'ImportTooLargeError'
  }
}
export class ImportAbortedError extends Error {
  constructor() {
    super('İçe aktarma durduruldu.')
    this.name = 'ImportAbortedError'
  }
}
export class ImportFormatError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ImportFormatError'
  }
}

export interface ImportSink {
  append(events: ViewingEvent[]): { accepted: number; duplicates: number; rejected: number }
  has(source: ViewingSource, id: string): boolean
}

export interface ImportContext {
  source: ViewingSource
  mapping: CompiledMapping
  resolver: TitleResolver
  /** deriveKey(config, 'viewer-id') */
  viewerKey: Buffer
  /** deriveKey(config, 'viewing-event-id') */
  eventKey: Buffer
  sink: ImportSink
  /** Depoya yazmadan yalnız rapor üretir */
  dryRun?: boolean
  /** Ham (sıkıştırılmış olabilir) gövde sınırı */
  maxBytes?: number
  signal?: AbortSignal
  /** Rapordaki from/to (API çekiminde istenen aralık); verilmezse olaylardan bulunur */
  range?: { from: string; to: string }
  batchSize?: number
  /** Her paketten sonra (ilerleme) */
  onProgress?: (lines: number) => void
}

type Chunk = Buffer | Uint8Array | string

/** Bayt sayar, sınırı uygular, gzip ise açar. */
async function* decodedChunks(input: AsyncIterable<Chunk>, maxBytes: number): AsyncGenerator<Buffer> {
  let total = 0
  const it = input[Symbol.asyncIterator]()
  const counted = async function* (): AsyncGenerator<Buffer> {
    for (;;) {
      const r = await it.next()
      if (r.done) return
      const b = typeof r.value === 'string' ? Buffer.from(r.value) : Buffer.from(r.value)
      total += b.length
      if (total > maxBytes) throw new ImportTooLargeError(maxBytes)
      yield b
    }
  }
  const src = counted()
  // İlk iki baytı topla (gzip sihirli baytları 1f 8b)
  const head: Buffer[] = []
  let headLen = 0
  while (headLen < 2) {
    const r = await src.next()
    if (r.done) break
    head.push(r.value)
    headLen += r.value.length
  }
  if (headLen === 0) return
  const first = Buffer.concat(head)
  const all = async function* (): AsyncGenerator<Buffer> {
    yield first
    yield* src
  }
  if (first[0] === 0x1f && first[1] === 0x8b) {
    const gunzip = createGunzip()
    let failure: Error | null = null
    pipeline(Readable.from(all()), gunzip, (err) => {
      if (err) failure = err
    })
    try {
      for await (const c of gunzip) yield c as Buffer
    } catch (err) {
      const f = failure ?? (err as Error)
      if (f instanceof ImportTooLargeError) throw f
      throw new ImportFormatError(`gzip açılamadı: ${f.message}`)
    }
    if (failure) {
      const f: Error = failure
      if (f instanceof ImportTooLargeError) throw f
      throw new ImportFormatError(`gzip açılamadı: ${f.message}`)
    }
  } else yield* all()
}

/** Satırlara böler (\n ya da \r\n); çok uzun satırı atlar ve null olarak bildirir. */
async function* linesOf(input: AsyncIterable<Buffer>): AsyncGenerator<string | null> {
  const dec = new StringDecoder('utf8')
  let rest = ''
  let skipping = false
  for await (const chunk of input) {
    const text = rest + dec.write(chunk)
    let start = 0
    for (;;) {
      const nl = text.indexOf('\n', start)
      if (nl < 0) break
      const line = text.slice(start, nl)
      start = nl + 1
      if (skipping) {
        skipping = false
        yield null
        continue
      }
      yield line.endsWith('\r') ? line.slice(0, -1) : line
    }
    rest = text.slice(start)
    if (rest.length > MAX_LINE_CHARS) {
      rest = ''
      skipping = true
    }
  }
  rest += dec.end()
  if (skipping) yield null
  else if (rest) yield rest
}

const isoDay = (ts: number) => new Date(ts).toISOString().slice(0, 10)

export async function importMixpanelExport(input: AsyncIterable<Chunk>, ctx: ImportContext): Promise<ImportReport> {
  const startedAt = new Date().toISOString()
  const batchSize = ctx.batchSize ?? 5000
  const viewerId = pseudonymizer(ctx.viewerKey, ctx.source === 'SYNTHETIC' ? 'synthetic' : 'mixpanel')
  const prefix = ctx.source === 'SYNTHETIC' ? 'sy_' : 'mp_'
  const convertCtx = {
    source: ctx.source,
    viewerId,
    eventId: (parts: string) => eventIdOf(ctx.eventKey, prefix, parts),
    resolver: ctx.resolver,
  }
  let lines = 0
  let accepted = 0
  let duplicates = 0
  let rejected = 0
  let minTs = Infinity
  let maxTs = -Infinity
  const unmapped = new Map<string, number>()
  const unknown = new Map<string, number>()
  const dryRunSeen = ctx.dryRun ? new IdSet() : null
  let batch: ViewingEvent[] = []

  const flush = async () => {
    if (!batch.length) return
    if (dryRunSeen) {
      for (const ev of batch) {
        if (!dryRunSeen.add(ev.id) || ctx.sink.has(ev.source, ev.id)) duplicates++
        else accepted++
      }
    } else {
      const r = ctx.sink.append(batch)
      accepted += r.accepted
      duplicates += r.duplicates
      rejected += r.rejected
    }
    batch = []
    ctx.onProgress?.(lines)
    // Olay döngüsünü bırak: sunucu içe aktarma sürerken başka isteklere yanıt verebilsin
    await yieldLoop()
    if (ctx.signal?.aborted) throw new ImportAbortedError()
  }

  for await (const line of linesOf(decodedChunks(input, ctx.maxBytes ?? DEFAULT_MAX_IMPORT_BYTES))) {
    if (line === null) {
      lines++
      rejected++
      continue
    }
    if (!line.trim()) continue
    lines++
    let row: unknown
    try {
      row = JSON.parse(line)
    } catch {
      rejected++
      continue
    }
    const r = convertRow(row, line, ctx.mapping, convertCtx)
    if (r.kind === 'rejected') {
      rejected++
      continue
    }
    if (r.kind === 'unmapped') {
      const key = unmapped.has(r.name) || unmapped.size < MAX_UNMAPPED_NAMES ? r.name : '(diğer adlar)'
      unmapped.set(key, (unmapped.get(key) ?? 0) + 1)
      continue
    }
    if (r.unknownContent !== null && (unknown.has(r.unknownContent) || unknown.size < MAX_UNKNOWN_IDS))
      unknown.set(r.unknownContent, (unknown.get(r.unknownContent) ?? 0) + 1)
    if (r.event.ts < minTs) minTs = r.event.ts
    if (r.event.ts > maxTs) maxTs = r.event.ts
    batch.push(r.event)
    if (batch.length >= batchSize) await flush()
  }
  await flush()

  return {
    source: ctx.source,
    startedAt,
    finishedAt: new Date().toISOString(),
    lines,
    accepted,
    duplicates,
    rejected,
    unmappedEvents: Object.fromEntries([...unmapped].sort((a, b) => b[1] - a[1])),
    unknownTitles: [...unknown]
      .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
      .slice(0, UNKNOWN_REPORT)
      .map(([externalId, count]) => ({ externalId, count })),
    from: ctx.range?.from ?? (Number.isFinite(minTs) ? isoDay(minTs) : null),
    to: ctx.range?.to ?? (Number.isFinite(maxTs) ? isoDay(maxTs) : null),
  }
}
