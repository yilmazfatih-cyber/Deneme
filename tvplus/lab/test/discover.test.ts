/**
 * Şema keşfi: sentetik dünyadan, düz JSONL'den ve CSV'den eşleme önerisi; gizlilik (ham kimlik, e-posta, telefon,
 * IP, ad, arama metni rapora sızmaz) ve önerilen eşlemeyle uçtan uca içe alma.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { openLab } from '../src/core/lab'
import { build } from '../src/data/build'
import { classifyEvent, discover, formatDiscovery, namePii, valuePii, type DiscoveryReport } from '../src/data/discover'
import { ingest } from '../src/data/ingest'
import { namesOf, zLabMapping } from '../src/data/mapping'
import { WORLD_MAPPING } from '../src/world/world'
import { writeWorld } from '../src/world/write'

const dir = mkdtempSync(join(tmpdir(), 'lab-kesif-'))
afterAll(() => rmSync(dir, { recursive: true, force: true }))

const kindOfRule = (rule: unknown): string | undefined => {
  const r = Array.isArray(rule) ? rule[0] : rule
  return typeof r === 'string' ? r : (r as { kind?: string } | undefined)?.kind
}

describe('dünya verisi', () => {
  const worldPath = join(dir, 'dunya', 'dunya.jsonl')
  let report: DiscoveryReport
  let text: string
  let raw: string

  beforeAll(async () => {
    await writeWorld(worldPath, { users: 150, days: 60, seed: 5, end: '2026-11-10' })
    report = await discover([worldPath])
    text = formatDiscovery(report)
    raw = readFileSync(worldPath, 'utf8')
  }, 120_000)

  it('temel özet doğru', () => {
    expect(report.format).toBe('jsonl')
    expect(report.propertiesKey).toBe('properties')
    expect(report.userProperty).toBe('distinct_id')
    expect(report.timeProperty).toBe('time')
    expect(report.timeUnit).toBe('s')
    expect(report.users).toBe(150)
    expect(report.scanned).toBeGreaterThan(1000)
    expect(report.firstTs).not.toBeNull()
    expect(report.events[0].count).toBeGreaterThanOrEqual(report.events[report.events.length - 1].count)
  })

  it('önerilen eşleme şemadan geçer ve olayları doğru türe eşler', () => {
    const parsed = zLabMapping.parse(report.suggestion)
    const must = [
      'App Opened',
      'Screen Viewed',
      'Content Impression',
      'Content Clicked',
      'Playback Started',
      'Playback Heartbeat',
      'Playback Stopped',
      'Playback Error',
      'Buffering',
      'Search Performed',
      'Signup Completed',
      'Subscription Started',
      'Subscription Renewed',
      'Subscription Cancelled',
      'Payment Failed',
      '$experiment_started',
    ]
    const seen = new Set(report.events.map((e) => e.name))
    for (const name of must) expect(seen.has(name), name).toBe(true)
    for (const [name, rule] of Object.entries(WORLD_MAPPING.events)) {
      if (!seen.has(name)) continue
      expect(kindOfRule(parsed.events[name]), name).toBe(kindOfRule(rule))
    }
    // Dünyanın gürültü olayları (ayar, profil) eşlenmez
    expect(parsed.events['Profile Updated']).toBeUndefined()
  })

  it('özellik alanları ve boyutlar', () => {
    const p = zLabMapping.parse(report.suggestion).props
    const has = (field: keyof typeof p, name: string): void => expect(namesOf(p[field]), field).toContain(name)
    has('contentId', 'content_id')
    has('duration', 'content_duration_sec')
    has('watched', 'watch_duration_sec')
    has('position', 'position_sec')
    has('rank', 'position')
    has('device', 'platform')
    has('resultCount', 'results_count')
    has('seriesId', 'series_id')
    has('experiment', 'Experiment name')
    has('variant', 'Variant name')
    has('bufferDuration', 'buffer_duration_sec')
    // Konum alanı gösterim sırasını taşımamalı
    expect(namesOf(p.position)).not.toContain('position')
    expect(report.suggestion.durationUnit).toBe('s')
    const dimProps = Object.values(report.suggestion.dims ?? {}).flatMap((v) => namesOf(v))
    for (const d of ['app_version', 'plan_type', 'acquisition_channel']) expect(dimProps).toContain(d)
    for (const d of ['$email', 'msisdn', '$ip', '$name', 'distinct_id', '$insert_id', 'time'])
      expect(dimProps).not.toContain(d)
    expect(Object.keys(report.suggestion.dims ?? {}).length).toBeLessThanOrEqual(8)
  })

  it('kişisel veri raporda ve çıktıda yok', () => {
    const json = JSON.stringify(report)
    const outputs = [
      json,
      text,
      formatDiscovery(report, { event: 'Profile Updated' }),
      formatDiscovery(report, { event: 'Search Performed' }),
    ]
    // Ham dosyada gerçekten var olduklarını doğrula (test anlamlı olsun)
    expect(raw).toMatch(/ornek-posta\.example/)
    expect(raw).toMatch(/"msisdn":"90532/)
    expect(raw).toMatch(/sentetik-5-/)
    const searchTerms = [...raw.matchAll(/"search_term":"([^"]+)"/g)].map((m) => m[1])
    expect(searchTerms.length).toBeGreaterThan(0)
    for (const o of outputs) {
      expect(o).not.toMatch(/ornek-posta/)
      expect(o).not.toMatch(/90532/)
      expect(o).not.toMatch(/sentetik-/)
      expect(o).not.toMatch(/Soyad\d/)
      expect(o).not.toMatch(/\b10\.\d+\.\d+\.7\b/)
    }
    const profile = report.events.find((e) => e.name === 'Profile Updated')
    expect(profile).toBeDefined()
    for (const n of ['$email', 'msisdn', '$ip', '$name', 'distinct_id']) {
      const st = profile?.props.find((x) => x.name === n)
      expect(st?.pii, n).not.toBeNull()
      expect(st?.values, n).toBeUndefined()
      expect(st?.numeric, n).toBeUndefined()
    }
    const search = report.events.find((e) => e.name === 'Search Performed')?.props.find((x) => x.name === 'search_term')
    expect(search?.pii).toBe('serbest metin')
    expect(search?.values).toBeUndefined()
    // Hiçbir gösterilen değer arama metni değildir (arama metni başka özelliğin değeri olarak da geçmiyorsa)
    const shown = new Set(
      [...report.common, ...report.events.flatMap((e) => e.props)].flatMap((p) => (p.values ?? []).map((v) => v.value)),
    )
    const terms = new Set(searchTerms)
    for (const v of shown) if (terms.has(v)) expect(['true', 'false']).toContain(v)
  })

  it('kompakt çıktı kısa ve sonraki adımı söylüyor', () => {
    const lines = text.split('\n')
    expect(lines.length).toBeLessThanOrEqual(60)
    expect(lines[0]).toMatch(/dunya\.jsonl/)
    expect(text).toMatch(/Playback Started/)
    expect(text).toMatch(/gizlendi: kimlik benzeri/)
    expect(lines[lines.length - 1]).toMatch(/npm run lab -- esleme/)
    const one = formatDiscovery(report, { event: 'Playback Stopped' })
    expect(one).toMatch(/watch_duration_sec/)
  })

  it('maxLines taramayı sınırlar ve uyarır', async () => {
    const r = await discover([worldPath], { maxLines: 2000 })
    expect(r.scanned).toBe(2000)
    expect(r.warnings.some((w) => /tarandı/.test(w))).toBe(true)
  })

  it('önerilen eşlemeyle içe alma ve kurma çalışır', async () => {
    const lab = openLab({ dir: join(dir, 'lab'), secret: 'kesif-testi' })
    const { reports } = await ingest(lab, [worldPath], { mapping: report.suggestion, reset: true })
    expect(reports[0].byKind.PLAY_START ?? 0).toBeGreaterThan(0)
    expect(reports[0].byKind.SEARCH ?? 0).toBeGreaterThan(0)
    expect(reports[0].byKind.EXPOSURE ?? 0).toBeGreaterThan(0)
    const meta = build(lab)
    expect(meta.users).toBeGreaterThan(100)
    expect(meta.events).toBeGreaterThan(1000)
  }, 120_000)
})

describe('düz JSONL ve CSV', () => {
  it('düz JSONL (özellikler en üst düzeyde, ISO zaman)', async () => {
    const path = join(dir, 'duz.jsonl')
    const rows: string[] = []
    const t0 = Date.parse('2026-10-01T08:00:00Z')
    for (let u = 0; u < 30; u++) {
      const base = {
        user_id: `kullanici-${1000 + u}`,
        platform: u % 3 === 0 ? 'Roku Ultra' : u % 3 === 1 ? 'iOS' : 'Web',
        userEmail: `uye${u}@ornek-posta.example`,
        appVersion: u % 2 ? '3.1.0' : '3.2.0',
      }
      for (let d = 0; d < 5; d++) {
        const t = t0 + (u * 7 + d * 86_400) * 1000
        const at = (s: number): string => new Date(t + s * 1000).toISOString()
        const vid = `v${(u + d) % 6}`
        rows.push(JSON.stringify({ event_name: 'app_launch', timestamp: at(0), ...base }))
        rows.push(
          JSON.stringify({
            event_name: 'video_start',
            timestamp: at(5),
            videoId: vid,
            contentType: 'documentary',
            contentDuration: 1800,
            ...base,
          }),
        )
        rows.push(
          JSON.stringify({ event_name: 'video_progress', timestamp: at(605), videoId: vid, playheadSec: 600, ...base }),
        )
        rows.push(
          JSON.stringify({
            event_name: 'video_stop',
            timestamp: at(900),
            videoId: vid,
            playheadSec: 895,
            watchTimeSec: 895,
            ...base,
          }),
        )
        rows.push(
          JSON.stringify({
            event_name: 'search',
            timestamp: at(950),
            searchQuery: `sorgu ${u} ${d}`,
            resultsCount: d % 3,
            ...base,
          }),
        )
      }
    }
    writeFileSync(path, `${rows.join('\n')}\n`)
    const r = await discover([path])
    expect(r.format).toBe('jsonl')
    expect(r.propertiesKey).toBeNull()
    expect(r.userProperty).toBe('user_id')
    expect(r.timeProperty).toBe('timestamp')
    expect(r.timeUnit).toBe('iso')
    expect(r.users).toBe(30)
    const m = zLabMapping.parse(r.suggestion)
    expect(m.eventKey).toBe('event_name')
    expect(m.propertiesKey).toBeNull()
    expect(kindOfRule(m.events.app_launch)).toBe('APP_OPEN')
    expect(kindOfRule(m.events.video_start)).toBe('PLAY_START')
    expect(kindOfRule(m.events.video_progress)).toBe('PLAY_PROGRESS')
    expect(kindOfRule(m.events.video_stop)).toBe('PLAY_END')
    expect(kindOfRule(m.events.search)).toBe('SEARCH')
    expect(namesOf(m.props.contentId)).toEqual(['videoId'])
    expect(namesOf(m.props.position)).toEqual(['playheadSec'])
    expect(namesOf(m.props.watched)).toEqual(['watchTimeSec'])
    expect(namesOf(m.props.resultCount)).toEqual(['resultsCount'])
    expect(namesOf(m.props.device)).toEqual(['platform'])
    // Yerleşikte olmayan cihaz değeri sözlüğe önerilir; yerleşik olanlar yazılmaz
    expect(m.deviceMap['roku ultra']).toBe('TV')
    expect(m.deviceMap.ios).toBeUndefined()
    const json = JSON.stringify(r) + formatDiscovery(r)
    expect(json).not.toMatch(/ornek-posta|kullanici-10|sorgu \d/)
  })

  it("CSV (';' ayırıcı, Türkçe olay adları, epoch saniye)", async () => {
    const path = join(dir, 'olaylar.csv')
    const rows = ['olay;kullanici_id;zaman;icerik_id;izlenen_sure;arama_metni;sonuc_sayisi;platform;telefon']
    const t0 = 1_790_000_000
    for (let u = 0; u < 20; u++) {
      const tel = `0532${String(1_000_000 + u).slice(-7)}`
      for (let d = 0; d < 4; d++) {
        const t = t0 + u * 13 + d * 86_400
        rows.push(`Oynatma Başladı;k${u};${t};ic-${d};;;;Android TV;${tel}`)
        rows.push(`Oynatma Bitti;k${u};${t + 1200};ic-${d};1195;;;Android TV;${tel}`)
        rows.push(`Arama Yapıldı;k${u};${t + 1300};;;"aranan ${u}";${d % 2 ? 4 : 0};Android TV;${tel}`)
      }
    }
    writeFileSync(path, `${rows.join('\n')}\n`)
    const r = await discover([path])
    expect(r.format).toBe('csv')
    expect(r.propertiesKey).toBeNull()
    expect(r.userProperty).toBe('kullanici_id')
    expect(r.timeProperty).toBe('zaman')
    expect(r.timeUnit).toBe('s')
    expect(r.users).toBe(20)
    const m = zLabMapping.parse(r.suggestion)
    expect(m.eventKey).toBe('olay')
    expect(kindOfRule(m.events['Oynatma Başladı'])).toBe('PLAY_START')
    expect(kindOfRule(m.events['Oynatma Bitti'])).toBe('PLAY_END')
    expect(kindOfRule(m.events['Arama Yapıldı'])).toBe('SEARCH')
    expect(namesOf(m.props.contentId)).toEqual(['icerik_id'])
    expect(namesOf(m.props.watched)).toEqual(['izlenen_sure'])
    expect(namesOf(m.props.resultCount)).toEqual(['sonuc_sayisi'])
    const out = JSON.stringify(r) + formatDiscovery(r) + formatDiscovery(r, { event: 'Arama Yapıldı' })
    expect(out).not.toMatch(/0532|aranan/)
  })
})

describe('sezgiler', () => {
  it('olay adı sınıflaması: özgül kural kazanır', () => {
    const k = (s: string): string | undefined => classifyEvent(s)?.kind
    expect(k('Playback Error')).toBe('PLAY_ERROR')
    expect(k('Playback Stopped')).toBe('PLAY_END')
    expect(k('videoStarted')).toBe('PLAY_START')
    expect(k('Search No Results')).toBe('SEARCH')
    expect(classifyEvent('Search No Results')?.empty).toBe(true)
    expect(k('Subscription Started')).toBe('SUBSCRIBE')
    expect(k('abonelik_iptal')).toBe('CANCEL')
    expect(k('Ödeme Hatası')).toBe('PAYMENT_FAIL')
    expect(k('App Crash')).toBe('APP_ERROR')
    expect(k('$mp_web_page_view')).toBe('SCREEN')
    expect(k('Remove From Watchlist')).toBe('LIST_REMOVE')
    expect(k('Uygulama Açıldı')).toBe('APP_OPEN')
    expect(k('Settings Opened')).toBeUndefined()
    // Başarısızlık içeren giriş olayı emin olunmayan sayılır
    expect(classifyEvent('Login Failed')?.confidence ?? 0).toBeLessThan(0.5)
  })

  it('kişisel veri adları ve değerleri', () => {
    expect(namePii('$email')).toBe('e-posta')
    expect(namePii('msisdn')).toBe('telefon')
    expect(namePii('$ip')).toBe('IP')
    expect(namePii('$name')).toBe('ad')
    expect(namePii('search_term')).toBe('serbest metin')
    expect(namePii('platform')).toBeNull()
    expect(namePii('screen_name')).toBeNull()
    expect(namePii('Experiment name')).toBeNull()
    expect(valuePii('kisi1@ornek-posta.example')).toBe('e-posta')
    expect(valuePii('+90 532 123 45 67')).toBe('telefon')
    expect(valuePii('192.168.1.20')).toBe('IP')
    expect(valuePii('2001:db8::1')).toBe('IP')
    expect(valuePii('550e8400-e29b-41d4-a716-446655440000')).toBe('kimlik benzeri')
    expect(valuePii('4.2.0')).toBeNull()
    expect(valuePii('12:30:00')).toBeNull()
    expect(valuePii('Android TV')).toBeNull()
  })
})
