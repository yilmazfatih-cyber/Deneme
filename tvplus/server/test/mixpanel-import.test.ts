/**
 * Akışlı içe aktarıcı: örnek dosya raporu, gzip, boş/bozuk/çok uzun satırlar, parça sınırında çok baytlı karakter,
 * yeniden içe aktarmada yinelenme, deneme kipi, boyut sınırı, bozuk gzip ve takma kimlik (veri klasöründe ham
 * distinct_id kalmaz).
 */
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'
import { afterEach, describe, expect, it } from 'vitest'
import { zMixpanelMapping } from '../../shared/mixpanel-mapping'
import { loadContent } from '../src/services/catalog/load'
import {
  ImportFormatError,
  ImportTooLargeError,
  importMixpanelExport,
  type ImportContext,
} from '../src/services/mixpanel/importer'
import { compileMapping } from '../src/services/mixpanel/mapping'
import { createTitleResolver } from '../src/services/viewing/resolve'
import { openViewingStore, type ViewingStore } from '../src/services/viewing/store'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const SAMPLE = join(ROOT, 'content', 'analytics', 'ornek-mixpanel.jsonl')
const titles = loadContent(join(ROOT, 'content'), () => {}).titles.map((t) => t.title)
const mapping = compileMapping(
  zMixpanelMapping.parse(JSON.parse(readFileSync(join(ROOT, 'content', 'analytics', 'mixpanel-mapping.json'), 'utf8'))),
)
const resolver = createTitleResolver(titles)

const dirs: string[] = []
const stores: ViewingStore[] = []
afterEach(() => {
  while (stores.length) stores.pop()!.close()
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true })
})
async function setup() {
  const dir = mkdtempSync(join(tmpdir(), 'tvplus-mp-'))
  dirs.push(dir)
  const store = await openViewingStore({ dir, viewerKey: Buffer.from('k1'), snapshotDelayMs: 0 })
  stores.push(store)
  const ctx = (extra: Partial<ImportContext> = {}): ImportContext => ({
    source: 'MIXPANEL',
    mapping,
    resolver,
    viewerKey: Buffer.from('k1'),
    eventKey: Buffer.from('k2'),
    sink: store,
    batchSize: 7,
    ...extra,
  })
  return { dir, store, ctx }
}
/** Tamponu verilen boyda parçalara bölen akış */
async function* chunks(buf: Buffer, size: number): AsyncGenerator<Buffer> {
  for (let i = 0; i < buf.length; i += size) yield buf.subarray(i, i + size)
}
const line = (event: string, props: Record<string, unknown>) =>
  JSON.stringify({ event, properties: { time: 1_790_000_000, distinct_id: 'ham-kisi-1', ...props } })

describe('içe aktarma', () => {
  it('örnek dosya: kabul, yinelenen, reddedilen, eşlenmeyen olaylar ve bilinmeyen içerik raporu', async () => {
    const { store, ctx } = await setup()
    const buf = readFileSync(SAMPLE)
    const r = await importMixpanelExport(chunks(buf, 4096), ctx())
    expect(r).toMatchObject({ source: 'MIXPANEL', lines: 116, accepted: 110, duplicates: 1, rejected: 3 })
    expect(r.unmappedEvents).toEqual({ 'App Open': 1, 'Page View': 1 })
    expect(r.unknownTitles).toEqual([{ externalId: 'cnt_99999', count: 1 }])
    expect(r.from).toBe('2026-10-28')
    expect(r.to).toBe('2026-11-10')
    // Kenar satırları: slug ile, ad ile eşleşenler özet üretti
    const facts = store.facts({ sources: ['MIXPANEL'] })
    expect(facts.some((f) => f.titleId === 80010001)).toBe(true) // 'sintel'
    expect(facts.some((f) => f.titleId === 80020003)).toBe(true) // 'Nosferatu'
    // İkinci içe aktarma: hepsi yinelenen
    const again = await importMixpanelExport(chunks(buf, 1000), ctx())
    expect(again).toMatchObject({ lines: 116, accepted: 0, duplicates: 111, rejected: 3 })
  })

  it('gzip ile düz dosya aynı sonucu verir; parça sınırı ve CRLF sorun değil', async () => {
    const a = await setup()
    const b = await setup()
    const plain = readFileSync(SAMPLE)
    const crlf = Buffer.from(plain.toString('utf8').replace(/\n/g, '\r\n'))
    const r1 = await importMixpanelExport(chunks(plain, 13), a.ctx())
    const r2 = await importMixpanelExport(chunks(gzipSync(crlf), 5), b.ctx())
    const strip = (r: typeof r1) => ({ ...r, startedAt: '', finishedAt: '' })
    expect(strip(r2)).toEqual(strip(r1))
    expect(b.store.facts({ sources: ['MIXPANEL'] })).toEqual(a.store.facts({ sources: ['MIXPANEL'] }))
  })

  it('çok baytlı karakter parça sınırında bölünse de doğru okunur', async () => {
    const { store, ctx } = await setup()
    const text = `${line('Search', { $insert_id: 's1', search_query: 'Türk Dünyası Keşif Rotası ğüşiöç' })}\n`
    const r = await importMixpanelExport(chunks(Buffer.from(text), 3), ctx())
    expect(r.accepted).toBe(1)
    const day = readdirSync(join(dirs[0]!, 'MIXPANEL'))[0]!
    expect(readFileSync(join(dirs[0]!, 'MIXPANEL', day), 'utf8')).toContain('Türk Dünyası Keşif Rotası ğüşiöç')
    expect(store.sources()[1]!.events).toBe(1)
  })

  it('boş, bozuk ve çok uzun satırlar içe aktarmayı durdurmaz', async () => {
    const { ctx } = await setup()
    const long = `{"event":"Video Start","properties":{"x":"${'a'.repeat(5 * 1024 * 1024)}"}}`
    const text = [
      '',
      '   ',
      '{bozuk',
      '[]',
      'null',
      long,
      line('Video Start', { $insert_id: 'u1', content_id: '80010001' }),
      '',
    ].join('\n')
    const r = await importMixpanelExport(chunks(Buffer.from(text), 64 * 1024), ctx())
    expect(r).toMatchObject({ lines: 5, accepted: 1, rejected: 4 })
  })

  it('$insert_id yoksa satır özeti: aynı satır iki kez sayılmaz, farklı satır sayılır', async () => {
    const { ctx } = await setup()
    const l1 = line('Video Start', { content_id: '80010001' })
    const l2 = line('Video Start', { content_id: '80010002' })
    const r = await importMixpanelExport(chunks(Buffer.from([l1, l1, l2].join('\n')), 100), ctx())
    expect(r).toMatchObject({ accepted: 2, duplicates: 1 })
  })

  it('deneme kipi depoya yazmaz ama yinelenenleri depoya göre de sayar', async () => {
    const { store, dir, ctx } = await setup()
    const buf = readFileSync(SAMPLE)
    const dry = await importMixpanelExport(chunks(buf, 4096), ctx({ dryRun: true }))
    expect(dry).toMatchObject({ accepted: 110, duplicates: 1 })
    expect(store.isEmpty()).toBe(true)
    expect(readdirSync(dir).includes('MIXPANEL')).toBe(false)
    await importMixpanelExport(chunks(buf, 4096), ctx())
    const dry2 = await importMixpanelExport(chunks(buf, 4096), ctx({ dryRun: true }))
    expect(dry2).toMatchObject({ accepted: 0, duplicates: 111 })
  })

  it('boyut sınırı ve bozuk gzip anlaşılır hatayla durur', async () => {
    const { ctx } = await setup()
    const buf = readFileSync(SAMPLE)
    await expect(importMixpanelExport(chunks(buf, 1024), ctx({ maxBytes: 5000 }))).rejects.toBeInstanceOf(
      ImportTooLargeError,
    )
    const gz = gzipSync(buf)
    const broken = Buffer.concat([gz.subarray(0, 200), Buffer.from('çöp veri')])
    await expect(importMixpanelExport(chunks(broken, 64), ctx())).rejects.toBeInstanceOf(ImportFormatError)
    await expect(importMixpanelExport(chunks(gz, 1024), ctx({ maxBytes: 500 }))).rejects.toBeInstanceOf(
      ImportTooLargeError,
    )
  })

  it('takma kimlik: içe aktarmadan sonra veri klasöründe ham distinct_id ve eşlenmemiş özellik yok', async () => {
    const { dir, store, ctx } = await setup()
    const raw = 'gizli-kisi-8c41f2@ornek.invalid'
    const text = [
      line('Video Start', {
        distinct_id: raw,
        $insert_id: 'p1',
        content_id: '80010001',
        $email: raw,
        $ip: '198.51.100.7',
      }),
      line('Video Stop', { distinct_id: raw, $insert_id: 'p2', content_id: '80010001', watched_seconds: 100 }),
      line('Page View', { distinct_id: raw, $insert_id: 'p3' }),
    ].join('\n')
    await importMixpanelExport(chunks(Buffer.from(text), 50), ctx())
    store.flush()
    const hits: string[] = []
    const walk = (d: string) => {
      for (const f of readdirSync(d)) {
        const p = join(d, f)
        if (statSync(p).isDirectory()) walk(p)
        else {
          const b = readFileSync(p)
          for (const needle of [raw, 'gizli-kisi', '198.51.100.7', 'ornek.invalid'])
            if (b.includes(Buffer.from(needle))) hits.push(`${f}: ${needle}`)
        }
      }
    }
    walk(dir)
    expect(hits).toEqual([])
    const facts = store.facts({ sources: ['MIXPANEL'] })
    expect(facts).toHaveLength(1)
    expect(facts[0]!.viewerId).toMatch(/^v_[A-Za-z0-9_-]{16}$/)
  })
})
