/**
 * Mixpanel eşleme şeması, satır çevirme (zaman birimleri, saat farkı, süre birimi, cihaz/beğeni eşlemesi, tamamlama)
 * ve katalog eşleme sırası (externalIds → videoId → slug → ad; bölüm → dizi).
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import type { ContentTitle } from '../../shared/content-schema'
import { zMixpanelMapping } from '../../shared/mixpanel-mapping'
import { loadContent } from '../src/services/catalog/load'
import { compileMapping, convertRow, parseTime, type ConvertContext } from '../src/services/mixpanel/mapping'
import { SYNTHETIC_MAPPING } from '../src/services/mixpanel/synthetic'
import { createTitleResolver, normalizeTitle, referenceSeconds } from '../src/services/viewing/resolve'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const titles: ContentTitle[] = loadContent(join(ROOT, 'content'), () => {}).titles.map((t) => t.title)
const repoMapping = zMixpanelMapping.parse(
  JSON.parse(readFileSync(join(ROOT, 'content', 'analytics', 'mixpanel-mapping.json'), 'utf8')),
)

function ctx(extraTitles: ContentTitle[] = []): ConvertContext {
  return {
    source: 'MIXPANEL',
    viewerId: (raw) => `v_test${raw.replace(/[^A-Za-z0-9]/g, '')}`,
    eventId: (parts) => `id:${parts}`,
    resolver: createTitleResolver([...titles, ...extraTitles]),
  }
}
const row = (event: string, props: Record<string, unknown>) => ({
  event,
  properties: { distinct_id: 'u1', time: 1_790_000_000, $insert_id: 'abc', ...props },
})
function ok(r: ReturnType<typeof convertRow>) {
  if (r.kind !== 'ok') throw new Error(`beklenen ok, gelen ${r.kind}`)
  return r
}

describe('eşleme şeması', () => {
  it('depodaki varsayılan eşleme geçerli ve sentetik üretecin tüm olaylarını kapsıyor', () => {
    for (const name of Object.keys(SYNTHETIC_MAPPING.events)) expect(repoMapping.events[name]).toBeDefined()
    expect(repoMapping.titleMatch.order).toEqual(['externalId', 'videoId', 'slug', 'title'])
  })

  it('varsayılanları doldurur, tek ad ya da ad listesi kabul eder', () => {
    const m = zMixpanelMapping.parse({
      version: 1,
      events: { Play: 'PLAY_START', Stop: { type: 'PLAY_END', properties: { watchedSeconds: 'session_sec' } } },
      properties: { contentId: ['cid', 'video'] },
    })
    expect(m.viewerProperty).toBe('distinct_id')
    expect(m.time).toEqual({ property: 'time', unit: 'auto', offsetMinutes: 0 })
    expect(m.titleMatch.namespace).toBe('mixpanel')
    const c = compileMapping(m)
    expect(c.events.get('Play')!.props.contentId).toEqual(['cid', 'video'])
    expect(c.events.get('Stop')!.props.watchedSeconds).toEqual(['session_sec'])
    expect(c.events.get('Stop')!.props.contentId).toEqual(['cid', 'video'])
  })

  it('bilinmeyen alanı, yanlış türü, boş olay listesini ve tekrar eden sırayı reddeder', () => {
    const base = { version: 1, events: { Play: 'PLAY_START' } }
    expect(zMixpanelMapping.safeParse({ ...base, extra: 1 }).success).toBe(false)
    expect(zMixpanelMapping.safeParse({ ...base, events: { Play: 'OYNAT' } }).success).toBe(false)
    expect(zMixpanelMapping.safeParse({ ...base, events: {} }).success).toBe(false)
    expect(zMixpanelMapping.safeParse({ ...base, properties: { contentID: 'x' } }).success).toBe(false)
    expect(zMixpanelMapping.safeParse({ ...base, titleMatch: { order: ['slug', 'slug'] } }).success).toBe(false)
    expect(zMixpanelMapping.safeParse({ ...base, version: 2 }).success).toBe(false)
    expect(zMixpanelMapping.safeParse({ ...base, deviceMap: { roku: 'TELEVIZYON' } }).success).toBe(false)
  })
})

describe('zaman', () => {
  it('auto: saniye ve milisaniyeyi ayırır; s/ms zorlanabilir; ISO metni', () => {
    expect(parseTime(1_790_000_000, 'auto', 0)).toBe(1_790_000_000_000)
    expect(parseTime(1_790_000_000_123, 'auto', 0)).toBe(1_790_000_000_123)
    expect(parseTime('1790000000', 'auto', 0)).toBe(1_790_000_000_000)
    expect(parseTime(1_790_000_000_000, 's', 0)).toBeNull() // 2100'den sonrası bozuk
    expect(parseTime(1_790_000_000, 'ms', 0)).toBeNull() // 1970 → bozuk
    expect(parseTime('2026-10-01T12:00:00Z', 'auto', 0)).toBe(Date.UTC(2026, 9, 1, 12))
    expect(parseTime('2026-10-01T12:00:00+03:00', 'auto', 180 * 60_000)).toBe(Date.UTC(2026, 9, 1, 9))
    expect(parseTime('dün', 'auto', 0)).toBeNull()
    expect(parseTime(null, 'auto', 0)).toBeNull()
  })

  it("proje saat dilimi farkı (offsetMinutes) UTC'ye çevirir", () => {
    // İstanbul saatine göre yazılmış 12:00 → UTC 09:00
    const local = Date.UTC(2026, 9, 1, 12) / 1000
    expect(parseTime(local, 'auto', 180 * 60_000)).toBe(Date.UTC(2026, 9, 1, 9))
    expect(parseTime('2026-10-01T12:00:00', 'auto', 180 * 60_000)).toBe(Date.UTC(2026, 9, 1, 9))
    const m = compileMapping(
      zMixpanelMapping.parse({ version: 1, events: { P: 'PLAY_START' }, time: { offsetMinutes: 180 } }),
    )
    const r = ok(convertRow(row('P', { time: local }), '', m, ctx()))
    expect(r.event.ts).toBe(Date.UTC(2026, 9, 1, 9))
  })
})

describe('satır çevirme', () => {
  const m = compileMapping(repoMapping)

  it('eşlenen alanları çevirir; eşlemede olmayan özellikleri taşımaz', () => {
    const r = ok(
      convertRow(
        row('Video Stop', {
          content_id: '80010001',
          watched_seconds: '120',
          position: 880,
          duration: 888,
          platform: 'Android TV',
          mp_country_code: 'tr',
          $email: 'kisi@ornek.invalid',
          $ip: '10.0.0.1',
          $name: 'Ad Soyad',
        }),
        '',
        m,
        ctx(),
      ),
    )
    expect(r.event).toMatchObject({
      type: 'PLAY_END',
      titleId: 80010001,
      videoId: 80010001,
      watchedSec: 120,
      positionSec: 880,
      durationSec: 888,
      completed: true,
      device: 'TV',
      country: 'TR',
      viewerId: 'v_testu1',
    })
    const text = JSON.stringify(r.event)
    expect(text).not.toContain('ornek.invalid')
    expect(text).not.toContain('10.0.0.1')
    expect(text).not.toContain('Ad Soyad')
    expect(text).not.toContain('"u1"')
  })

  it('tamamlama eşiği, açık completed alanı, süre birimi', () => {
    expect(ok(convertRow(row('Video Stop', { position: 80, duration: 100 }), '', m, ctx())).event.completed).toBe(false)
    expect(
      ok(convertRow(row('Video Stop', { position: 95, duration: 100, completed: 'false' }), '', m, ctx())).event
        .completed,
    ).toBe(false)
    const msMap = compileMapping({ ...repoMapping, durationUnit: 'ms', completionThreshold: 0.75 })
    const e = ok(
      convertRow(row('Video Stop', { position: 80_000, duration: 100_000, watched_seconds: 5000 }), '', msMap, ctx()),
    ).event
    expect(e).toMatchObject({ positionSec: 80, durationSec: 100, watchedSec: 5, completed: true })
    const minMap = compileMapping({ ...repoMapping, durationUnit: 'min' })
    expect(ok(convertRow(row('Video Progress', { watched_seconds: 2 }), '', minMap, ctx())).event.watchedSec).toBe(120)
  })

  it('cihaz ve beğeni eşlemesi; bilinmeyen cihaz OTHER', () => {
    expect(ok(convertRow(row('Video Start', { platform: 'iOS' }), '', m, ctx())).event.device).toBe('MOBILE')
    expect(ok(convertRow(row('Video Start', { $os: 'Mac OS X' }), '', m, ctx())).event.device).toBe('WEB')
    expect(ok(convertRow(row('Video Start', { platform: 'Buzdolabı' }), '', m, ctx())).event.device).toBe('OTHER')
    expect(ok(convertRow(row('Content Rated', { rating: 'THUMBS_WAY_UP' }), '', m, ctx())).event.rating).toBe(2)
    expect(ok(convertRow(row('Content Rated', { rating: -1 }), '', m, ctx())).event.rating).toBe(-1)
    expect(
      ok(convertRow(row('Content Rated', { rating: 'thumbs_unrated' }), '', m, ctx())).event.rating,
    ).toBeUndefined()
    expect(ok(convertRow(row('Search', { search_query: 'x'.repeat(200) }), '', m, ctx())).event.query).toHaveLength(80)
  })

  it('eşlenmeyen olay, eksik izleyici, bozuk zaman, bozuk biçim', () => {
    expect(convertRow(row('Page View', {}), '', m, ctx())).toEqual({ kind: 'unmapped', name: 'Page View' })
    expect(convertRow(row('Video Start', { distinct_id: '' }), '', m, ctx()).kind).toBe('rejected')
    expect(convertRow(row('Video Start', { time: 'yarın' }), '', m, ctx()).kind).toBe('rejected')
    expect(convertRow({ event: 'Video Start' }, '', m, ctx()).kind).toBe('rejected')
    expect(convertRow([1, 2], '', m, ctx()).kind).toBe('rejected')
    expect(convertRow({ event: 5, properties: {} }, '', m, ctx()).kind).toBe('rejected')
  })

  it('yinelenme anahtarı: (olay, distinct_id, time, $insert_id); $insert_id yoksa satır özeti', () => {
    const a = ok(convertRow(row('Video Start', {}), '', m, ctx())).event.id
    expect(a).toBe('id:i|Video Start|u1|1790000000|abc')
    const b = ok(convertRow(row('Video Start', { $insert_id: undefined }), '{"satir":1}', m, ctx())).event.id
    expect(b).toBe('id:l|{"satir":1}')
    const c = ok(convertRow(row('Video Start', { time: 1_790_000_001 }), '', m, ctx())).event.id
    expect(c).not.toBe(a)
  })

  it('içerik kimliği bulunamazsa olay kalır, başlık null, rapora kimlik düşer; ad ile eşleme yedeği', () => {
    const r = ok(convertRow(row('Video Start', { content_id: 'cnt_404' }), '', m, ctx()))
    expect(r.event.titleId).toBeNull()
    expect(r.unknownContent).toBe('cnt_404')
    const byName = ok(convertRow(row('Video Start', { content_title: 'NOSFERATU' }), '', m, ctx()))
    expect(byName.event.titleId).toBe(80020003)
    expect(byName.unknownContent).toBeNull()
    const none = ok(convertRow(row('Search', { search_query: 'uzay' }), '', m, ctx()))
    expect(none.unknownContent).toBeNull()
  })
})

describe('başlık eşleme', () => {
  const show = titles.find((t) => t.type === 'SHOW')!
  const episode = show.seasons[0]!.episodes[0]!
  const withExt: ContentTitle = {
    ...titles.find((t) => t.slug === 'sintel')!,
    videoId: 99000001,
    slug: 'harici-film',
    title: 'Harici Film',
    externalIds: { mixpanel: 'cnt_48213', baska: '80020003' },
  }
  const r = createTitleResolver([...titles, withExt])
  const order = ['externalId', 'videoId', 'slug', 'title'] as const

  it('externalIds → videoId → slug → ad sırası; ad alanı', () => {
    expect(r.resolve('cnt_48213', order, 'mixpanel')).toEqual({ titleId: 99000001, videoId: 99000001 })
    expect(r.resolve('cnt_48213', order, 'baska')).toBeNull()
    // 'baska' ad alanında 80020003 harici filme gider; varsayılan sırada externalId önce gelir
    expect(r.resolve('80020003', order, 'baska')!.titleId).toBe(99000001)
    expect(r.resolve('80020003', order, 'mixpanel')!.titleId).toBe(80020003)
    expect(r.resolve('80020003', ['videoId', 'externalId'], 'baska')!.titleId).toBe(80020003)
    expect(r.resolve('sintel', order, 'mixpanel')!.titleId).toBe(80010001)
    expect(r.resolve('  Sintel ', order, 'mixpanel')!.titleId).toBe(80010001)
    expect(r.resolve('sintel', ['videoId'], 'mixpanel')).toBeNull()
  })

  it('bölüm kimliği diziye bağlanır, yaprak korunur; dizi kimliğinde yaprak null', () => {
    expect(r.resolve(String(episode.videoId), order, 'mixpanel')).toEqual({
      titleId: show.videoId,
      videoId: episode.videoId,
    })
    expect(r.resolve(String(show.videoId), order, 'mixpanel')).toEqual({ titleId: show.videoId, videoId: null })
  })

  it('ad normalleştirme Türkçe harfleri ve noktalamayı yok sayar; belirsiz ad eşlenmez', () => {
    expect(normalizeTitle('Türk Dünyası: Keşif Rotası!')).toBe('turk dunyasi kesif rotasi')
    expect(normalizeTitle('İĞNE ışık')).toBe('igne isik')
    const twin: ContentTitle = { ...withExt, videoId: 99000002, slug: 'ikiz', externalIds: {} }
    const amb = createTitleResolver([withExt, twin])
    expect(amb.resolveName('Harici Film')).toBeNull()
  })

  it('ilgi referansı: film süresi; dizi için ~3 bölüm; süre yoksa gözlenen ya da 30 dk', () => {
    const film = titles.find((t) => t.slug === 'sintel')!
    expect(referenceSeconds(film, () => null)).toBe(888)
    const noRuntime = titles.find((t) => t.slug === 'big-buck-bunny')!
    expect(referenceSeconds(noRuntime, () => 600)).toBe(600)
    expect(referenceSeconds(noRuntime, () => null)).toBe(1800)
    const series = {
      ...show,
      seasons: [{ number: 1, episodes: [1, 2, 3, 4].map((n) => ({ ...episode, videoId: n, runtimeSec: 1000 })) }],
    }
    expect(referenceSeconds(series as ContentTitle, () => null)).toBe(3000)
    const two = { ...series, seasons: [{ number: 1, episodes: series.seasons[0]!.episodes.slice(0, 2) }] }
    expect(referenceSeconds(two as ContentTitle, () => null)).toBe(2000)
  })
})
