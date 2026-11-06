/**
 * USD→TRY rate service. Order: manual override → fresh cache → TCMB → frankfurter → open.er-api → stale cache.
 * The rate never blocks a WhatsApp reply: callers get `undefined` and the ledger records USD only.
 *
 * TCMB `today.xml`: root `<Tarih_Date Tarih="DD.MM.YYYY" …>`, one `<Currency Kod="USD">` with `ForexSelling`.
 * Published on business days (~15:30 TR); on weekends the last bulletin is served. The element names were taken
 * from third-party client code because tcmb.gov.tr was not reachable while researching: verify on first run.
 */
import { atomicWriteJson, readJson } from '../store/files.js'
import type { FxRate, FxService } from './types.js'

interface FxFile {
  /** base rate (before multiplier) */
  rate?: number
  source?: 'tcmb' | 'frankfurter' | 'erapi'
  fetchedAt?: number
  /** manual base rate set with /kur <sayı> */
  manual?: number
}

export interface FxOptions {
  file: string
  refreshHours: number
  /** USD_TRY from the environment: wins over everything */
  envManual?: number
  multiplier?: number
  fetchImpl?: typeof fetch
  now?: () => number
  warn?: (msg: string) => void
}

const TCMB_URL = 'https://www.tcmb.gov.tr/kurlar/today.xml'
const FRANKFURTER_URL = 'https://api.frankfurter.dev/v1/latest?base=USD&symbols=TRY'
const ERAPI_URL = 'https://open.er-api.com/v6/latest/USD'

const num = (s: string | undefined): number | undefined => {
  if (!s) return undefined
  const n = Number(s.trim().replace(',', '.'))
  return Number.isFinite(n) && n > 0 ? n : undefined
}

/** USD ForexSelling (falls back to BanknoteSelling) from the TCMB bulletin. */
export function parseTcmbUsd(xml: string): number | undefined {
  const block = /<Currency\b[^>]*\bKod="USD"[^>]*>([\s\S]*?)<\/Currency>/.exec(xml)?.[1]
  if (!block) return undefined
  const pick = (tag: string) => num(new RegExp(`<${tag}>\\s*([^<]*?)\\s*</${tag}>`).exec(block)?.[1])
  return pick('ForexSelling') ?? pick('BanknoteSelling')
}

export function parseFrankfurter(json: unknown): number | undefined {
  const rates = (json as { rates?: { TRY?: unknown } } | null)?.rates
  return typeof rates?.TRY === 'number' && rates.TRY > 0 ? rates.TRY : undefined
}

export function parseErApi(json: unknown): number | undefined {
  const j = json as { result?: unknown; rates?: { TRY?: unknown } } | null
  if (j?.result !== 'success') return undefined
  return typeof j.rates?.TRY === 'number' && j.rates.TRY > 0 ? j.rates.TRY : undefined
}

export class HttpFxService implements FxService {
  private readonly fetchImpl: typeof fetch
  private readonly now: () => number
  private readonly mult: number
  private state: FxFile | undefined
  private inflight: Promise<FxRate | undefined> | undefined

  constructor(private readonly o: FxOptions) {
    this.fetchImpl = o.fetchImpl ?? fetch
    this.now = o.now ?? Date.now
    this.mult = o.multiplier && o.multiplier > 0 ? o.multiplier : 1
  }

  private async load(): Promise<FxFile> {
    this.state ??= await readJson<FxFile>(this.o.file, {})
    return this.state
  }

  private async save(): Promise<void> {
    if (this.state) await atomicWriteJson(this.o.file, this.state)
  }

  private eff(base: number): number {
    return Math.round(base * this.mult * 10_000) / 10_000
  }

  async rate(): Promise<FxRate | undefined> {
    if (this.o.envManual) return { rate: this.eff(this.o.envManual), source: 'manual', asOf: this.now() }
    const st = await this.load()
    if (st.manual) return { rate: this.eff(st.manual), source: 'manual', asOf: st.fetchedAt ?? this.now() }
    const fresh =
      st.rate !== undefined && st.fetchedAt !== undefined && this.now() - st.fetchedAt < this.o.refreshHours * 3_600_000
    if (fresh && st.rate !== undefined && st.source)
      return { rate: this.eff(st.rate), source: st.source, asOf: st.fetchedAt ?? this.now() }
    return this.refresh()
  }

  async setManual(rate: number): Promise<FxRate> {
    const st = await this.load()
    if (!(rate > 0)) {
      delete st.manual
      await this.save()
      const r = await this.refresh()
      return r ?? { rate: 0, source: 'cache', asOf: this.now() }
    }
    st.manual = rate
    await this.save()
    return { rate: this.eff(rate), source: 'manual', asOf: this.now() }
  }

  refresh(): Promise<FxRate | undefined> {
    this.inflight ??= this.doRefresh().finally(() => {
      this.inflight = undefined
    })
    return this.inflight
  }

  private async doRefresh(): Promise<FxRate | undefined> {
    const st = await this.load()
    if (this.o.envManual) return { rate: this.eff(this.o.envManual), source: 'manual', asOf: this.now() }
    if (st.manual) return { rate: this.eff(st.manual), source: 'manual', asOf: this.now() }
    const sources: Array<{
      name: 'tcmb' | 'frankfurter' | 'erapi'
      url: string
      parse: (body: string) => number | undefined
    }> = [
      { name: 'tcmb', url: TCMB_URL, parse: parseTcmbUsd },
      { name: 'frankfurter', url: FRANKFURTER_URL, parse: (b) => parseFrankfurter(safeJson(b)) },
      { name: 'erapi', url: ERAPI_URL, parse: (b) => parseErApi(safeJson(b)) },
    ]
    for (const s of sources) {
      try {
        const res = await this.fetchImpl(s.url, { signal: AbortSignal.timeout(10_000), headers: { Accept: '*/*' } })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const rate = s.parse(await res.text())
        if (rate === undefined) throw new Error('kur okunamadı')
        st.rate = rate
        st.source = s.name
        st.fetchedAt = this.now()
        await this.save()
        return { rate: this.eff(rate), source: s.name, asOf: st.fetchedAt }
      } catch (err) {
        this.o.warn?.(`Kur kaynağı ${s.name} başarısız: ${err instanceof Error ? err.message : String(err)}`)
      }
    }
    // every source failed: serve the last known rate, however old
    if (st.rate !== undefined) return { rate: this.eff(st.rate), source: 'cache', asOf: st.fetchedAt ?? 0 }
    return undefined
  }
}

function safeJson(body: string): unknown {
  try {
    return JSON.parse(body)
  } catch {
    return undefined
  }
}
