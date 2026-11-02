import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { JsonlLedger, dayRange, monthRange, parseLedgerLine, summarize, wallClock } from '../src/core/ledger.js'
import type { LedgerEntry } from '../src/core/types.js'

const IST = 'Europe/Istanbul'
const iso = (ms: number) => new Date(ms).toISOString()

let dir = ''

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wa-ledger-'))
})

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true })
})

function entry(patch: Partial<LedgerEntry> & { ts: number }): LedgerEntry {
  return {
    chatJid: '905321234567@s.whatsapp.net',
    model: 'openai/gpt-5-mini',
    promptTokens: 100,
    completionTokens: 50,
    usd: 0.001,
    usdSource: 'estimate',
    rate: 40,
    tl: 0.04,
    ...patch,
  }
}

describe('wallClock', () => {
  it('reads the local wall clock through Intl, not the process zone', () => {
    const t = Date.UTC(2026, 1, 28, 21, 30, 0)
    expect(wallClock(t, IST)).toEqual({ year: 2026, month: 3, day: 1, hour: 0, minute: 30, second: 0 })
    expect(wallClock(t, 'UTC')).toEqual({ year: 2026, month: 2, day: 28, hour: 21, minute: 30, second: 0 })
    expect(wallClock(t, 'America/New_York')).toEqual({ year: 2026, month: 2, day: 28, hour: 16, minute: 30, second: 0 })
  })
})

describe('dayRange', () => {
  it('2026-02-28T21:30Z is already 1 March in Istanbul (UTC+3 all year)', () => {
    const r = dayRange(Date.UTC(2026, 1, 28, 21, 30), IST)
    expect(iso(r.from)).toBe('2026-02-28T21:00:00.000Z')
    expect(iso(r.to)).toBe('2026-03-01T21:00:00.000Z')
  })

  it('2026-02-28T20:59:59Z is still 28 February in Istanbul', () => {
    const r = dayRange(Date.UTC(2026, 1, 28, 20, 59, 59), IST)
    expect(iso(r.from)).toBe('2026-02-27T21:00:00.000Z')
    expect(iso(r.to)).toBe('2026-02-28T21:00:00.000Z')
  })

  it('uses UTC midnight for the UTC zone', () => {
    const r = dayRange(Date.UTC(2026, 1, 28, 21, 30), 'UTC')
    expect(iso(r.from)).toBe('2026-02-28T00:00:00.000Z')
    expect(iso(r.to)).toBe('2026-03-01T00:00:00.000Z')
  })

  it('handles a DST switch day (Berlin, 29 March 2026 has 23 hours)', () => {
    const r = dayRange(Date.UTC(2026, 2, 29, 12, 0), 'Europe/Berlin')
    expect(iso(r.from)).toBe('2026-03-28T23:00:00.000Z')
    expect(iso(r.to)).toBe('2026-03-29T22:00:00.000Z')
    expect(r.to - r.from).toBe(23 * 3_600_000)
  })

  it('rolls over the year at Istanbul midnight', () => {
    const r = dayRange(Date.UTC(2026, 11, 31, 21, 0), IST)
    expect(iso(r.from)).toBe('2026-12-31T21:00:00.000Z')
    expect(iso(r.to)).toBe('2027-01-01T21:00:00.000Z')
  })
})

describe('monthRange', () => {
  it('starts March on 28 Feb 21:00Z in Istanbul and ends on 31 March 21:00Z', () => {
    const r = monthRange(Date.UTC(2026, 1, 28, 21, 30), IST)
    expect(iso(r.from)).toBe('2026-02-28T21:00:00.000Z')
    expect(iso(r.to)).toBe('2026-03-31T21:00:00.000Z')
  })

  it('keeps February for 28 Feb 20:59Z in Istanbul', () => {
    const r = monthRange(Date.UTC(2026, 1, 28, 20, 59), IST)
    expect(iso(r.from)).toBe('2026-01-31T21:00:00.000Z')
    expect(iso(r.to)).toBe('2026-02-28T21:00:00.000Z')
  })

  it('differs from the UTC month for the same instant', () => {
    const r = monthRange(Date.UTC(2026, 1, 28, 21, 30), 'UTC')
    expect(iso(r.from)).toBe('2026-02-01T00:00:00.000Z')
    expect(iso(r.to)).toBe('2026-03-01T00:00:00.000Z')
  })

  it('rolls December into January of the next year', () => {
    const r = monthRange(Date.UTC(2026, 11, 31, 22, 0), IST)
    expect(iso(r.from)).toBe('2026-12-31T21:00:00.000Z')
    expect(iso(r.to)).toBe('2027-01-31T21:00:00.000Z')
  })
})

describe('parseLedgerLine / summarize', () => {
  it('rejects garbage and incomplete lines', () => {
    expect(parseLedgerLine('not json')).toBeUndefined()
    expect(parseLedgerLine('[]')).toBeUndefined()
    expect(parseLedgerLine(JSON.stringify({ ts: 1, model: 'x' }))).toBeUndefined()
    expect(parseLedgerLine(JSON.stringify({ ...entry({ ts: 1 }), usdSource: 'guess' }))).toBeUndefined()
    expect(parseLedgerLine(JSON.stringify(entry({ ts: 1 })))).toEqual(entry({ ts: 1 }))
  })

  it('drops non-numeric rate/tl instead of failing the line', () => {
    const parsed = parseLedgerLine(JSON.stringify({ ...entry({ ts: 1 }), tl: 'çok', rate: null }))
    expect(parsed).toBeDefined()
    expect(parsed?.tl).toBeUndefined()
    expect(parsed?.rate).toBeUndefined()
  })

  it('sums usd and tl, counts unknowns, sorts byModel by tl then usd', () => {
    const s = summarize([
      entry({ ts: 1, model: 'a', usd: 0.01, tl: 0.4 }),
      entry({ ts: 2, model: 'b', usd: 0.05, tl: undefined, rate: undefined }),
      entry({ ts: 3, model: 'c', usd: 0, tl: 0, usdSource: 'unknown' }),
      entry({ ts: 4, model: 'd', usd: 0.02, tl: 0.4 }),
      entry({ ts: 5, model: 'a', usd: 0.01, tl: 0.4, usdSource: 'provider' }),
    ])
    expect(s.count).toBe(5)
    expect(s.usd).toBeCloseTo(0.09, 10)
    expect(s.tl).toBeCloseTo(1.2, 10)
    expect(s.unknownCount).toBe(1)
    expect(s.byModel.map((m) => m.model)).toEqual(['a', 'd', 'b', 'c'])
    expect(s.byModel[0]).toEqual({ model: 'a', count: 2, usd: 0.02, tl: 0.8 })
    expect(s.byModel[2]).toEqual({ model: 'b', count: 1, usd: 0.05, tl: 0 })
  })

  it('returns zeros for no entries', () => {
    expect(summarize([])).toEqual({ count: 0, usd: 0, tl: 0, unknownCount: 0, byModel: [] })
  })
})

describe('JsonlLedger', () => {
  it('appends one JSON line per entry, creating the directory, and reloads in a new instance', async () => {
    const file = path.join(dir, 'nested', 'ledger.jsonl')
    const ledger = new JsonlLedger(file)
    await ledger.append(entry({ ts: 1_000 }))
    await ledger.append(entry({ ts: 2_000, model: 'anthropic/claude', usd: 0.2, tl: 8 }))

    const lines = fs.readFileSync(file, 'utf8').split('\n')
    expect(lines).toHaveLength(3)
    expect(lines[2]).toBe('')
    expect(JSON.parse(lines[0] ?? '')).toEqual(entry({ ts: 1_000 }))

    const again = new JsonlLedger(file)
    const all = await again.allTime()
    expect(all.count).toBe(2)
    expect(all.usd).toBeCloseTo(0.201, 10)
    expect(all.tl).toBeCloseTo(8.04, 10)
    expect(all.byModel[0]?.model).toBe('anthropic/claude')
  })

  it('does not double count entries appended before the first read', async () => {
    const file = path.join(dir, 'ledger.jsonl')
    fs.writeFileSync(file, `${JSON.stringify(entry({ ts: 10 }))}\n`)
    const ledger = new JsonlLedger(file)
    await ledger.append(entry({ ts: 20 }))
    expect((await ledger.allTime()).count).toBe(2)
    expect((await new JsonlLedger(file).allTime()).count).toBe(2)
  })

  it('skips corrupt lines and counts them', async () => {
    const file = path.join(dir, 'ledger.jsonl')
    fs.writeFileSync(
      file,
      [
        JSON.stringify(entry({ ts: 1 })),
        '{"half": tru',
        '',
        JSON.stringify({ ts: 2 }),
        JSON.stringify(entry({ ts: 3 })),
      ].join('\n'),
    )
    const ledger = new JsonlLedger(file)
    expect((await ledger.allTime()).count).toBe(2)
    expect(ledger.corruptLines).toBe(2)
  })

  it('applies Istanbul day and month boundaries in today()/month()', async () => {
    const file = path.join(dir, 'ledger.jsonl')
    const ledger = new JsonlLedger(file, IST)
    const lateFeb = Date.UTC(2026, 1, 28, 20, 59, 59)
    const earlyMar = Date.UTC(2026, 1, 28, 21, 0, 0)
    await ledger.append(entry({ ts: lateFeb, model: 'feb', tl: 1 }))
    await ledger.append(entry({ ts: earlyMar, model: 'mar', tl: 2 }))

    const now = Date.UTC(2026, 1, 28, 21, 30)
    const today = await ledger.today(now)
    expect(today.count).toBe(1)
    expect(today.byModel[0]?.model).toBe('mar')
    const month = await ledger.month(now)
    expect(month.count).toBe(1)
    expect(month.tl).toBe(2)

    const yesterday = await ledger.today(Date.UTC(2026, 1, 28, 20, 0))
    expect(yesterday.byModel[0]?.model).toBe('feb')

    const utc = new JsonlLedger(file, 'UTC')
    expect((await utc.today(now)).count).toBe(2)
    expect((await utc.month(now)).count).toBe(2)
  })

  it('summary uses a half-open range', async () => {
    const ledger = new JsonlLedger(path.join(dir, 'ledger.jsonl'))
    await ledger.append(entry({ ts: 100 }))
    await ledger.append(entry({ ts: 200 }))
    expect((await ledger.summary({ from: 100, to: 200 })).count).toBe(1)
    expect((await ledger.summary({ from: 100, to: 201 })).count).toBe(2)
    expect((await ledger.summary({ from: 101, to: 200 })).count).toBe(0)
  })

  it('starts empty when the file does not exist', async () => {
    const ledger = new JsonlLedger(path.join(dir, 'missing', 'ledger.jsonl'))
    expect(await ledger.allTime()).toEqual({ count: 0, usd: 0, tl: 0, unknownCount: 0, byModel: [] })
    expect(ledger.corruptLines).toBe(0)
  })
})
