import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import type { HttpResponse } from './lib/net'
import {
  REQUEST_GAP_MS,
  approximateDate,
  parseChannelVideosPage,
  channelPageUrl,
  classifyOembed,
  collectYoutubeRefs,
  feedToSkeletons,
  feedUrl,
  fixArt,
  formatReportTable,
  isReportBroken,
  oembedUrl,
  parseChannelFeed,
  runCheck,
  type YoutubeDeps,
} from './ingest-youtube'

const GOOD = 'aqz-KE-bpKQ'
const BAD = 'xxxxxxxxxxx'
const NOEMBED = 'nnnnnnnnnnn'
const CH_OK = 'UC' + 'a'.repeat(22)
const CH_BAD = 'UC' + 'b'.repeat(22)
const CH_PAGE = 'UC' + 'c'.repeat(22)

const FEED = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns:yt="http://www.youtube.com/xml/schemas/2015" xmlns:media="http://search.yahoo.com/mrss/" xmlns="http://www.w3.org/2005/Atom">
 <title>Örnek Kanal</title>
 <entry>
  <id>yt:video:${GOOD}</id>
  <yt:videoId>${GOOD}</yt:videoId>
  <title>Büyük Tavşan &amp; Arkadaşları</title>
  <author><name>Blender</name></author>
  <published>2024-05-01T10:00:00+00:00</published>
  <media:group>
   <media:title>Büyük Tavşan</media:title>
   <media:thumbnail url="https://i4.ytimg.com/vi/${GOOD}/hqdefault.jpg" width="480" height="360"/>
   <media:description>Uzun bir açıklama metni burada yer alıyor ve yirmi karakteri geçiyor.</media:description>
  </media:group>
 </entry>
 <entry>
  <yt:videoId>12345678901</yt:videoId>
  <title>2024</title>
  <published>2023-01-02T00:00:00+00:00</published>
  <media:group><media:description></media:description></media:group>
 </entry>
</feed>`

function contentDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'tvplus-yt-'))
  mkdirSync(join(dir, 'titles'))
  const titles = [
    {
      videoId: 80030001,
      slug: 'iyi',
      title: 'İyi',
      sources: [{ type: 'YOUTUBE', videoId: GOOD }],
      artwork: { storyArt: null, focal: '50% 50%' },
    },
    { videoId: 80030002, slug: 'kotu', title: 'Kötü', sources: [{ type: 'YOUTUBE', videoId: BAD }] },
    {
      videoId: 80030003,
      slug: 'dizi',
      type: 'SHOW',
      seasons: [
        {
          number: 1,
          episodes: [
            {
              videoId: 80030103,
              sources: [{ type: 'YOUTUBE', videoId: NOEMBED }],
              artwork: { storyArt: 'https://x/y.jpg' },
            },
          ],
        },
      ],
    },
    { videoId: 80010001, slug: 'dash', sources: [{ type: 'DASH', manifest: 'https://x/m.mpd' }] },
  ]
  writeFileSync(join(dir, 'titles', 'a.json'), JSON.stringify(titles, null, 2))
  writeFileSync(
    join(dir, 'channels.json'),
    JSON.stringify([
      { channelId: 1, source: { type: 'YOUTUBE_LIVE', channelId: CH_OK } },
      { channelId: 2, source: { type: 'YOUTUBE_LIVE', channelId: CH_BAD, videoId: GOOD } },
      { channelId: 3, source: { type: 'YOUTUBE_LIVE', channelId: CH_PAGE } },
    ]),
  )
  return dir
}

function fakeDeps(): YoutubeDeps & { calls: string[]; sleeps: number[] } {
  const calls: string[] = []
  const sleeps: number[] = []
  const res = (status: number, text = ''): HttpResponse => ({ status, contentType: null, text })
  const get = vi.fn(async (url: string) => {
    calls.push(url)
    if (url === oembedUrl(GOOD))
      return res(200, JSON.stringify({ title: 'Big Buck Bunny 60fps 4K', author_name: 'Blender' }))
    if (url === oembedUrl(BAD)) return res(404, 'Not Found')
    if (url === oembedUrl(NOEMBED)) return res(401, 'Unauthorized')
    if (url === feedUrl(CH_OK)) return res(200, FEED)
    if (url === feedUrl(CH_BAD)) return res(404)
    if (url === feedUrl(CH_PAGE)) return res(404)
    if (url === channelPageUrl(CH_PAGE))
      return res(
        200,
        `<link rel="canonical" href="https://www.youtube.com/channel/${CH_PAGE}"><meta property="og:title" content="S&#39;ayfa &amp; Kanal">"externalId":"${CH_PAGE}"`,
      )
    if (url === channelPageUrl(CH_BAD)) return res(200, '<html><title>YouTube</title></html>')
    if (url.includes(`/vi/${GOOD}/maxresdefault.jpg`)) return res(200)
    if (url.includes('maxresdefault')) return res(404)
    if (url.includes('hqdefault')) return res(200)
    throw new Error(`beklenmeyen adres ${url}`)
  })
  return {
    get,
    sleep: async (ms) => void sleeps.push(ms),
    now: () => new Date('2026-11-13T10:00:00Z'),
    log: () => {},
    calls,
    sleeps,
  }
}

describe('ingest-youtube', () => {
  it('oEmbed sınıflandırma', () => {
    expect(classifyOembed(200, '{"title":"T","author_name":"A"}')).toEqual({
      ok: true,
      status: 200,
      state: 'ok',
      title: 'T',
      author: 'A',
    })
    expect(classifyOembed(401, '').state).toBe('embed-disabled')
    expect(classifyOembed(403, '').state).toBe('embed-disabled')
    expect(classifyOembed(404, '').state).toBe('missing')
    expect(classifyOembed(400, '').state).toBe('missing')
    expect(classifyOembed(500, '')).toMatchObject({ ok: false, state: 'error' })
  })

  it('kanal akışı ayrıştırma', () => {
    const f = parseChannelFeed(FEED)
    expect(f.channelTitle).toBe('Örnek Kanal')
    expect(f.entries).toHaveLength(2)
    expect(f.entries[0]).toEqual({
      videoId: GOOD,
      title: 'Büyük Tavşan & Arkadaşları',
      published: '2024-05-01T10:00:00+00:00',
      author: 'Blender',
      description: 'Uzun bir açıklama metni burada yer alıyor ve yirmi karakteri geçiyor.',
      thumbnail: `https://i4.ytimg.com/vi/${GOOD}/hqdefault.jpg`,
    })
    // Sayısal başlık metin olarak kalır
    expect(f.entries[1]?.title).toBe('2024')
    expect(parseChannelFeed('<html/>').entries).toEqual([])
  })

  it('içerikteki YouTube başvurularını toplar', () => {
    const refs = collectYoutubeRefs(contentDir())
    expect([...refs.videos.keys()].sort()).toEqual([BAD, GOOD, NOEMBED].sort())
    expect(refs.videos.get(GOOD)).toHaveLength(2) // başlık + canlı kanalın sabit videosu
    expect([...refs.channels.keys()]).toEqual([CH_OK, CH_BAD, CH_PAGE])
  })

  it('denetim raporu: durumlar, istekler arası bekleme, bozukluk', async () => {
    const deps = fakeDeps()
    const r = await runCheck(contentDir(), deps)
    expect(r.checkedAt).toBe('2026-11-13T10:00:00.000Z')
    expect(r.videos[GOOD]).toMatchObject({ ok: true, status: 200, title: 'Big Buck Bunny 60fps 4K', author: 'Blender' })
    expect(r.videos[BAD]).toMatchObject({ ok: false, status: 404, state: 'missing' })
    expect(r.videos[NOEMBED]).toMatchObject({ ok: false, status: 401, state: 'embed-disabled' })
    expect(r.channels[CH_OK]).toMatchObject({ ok: true, title: 'Örnek Kanal', latestVideoId: GOOD, via: 'feed' })
    // Akış 404, sayfada kanal kimliği yok → yok
    expect(r.channels[CH_BAD]).toMatchObject({ ok: false, status: 404, via: null })
    // Akış 404 ama sayfa kanalın kendisi → var
    expect(r.channels[CH_PAGE]).toMatchObject({ ok: true, title: "S'ayfa & Kanal", via: 'page' })
    // 3 video + 3 akış + 2 sayfa isteği; her istek arasında 150 ms
    expect(deps.calls).toHaveLength(8)
    expect(deps.sleeps).toEqual(Array(7).fill(REQUEST_GAP_MS))
    expect(isReportBroken(r)).toBe(true)
    const table = formatReportTable(r)
    expect(table).toContain('gömme kapalı')
    expect(table).toContain('2 video, 1 kanal sorunlu')
  })

  it('ağ hatası "hata" durumudur, fırlatmaz', async () => {
    const deps = fakeDeps()
    deps.get = vi.fn().mockRejectedValue(new Error('zaman aşımı'))
    const r = await runCheck(contentDir(), deps)
    expect(r.videos[GOOD]).toMatchObject({ ok: false, status: 0, state: 'error' })
  })

  it('--fix-art: boş storyArt doldurulur (maxres → hq), dolu olana dokunulmaz, biçim korunur', async () => {
    const dir = contentDir()
    const deps = fakeDeps()
    const fixes = await fixArt(dir, deps)
    expect(fixes.map((f) => [f.path, f.storyArt])).toEqual([
      ['[0]', `https://i.ytimg.com/vi/${GOOD}/maxresdefault.jpg`],
      ['[1]', `https://i.ytimg.com/vi/${BAD}/hqdefault.jpg`],
    ])
    const text = readFileSync(join(dir, 'titles', 'a.json'), 'utf8')
    expect(text.endsWith('}\n]\n') || text.endsWith(']\n')).toBe(true)
    expect(text).toContain('\n  {\n    "videoId": 80030001')
    const data = JSON.parse(text) as { artwork?: { storyArt?: string; focal?: string } }[]
    expect(data[0]?.artwork).toEqual({ storyArt: `https://i.ytimg.com/vi/${GOOD}/maxresdefault.jpg`, focal: '50% 50%' })
    expect(data[1]?.artwork?.storyArt).toBe(`https://i.ytimg.com/vi/${BAD}/hqdefault.jpg`)
    // İkinci çalıştırma: yapılacak iş yok
    expect(await fixArt(dir, fakeDeps())).toEqual([])
  })

  it('kanal akışından içerik iskeleti', () => {
    const sk = feedToSkeletons(parseChannelFeed(FEED), { usedIds: new Set([80030001]), today: '2026-11-13' }) as Record<
      string,
      unknown
    >[]
    expect(sk).toHaveLength(2)
    expect(sk[0]).toMatchObject({
      videoId: 80030002,
      slug: 'buyuk-tavsan-arkadaslari',
      type: 'MOVIE',
      title: 'Büyük Tavşan & Arkadaşları',
      year: 2024,
      sources: [{ type: 'YOUTUBE', videoId: GOOD }],
      artwork: { storyArt: `https://i4.ytimg.com/vi/${GOOD}/hqdefault.jpg` },
      availability: { addedAt: '2026-11-13' },
    })
    expect(sk[1]).toMatchObject({ videoId: 80030003, year: 2023 })
    expect(String(sk[1]?.synopsis).length).toBeGreaterThanOrEqual(20)
  })

  it('kanal video sayfası (yedek) ayrıştırma ve yaklaşık tarih', () => {
    const lockup = (id: string, title: string, when: string) => ({
      richItemRenderer: {
        content: {
          lockupViewModel: {
            contentId: id,
            contentType: 'LOCKUP_CONTENT_TYPE_VIDEO',
            metadata: {
              lockupMetadataViewModel: {
                title: { content: title },
                metadata: {
                  contentMetadataViewModel: {
                    metadataRows: [{ metadataParts: [{ text: { content: '253 B' } }, { text: { content: when } }] }],
                  },
                },
              },
            },
          },
        },
      },
    })
    const data = {
      metadata: { channelMetadataRenderer: { title: 'Blender' } },
      contents: [
        lockup(GOOD, 'Yeni Sürüm', '2 gün önce'),
        lockup('pvUy69I_Xuk', 'Eski', '3 yıl önce'),
        lockup(GOOD, 'Yinelenen', '1 gün önce'),
      ],
    }
    const html = `<html><script>var ytInitialData = ${JSON.stringify(data)};</script></html>`
    const now = new Date('2026-11-13T10:00:00Z')
    const f = parseChannelVideosPage(html, now)
    expect(f.channelTitle).toBe('Blender')
    expect(f.entries.map((e) => [e.videoId, e.title, e.published])).toEqual([
      [GOOD, 'Yeni Sürüm', '2026-11-11'],
      ['pvUy69I_Xuk', 'Eski', '2023-11-13'],
    ])
    expect(parseChannelVideosPage('<html></html>', now).entries).toEqual([])
    expect(approximateDate('5 weeks ago', now)).toBe('2026-10-09')
    expect(approximateDate('2 hf. önce', now)).toBe('2026-10-30')
    expect(approximateDate('', now)).toBe('2026-11-13')
  })
})

describe('canlı kanalın yedek videosu', () => {
  it('yükleyen adı kanal adıyla eşleşmeli', async () => {
    const { sameChannelName } = await import('./ingest-youtube')
    expect(sameChannelName('SÖZCÜ Televizyonu', 'SÖZCÜ Televizyonu')).toBe(true)
    expect(sameChannelName('TGRT Haber TV', 'TGRT Haber')).toBe(true)
    expect(sameChannelName('TRT Çocuk', 'trt cocuk')).toBe(true)
    expect(sameChannelName('Yılmaz Özdil', 'TRT Haber')).toBe(false)
    expect(sameChannelName('PBS NewsHour', 'TRT World')).toBe(false)
    expect(sameChannelName(null, 'TRT Haber')).toBe(true)
  })
})
