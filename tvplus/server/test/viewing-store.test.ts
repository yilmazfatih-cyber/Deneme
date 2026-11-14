/**
 * İzleme deposu: özet hesapları (ilgi puanı, liste/beğeni sırası, pencereler, İstanbul ayları), yinelenmenin
 * yeniden açılışta korunması, anlık görüntü ↔ günlükten kurma eşdeğerliği, kuyruk oynatma, activeSources kuralı,
 * clear, temizleme (fazla alan saklanmaz), kilit.
 */
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { ViewingEvent, ViewingSource } from '../../shared/intelligence'
import { mulberry32 } from '../src/services/mixpanel/synthetic'
import {
  engagementOf,
  openViewingStore,
  ViewingStoreLockedError,
  type ViewingStore,
} from '../src/services/viewing/store'

const KEY = Buffer.from('test-viewer-key')
const dirs: string[] = []
const stores: ViewingStore[] = []
afterEach(() => {
  while (stores.length) stores.pop()!.close()
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true })
})
function tmp(): string {
  const d = mkdtempSync(join(tmpdir(), 'tvplus-viewing-'))
  dirs.push(d)
  return d
}
async function open(dir: string, delay = 0, realDataMinViewers?: number): Promise<ViewingStore> {
  const s = await openViewingStore({ dir, viewerKey: KEY, snapshotDelayMs: delay, realDataMinViewers })
  s.setReference(() => 1000)
  stores.push(s)
  return s
}
let seq = 0
const T0 = Date.UTC(2026, 9, 10, 12)
function ev(p: Partial<ViewingEvent> & Pick<ViewingEvent, 'type'>): ViewingEvent {
  return {
    id: `e${++seq}`,
    source: 'MIXPANEL',
    ts: T0,
    viewerId: 'v_aaaaaaaa',
    titleId: 80010001,
    videoId: 80010001,
    ...p,
  }
}

/** Karşılaştırma için deponun tüm görünür çıktısı */
function dump(s: ViewingStore, sources: ViewingSource[] = ['TVPLUS', 'MIXPANEL', 'SYNTHETIC']) {
  const facts = s
    .facts({ sources })
    .sort((a, b) => (a.viewerId + a.titleId + a.source < b.viewerId + b.titleId + b.source ? -1 : 1))
  const totals = [...s.titleTotals({ sources })].sort((a, b) => a[0] - b[0])
  const win = [...s.titleTotals({ sources, from: Date.UTC(2026, 9, 5), to: Date.UTC(2026, 9, 20) })].sort(
    (a, b) => a[0] - b[0],
  )
  const monthly = [...s.monthlyTitleHours({ sources })].map(([m, h]) => [m, [...h].sort((a, b) => a[0] - b[0])])
  const status = s.sources().map(({ lastImport: _l, ...rest }) => rest)
  const viewers = [...new Set(facts.map((f) => f.viewerId))].sort()
  return { facts, totals, win, monthly, status, traits: viewers.map((v) => s.viewerTraits(v)) }
}

/** Tohumlu rastgele olaylar: birkaç kaynak, izleyici, başlık, tür, sıra karışık */
function randomEvents(n: number, seed: number): ViewingEvent[] {
  const rng = mulberry32(seed)
  const types: ViewingEvent['type'][] = [
    'PLAY_START',
    'PLAY_PROGRESS',
    'PLAY_END',
    'ADD_TO_LIST',
    'REMOVE_FROM_LIST',
    'RATING',
    'IMPRESSION',
    'SEARCH',
  ]
  const out: ViewingEvent[] = []
  for (let i = 0; i < n; i++) {
    const type = types[Math.floor(rng() * types.length)]!
    const known = rng() > 0.05
    out.push({
      id: `r${seed}-${i}`,
      source: (['MIXPANEL', 'SYNTHETIC', 'TVPLUS'] as const)[Math.floor(rng() * 3)]!,
      type,
      ts: Date.UTC(2026, 8, 1) + Math.floor(rng() * 70 * 86_400_000),
      viewerId: `v_viewer${Math.floor(rng() * 40)}`,
      titleId: known ? 80010001 + Math.floor(rng() * 6) : null,
      videoId: null,
      watchedSec: type === 'PLAY_PROGRESS' || type === 'PLAY_END' ? Math.floor(rng() * 900) : undefined,
      completed: type === 'PLAY_END' ? rng() < 0.4 : undefined,
      rating: type === 'RATING' ? ([-1, 1, 2] as const)[Math.floor(rng() * 3)] : undefined,
      device: (['TV', 'MOBILE', 'WEB', 'OTHER'] as const)[Math.floor(rng() * 4)],
      country: (['TR', 'DE', 'NL'] as const)[Math.floor(rng() * 3)],
    })
  }
  return out
}

describe('özet hesapları', () => {
  it('oynatma, izlenen süre, tamamlama ve ilgi puanı formülü', async () => {
    const s = await open(tmp())
    s.append([
      ev({ type: 'PLAY_START', ts: T0 }),
      ev({ type: 'PLAY_PROGRESS', ts: T0 + 300_000, watchedSec: 300 }),
      ev({ type: 'PLAY_END', ts: T0 + 900_000, watchedSec: 600, completed: true }),
    ])
    let [f] = s.factsOfViewer('v_aaaaaaaa')
    expect(f).toMatchObject({ plays: 1, watchedSec: 900, completions: 1, firstTs: T0, lastTs: T0 + 900_000 })
    expect(f!.engagement).toBeCloseTo(0.6 * 0.9 + 0.15, 6)
    s.append([ev({ type: 'ADD_TO_LIST', ts: T0 + 1_000_000 }), ev({ type: 'RATING', ts: T0 + 1_000_001, rating: 2 })])
    ;[f] = s.factsOfViewer('v_aaaaaaaa')
    expect(f).toMatchObject({ inList: true, rating: 2 })
    expect(f!.engagement).toBeCloseTo(0.54 + 0.15 + 0.1 + 0.2, 6)
    s.append([ev({ type: 'RATING', ts: T0 + 2_000_000, rating: -1 })])
    expect(s.factsOfViewer('v_aaaaaaaa')[0]!.engagement).toBeCloseTo((0.54 + 0.15 + 0.1) * 0.3, 6)
    // Puan 1'i aşmaz; ikinci oynatma payı
    s.append([ev({ type: 'PLAY_START', ts: T0 + 3_000_000 }), ev({ type: 'RATING', ts: T0 + 3_000_001, rating: 2 })])
    s.append([ev({ type: 'PLAY_END', ts: T0 + 4_000_000, watchedSec: 5000 })])
    expect(s.factsOfViewer('v_aaaaaaaa')[0]!.engagement).toBe(1)
    expect(engagementOf({ watchedSec: 0, completions: 0, inList: true, plays: 0, rating: null }, 1000)).toBe(0.1)
  })

  it('liste ve beğeni zaman damgasına göre en son olana göre; geliş sırası önemsiz', async () => {
    const s = await open(tmp())
    s.append([
      ev({ type: 'REMOVE_FROM_LIST', ts: T0 + 5000 }),
      ev({ type: 'ADD_TO_LIST', ts: T0 + 3000 }),
      ev({ type: 'RATING', ts: T0 + 9000 }), // değerlendirmeyi temizler
      ev({ type: 'RATING', ts: T0 + 1000, rating: 2 }),
    ])
    // Hiçbir sinyal kalmayan özet dönmez
    expect(s.facts({ sources: ['MIXPANEL'] })).toHaveLength(0)
    s.append([ev({ type: 'PLAY_START', ts: T0 }), ev({ type: 'ADD_TO_LIST', ts: T0 + 4000 })])
    expect(s.factsOfViewer('v_aaaaaaaa')[0]).toMatchObject({ inList: false, rating: null, plays: 1 })
  })

  it('başlığı eşlenmeyen olay sayılır ama özet üretmez; gösterim/arama özete girmez', async () => {
    const s = await open(tmp())
    s.append([
      ev({ type: 'PLAY_START', titleId: null, videoId: null }),
      ev({ type: 'IMPRESSION' }),
      ev({ type: 'SEARCH', titleId: null, videoId: null, query: 'uzay' }),
    ])
    expect(s.facts({ sources: ['MIXPANEL'] })).toHaveLength(0)
    const st = s.sources().find((x) => x.source === 'MIXPANEL')!
    expect(st).toMatchObject({ events: 3, viewers: 1, titles: 1 })
  })

  it('başlık toplamları, pencere ve İstanbul ayı sınırı', async () => {
    const s = await open(tmp())
    // 30 Eylül 22:30 UTC = 1 Ekim 01:30 İstanbul → Ekim
    const lateSep = Date.UTC(2026, 8, 30, 22, 30)
    s.append([
      ev({ type: 'PLAY_START', ts: lateSep, viewerId: 'v_bbbbbbbb' }),
      ev({ type: 'PLAY_END', ts: lateSep + 1000, watchedSec: 3600, completed: true, viewerId: 'v_bbbbbbbb' }),
      ev({ type: 'PLAY_START', ts: Date.UTC(2026, 8, 15, 12), viewerId: 'v_cccccccc' }),
      ev({ type: 'PLAY_END', ts: Date.UTC(2026, 8, 15, 13), watchedSec: 1800, viewerId: 'v_cccccccc' }),
      ev({
        type: 'PLAY_START',
        ts: Date.UTC(2026, 8, 15, 12),
        viewerId: 'v_cccccccc',
        titleId: 80010002,
        videoId: 80010002,
      }),
    ])
    const all = s.titleTotals({ sources: ['MIXPANEL'] }).get(80010001)!
    expect(all).toEqual({ titleId: 80010001, viewers: 2, plays: 2, hours: 1.5, completions: 1 })
    // Pencere: Ekim (UTC gece yarısı sınırı) → yalnız İstanbul 1 Ekim günü
    const oct = s.titleTotals({ sources: ['MIXPANEL'], from: Date.UTC(2026, 9, 1), to: Date.UTC(2026, 10, 1) })
    expect(oct.get(80010001)).toEqual({ titleId: 80010001, viewers: 1, plays: 1, hours: 1, completions: 1 })
    expect(oct.has(80010002)).toBe(false)
    // İstanbul gece yarısı sınırı da aynı günü seçer
    const octIst = s.titleTotals({
      sources: ['MIXPANEL'],
      from: Date.UTC(2026, 8, 30, 21),
      to: Date.UTC(2026, 9, 31, 21),
    })
    expect(octIst.get(80010001)!.plays).toBe(1)
    const monthly = s.monthlyTitleHours({ sources: ['MIXPANEL'] })
    expect([...monthly.keys()]).toEqual(['2026-09', '2026-10'])
    expect(monthly.get('2026-10')!.get(80010001)).toBe(1)
    expect(monthly.get('2026-09')!.get(80010001)).toBe(0.5)
  })

  it('izleyici özellikleri: en sık cihaz ve ülke', async () => {
    const s = await open(tmp())
    s.append([
      ev({ type: 'IMPRESSION', device: 'TV', country: 'DE' }),
      ev({ type: 'PLAY_START', device: 'TV', country: 'TR' }),
      ev({ type: 'PLAY_START', device: 'MOBILE', country: 'TR' }),
    ])
    expect(s.viewerTraits('v_aaaaaaaa')).toEqual({ device: 'TV', country: 'TR' })
    expect(s.viewerTraits('v_yokyokyok')).toEqual({ device: null, country: null })
  })

  it('geçersiz olayı reddeder; bilinmeyen alanları diske yazmaz', async () => {
    const dir = tmp()
    const s = await open(dir)
    const bad = [
      { ...ev({ type: 'PLAY_START' }), viewerId: 'ham-kimlik' },
      { ...ev({ type: 'PLAY_START' }), type: 'OYNAT' },
      { ...ev({ type: 'PLAY_START' }), ts: Number.NaN },
      { ...ev({ type: 'PLAY_START' }), titleId: -3 },
      { ...ev({ type: 'PLAY_START' }), source: 'BASKA' },
    ] as unknown as ViewingEvent[]
    const extra = {
      ...ev({ type: 'PLAY_START' }),
      email: 'kisi@ornek.invalid',
      raw: { distinct_id: 'x' },
    } as ViewingEvent
    expect(s.append([...bad, extra])).toEqual({ accepted: 1, duplicates: 0, rejected: 5 })
    const files = readdirSync(join(dir, 'MIXPANEL'))
    const text = readFileSync(join(dir, 'MIXPANEL', files[0]!), 'utf8')
    expect(text).not.toContain('ornek.invalid')
    expect(text).not.toContain('distinct_id')
  })
})

describe('kalıcılık', () => {
  it('yinelenme yeniden açılışta korunur', async () => {
    const dir = tmp()
    const a = await open(dir)
    const evs = [ev({ type: 'PLAY_START' }), ev({ type: 'PLAY_END', watchedSec: 60 })]
    expect(a.append(evs)).toEqual({ accepted: 2, duplicates: 0, rejected: 0 })
    expect(a.append(evs)).toEqual({ accepted: 0, duplicates: 2, rejected: 0 })
    a.close()
    stores.length = 0
    const b = await open(dir)
    expect(b.append(evs)).toEqual({ accepted: 0, duplicates: 2, rejected: 0 })
    expect(b.has('MIXPANEL', evs[0]!.id)).toBe(true)
    expect(b.has('SYNTHETIC', evs[0]!.id)).toBe(false)
    expect(b.factsOfViewer('v_aaaaaaaa')[0]!.watchedSec).toBe(60)
  })

  it('anlık görüntüden açılış ile günlükten baştan kurma aynı özetleri verir', async () => {
    const dir = tmp()
    const a = await open(dir, 60_000)
    const evs = randomEvents(4000, 42)
    for (let i = 0; i < evs.length; i += 500) a.append(evs.slice(i, i + 500))
    a.append(evs.slice(0, 300)) // yinelenenler
    const live = dump(a)
    expect(live.facts.length).toBeGreaterThan(100)
    a.close()
    stores.length = 0

    const fromSnapshot = await open(dir)
    expect(dump(fromSnapshot)).toEqual(live)
    fromSnapshot.close()
    stores.length = 0

    // Anlık görüntüyü ve kimlik dosyalarını sil → günlükten kur
    for (const f of readdirSync(dir)) if (f === 'snapshot.json' || f.endsWith('.bin')) rmSync(join(dir, f))
    const rebuilt = await open(dir)
    expect(dump(rebuilt)).toEqual(live)
    // Yinelenme bilgisi de günlükten geri gelir
    expect(rebuilt.append(evs.slice(0, 50)).duplicates).toBe(50)
  })

  it('çökme: anlık görüntüden sonra yazılan kuyruk açılışta oynatılır; yarım satır atlanır', async () => {
    const dir = tmp()
    const a = await open(dir, 60_000)
    const evs = randomEvents(1000, 7)
    a.append(evs.slice(0, 600))
    a.flush()
    a.append(evs.slice(600))
    const live = dump(a)
    // close() çağrılmadan (çökme) aynı dizinden açılır; yarım satır ekle
    const day = readdirSync(join(dir, 'MIXPANEL'))[0]!
    writeFileSync(join(dir, 'MIXPANEL', day), readFileSync(join(dir, 'MIXPANEL', day), 'utf8') + '{"id":"yarim', {
      flag: 'w',
    })
    stores.length = 0
    const b = await open(dir)
    expect(dump(b)).toEqual(live)
    // Onarılan dosyaya yeni yazım sonraki açılışta da tutarlı
    b.append([ev({ type: 'PLAY_START', ts: Date.UTC(2026, 8, 2) })])
    const after = dump(b)
    b.close()
    stores.length = 0
    expect(dump(await open(dir))).toEqual(after)
  })
})

describe('kaynaklar', () => {
  it('activeSources: eşiğin altında SENTETİK gerçek kaynaklarla birlikte etkin kalır', async () => {
    const s = await open(tmp(), 0, 3)
    expect(s.activeSources()).toEqual([])
    expect(s.isEmpty()).toBe(true)
    s.append([ev({ type: 'PLAY_START', source: 'SYNTHETIC' })])
    expect(s.activeSources()).toEqual(['SYNTHETIC'])
    expect(s.facts()).toHaveLength(1)
    const r0 = s.revision()
    s.append([ev({ type: 'PLAY_START', source: 'TVPLUS', viewerId: 'v_profil01' })])
    expect(s.revision()).toBeGreaterThan(r0)
    // 1 gerçek izleyici < 3 → örnek açık kalır; profilin kendi TVPLUS özeti de sayılır
    expect(s.activeSources()).toEqual(['TVPLUS', 'SYNTHETIC'])
    expect(
      s
        .facts()
        .map((f) => f.source)
        .sort(),
    ).toEqual(['SYNTHETIC', 'TVPLUS'])
    // Özetsiz izleyiciler (yalnız gösterim) eşiğe sayılmaz
    s.append([
      ev({ type: 'IMPRESSION', source: 'MIXPANEL', viewerId: 'v_gosterim1' }),
      ev({ type: 'IMPRESSION', source: 'MIXPANEL', viewerId: 'v_gosterim2' }),
    ])
    expect(s.activeSources()).toEqual(['TVPLUS', 'MIXPANEL', 'SYNTHETIC'])
    expect(Object.fromEntries(s.sources().map((x) => [x.source, x.active]))).toEqual({
      TVPLUS: true,
      MIXPANEL: true,
      SYNTHETIC: true,
    })
  })

  it('activeSources: gerçek kaynaklarda (MIXPANEL + TVPLUS birlikte) eşik kadar izleyici olunca SENTETİK dışarıda', async () => {
    const s = await open(tmp(), 0, 3)
    s.append([ev({ type: 'PLAY_START', source: 'SYNTHETIC' })])
    s.append([
      ev({ type: 'PLAY_START', source: 'TVPLUS', viewerId: 'v_profil01' }),
      ev({ type: 'ADD_TO_LIST', source: 'MIXPANEL', viewerId: 'v_mixpnl01' }),
    ])
    expect(s.activeSources()).toEqual(['TVPLUS', 'MIXPANEL', 'SYNTHETIC'])
    s.append([ev({ type: 'RATING', source: 'MIXPANEL', viewerId: 'v_mixpnl02', rating: 1 })])
    expect(s.activeSources()).toEqual(['TVPLUS', 'MIXPANEL'])
    expect(s.facts().every((f) => f.source !== 'SYNTHETIC')).toBe(true)
    expect(s.facts({ sources: ['SYNTHETIC'] })).toHaveLength(1)
    const status = Object.fromEntries(s.sources().map((x) => [x.source, x.active]))
    expect(status).toEqual({ TVPLUS: true, MIXPANEL: true, SYNTHETIC: false })
    // Gerçek kaynak silinip eşiğin altına düşülürse örnek yeniden etkin
    s.clear('MIXPANEL')
    expect(s.activeSources()).toEqual(['TVPLUS', 'SYNTHETIC'])
  })

  it('activeSources: sentetik veri yoksa yalnız gerçek kaynaklar (eşikten bağımsız)', async () => {
    const s = await open(tmp())
    s.append([ev({ type: 'PLAY_START', source: 'TVPLUS', viewerId: 'v_profil01' })])
    expect(s.activeSources()).toEqual(['TVPLUS'])
  })

  it('clear: kaynağın günlüğü ve özetleri silinir, diğerleri kalır; yeniden açılışta da', async () => {
    const dir = tmp()
    const s = await open(dir)
    s.append([ev({ type: 'PLAY_START', source: 'SYNTHETIC' }), ev({ type: 'PLAY_START', source: 'MIXPANEL' })])
    const r0 = s.revision()
    s.clear('MIXPANEL')
    expect(s.revision()).toBeGreaterThan(r0)
    expect(existsSync(join(dir, 'MIXPANEL'))).toBe(false)
    expect(s.sources().find((x) => x.source === 'MIXPANEL')!.events).toBe(0)
    expect(s.activeSources()).toEqual(['SYNTHETIC'])
    s.close()
    stores.length = 0
    const b = await open(dir)
    expect(b.sources().map((x) => x.events)).toEqual([0, 0, 1])
  })

  it('takma kimlik: profil kimliği geri çevrilemez biçimde ve kararlı', async () => {
    const s = await open(tmp())
    const v = s.viewerIdOfProfile('profil-guid-1')
    expect(v).toMatch(/^v_[A-Za-z0-9_-]{16}$/)
    expect(v).toBe(s.viewerIdOfProfile('profil-guid-1'))
    expect(v).not.toBe(s.viewerIdOfProfile('profil-guid-2'))
    expect(v).not.toContain('profil')
  })

  it('kilit: depo başka canlı süreçte açıksa açılmaz', async () => {
    const dir = tmp()
    writeFileSync(join(dir, 'LOCK'), String(process.ppid))
    await expect(openViewingStore({ dir, viewerKey: KEY })).rejects.toBeInstanceOf(ViewingStoreLockedError)
    // Ölü süreç kilidi devralınır
    writeFileSync(join(dir, 'LOCK'), '999999999')
    const s = await open(dir)
    expect(readFileSync(join(dir, 'LOCK'), 'utf8')).toBe(String(process.pid))
    s.close()
    stores.length = 0
    expect(existsSync(join(dir, 'LOCK'))).toBe(false)
  })

  it('kilit: canlı bir pid taşısa da uzun süredir tazelenmeyen kilit bayattır (yeniden başlatma sonrası pid başkasına geçer)', async () => {
    const dir = tmp()
    const lock = join(dir, 'LOCK')
    writeFileSync(lock, String(process.ppid))
    const past = new Date(Date.now() - 5 * 60_000)
    utimesSync(lock, past, past)
    const s = await open(dir)
    expect(readFileSync(lock, 'utf8')).toBe(String(process.pid))
    s.close()
    stores.length = 0
  })
})
