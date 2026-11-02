/**
 * Append-only JSONL cost ledger with day / month / all-time summaries.
 * Day and month boundaries follow a named time zone (Europe/Istanbul by default) through Intl,
 * never the process time zone, so `/maliyet` says the same thing on a server set to UTC.
 * The ledger is an estimate; the provider's bill is authoritative.
 */
import fsp from 'node:fs/promises'
import path from 'node:path'
import type { CostSummary, Ledger, LedgerEntry } from './types.js'

export interface WallClock {
  year: number
  /** 1–12 */
  month: number
  day: number
  hour: number
  minute: number
  second: number
}

export interface TimeRange {
  /** inclusive, ms since epoch */
  from: number
  /** exclusive, ms since epoch */
  to: number
}

const formatters = new Map<string, Intl.DateTimeFormat>()

function formatterFor(tz: string): Intl.DateTimeFormat {
  let f = formatters.get(tz)
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
    formatters.set(tz, f)
  }
  return f
}

/** The wall clock reading in `tz` at the instant `ms`. */
export function wallClock(ms: number, tz: string): WallClock {
  const parts = formatterFor(tz).formatToParts(new Date(ms))
  const num = (type: Intl.DateTimeFormatPartTypes): number => Number(parts.find((p) => p.type === type)?.value ?? '0')
  return {
    year: num('year'),
    month: num('month'),
    day: num('day'),
    hour: num('hour') % 24,
    minute: num('minute'),
    second: num('second'),
  }
}

/**
 * UTC ms of the instant at which the wall clock in `tz` reads `year-month-day 00:00:00`.
 * `month` is 1-based and may overflow (13 → January next year), `day` likewise.
 * Iterates on the zone offset so DST edges resolve; a midnight that does not exist in `tz`
 * (DST gap) lands on the nearest valid instant after at most three rounds.
 */
export function localMidnightUtc(year: number, month: number, day: number, tz: string): number {
  const target = Date.UTC(year, month - 1, day, 0, 0, 0)
  let guess = target
  for (let i = 0; i < 3; i++) {
    const w = wallClock(guess, tz)
    const seen = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second)
    const diff = seen - target
    if (diff === 0) break
    guess -= diff
  }
  return guess
}

/** The local calendar day in `tz` that contains `now`: [local midnight, next local midnight). */
export function dayRange(now: number, tz: string): TimeRange {
  const w = wallClock(now, tz)
  return {
    from: localMidnightUtc(w.year, w.month, w.day, tz),
    to: localMidnightUtc(w.year, w.month, w.day + 1, tz),
  }
}

/** The local calendar month in `tz` that contains `now`: [1st 00:00, next month's 1st 00:00). */
export function monthRange(now: number, tz: string): TimeRange {
  const w = wallClock(now, tz)
  return {
    from: localMidnightUtc(w.year, w.month, 1, tz),
    to: localMidnightUtc(w.year, w.month + 1, 1, tz),
  }
}

const SOURCES: ReadonlySet<string> = new Set(['provider', 'estimate', 'unknown'])

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v)
}

/** Accepts a line only when every required field has the right type; a bad line is counted, not thrown. */
export function parseLedgerLine(line: string): LedgerEntry | undefined {
  let raw: unknown
  try {
    raw = JSON.parse(line) as unknown
  } catch {
    return undefined
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined
  const r = raw as Record<string, unknown>
  if (
    !isFiniteNumber(r.ts) ||
    typeof r.chatJid !== 'string' ||
    typeof r.model !== 'string' ||
    !isFiniteNumber(r.promptTokens) ||
    !isFiniteNumber(r.completionTokens) ||
    !isFiniteNumber(r.usd) ||
    typeof r.usdSource !== 'string' ||
    !SOURCES.has(r.usdSource)
  ) {
    return undefined
  }
  const entry: LedgerEntry = {
    ts: r.ts,
    chatJid: r.chatJid,
    model: r.model,
    promptTokens: r.promptTokens,
    completionTokens: r.completionTokens,
    usd: r.usd,
    usdSource: r.usdSource as LedgerEntry['usdSource'],
  }
  if (isFiniteNumber(r.rate)) entry.rate = r.rate
  if (isFiniteNumber(r.tl)) entry.tl = r.tl
  return entry
}

/** Sums a list of entries; `byModel` is sorted by TL desc, then USD desc, then model id. */
export function summarize(entries: readonly LedgerEntry[]): CostSummary {
  const summary: CostSummary = { count: 0, usd: 0, tl: 0, unknownCount: 0, byModel: [] }
  const perModel = new Map<string, { model: string; count: number; usd: number; tl: number }>()
  for (const e of entries) {
    summary.count += 1
    summary.usd += e.usd
    const tl = isFiniteNumber(e.tl) ? e.tl : 0
    summary.tl += tl
    if (e.usdSource === 'unknown') summary.unknownCount += 1
    let m = perModel.get(e.model)
    if (!m) {
      m = { model: e.model, count: 0, usd: 0, tl: 0 }
      perModel.set(e.model, m)
    }
    m.count += 1
    m.usd += e.usd
    m.tl += tl
  }
  summary.byModel = [...perModel.values()].sort(
    (a, b) => b.tl - a.tl || b.usd - a.usd || (a.model < b.model ? -1 : a.model > b.model ? 1 : 0),
  )
  return summary
}

export class JsonlLedger implements Ledger {
  private entries: LedgerEntry[] | undefined
  private loading: Promise<LedgerEntry[]> | undefined
  private writeChain: Promise<void> = Promise.resolve()
  private corrupt = 0

  constructor(
    private readonly file: string,
    private readonly tz = 'Europe/Istanbul',
  ) {}

  /** Lines that could not be parsed on load (kept in the file, skipped in sums). */
  get corruptLines(): number {
    return this.corrupt
  }

  private async readAll(): Promise<LedgerEntry[]> {
    let text = ''
    try {
      text = await fsp.readFile(this.file, 'utf8')
    } catch (err) {
      if ((err as { code?: string }).code !== 'ENOENT') throw err
    }
    const out: LedgerEntry[] = []
    for (const line of text.split(/\r?\n/)) {
      if (line.trim() === '') continue
      const entry = parseLedgerLine(line)
      if (entry) out.push(entry)
      else this.corrupt += 1
    }
    return out
  }

  private load(): Promise<LedgerEntry[]> {
    if (this.entries) return Promise.resolve(this.entries)
    if (!this.loading) {
      this.loading = this.readAll().then(
        (list) => {
          this.entries = list
          return list
        },
        (err: unknown) => {
          this.loading = undefined
          throw err
        },
      )
    }
    return this.loading
  }

  async append(e: LedgerEntry): Promise<void> {
    const entry: LedgerEntry = { ...e }
    const list = await this.load()
    const line = `${JSON.stringify(entry)}\n`
    const write = this.writeChain.then(async () => {
      await fsp.mkdir(path.dirname(this.file), { recursive: true })
      await fsp.appendFile(this.file, line, 'utf8')
      list.push(entry)
    })
    this.writeChain = write.catch(() => undefined)
    await write
  }

  async summary(range: TimeRange): Promise<CostSummary> {
    const list = await this.load()
    return summarize(list.filter((e) => e.ts >= range.from && e.ts < range.to))
  }

  today(now: number): Promise<CostSummary> {
    return this.summary(dayRange(now, this.tz))
  }

  month(now: number): Promise<CostSummary> {
    return this.summary(monthRange(now, this.tz))
  }

  allTime(): Promise<CostSummary> {
    return this.summary({ from: Number.NEGATIVE_INFINITY, to: Number.POSITIVE_INFINITY })
  }
}
