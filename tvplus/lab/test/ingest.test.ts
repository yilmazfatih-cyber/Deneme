/**
 * İçe alma ve kurma kuralları, elle yazılmış küçük dosyalarla (beklenen değerler elle hesaplanmıştır): dosya biçimleri
 * (JSONL, tek JSON dizisi, CSV, BOM), zaman biçimleri ve saat dilimi, kullanıcı kimliği, eşleme kuralları (koşullu
 * kural, yok sayma, eşlenmeyenler), süre birimi, izlenen süre kipleri, tamamlanma, canlı yayın, dizi → başlık,
 * oturum sınırları, cihaz ve boyut eşlemesi, abonelik olayları ve deney maruziyeti.
 *
 * Büyük sentetik dünya bu ayrıntıların çoğunu tek biçimde üretir; burada her kural kendi küçük örneğiyle sınanır.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { loadTable, type Table } from '../src/core/columns'
import { openLab, type Lab } from '../src/core/lab'
import {
  build,
  SUB_CANCEL,
  SUB_PAYMENT_FAIL,
  SUB_RENEW,
  SUB_SIGNUP,
  SUB_SUBSCRIBE,
  type BuildMeta,
  type TitleInfo,
} from '../src/data/build'
import { ingest, type IngestReport } from '../src/data/ingest'
import { compileMapping, timeOf, type LabMappingInput } from '../src/data/mapping'

delete process.env.TVP_LAB_K
delete process.env.TVP_LAB_SECRET

const root = mkdtempSync(join(tmpdir(), 'lab-kural-'))
afterAll(() => rmSync(root, { recursive: true, force: true }))

/** 2026-09-21 14:13:20 UTC → İstanbul 17:13:20; yerel gün numarası 20717 */
const T = 1_790_000_000
const DAY0 = 20_717

type Row = Record<string, unknown>
const ev = (event: string, time: unknown, props: Row = {}, user = 'u1'): Row => ({
  event,
  properties: { time, distinct_id: user, ...props },
})
const jsonl = (rows: readonly Row[]): string => `${rows.map((r) => JSON.stringify(r)).join('\n')}\n`

const MAPPING: LabMappingInput = {
  version: 1,
  events: {
    ac: 'APP_OPEN',
    ekran: 'SCREEN',
    goster: 'IMPRESSION',
    tikla: 'CLICK',
    basla: 'PLAY_START',
    canli_basla: { kind: 'PLAY_START', live: true },
    ilerle: 'PLAY_PROGRESS',
    bitir: 'PLAY_END',
    hata: 'PLAY_ERROR',
    uyg_hata: 'APP_ERROR',
    takil: 'BUFFER',
    ara: 'SEARCH',
    bos_ara: { kind: 'SEARCH', empty: true },
    liste: 'LIST_ADD',
    bildirim: 'NOTIF_OPEN',
    puan: 'RATING',
    kayit: 'SIGNUP',
    abone: 'SUBSCRIBE',
    yenile: 'RENEW',
    iptal: 'CANCEL',
    odeme_hata: 'PAYMENT_FAIL',
    deney: 'EXPOSURE',
  },
  props: {
    contentId: 'cid',
    contentTitle: 'ad',
    contentType: 'tur',
    genre: 'janr',
    seriesId: 'dizi',
    season: 'sezon',
    episode: 'bolum',
    duration: 'sure',
    watched: 'izlenen',
    position: 'konum',
    completed: 'tamam',
    live: 'canli',
    device: 'cihaz',
    errorCode: 'kod',
    bufferDuration: 'takilma',
    resultCount: 'sonuc',
    rank: 'sira',
    row: 'satir',
    screen: 'ekran',
    experiment: 'deney',
    variant: 'kol',
    amount: 'tutar',
    rating: 'puan',
  },
  dims: { plan: 'plan', ulke: ['ulke', 'country'] },
  deviceMap: { 'akıllı ekran': 'TV', konsol: 'DIGER' },
  typeMap: { belgesel: 'FILM' },
}

interface Tiny {
  lab: Lab
  report: IngestReport
  meta: BuildMeta
  users: Table
  days: Table
  sessions: Table
}

let seq = 0
/** İçeriği dosyaya yazar, boş bir lab'a alır ve tabloları kurar. */
async function tiny(content: string | Buffer, mapping: LabMappingInput = MAPPING, ext = 'jsonl'): Promise<Tiny> {
  const dir = join(root, `ornek-${seq++}`)
  const lab = openLab({ dir: join(dir, 'lab'), secret: 'kural-testi' })
  const file = join(dir, `veri.${ext}`)
  writeFileSync(file, content)
  const { reports } = await ingest(lab, [file], { mapping, reset: true })
  const meta = build(lab)
  return {
    lab,
    report: reports[0],
    meta,
    users: loadTable(lab.tableDir, 'kullanici'),
    days: loadTable(lab.tableDir, 'gun'),
    sessions: loadTable(lab.tableDir, 'oturum'),
  }
}

/** Satırın seçilen sütunları (kategorik sütunlar adıyla) */
function rowOf(t: Table, r: number, names: readonly string[]): Record<string, number | string> {
  const out: Record<string, number | string> = {}
  for (const n of names) out[n] = t.dicts[n] ? t.dicts[n][t.cols[n][r]] : t.cols[n][r]
  return out
}

/** Bir oturum: film izleme + sonuçsuz arama (TV); ertesi gün yalnız arama (telefon) */
const SESSION: Row[] = [
  ev('ac', T, { cihaz: 'Android TV' }),
  ev('basla', T + 10, { cid: 'f1', tur: 'movie', sure: 3000, cihaz: 'Android TV' }),
  ev('ilerle', T + 610, { cid: 'f1', konum: 600, cihaz: 'Android TV' }),
  ev('bitir', T + 2810, { cid: 'f1', konum: 2800, izlenen: 2800, sure: 3000, cihaz: 'Android TV' }),
  ev('ara', T + 2900, { sonuc: 0, cihaz: 'Android TV' }),
  ev('ac', T + 86_400, { cihaz: 'iPhone' }),
  ev('ara', T + 86_410, { sonuc: 3, cihaz: 'iPhone' }),
]
const USER_COLS = [
  'events',
  'days',
  'active_days',
  'sessions',
  'plays',
  'watch_sec',
  'completions',
  'titles',
  'searches',
  'search_fails',
  'bounces',
  'dim_cihaz',
]
const SESSION_USER = {
  events: 7,
  days: 2,
  active_days: 1,
  sessions: 2,
  plays: 1,
  watch_sec: 2800,
  completions: 1,
  titles: 1,
  searches: 2,
  search_fails: 1,
  bounces: 1,
  dim_cihaz: 'TV',
}

describe('dosya biçimleri', () => {
  it('JSONL: olaylar, günler ve oturumlar', async () => {
    const r = await tiny(jsonl(SESSION))
    expect(r.report).toMatchObject({ lines: 7, accepted: 7, rejected: 0, format: 'düz' })
    expect(r.report.byKind).toEqual({ APP_OPEN: 2, PLAY_START: 1, PLAY_PROGRESS: 1, PLAY_END: 1, SEARCH: 2 })
    expect(r.meta).toMatchObject({
      users: 1,
      events: 7,
      dayMin: DAY0,
      dayMax: DAY0 + 1,
      sessions: 2,
      titles: 1,
      userDays: 2,
    })
    expect(rowOf(r.users, 0, USER_COLS)).toEqual(SESSION_USER)
    const dayCols = [
      'day',
      'active',
      'sessions',
      'plays',
      'watch_sec',
      'completions',
      'searches',
      'search_fails',
      'bounces',
      'device',
    ]
    expect(rowOf(r.days, 0, dayCols)).toEqual({
      day: DAY0,
      active: 1,
      sessions: 1,
      plays: 1,
      watch_sec: 2800,
      completions: 1,
      searches: 1,
      search_fails: 1,
      bounces: 0,
      device: 'TV',
    })
    expect(rowOf(r.days, 1, dayCols)).toEqual({
      day: DAY0 + 1,
      active: 0,
      sessions: 1,
      plays: 0,
      watch_sec: 0,
      completions: 0,
      searches: 1,
      search_fails: 0,
      bounces: 1,
      device: 'MOBIL',
    })
    const sessCols = ['start_ts', 'dur_sec', 'events', 'plays', 'watch_sec', 'device', 'last_kind', 'first_delay']
    expect(rowOf(r.sessions, 0, sessCols)).toEqual({
      start_ts: T,
      dur_sec: 2900,
      events: 5,
      plays: 1,
      watch_sec: 2800,
      device: 'TV',
      last_kind: 'SEARCH',
      first_delay: 10,
    })
    expect(rowOf(r.sessions, 1, sessCols)).toEqual({
      start_ts: T + 86_400,
      dur_sec: 10,
      events: 2,
      plays: 0,
      watch_sec: 0,
      device: 'MOBIL',
      last_kind: 'SEARCH',
      first_delay: -1,
    })
  })

  it('tek JSON dizisi (girintili) ve CRLF satır sonları aynı sonucu verir', async () => {
    const arr = await tiny(JSON.stringify(SESSION, null, 2), MAPPING, 'json')
    expect(arr.report).toMatchObject({ accepted: 7, rejected: 0 })
    expect(rowOf(arr.users, 0, USER_COLS)).toEqual(SESSION_USER)
    const crlf = await tiny(jsonl(SESSION).replace(/\n/g, '\r\n'))
    expect(crlf.report).toMatchObject({ lines: 7, accepted: 7, rejected: 0 })
    expect(rowOf(crlf.users, 0, USER_COLS)).toEqual(SESSION_USER)
    // Baştaki boş satırlar biçim algılamasını bozmaz
    const blank = await tiny(`\n\n${jsonl(SESSION)}`)
    expect(blank.report).toMatchObject({ accepted: 7, rejected: 0 })
  })

  it("CSV: ';' ayırıcı, tırnaklı alan içinde ayırıcı / satır sonu / çift tırnak; özellikler en üst düzeyde", async () => {
    const csv = [
      'event;distinct_id;time;cid;tur;sure;konum;izlenen;sonuc;cihaz;not',
      `ac;u1;${T};;;;;;;Android TV;"çok`,
      'satırlı; not"',
      `basla;u1;${T + 10};f1;movie;3000;;;;Android TV;`,
      `ilerle;u1;${T + 610};f1;;;600;;;Android TV;"a ""b"" c"`,
      `bitir;u1;${T + 2810};f1;;3000;2800;2800;;Android TV;`,
      `ara;u1;${T + 2900};;;;;;0;Android TV;`,
      `ac;u1;${T + 86_400};;;;;;;iPhone;`,
      `ara;u1;${T + 86_410};;;;;;3;iPhone;`,
      '',
    ].join('\n')
    const r = await tiny(csv, { ...MAPPING, propertiesKey: null }, 'csv')
    expect(r.report).toMatchObject({ lines: 7, accepted: 7, rejected: 0 })
    expect(rowOf(r.users, 0, USER_COLS)).toEqual(SESSION_USER)
  })

  it('BOM ile başlayan dosyalar ilk satırı kaybetmeden okunur (JSONL, JSON dizisi, CSV)', async () => {
    // Windows araçları (Excel, PowerShell) dosyanın başına U+FEFF yazar. JSON.parse BOM kabul etmez: içe alma onu
    // atmalı. (ingest.ts readEvents: `t.charCodeAt(0) === 0xfeff` denetimi trimStart() BOM'u zaten sildiği için hiç
    // tutmuyor.)
    const results: string[] = []
    const attempt = async (name: string, content: string, mapping: LabMappingInput, ext: string): Promise<void> => {
      try {
        const r = await tiny(content, mapping, ext)
        results.push(`${name}: kabul ${r.report.accepted}, ret ${r.report.rejected}`)
      } catch (e) {
        results.push(`${name}: HATA ${e instanceof Error ? e.message : String(e)}`)
      }
    }
    await attempt('JSONL', `﻿${jsonl(SESSION)}`, MAPPING, 'jsonl')
    await attempt('JSON dizisi', `﻿${JSON.stringify(SESSION)}`, MAPPING, 'json')
    await attempt(
      'CSV',
      `﻿event,distinct_id,time\nac,u1,${T}\nac,u1,${T + 5}\n`,
      { ...MAPPING, propertiesKey: null },
      'csv',
    )
    expect(results).toEqual(['JSONL: kabul 7, ret 0', 'JSON dizisi: kabul 7, ret 0', 'CSV: kabul 2, ret 0'])
  })
})

describe('zaman ve kullanıcı kimliği', () => {
  it('saniye, milisaniye, sayı metni ve ISO zamanlar okunur; bozuk ve eksik alanlı satırlar reddedilir', async () => {
    const r = await tiny(
      jsonl([
        ev('ac', (T + 5) * 1000),
        ev('ac', String(T + 50)),
        ev('ac', '2026-09-21T15:00:00Z'),
        // Reddedilenler: okunamayan zaman, 2005 öncesi, zaman yok, olay adı yok, kullanıcı yok
        ev('ac', 'bozuk'),
        ev('ac', 12),
        { event: 'ac', properties: { distinct_id: 'u1' } },
        { properties: { time: T, distinct_id: 'u1' } },
        { event: 'ac', properties: { time: T } },
      ]),
    )
    expect(r.report).toMatchObject({ lines: 8, accepted: 3, rejected: 5 })
    expect(r.users.cols.first_ts[0]).toBe(T + 5)
    expect(r.users.cols.last_ts[0]).toBe(Date.parse('2026-09-21T15:00:00Z') / 1000)
    // Bozuk JSON satırı da reddedilir, kalanlar alınır
    const broken = await tiny(
      `${JSON.stringify(ev('ac', T))}\n{"event":"ac","properties":{"time":17900\n${JSON.stringify(ev('ac', T + 9))}\n`,
    )
    expect(broken.report).toMatchObject({ lines: 3, accepted: 2, rejected: 1 })
  })

  it('time.unit ve offsetMinutes: proje saat dilimindeki zaman UTC’ye çevrilir', () => {
    const m = (time: LabMappingInput['time']): ReturnType<typeof compileMapping> =>
      compileMapping({ version: 1, events: {}, time })
    expect(timeOf(m({}), { time: T }, {})).toBe(T)
    expect(timeOf(m({}), {}, { time: T })).toBe(T)
    expect(timeOf(m({}), { time: T * 1000 + 999 }, {})).toBe(T)
    expect(timeOf(m({ unit: 'ms' }), { time: T * 1000 }, {})).toBe(T)
    expect(timeOf(m({ unit: 's' }), { time: T }, {})).toBe(T)
    expect(timeOf(m({ property: ['ts', 'time'] }), { time: T + 1, ts: '' }, {})).toBe(T + 1)
    // İstanbul saatiyle yazılmış değer (UTC + 180 dk) → UTC
    expect(timeOf(m({ offsetMinutes: 180 }), { time: T }, {})).toBe(T - 3 * 3600)
    expect(timeOf(m({}), { time: '2026-10-01T08:00:00+03:00' }, {})).toBe(Date.UTC(2026, 9, 1, 5) / 1000)
    expect(timeOf(m({}), { time: 'yarın' }, {})).toBeNull()
    expect(timeOf(m({}), {}, {})).toBeNull()
    expect(timeOf(m({}), { time: 5e9 }, {})).toBeNull()
  })

  it('saat dilimi yazılmamış zaman metni makinenin saat diliminden bağımsız okunur (UTC sayılır)', () => {
    // CSV dışa aktarımlarında zaman çoğu kez '2026-10-01 08:00:00' biçimindedir. Eşleme belgesine göre değer UTC
    // sayılır, proje dilimi `offsetMinutes` ile verilir. Date.parse ise dilimsiz metni makinenin yerel saatine göre
    // yorumlar: aynı dosya İstanbul'daki makinede 3 saat, Los Angeles'takinde 7–8 saat kayar.
    const plain = compileMapping({ version: 1, events: {} })
    const istanbul = compileMapping({ version: 1, events: {}, time: { offsetMinutes: 180 } })
    const utc = Date.UTC(2026, 9, 1, 8) / 1000
    const before = process.env.TZ
    const seen: string[] = []
    try {
      for (const tz of ['UTC', 'Europe/Istanbul', 'America/Los_Angeles', 'Asia/Tokyo']) {
        process.env.TZ = tz
        for (const text of ['2026-10-01T08:00:00', '2026-10-01 08:00:00']) {
          const a = timeOf(plain, { time: text }, {})
          const b = timeOf(istanbul, { time: text }, {})
          if (a !== utc || b !== utc - 3 * 3600)
            seen.push(
              `TZ=${tz} '${text}' → ${a} (beklenen ${utc}); offsetMinutes 180 → ${b} (beklenen ${utc - 3 * 3600})`,
            )
        }
      }
    } finally {
      if (before === undefined) delete process.env.TZ
      else process.env.TZ = before
    }
    expect(seen).toEqual([])
  })

  it('kullanıcı kimliği sayı ya da metin, özelliklerde ya da en üst düzeyde olabilir; sıradaki adlar denenir', async () => {
    const r = await tiny(
      jsonl([
        { event: 'ac', properties: { time: T, distinct_id: 12345 } },
        { event: 'ac', time: T + 5, distinct_id: '12345' },
        { event: 'ac', properties: { time: T + 9, $user_id: 'x9' } },
        { event: 'ac', properties: { time: T + 12, user_id: 'x9' } },
      ]),
    )
    expect(r.report).toMatchObject({ accepted: 4, rejected: 0 })
    expect(r.meta.users).toBe(2)
    expect([...r.users.cols.events].sort()).toEqual([2, 2])
  })
})

describe('eşleme kuralları', () => {
  it('yok sayılan olaylar sayılmaz; eşlenmeyenler isteğe göre saklanır ya da atılır', async () => {
    const rows = [
      ev('ac', T),
      ev('gereksiz', T + 1),
      ev('bilinmeyen', T + 2),
      ev('bilinmeyen', T + 3),
      ev('baska', T + 4),
    ]
    const kept = await tiny(jsonl(rows), { ...MAPPING, ignore: ['gereksiz'] })
    expect(kept.report).toMatchObject({ lines: 5, accepted: 4, ignored: 1, rejected: 0, unmappedTotal: 3 })
    expect(kept.report.byKind).toEqual({ OTHER: 3, APP_OPEN: 1 })
    expect(kept.report.unmapped).toEqual({ bilinmeyen: 2, baska: 1 })
    // Saklanan eşlenmeyen olaylar uygulama etkinliğidir (oturuma girer) ama izleme sayılmaz
    expect(rowOf(kept.users, 0, ['events', 'sessions', 'active_days', 'days'])).toEqual({
      events: 4,
      sessions: 1,
      active_days: 0,
      days: 1,
    })
    const dropped = await tiny(jsonl(rows), { ...MAPPING, ignore: ['gereksiz'], keepUnmapped: false })
    expect(dropped.report).toMatchObject({ lines: 5, accepted: 1, ignored: 1, rejected: 0, unmappedTotal: 3 })
    expect(dropped.meta.events).toBe(1)
  })

  it('koşullu kural dizisi: aynı olay adı özelliğe göre farklı türlere ayrılır (ilk tutan kural)', async () => {
    const mapping: LabMappingInput = {
      ...MAPPING,
      events: {
        'Player Event': [
          { kind: 'PLAY_START', when: { action: 'start' } },
          { kind: 'PLAY_PROGRESS', when: { action: 'heartbeat' } },
          { kind: 'PLAY_END', when: { action: ['finish', 'stop'] }, completed: true },
          // CSV'de sayılar metin gelebilir: gevşek karşılaştırma
          { kind: 'PLAY_ERROR', when: { action: '2' } },
        ],
      },
    }
    const r = await tiny(
      jsonl([
        ev('Player Event', T, { action: 'start', cid: 'f1', sure: 600, konum: 0 }),
        ev('Player Event', T + 300, { action: 'heartbeat', cid: 'f1', konum: 300 }),
        ev('Player Event', T + 400, { action: 'stop', cid: 'f1', konum: 400 }),
        ev('Player Event', T + 500, { action: 'other' }),
        ev('Player Event', T + 600, { action: 2, cid: 'f2' }),
      ]),
      mapping,
    )
    expect(r.report.byKind).toEqual({ OTHER: 1, PLAY_START: 1, PLAY_PROGRESS: 1, PLAY_END: 1, PLAY_ERROR: 1 })
    expect(r.report.unmappedTotal).toBe(1)
    // Kural "tamamlanma" dediği için %67 izlenmiş oynatma tamamlanmış sayılır
    expect(rowOf(r.users, 0, ['plays', 'watch_sec', 'completions', 'errors'])).toEqual({
      plays: 1,
      watch_sec: 400,
      completions: 1,
      errors: 1,
    })
  })

  it('süre birimi: milisaniye ve dakika saniyeye çevrilir', async () => {
    const ms = await tiny(
      jsonl([
        ev('basla', T, { cid: 'f1', sure: 3_000_000 }),
        ev('bitir', T + 1500, { cid: 'f1', izlenen: 1_500_000, konum: 1_500_000 }),
      ]),
      { ...MAPPING, durationUnit: 'ms' },
    )
    expect(rowOf(ms.users, 0, ['plays', 'watch_sec', 'completions'])).toEqual({
      plays: 1,
      watch_sec: 1500,
      completions: 0,
    })
    const min = await tiny(
      jsonl([ev('basla', T, { cid: 'f1', sure: 50 }), ev('bitir', T + 2940, { cid: 'f1', izlenen: 49, konum: 49 })]),
      { ...MAPPING, durationUnit: 'min' },
    )
    expect(rowOf(min.users, 0, ['plays', 'watch_sec', 'completions'])).toEqual({
      plays: 1,
      watch_sec: 2940,
      completions: 1,
    })
    expect(loadTable(min.lab.tableDir, 'baslik').cols.dur_sec[1]).toBe(3000)
  })

  it('cihaz: eşleme sözlüğü, yerleşik adlar, bilinmeyen → DIGER; boyutlarda baskın değer ve yedek özellik adı', async () => {
    const r = await tiny(
      jsonl([
        ev('ac', T, { cihaz: 'Akıllı Ekran', plan: 'aylik', ulke: 'TR' }),
        ev('ac', T + 3600, { cihaz: 'konsol', plan: 'aylik', country: 'TR' }),
        ev('ac', T + 7200, { cihaz: 'Bilinmeyen Kutu', plan: 'yillik' }),
        ev('ac', T + 10_800, { cihaz: 'WEB', plan: 'yillik' }),
        ev('ac', T + 14_400, { plan: 'yillik' }),
        ev('ac', T, { cihaz: 'ipad' }, 'u2'),
      ]),
    )
    expect(r.meta.dimNames).toEqual(['cihaz', 'plan', 'ulke'])
    const byEvents = [0, 1].sort((a, b) => r.users.cols.events[b] - r.users.cols.events[a])
    // u1: 5 açılış → DIGER iki kez (en sık), plan yillik üç kez, ülke TR (iki adla da okunur)
    expect(rowOf(r.users, byEvents[0], ['events', 'dim_cihaz', 'dim_plan', 'dim_ulke'])).toEqual({
      events: 5,
      dim_cihaz: 'DIGER',
      dim_plan: 'yillik',
      dim_ulke: 'TR',
    })
    expect(rowOf(r.users, byEvents[1], ['events', 'dim_cihaz', 'dim_plan', 'dim_ulke'])).toEqual({
      events: 1,
      dim_cihaz: 'MOBIL',
      dim_plan: 'bilinmiyor',
      dim_ulke: 'bilinmiyor',
    })
    const devices: string[] = []
    for (let s = 0; s < r.sessions.rows; s++)
      if (r.sessions.cols.uid[s] === byEvents[0]) devices.push(r.sessions.dicts.device[r.sessions.cols.device[s]])
    expect(devices).toEqual(['TV', 'DIGER', 'DIGER', 'WEB', 'bilinmiyor'])
  })
})

describe('oynatma: izlenen süre, tamamlanma, canlı yayın', () => {
  const play = (values: [number, number, number]): Row[] => [
    ev('basla', T, { cid: 'f1', sure: 3000, konum: 0 }),
    ev('ilerle', T + 600, { cid: 'f1', konum: 600, izlenen: values[0] }),
    ev('ilerle', T + 1200, { cid: 'f1', konum: 1200, izlenen: values[1] }),
    ev('bitir', T + 1800, { cid: 'f1', konum: 1800, izlenen: values[2] }),
  ]
  const watch = async (rows: Row[], watched?: LabMappingInput['watched']): Promise<number> =>
    (await tiny(jsonl(rows), watched ? { ...MAPPING, watched } : MAPPING)).users.cols.watch_sec[0]

  it('izlenen süre kipleri: 30 dakikalık oynatma her kipte 1800 sn', async () => {
    const cumulative = play([600, 1200, 1800])
    const delta = play([600, 600, 600])
    // auto: değerler toplanır; toplam geçen süreyi belirgin aşıyorsa birikimli sayılır
    expect(await watch(cumulative)).toBe(1800)
    expect(await watch(delta)).toBe(1800)
    expect(await watch(delta, 'delta')).toBe(1800)
    expect(await watch(cumulative, 'cumulative')).toBe(1800)
    expect(await watch(cumulative, 'position')).toBe(1800)
    expect(await watch(cumulative, 'timestamps')).toBe(1800)
    // Yanlış kip seçilirse (birikimli değerler toplanırsa) süre şişer ama içerik süresinin 1.2 katını aşamaz
    expect(await watch(cumulative, 'delta')).toBe(3600)
  })

  it('süre ve konum yoksa zaman damgalarından; yalnız başlangıç olayları varsa sonraki başlangıca dek', async () => {
    expect(await watch([ev('basla', T, { cid: 'f1' }), ev('bitir', T + 590, { cid: 'f1' })])).toBe(590)
    const startsOnly = await tiny(
      jsonl([
        ev('ac', T),
        ev('basla', T + 5, { cid: 'f1', sure: 1200 }),
        ev('basla', T + 905, { cid: 'f2', sure: 1200 }),
        ev('ac', T + 20_000),
      ]),
    )
    expect(rowOf(startsOnly.users, 0, ['plays', 'watch_sec', 'sessions', 'bounces'])).toEqual({
      plays: 2,
      watch_sec: 900,
      sessions: 2,
      bounces: 1,
    })
  })

  it('konumdan türetilen izleme: başlangıç olayı konum taşımasa da baştan izlenen süre sayılır', async () => {
    // Çoğu kaynakta "oynatma başladı" olayında oynatma konumu yoktur; konum ilerleme / bitiş olaylarıyla gelir.
    // Baştan başlayan oynatmada izlenen süre son konumdur. (build.ts: başlangıç konumu bilinmeyince ilk bildirilen
    // konum başlangıç sayılıyor → ilk aralık kayboluyor; konum yalnız bitişte geliyorsa süre 0 çıkıyor.)
    const got: Record<string, number> = {
      'yalnız bitişte konum': await watch([
        ev('basla', T, { cid: 'f1', sure: 3000 }),
        ev('bitir', T + 590, { cid: 'f1', konum: 590 }),
      ]),
      'ilerleme + bitişte konum': await watch([
        ev('basla', T, { cid: 'f1', sure: 3000 }),
        ev('ilerle', T + 600, { cid: 'f1', konum: 600 }),
        ev('ilerle', T + 1200, { cid: 'f1', konum: 1200 }),
        ev('bitir', T + 1800, { cid: 'f1', konum: 1800 }),
      ]),
      'position kipi': await watch(
        [
          ev('basla', T, { cid: 'f1', sure: 3000 }),
          ev('ilerle', T + 600, { cid: 'f1', konum: 600 }),
          ev('bitir', T + 1800, { cid: 'f1', konum: 1800 }),
        ],
        'position',
      ),
    }
    expect(got).toEqual({ 'yalnız bitişte konum': 590, 'ilerleme + bitişte konum': 1800, 'position kipi': 1800 })
  })

  it('kaldığı yerden devam: konum farkı kadar izlenmiş sayılır', async () => {
    expect(
      await watch([
        ev('basla', T, { cid: 'f1', sure: 3000, konum: 1000 }),
        ev('bitir', T + 590, { cid: 'f1', konum: 1590 }),
      ]),
    ).toBe(590)
  })

  it('tamamlanma: eşik (%90), açık bayrak, canlı yayın; içerik türü ve canlı süre', async () => {
    const r = await tiny(
      jsonl([
        // Kural canlı diyor
        ev('canli_basla', T, { cid: 'kanal-1' }),
        ev('bitir', T + 1800, { cid: 'kanal-1', izlenen: 1800 }),
        // İçerik türü spor → canlı sayılır
        ev('basla', T + 2000, { cid: 'mac-1', tur: 'sport' }),
        ev('bitir', T + 2600, { cid: 'mac-1', izlenen: 600 }),
        // typeMap: belgesel → FILM; %95 izlendi → tamamlandı
        ev('basla', T + 3000, { cid: 'bel-1', tur: 'Belgesel', sure: 1000 }),
        ev('bitir', T + 3950, { cid: 'bel-1', izlenen: 950, konum: 950 }),
        // %80 izlendi → tamamlanmadı
        ev('basla', T + 4000, { cid: 'f2', tur: 'movie', sure: 1000 }),
        ev('bitir', T + 4800, { cid: 'f2', izlenen: 800, konum: 800 }),
        // %10 izlendi ama kaynak "tamamlandı" diyor
        ev('basla', T + 5000, { cid: 'f3', tur: 'movie', sure: 1000 }),
        ev('bitir', T + 5100, { cid: 'f3', izlenen: 100, konum: 100, tamam: true }),
        // Canlı özelliği taşıyan olay: süresi olsa da tamamlanma sayılmaz
        ev('basla', T + 5200, { cid: 'f4', tur: 'movie', sure: 1000, canli: 'true' }),
        ev('bitir', T + 6190, { cid: 'f4', izlenen: 990 }),
      ]),
    )
    expect(rowOf(r.users, 0, ['plays', 'watch_sec', 'completions', 'titles', 'sessions'])).toEqual({
      plays: 6,
      watch_sec: 5240,
      completions: 2,
      titles: 6,
      sessions: 1,
    })
    expect(rowOf(r.days, 0, ['plays', 'completions', 'live_sec', 'live_plays', 'new_titles'])).toEqual({
      plays: 6,
      completions: 2,
      live_sec: 3390,
      live_plays: 3,
      new_titles: 6,
    })
    const titles = loadTable(r.lab.tableDir, 'baslik')
    const info = JSON.parse(readFileSync(join(r.lab.tableDir, 'baslik.json'), 'utf8')) as TitleInfo[]
    const byId = new Map(
      info.map((t, i) => [
        t.id,
        rowOf(titles, i, ['klass', 'plays', 'viewers', 'watch_sec', 'completions', 'dur_sec']),
      ]),
    )
    expect(byId.get('kanal-1')).toEqual({
      klass: 'CANLI',
      plays: 1,
      viewers: 1,
      watch_sec: 1800,
      completions: 0,
      dur_sec: 0,
    })
    expect(byId.get('mac-1')).toEqual({
      klass: 'SPOR',
      plays: 1,
      viewers: 1,
      watch_sec: 600,
      completions: 0,
      dur_sec: 0,
    })
    expect(byId.get('bel-1')).toEqual({
      klass: 'FILM',
      plays: 1,
      viewers: 1,
      watch_sec: 950,
      completions: 1,
      dur_sec: 1000,
    })
    expect(byId.get('f2')).toEqual({
      klass: 'FILM',
      plays: 1,
      viewers: 1,
      watch_sec: 800,
      completions: 0,
      dur_sec: 1000,
    })
    expect(byId.get('f3')).toEqual({
      klass: 'FILM',
      plays: 1,
      viewers: 1,
      watch_sec: 100,
      completions: 1,
      dur_sec: 1000,
    })
    expect(byId.get('f4')).toEqual({
      klass: 'FILM',
      plays: 1,
      viewers: 1,
      watch_sec: 990,
      completions: 0,
      dur_sec: 1000,
    })
  })

  it('dizi: bölümler tek başlığa toplanır, ad bölüm adlarının ortak başıdır, son bölüm bitince dizi biter', async () => {
    const rows = [1, 2, 3].flatMap((e, i) => [
      ev('basla', T + i * 2000, {
        cid: `d1-b${e}`,
        ad: `Kuzey Rüzgârı · S1 B${e}`,
        dizi: 'd1',
        sezon: 1,
        bolum: e,
        sure: 1500,
        janr: 'Dram, Yerli Dizi',
      }),
      ev('bitir', T + i * 2000 + 1450, { cid: `d1-b${e}`, izlenen: 1450, konum: 1450, sure: 1500 }),
    ])
    const r = await tiny(jsonl(rows))
    expect(r.meta).toMatchObject({ contents: 3, titles: 1 })
    expect(rowOf(r.users, 0, ['plays', 'watch_sec', 'completions', 'titles'])).toEqual({
      plays: 3,
      watch_sec: 4350,
      completions: 3,
      titles: 1,
    })
    expect(rowOf(r.days, 0, ['plays', 'titles', 'new_titles', 'series_finished', 'main_sec'])).toEqual({
      plays: 3,
      titles: 1,
      new_titles: 1,
      series_finished: 1,
      main_sec: 4350,
    })
    const titles = loadTable(r.lab.tableDir, 'baslik')
    expect(rowOf(titles, 1, ['klass', 'episodes', 'plays', 'viewers', 'completions', 'dur_sec', 'genre'])).toEqual({
      klass: 'DIZI',
      episodes: 3,
      plays: 3,
      viewers: 1,
      completions: 3,
      dur_sec: 1500,
      genre: 'Dram',
    })
    const info = JSON.parse(readFileSync(join(r.lab.tableDir, 'baslik.json'), 'utf8')) as TitleInfo[]
    expect(info[1]).toMatchObject({ id: 'd1', title: 'Kuzey Rüzgârı', genres: ['Dram', 'Yerli Dizi'] })
    expect(info[1].episodes?.map((e) => `${e.id}:${e.s}:${e.e}:${e.dur}`)).toEqual([
      'd1-b1:1:1:1500',
      'd1-b2:1:2:1500',
      'd1-b3:1:3:1500',
    ])
    const facts = loadTable(r.lab.tableDir, 'izleme')
    expect(facts.rows).toBe(1)
    expect(rowOf(facts, 0, ['uid', 'tid', 'plays', 'watch_sec', 'completions', 'first_day', 'last_day'])).toEqual({
      uid: 0,
      tid: 1,
      plays: 3,
      watch_sec: 4350,
      completions: 3,
      first_day: DAY0,
      last_day: DAY0,
    })
  })
})

describe('oturumlar ve günler', () => {
  it('30 dakikadan uzun sessizlik yeni oturum açar; kısa sessizlik açmaz', async () => {
    const r = await tiny(
      jsonl([
        ev('ac', T),
        ev('ara', T + 100, { sonuc: 2 }),
        ev('ac', T + 100 + 31 * 60),
        ev('ara', T + 100 + 60 * 60, { sonuc: 0 }),
      ]),
    )
    expect(r.sessions.rows).toBe(2)
    expect(rowOf(r.sessions, 0, ['start_ts', 'dur_sec', 'events'])).toEqual({ start_ts: T, dur_sec: 100, events: 2 })
    expect(rowOf(r.sessions, 1, ['start_ts', 'dur_sec', 'events'])).toEqual({
      start_ts: T + 1960,
      dur_sec: 29 * 60,
      events: 2,
    })
    // Eşlemedeki oturum boşluğu değişirse sınır da değişir
    const wide = await tiny(jsonl([ev('ac', T), ev('ac', T + 31 * 60)]), { ...MAPPING, sessionGapMin: 45 })
    expect(wide.sessions.rows).toBe(1)
  })

  it('oynatma sürerken uzun sessizlik oturumu bölmez', async () => {
    const r = await tiny(
      jsonl([
        ev('ac', T),
        ev('basla', T + 10, { cid: 'f1', sure: 7200 }),
        ev('bitir', T + 7010, { cid: 'f1', izlenen: 7000, konum: 7000 }),
      ]),
    )
    expect(r.sessions.rows).toBe(1)
    expect(rowOf(r.sessions, 0, ['dur_sec', 'plays', 'watch_sec', 'events'])).toEqual({
      dur_sec: 7010,
      plays: 1,
      watch_sec: 7000,
      events: 3,
    })
    expect(r.users.cols.completions[0]).toBe(1)
  })

  it('gün sınırı yerel saate göredir (İstanbul); gece yarısını aşan oynatma başladığı güne yazılır', async () => {
    // 20:59:50 UTC = 23:59:50 İstanbul → ertesi olay 00:00:10 yerel
    const nearMidnight = (DAY0 + 1) * 86_400 - 3 * 3600 - 10
    const two = await tiny(jsonl([ev('ac', nearMidnight), ev('ac', nearMidnight + 20)]))
    expect([...two.days.cols.day]).toEqual([DAY0, DAY0 + 1])
    expect(two.meta).toMatchObject({ dayMin: DAY0, dayMax: DAY0 + 1, sessions: 1 })
    const play = await tiny(
      jsonl([
        ev('ac', nearMidnight - 600),
        ev('basla', nearMidnight - 590, { cid: 'f1', sure: 3000 }),
        ev('bitir', nearMidnight + 1210, { cid: 'f1', izlenen: 1800, konum: 1800 }),
      ]),
    )
    expect(rowOf(play.days, 0, ['day', 'sessions', 'plays', 'watch_sec'])).toEqual({
      day: DAY0,
      sessions: 1,
      plays: 1,
      watch_sec: 1800,
    })
    expect(rowOf(play.sessions, 0, ['day', 'plays', 'watch_sec'])).toEqual({ day: DAY0, plays: 1, watch_sec: 1800 })
    expect(play.users.cols.plays[0]).toBe(1)
  })

  it('arama, hata, takılma, gösterim, tıklama, liste, bildirim sayımları güne ve oturuma yazılır', async () => {
    const r = await tiny(
      jsonl([
        ev('ac', T),
        ev('ekran', T + 1, { ekran: 'Home' }),
        ev('goster', T + 2, { cid: 'f1', sira: 0, satir: 2 }),
        ev('tikla', T + 3, { cid: 'f1', sira: 0, satir: 2 }),
        ev('ara', T + 4, { sonuc: 0 }),
        ev('ara', T + 5, { sonuc: 7 }),
        ev('ara', T + 6),
        ev('bos_ara', T + 7),
        ev('hata', T + 8, { cid: 'f1', kod: 'DRM' }),
        ev('uyg_hata', T + 9, { kod: 'CRASH' }),
        ev('basla', T + 10, { cid: 'f1', sure: 3000 }),
        ev('takil', T + 20, { cid: 'f1', takilma: 4.5 }),
        ev('takil', T + 30, { cid: 'f1' }),
        ev('bitir', T + 1010, { cid: 'f1', izlenen: 1000 }),
        ev('liste', T + 1020, { cid: 'f1' }),
        ev('bildirim', T + 1030),
        ev('puan', T + 1040, { cid: 'f1', puan: 2 }),
      ]),
    )
    expect(r.report).toMatchObject({ accepted: 17, rejected: 0, unmappedTotal: 0 })
    expect(
      rowOf(r.users, 0, ['events', 'sessions', 'plays', 'errors', 'buffers', 'searches', 'search_fails', 'bounces']),
    ).toEqual({
      events: 17,
      sessions: 1,
      plays: 1,
      errors: 1,
      buffers: 2,
      searches: 4,
      // sonuç sayısı 0 olan + kuralı "sonuçsuz" diyen
      search_fails: 2,
      bounces: 0,
    })
    expect(
      rowOf(r.days, 0, [
        'events',
        'errors',
        'app_errors',
        'buffers',
        'buffer_sec',
        'searches',
        'search_fails',
        'impressions',
        'clicks',
        'list_adds',
        'notif_opens',
        'first_delay',
      ]),
    ).toEqual({
      events: 17,
      errors: 1,
      app_errors: 1,
      buffers: 2,
      buffer_sec: 4.5,
      searches: 4,
      search_fails: 2,
      impressions: 1,
      clicks: 1,
      list_adds: 1,
      notif_opens: 1,
      first_delay: 10,
    })
    expect(
      rowOf(r.sessions, 0, [
        'events',
        'plays',
        'errors',
        'buffers',
        'searches',
        'search_fails',
        'impressions',
        'clicks',
        'first_delay',
        'last_kind',
      ]),
    ).toEqual({
      events: 17,
      plays: 1,
      errors: 1,
      buffers: 2,
      searches: 4,
      search_fails: 2,
      impressions: 1,
      clicks: 1,
      first_delay: 10,
      last_kind: 'RATING',
    })
  })
})

describe('abonelik olayları ve deney maruziyeti', () => {
  it('abonelik olayları güne işaretlenir ama oturum açmaz; maruziyet etkinlik sayılmaz', async () => {
    const r = await tiny(
      jsonl([
        ev('kayit', T),
        ev('abone', T + 60, { tutar: 99.9 }),
        ev('deney', T + 100, { deney: 'e1', kol: 'A' }),
        ev('ac', T + 110),
        // Aynı kol yinelenirse tek satır; farklı kol görülürse "çok kollu" işaretlenir
        ev('deney', T + 120, { deney: 'e1', kol: 'A' }),
        ev('deney', T + 130, { deney: 'e2', kol: 'X' }),
        ev('deney', T + 86_400, { deney: 'e2', kol: 'Y' }),
        // Kolu olmayan maruziyet reddedilir
        ev('deney', T + 90_000, { deney: 'e3' }),
        ev('odeme_hata', T + 30 * 86_400, { tutar: 99.9 }),
        ev('iptal', T + 31 * 86_400),
        ev('yenile', T + 5 * 86_400, {}, 'u2'),
      ]),
    )
    expect(r.report).toMatchObject({ accepted: 10, rejected: 1 })
    expect(r.report.byKind).toEqual({
      APP_OPEN: 1,
      SIGNUP: 1,
      SUBSCRIBE: 1,
      RENEW: 1,
      CANCEL: 1,
      PAYMENT_FAIL: 1,
      EXPOSURE: 4,
    })
    const u1 = r.users.cols.events[0] === 5 ? 0 : 1
    const u2 = 1 - u1
    expect(
      rowOf(r.users, u1, ['events', 'days', 'sessions', 'signup_day', 'cancel_day', 'first_day', 'last_day']),
    ).toEqual({
      events: 5,
      days: 1,
      sessions: 1,
      signup_day: DAY0,
      cancel_day: DAY0 + 31,
      first_day: DAY0,
      last_day: DAY0 + 31,
    })
    // Yalnız abonelik olayı olan kullanıcı: uygulama günü ve oturumu yok
    expect(rowOf(r.users, u2, ['events', 'days', 'sessions', 'signup_day', 'cancel_day'])).toEqual({
      events: 1,
      days: 0,
      sessions: 0,
      signup_day: -1,
      cancel_day: -1,
    })
    const dayRows: Record<string, number | string>[] = []
    for (let d = 0; d < r.days.rows; d++)
      dayRows.push({
        u: r.days.cols.uid[d] === u1 ? 'u1' : 'u2',
        ...rowOf(r.days, d, ['day', 'sessions', 'events', 'sub', 'active']),
      })
    expect(dayRows.sort((a, b) => Number(a.day) - Number(b.day))).toEqual([
      { u: 'u1', day: DAY0, sessions: 1, events: 1, sub: SUB_SIGNUP | SUB_SUBSCRIBE, active: 0 },
      { u: 'u2', day: DAY0 + 5, sessions: 0, events: 0, sub: SUB_RENEW, active: 0 },
      { u: 'u1', day: DAY0 + 30, sessions: 0, events: 0, sub: SUB_PAYMENT_FAIL, active: 0 },
      { u: 'u1', day: DAY0 + 31, sessions: 0, events: 0, sub: SUB_CANCEL, active: 0 },
    ])
    const exp = loadTable(r.lab.tableDir, 'maruziyet')
    expect(exp.rows).toBe(2)
    expect(rowOf(exp, 0, ['exp', 'variant', 'ts', 'day', 'multi'])).toEqual({
      exp: 'e1',
      variant: 'A',
      ts: T + 100,
      day: DAY0,
      multi: 0,
    })
    // İlk görülen kol yazılır; ikinci kol görüldüğü için işaretlenir
    expect(rowOf(exp, 1, ['exp', 'variant', 'ts', 'day', 'multi'])).toEqual({
      exp: 'e2',
      variant: 'X',
      ts: T + 130,
      day: DAY0,
      multi: 1,
    })
    expect(exp.cols.uid[0]).toBe(u1)
  })
})
