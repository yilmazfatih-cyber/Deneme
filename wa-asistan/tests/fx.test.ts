import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { HttpFxService, parseErApi, parseFrankfurter, parseTcmbUsd } from '../src/core/fx.js'

const TCMB_XML = `<?xml version="1.0" encoding="UTF-8"?>
<Tarih_Date Tarih="02.11.2026" Date="11/02/2026" Bulten_No="2026/210">
  <Currency CrossOrder="0" Kod="USD" CurrencyCode="USD">
    <Unit>1</Unit><Isim>ABD DOLARI</Isim><CurrencyName>US DOLLAR</CurrencyName>
    <ForexBuying>41.1000</ForexBuying><ForexSelling>41.1800</ForexSelling>
    <BanknoteBuying>41.0700</BanknoteBuying><BanknoteSelling>41.2400</BanknoteSelling>
    <CrossRateUSD/><CrossRateOther/>
  </Currency>
  <Currency CrossOrder="9" Kod="EUR" CurrencyCode="EUR"><Unit>1</Unit><ForexSelling>47.9</ForexSelling></Currency>
</Tarih_Date>`

const tmp = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'fx-')), 'fx.json')

type Route = { ok?: boolean; status?: number; body: string } | Error
function fetchFor(routes: Record<string, Route>) {
  const calls: string[] = []
  const impl = vi.fn(async (url: string | URL | Request) => {
    const u = String(url)
    calls.push(u)
    const key = Object.keys(routes).find((k) => u.includes(k))
    const r = key ? routes[key] : undefined
    if (!r) throw new Error('bilinmeyen adres ' + u)
    if (r instanceof Error) throw r
    return new Response(r.body, { status: r.status ?? 200 })
  }) as unknown as typeof fetch
  return { impl, calls }
}

const FRANK = { body: JSON.stringify({ amount: 1, base: 'USD', date: '2026-11-02', rates: { TRY: 41.5 } }) }
const ER = { body: JSON.stringify({ result: 'success', rates: { TRY: 41.9 } }) }
const TCMB = { body: TCMB_XML }

describe('parsers', () => {
  it('reads USD ForexSelling from the TCMB bulletin, not another currency', () => {
    expect(parseTcmbUsd(TCMB_XML)).toBe(41.18)
  })
  it('falls back to BanknoteSelling when ForexSelling is empty', () => {
    const xml = '<Currency Kod="USD"><ForexSelling></ForexSelling><BanknoteSelling>41,2</BanknoteSelling></Currency>'
    expect(parseTcmbUsd(xml)).toBe(41.2)
  })
  it('returns undefined without a USD row or on garbage', () => {
    expect(parseTcmbUsd('<Currency Kod="EUR"><ForexSelling>1</ForexSelling></Currency>')).toBeUndefined()
    expect(parseTcmbUsd('<html>bakım</html>')).toBeUndefined()
  })
  it('reads frankfurter and er-api', () => {
    expect(parseFrankfurter({ rates: { TRY: 41.5 } })).toBe(41.5)
    expect(parseFrankfurter({ rates: {} })).toBeUndefined()
    expect(parseErApi({ result: 'success', rates: { TRY: 41.9 } })).toBe(41.9)
    expect(parseErApi({ result: 'error', rates: { TRY: 41.9 } })).toBeUndefined()
  })
})

describe('HttpFxService', () => {
  const clock = (t = 1_000_000) => {
    let now = t
    return { now: () => now, advance: (ms: number) => (now += ms) }
  }

  it('prefers TCMB and persists the result', async () => {
    const { impl, calls } = fetchFor({ 'tcmb.gov.tr': TCMB, frankfurter: FRANK, 'er-api': ER })
    const file = tmp()
    const fx = new HttpFxService({ file, refreshHours: 6, fetchImpl: impl, now: clock().now })
    const r = await fx.rate()
    expect(r).toMatchObject({ rate: 41.18, source: 'tcmb' })
    expect(calls).toHaveLength(1)
    expect(JSON.parse(fs.readFileSync(file, 'utf8'))).toMatchObject({ rate: 41.18, source: 'tcmb' })
  })

  it('serves a fresh cache without a request and refreshes after the interval', async () => {
    const c = clock()
    const { impl, calls } = fetchFor({ 'tcmb.gov.tr': TCMB })
    const fx = new HttpFxService({ file: tmp(), refreshHours: 6, fetchImpl: impl, now: c.now })
    await fx.rate()
    c.advance(5 * 3_600_000)
    await fx.rate()
    expect(calls).toHaveLength(1)
    c.advance(2 * 3_600_000)
    await fx.rate()
    expect(calls).toHaveLength(2)
  })

  it('falls through TCMB → frankfurter → er-api', async () => {
    const warn = vi.fn()
    const a = fetchFor({ 'tcmb.gov.tr': new Error('ağ'), frankfurter: FRANK, 'er-api': ER })
    expect(await new HttpFxService({ file: tmp(), refreshHours: 6, fetchImpl: a.impl, warn }).rate()).toMatchObject({
      rate: 41.5,
      source: 'frankfurter',
    })
    expect(warn).toHaveBeenCalledOnce()
    const b = fetchFor({ 'tcmb.gov.tr': { status: 404, body: '' }, frankfurter: { body: '{}' }, 'er-api': ER })
    expect(await new HttpFxService({ file: tmp(), refreshHours: 6, fetchImpl: b.impl }).rate()).toMatchObject({
      rate: 41.9,
      source: 'erapi',
    })
  })

  it('serves the stale cache when every source fails, and nothing when there is no cache', async () => {
    const c = clock()
    const file = tmp()
    const ok = fetchFor({ 'tcmb.gov.tr': TCMB })
    await new HttpFxService({ file, refreshHours: 1, fetchImpl: ok.impl, now: c.now }).rate()
    c.advance(48 * 3_600_000)
    const down = fetchFor({ 'tcmb.gov.tr': new Error('x'), frankfurter: new Error('x'), 'er-api': new Error('x') })
    const stale = await new HttpFxService({ file, refreshHours: 1, fetchImpl: down.impl, now: c.now }).rate()
    expect(stale).toMatchObject({ rate: 41.18, source: 'cache' })
    expect(await new HttpFxService({ file: tmp(), refreshHours: 1, fetchImpl: down.impl }).rate()).toBeUndefined()
  })

  it('USD_TRY from the environment wins and never touches the network', async () => {
    const { impl, calls } = fetchFor({})
    const fx = new HttpFxService({ file: tmp(), refreshHours: 6, envManual: 40, fetchImpl: impl })
    expect(await fx.rate()).toMatchObject({ rate: 40, source: 'manual' })
    expect(await fx.refresh()).toMatchObject({ rate: 40, source: 'manual' })
    expect(calls).toHaveLength(0)
  })

  it('/kur <sayı> persists a manual rate; 0 clears it', async () => {
    const file = tmp()
    const { impl } = fetchFor({ 'tcmb.gov.tr': TCMB })
    const fx = new HttpFxService({ file, refreshHours: 6, fetchImpl: impl })
    expect(await fx.setManual(42)).toMatchObject({ rate: 42, source: 'manual' })
    expect(await new HttpFxService({ file, refreshHours: 6, fetchImpl: impl }).rate()).toMatchObject({
      rate: 42,
      source: 'manual',
    })
    expect(await fx.setManual(0)).toMatchObject({ rate: 41.18, source: 'tcmb' })
  })

  it('applies the multiplier to the rate it reports, and stores the base rate', async () => {
    const file = tmp()
    const { impl } = fetchFor({ 'tcmb.gov.tr': TCMB })
    const fx = new HttpFxService({ file, refreshHours: 6, multiplier: 1.09, fetchImpl: impl })
    expect((await fx.rate())?.rate).toBeCloseTo(44.8862, 4)
    expect(JSON.parse(fs.readFileSync(file, 'utf8')).rate).toBe(41.18)
  })

  it('shares one in-flight refresh between concurrent callers', async () => {
    const { impl, calls } = fetchFor({ 'tcmb.gov.tr': TCMB })
    const fx = new HttpFxService({ file: tmp(), refreshHours: 6, fetchImpl: impl })
    await Promise.all([fx.refresh(), fx.refresh(), fx.refresh()])
    expect(calls).toHaveLength(1)
  })
})
