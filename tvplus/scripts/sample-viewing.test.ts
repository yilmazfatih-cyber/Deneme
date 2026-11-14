/**
 * SENTETİK örnek üreteci: belirleyicilik (aynı tohum → aynı dosya), gzip, komut satırı ve üretilen verinin
 * ilkörnek yapısını gerçekten taşıması (bilim izleyicileri bilim başlıklarını izler).
 */
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { gunzipSync } from 'node:zlib'
import { afterEach, describe, expect, it } from 'vitest'
import { parseSampleArgs, writeSample } from './sample-viewing'

const dirs: string[] = []
afterEach(() => {
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true })
})
const tmp = () => {
  const d = mkdtempSync(join(tmpdir(), 'tvplus-sample-'))
  dirs.push(d)
  return d
}

describe('sample:viewing', () => {
  it('komut satırı: varsayılanlar ve hatalı değerler', () => {
    expect(parseSampleArgs(['--out', 'a.jsonl'], '2026-11-01')).toEqual({
      viewers: 1500,
      days: 90,
      seed: 7,
      out: 'a.jsonl',
      end: '2026-11-01',
    })
    expect(
      parseSampleArgs(['--viewers', '10', '--days', '3', '--seed', '9', '--out', 'b', '--end', '2026-01-02']),
    ).toMatchObject({ viewers: 10, days: 3, seed: 9, end: '2026-01-02' })
    expect(() => parseSampleArgs([])).toThrow(/--out/)
    expect(() => parseSampleArgs(['--out', 'x', '--viewers', '0'])).toThrow(/--viewers/)
    expect(() => parseSampleArgs(['--out', 'x', '--days', '1.5'])).toThrow(/--days/)
    expect(() => parseSampleArgs(['--out', 'x', '--end', '13/11/2026'])).toThrow(/--end/)
  })

  it('aynı tohum + aynı bitiş günü → bayt bayt aynı dosya; farklı tohum farklı; gzip açılınca aynı', async () => {
    const d = tmp()
    const base = { viewers: 60, days: 20, end: '2026-11-01' }
    const a = await writeSample({ ...base, seed: 3, out: join(d, 'a.jsonl') })
    await writeSample({ ...base, seed: 3, out: join(d, 'b.jsonl') })
    await writeSample({ ...base, seed: 4, out: join(d, 'c.jsonl') })
    await writeSample({ ...base, seed: 3, out: join(d, 'a.jsonl.gz') })
    const fa = readFileSync(join(d, 'a.jsonl'))
    expect(a.lines).toBeGreaterThan(200)
    expect(fa.equals(readFileSync(join(d, 'b.jsonl')))).toBe(true)
    expect(fa.equals(readFileSync(join(d, 'c.jsonl')))).toBe(false)
    expect(gunzipSync(readFileSync(join(d, 'a.jsonl.gz'))).equals(fa)).toBe(true)

    // Her satır Mixpanel biçiminde ve SENTETİK işaretli; zaman aralığın içinde (saniye)
    const rows = fa
      .toString()
      .trim()
      .split('\n')
      .map((l) => JSON.parse(l) as { event: string; properties: Record<string, unknown> })
    const lo = Date.parse('2026-10-12T00:00:00+03:00') / 1000
    const hi = Date.parse('2026-11-02T00:00:00+03:00') / 1000 + 6 * 3600
    for (const r of rows) {
      expect(r.properties.synthetic).toBe(true)
      expect(String(r.properties.distinct_id)).toMatch(/^sentetik-3-\d{6}$/)
      expect(String(r.properties.$insert_id)).toMatch(/^[0-9a-f]{32}$/)
      const t = r.properties.time as number
      expect(Number.isInteger(t) && t >= lo && t <= hi).toBe(true)
    }
    const names = new Set(rows.map((r) => r.event))
    for (const n of ['Video Start', 'Video Stop']) expect(names.has(n)).toBe(true)
  })

  it('ilkörnek yapısı veride görünür: izleyicinin en çok izlediği türler tutarlı kümelenir', async () => {
    const d = tmp()
    await writeSample({ viewers: 200, days: 60, seed: 11, end: '2026-11-01', out: join(d, 's.jsonl') })
    const rows = readFileSync(join(d, 's.jsonl'), 'utf8')
      .trim()
      .split('\n')
      .map((l) => JSON.parse(l))
    // İzleyici başına tekil içerik sayısı katalogdan belirgin küçük (rastgele değil, zevke bağlı)
    const byViewer = new Map<string, Set<string>>()
    for (const r of rows) {
      if (r.event !== 'Video Start') continue
      const v = r.properties.distinct_id as string
      if (!byViewer.has(v)) byViewer.set(v, new Set())
      byViewer.get(v)!.add(r.properties.content_id as string)
    }
    const counts = [...byViewer.values()].map((s) => s.size)
    expect(byViewer.size).toBeGreaterThan(100)
    const devices = new Set(rows.map((r) => r.properties.platform))
    expect(devices.size).toBeGreaterThanOrEqual(4)
    const countries = new Set(rows.map((r) => r.properties.mp_country_code))
    expect(countries.has('TR')).toBe(true)
    expect(countries.size).toBeGreaterThanOrEqual(3)
    expect(counts.reduce((a, b) => a + b, 0) / counts.length).toBeLessThan(40)
  })
})
