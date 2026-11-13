import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { ContentChannel } from '../../shared/content-schema'
import {
  rangeUrl,
  type EmbedManifest,
  type LicensedManifest,
  type ManifestError,
  type ManifestRequest,
  type MslEnvelope,
  type ProgressiveManifest,
  type StreamsManifest,
} from '../../shared/playback'
import { packageTitle } from '../../scripts/package-title'
import { planeOf } from '../src/services/playback/plane'
import { parseMpd } from '../src/services/playback/sources/dash'
import { packagedDir } from '../src/services/playback/sources/packaged'
import { createTestApp } from './helpers'
import { openResponse, provisionClient, sealRequest, type MslClient } from './msl-client'
import { fakePassport, generateClip, installFakes, playable, usePassport, type Fakes } from './playback-fakes'

const MPD_URL = 'https://ornek-koken.invalid/sintel/dash.mpd'
const EXTRA_MPD_URL = 'https://ornek-koken.invalid/sintel-surround/dash.mpd'
const MISSING_MPD_URL = 'https://ornek-koken.invalid/yok/dash.mpd'

const rep = (id: string, mime: string, codecs: string, bw: number, file: string, extra = '') =>
  `<Representation id="${id}" bandwidth="${bw}" codecs="${codecs}" mimeType="${mime}" ${extra}><BaseURL>${file}</BaseURL>` +
  `<SegmentBase indexRange="800-3500" timescale="1000"><Initialization range="0-799"/></SegmentBase></Representation>`
const MPD = `<?xml version="1.0"?>
<MPD xmlns="urn:mpeg:dash:schema:mpd:2011" profiles="urn:mpeg:dash:profile:isoff-on-demand:2011" type="static" mediaPresentationDuration="PT888.053S">
<Period id="0">
  <AdaptationSet contentType="text" lang="en"><Role schemeIdUri="urn:mpeg:dash:role:2011" value="main"/><Representation id="t1" bandwidth="256" mimeType="text/vtt"><BaseURL>s-eng.webvtt</BaseURL></Representation></AdaptationSet>
  <AdaptationSet contentType="text" lang="de"><Representation id="t2" bandwidth="256" mimeType="text/vtt"><BaseURL>s-ger.webvtt</BaseURL></Representation></AdaptationSet>
  <AdaptationSet contentType="text" lang="tr"><Representation id="t3" bandwidth="256" mimeType="text/vtt"><BaseURL>s-tr.webvtt</BaseURL></Representation></AdaptationSet>
  <AdaptationSet contentType="video">
    ${rep('h1', 'video/mp4', 'avc1.4d401f', 417975, 'v-240-h264.mp4', 'width="426" height="182"')}
    ${rep('h2', 'video/mp4', 'avc1.4d401f', 1043675, 'v-480-h264.mp4', 'width="854" height="364"')}
    ${rep('h3', 'video/mp4', 'avc1.4d401f', 2622785, 'v-720-h264.mp4', 'width="1280" height="546"')}
    ${rep('h4', 'video/mp4', 'avc1.640028', 4716317, 'v-1080-h264.mp4', 'width="1920" height="818"')}
  </AdaptationSet>
  <AdaptationSet contentType="audio" lang="en"><Role schemeIdUri="urn:mpeg:dash:role:2011" value="main"/>
    <AudioChannelConfiguration schemeIdUri="urn:mpeg:dash:23003:3:audio_channel_configuration:2011" value="2"/>
    ${rep('a1', 'audio/mp4', 'mp4a.40.2', 132445, 'a-eng-aac.mp4')}
  </AdaptationSet>
  <AdaptationSet contentType="video">
    ${rep('v1', 'video/webm', 'vp9', 204094, 'v-240-vp9.webm', 'width="426" height="182"')}
    ${rep('v2', 'video/webm', 'vp9', 521203, 'v-480-vp9.webm', 'width="854" height="364"')}
    ${rep('v3', 'video/webm', 'vp9', 1127443, 'v-720-vp9.webm', 'width="1280" height="546"')}
  </AdaptationSet>
  <AdaptationSet contentType="audio" lang="en"><Role schemeIdUri="urn:mpeg:dash:role:2011" value="main"/>
    <AudioChannelConfiguration schemeIdUri="urn:mpeg:dash:23003:3:audio_channel_configuration:2011" value="2"/>
    ${rep('o1', 'audio/webm', 'opus', 130600, 'a-eng-opus.webm')}
  </AdaptationSet>
</Period></MPD>`
const EXTRA_MPD = `<?xml version="1.0"?>
<MPD xmlns="urn:mpeg:dash:schema:mpd:2011" profiles="urn:mpeg:dash:profile:isoff-on-demand:2011" type="static" mediaPresentationDuration="PT888S">
<Period id="0"><AdaptationSet contentType="audio" lang="en">
  <Representation id="x1" bandwidth="131710" codecs="mp4a.40.2" mimeType="audio/mp4"><AudioChannelConfiguration schemeIdUri="urn:mpeg:dash:23003:3:audio_channel_configuration:2011" value="2"/><BaseURL>a-2c.mp4</BaseURL><SegmentBase indexRange="754-2993"><Initialization range="0-753"/></SegmentBase></Representation>
  <Representation id="x2" bandwidth="387599" codecs="mp4a.40.2" mimeType="audio/mp4"><AudioChannelConfiguration schemeIdUri="urn:mpeg:dash:23003:3:audio_channel_configuration:2011" value="6"/><BaseURL>a-6c.mp4</BaseURL><SegmentBase indexRange="754-2993"><Initialization range="0-753"/></SegmentBase></Representation>
</AdaptationSet></Period></MPD>`

/** MPD'yi ağa çıkmadan disk önbelleğine yerleştirir (çevrimdışı test uygulaması bunu kullanır). */
function seedMpd(dataDir: string, url: string, xml: string) {
  const parsed = parseMpd(xml, url)
  const withSize = (r: (typeof parsed.video)[number]) => ({ ...r, size: 5_000_000 + r.bandwidth })
  const dir = join(dataDir, 'mpd-cache')
  mkdirSync(dir, { recursive: true })
  const file = join(dir, `${createHash('sha1').update(url).digest('hex')}.json`)
  writeFileSync(
    file,
    JSON.stringify({
      version: 1,
      fetchedAt: Date.now(),
      ...parsed,
      video: parsed.video.map(withSize),
      audio: parsed.audio.map(withSize),
    }),
  )
}

let work: string
let app: FastifyInstance
let fakes: Fakes
let client: MslClient
let vp9File: Buffer

const ALL_PROFILES = ['vp9-webm', 'h264-mp4', 'opus-webm', 'aac-mp4']
async function manifest<T = LicensedManifest>(req: Partial<ManifestRequest>, reqName = 'licensedManifest'): Promise<T> {
  const body: ManifestRequest = {
    viewableId: 'Video:1001',
    prefetch: false,
    profiles: ALL_PROFILES as ManifestRequest['profiles'],
    supportsMse: true,
    uiLanguage: 'tr',
    ...req,
  }
  const res = await app.inject({
    method: 'POST',
    url: `/msl/v1/playapi/licensedManifest?reqName=${reqName}&clienttype=anka`,
    payload: await sealRequest(client, body),
  })
  if (res.statusCode !== 200) throw new Error(`HTTP ${res.statusCode}: ${res.body}`)
  return (await openResponse<T>(client, res.json() as MslEnvelope)).payload
}

beforeAll(async () => {
  work = mkdtempSync(join(tmpdir(), 'tvplus-oynatma-'))
  const mediaDir = join(work, 'media')
  const subtitlesDir = join(work, 'altyazi')
  mkdirSync(subtitlesDir)
  writeFileSync(join(subtitlesDir, 'klip.tr.vtt'), 'WEBVTT\n\n00:01.000 --> 00:02.500\nMerhaba <i>dünya</i>\n')
  const clip = await generateClip(work)
  await packageTitle({
    input: clip,
    id: 'klip',
    mediaDir,
    ladder: [90, 144],
    bitrates: { 90: 60, 144: 110 },
    codecs: ['vp9', 'h264'],
    speed: 'fast',
    lang: 'tr',
  })
  vp9File = readFileSync(join(packagedDir(mediaDir, 'klip'), 'v-144p-110k-vp9.webm'))

  app = await createTestApp({ mediaDir })
  seedMpd(app.config.dataDir, MPD_URL, MPD)
  seedMpd(app.config.dataDir, EXTRA_MPD_URL, EXTRA_MPD)
  fakes = installFakes(app, subtitlesDir)
  usePassport(app, fakePassport())
  client = await provisionClient(app, 'TVPWCH-MC-OYNATMA')

  const yt = { type: 'YOUTUBE' as const, videoId: 'aqz-KE-bpKQ' }
  fakes.playables.set(
    1001,
    playable({
      videoId: 1001,
      displayTitle: 'Deneme Klibi',
      sources: [
        {
          type: 'PACKAGED',
          id: 'klip',
          timedText: [{ lang: 'tr', label: 'Türkçe', format: 'vtt', file: 'klip.tr.vtt', kind: 'SUBTITLES' }],
        },
        yt,
      ],
    }),
  )
  const dash = {
    type: 'DASH' as const,
    manifest: MPD_URL,
    extraAudioManifest: EXTRA_MPD_URL,
    timedText: [
      {
        lang: 'tr',
        label: 'Türkçe (içerik)',
        format: 'vtt' as const,
        url: 'https://ornek-koken.invalid/tr.vtt',
        kind: 'SUBTITLES' as const,
      },
    ],
  }
  fakes.playables.set(
    1002,
    playable({
      videoId: 1002,
      displayTitle: 'Sintel',
      runtimeSec: 888,
      sources: [dash],
      promo: { source: dash, offsetSec: 95 },
    }),
  )
  fakes.playables.set(
    1003,
    playable({
      videoId: 1003,
      sources: [
        {
          type: 'PROGRESSIVE',
          url: 'https://archive.invalid/film.mp4',
          mimeType: 'video/mp4',
          sizeBytes: 123456789,
          timedText: [],
        },
      ],
    }),
  )
  fakes.playables.set(1004, playable({ videoId: 1004, runtimeSec: null, sources: [{ ...yt, startSec: 12 }] }))
  fakes.playables.set(1005, playable({ videoId: 1005, sources: [dash] }))
  fakes.access.set(1005, {
    state: 'UPSELL',
    reasonText: 'Bu film Sinema paketinde.',
    requiredProduct: 'sinema',
    requiredProductName: 'Sinema',
    cta: 'Paketi incele',
  })
  fakes.playables.set(
    1006,
    playable({ videoId: 1006, sources: [{ type: 'DASH', manifest: MISSING_MPD_URL, timedText: [] }] }),
  )
  fakes.bookmarks.set('PROFIL1:1001', { positionSec: 42, runtimeSec: 6, lastModified: new Date().toISOString() })

  const channel = (channelId: number, source: ContentChannel['source']): ContentChannel => ({
    channelId,
    slug: `kanal-${channelId}`,
    name: `Kanal ${channelId}`,
    number: channelId,
    category: 'haber' as ContentChannel['category'],
    description: 'deneme',
    logo: null,
    isHd: true,
    favorite: false,
    kids: false,
    source,
    requiredProduct: null,
  })
  fakes.channels.set(1, channel(1, { type: 'YOUTUBE_LIVE', channelId: 'UC' + 'a'.repeat(22) }))
  fakes.channels.set(2, channel(2, { type: 'LINEAR', playlist: [1001] }))
  const airing = {
    airingId: 'A1',
    channelId: 2,
    title: 'Gece Filmi',
    synopsis: '',
    kind: 'film',
    startAt: new Date(Date.now() - 125_500),
    endAt: new Date(Date.now() + 3_600_000),
    videoId: 1001,
    isSample: true,
  }
  fakes.airings.set('A1', airing)
  fakes.linear.set(2, { airing, videoId: 1001, offsetSec: 125.5 })
}, 60_000)
afterAll(async () => {
  await app.close()
  rmSync(work, { recursive: true, force: true })
})
beforeEach(() => planeOf(app).nodes.reset())

describe('lisanslı manifest: STREAMS (paketlenmiş)', () => {
  it('profil pazarlığı: istemcinin ilk tercihi, yalnız o profilin akışları', async () => {
    const m = await manifest<StreamsManifest>({ profiles: ['h264-mp4', 'vp9-webm', 'aac-mp4', 'opus-webm'] })
    expect(m.kind).toBe('STREAMS')
    const v = m.videoTracks[0]!.streams
    expect(v.map((s) => s.profile)).toEqual(['h264-mp4', 'h264-mp4'])
    expect(v.map((s) => s.height)).toEqual([90, 144])
    expect(v[0]!.bitrateKbps).toBeLessThan(v[1]!.bitrateKbps)
    expect(m.audioTracks).toHaveLength(1)
    expect(m.audioTracks[0]!.streams.map((s) => s.profile)).toEqual(['aac-mp4'])
    const m2 = await manifest<StreamsManifest>({ profiles: ['vp9-webm', 'opus-webm', 'aac-mp4'] })
    expect(
      m2.videoTracks[0]!.streams.every((s) => s.profile === 'vp9-webm' && s.container === 'webm' && s.codecs === 'vp9'),
    ).toBe(true)
    expect(m2.audioTracks[0]!.streams[0]!.codecs).toBe('opus')
  })

  it('alanlar: imzalı {range} şablonları, CDN sırası, yer imi, altyazı, kaynak seçenekleri', async () => {
    const m = await manifest<StreamsManifest>({ profiles: ['vp9-webm', 'opus-webm'] })
    expect(m.viewableId).toBe('Video:1001')
    expect(m.title).toBe('Deneme Klibi')
    expect(m.isPrefetch).toBe(false)
    expect(m.manifestId).toMatch(/^M/)
    expect(m.playbackContextId).toMatch(/^P/)
    expect(m.durationMs).toBe(6000)
    expect(m.live).toBeNull()
    expect(m.bookmark).toEqual({ positionMs: 42_000 })
    expect(m.alternatives).toEqual(['OWN_CDN', 'YOUTUBE'])
    expect(m.attribution).toEqual({
      license: 'CC BY 3.0',
      text: '© Blender Foundation',
      url: 'https://www.blender.org',
    })
    expect(m.license.type).toBe('ACCESS_GRANT')
    expect(Math.abs(m.expiration - (Date.now() + 12 * 3600 * 1000))).toBeLessThan(5000)
    expect(m.cdns.map((c) => [c.id, c.rank, c.type])).toEqual([
      ['c101-ist001-ix', 1, 'IX'],
      ['c102-ist001-ix', 2, 'IX'],
      ['c201-ank001-isp', 3, 'ISP'],
      ['cloud-ist-origin', 4, 'CLOUD'],
    ])
    const s = m.videoTracks[0]!.streams[1]!
    expect(s.urls.map((u) => u.cdnId)).toEqual(m.cdns.map((c) => c.id))
    for (const u of s.urls)
      expect(u.url).toMatch(new RegExp(`^/oca/${u.cdnId}/range/\\{range\\}\\?o=[0-9a-f]+&v=\\d+&e=\\d+&t=[\\w-]+$`))
    // gerçek yol bilgisi istemciye gitmez
    expect(JSON.stringify(m)).not.toContain(work)
    // şablon, başlatma aralığıyla gerçek baytları verir — her düğümden
    for (const u of s.urls) {
      const r = await app.inject({ method: 'GET', url: rangeUrl(u.url, s.init.start, s.init.end) })
      expect(r.statusCode).toBe(206)
      expect(r.rawPayload.equals(vp9File.subarray(s.init.start, s.init.end + 1))).toBe(true)
    }
    const idx = await app.inject({ method: 'GET', url: rangeUrl(s.urls[0]!.url, s.index.start, s.index.end) })
    expect(idx.rawPayload.readUInt32BE(0)).toBe(0x1c53bb6b) // Cues
    // altyazı: içerikteki Türkçe dosya, TTML olarak
    expect(m.timedTextTracks).toHaveLength(1)
    const t = m.timedTextTracks[0]!
    expect([t.trackId, t.language, t.languageDescription, t.type, t.format]).toEqual([
      'T-tr',
      'tr',
      'Türkçe',
      'SUBTITLES',
      'ttml',
    ])
    const ttml = await app.inject({ method: 'GET', url: t.urls[1]!.url })
    expect(ttml.statusCode).toBe(200)
    expect(ttml.body).toContain(
      '<p begin="10000000t" end="25000000t"><span>Merhaba </span><span tts:fontStyle="italic">dünya</span></p>',
    )
    // ses parçası
    expect(m.audioTracks[0]).toMatchObject({
      trackId: 'A-tr-20',
      language: 'tr',
      languageDescription: 'Türkçe [Özgün]',
      channels: '2.0',
      isNative: true,
    })
  })

  it('MSE yoksa ya da ortak profil yoksa sıradaki kaynağa (YouTube gömmesi) geçer', async () => {
    const noMse = await manifest<EmbedManifest>({ supportsMse: false })
    expect(noMse.kind).toBe('EXTERNAL_EMBED')
    expect(noMse.videoId).toBe('aqz-KE-bpKQ')
    const noAudio = await manifest<EmbedManifest>({ profiles: ['vp9-webm'] })
    expect(noAudio.kind).toBe('EXTERNAL_EMBED')
    const preferYt = await manifest<EmbedManifest>({ preferredSource: 'YOUTUBE' })
    expect(preferYt.kind).toBe('EXTERNAL_EMBED')
  })
})

describe('lisanslı manifest: DASH (önbellekteki MPD)', () => {
  it('ek ses MPD’sinden 5.1 parça, MPD altyazıları + içerik altyazısı tekilleştirilir, Türkçe önce', async () => {
    const m = await manifest<StreamsManifest>({ viewableId: 'Video:1002', profiles: ['h264-mp4', 'aac-mp4'] })
    expect(m.kind).toBe('STREAMS')
    expect(m.durationMs).toBe(888_053)
    expect(m.videoTracks[0]!.streams.map((s) => s.height)).toEqual([182, 364, 546, 818])
    expect(m.videoTracks[0]!.streams[3]!.codecs).toBe('avc1.640028')
    expect(m.audioTracks.map((a) => [a.trackId, a.channels, a.languageDescription])).toEqual([
      ['A-en-20', '2.0', 'İngilizce [Özgün]'],
      ['A-en-51', '5.1', 'İngilizce [Özgün]'],
    ])
    expect(m.audioTracks[0]!.streams).toHaveLength(1) // ek MPD'nin 2.0 sürümü eklenmedi
    expect(m.timedTextTracks.map((t) => [t.trackId, t.languageDescription])).toEqual([
      ['T-tr', 'Türkçe (içerik)'],
      ['T-de', 'Almanca'],
      ['T-en', 'İngilizce'],
    ])
    const v = m.videoTracks[0]!.streams[0]!
    expect(v.init).toEqual({ start: 0, end: 799 })
    expect(v.index).toEqual({ start: 800, end: 3500 })
    expect(v.sizeBytes).toBe(5_000_000 + 417975)
  })

  it('ses profili parça başına seçilir: VP9 + Opus stereo + yalnız AAC olan 5.1', async () => {
    const m = await manifest<StreamsManifest>({
      viewableId: 'Video:1002',
      profiles: ['vp9-webm', 'opus-webm', 'aac-mp4'],
    })
    expect(m.videoTracks[0]!.streams.every((s) => s.profile === 'vp9-webm')).toBe(true)
    expect(m.audioTracks.map((a) => [a.trackId, a.isNative, [...new Set(a.streams.map((s) => s.profile))]])).toEqual([
      ['A-en-20', true, ['opus-webm']],
      ['A-en-51', true, ['aac-mp4']],
    ])
    expect(m.audioTracks[1]!.streams[0]).toMatchObject({ mimeType: 'audio/mp4', container: 'mp4', codecs: 'mp4a.40.2' })
    // yalnız Opus bilen istemci: 5.1 (yalnız AAC) düşer, stereo kalır
    const opusOnly = await manifest<StreamsManifest>({ viewableId: 'Video:1002', profiles: ['vp9-webm', 'opus-webm'] })
    expect(opusOnly.audioTracks.map((a) => a.trackId)).toEqual(['A-en-20'])
    expect(opusOnly.audioTracks[0]!.streams.map((s) => s.profile)).toEqual(['opus-webm'])
    // AAC'yi önce sayan istemci: stereo da AAC olur
    const aacFirst = await manifest<StreamsManifest>({
      viewableId: 'Video:1002',
      profiles: ['vp9-webm', 'aac-mp4', 'opus-webm'],
    })
    expect(aacFirst.audioTracks.map((a) => a.streams[0]!.profile)).toEqual(['aac-mp4', 'aac-mp4'])
  })

  it('promo: true → en çok 480p, tanıtım ofseti konum olarak', async () => {
    const m = await manifest<StreamsManifest>({
      viewableId: 'Video:1002',
      promo: true,
      prefetch: true,
      profiles: ['vp9-webm', 'opus-webm'],
    })
    expect(m.videoTracks[0]!.streams.map((s) => s.height)).toEqual([182, 364])
    expect(m.bookmark).toEqual({ positionMs: 95_000 })
    expect(m.isPrefetch).toBe(true)
  })

  it('MPD önbellekte yok ve çevrimdışı → SOURCE_UNAVAILABLE', async () => {
    const m = await manifest<ManifestError>({ viewableId: 'Video:1006' })
    expect(m.error.code).toBe('SOURCE_UNAVAILABLE')
  })

  it('cachedStreamInfo eş zamanlı yanıt verir', () => {
    const info = app.services.playback.cachedStreamInfo(1002)
    expect(info).toEqual({
      maxHeight: 818,
      has51: true,
      textLanguages: ['tr', 'en', 'de'],
      audioLanguages: ['en'],
      durationSec: 888.053,
    })
    expect(app.services.playback.cachedStreamInfo(1001)?.maxHeight).toBe(144)
    expect(app.services.playback.cachedStreamInfo(1006)).toBeNull()
    expect(app.services.playback.cachedStreamInfo(999)).toBeNull()
  })
})

describe('lisanslı manifest: diğer türler', () => {
  it('PROGRESSIVE: imzalı /file adresleri', async () => {
    const m = await manifest<ProgressiveManifest>({ viewableId: 'Video:1003' })
    expect(m.kind).toBe('PROGRESSIVE')
    expect(m.mimeType).toBe('video/mp4')
    expect(m.sizeBytes).toBe(123456789)
    expect(m.urls[0]!.url).toMatch(/^\/oca\/c101-ist001-ix\/file\?o=[0-9a-f]+&v=\d+&e=\d+&t=[\w-]+$/)
    expect(JSON.stringify(m)).not.toContain('archive.invalid')
  })

  it('YouTube gömmesi', async () => {
    const m = await manifest<EmbedManifest>({ viewableId: 'Video:1004' })
    expect(m).toMatchObject({
      kind: 'EXTERNAL_EMBED',
      provider: 'YOUTUBE',
      videoId: 'aqz-KE-bpKQ',
      liveChannelId: null,
      startSec: 12,
      durationMs: null,
    })
    expect(m.alternatives).toEqual(['YOUTUBE'])
  })

  it('Channel: YOUTUBE_LIVE → canlı gömme', async () => {
    const m = await manifest<EmbedManifest>({ viewableId: 'Channel:1' })
    expect(m.kind).toBe('EXTERNAL_EMBED')
    expect(m.liveChannelId).toBe('UC' + 'a'.repeat(22))
    expect(m.live?.seekable).toBe(false)
    expect(m.bookmark).toBeNull()
  })

  it('Channel: LINEAR → yayındaki videonun akışları + katılma konumu', async () => {
    const m = await manifest<StreamsManifest>({ viewableId: 'Channel:2' })
    expect(m.kind).toBe('STREAMS')
    expect(m.title).toBe('Kanal 2 · Gece Filmi')
    expect(m.live).toMatchObject({ joinOffsetMs: 125_500, seekable: true })
    expect(m.live?.endAt).not.toBeNull()
    expect(m.bookmark).toBeNull()
  })

  it('Airing → yayının videosu baştan, canlı değil', async () => {
    const m = await manifest<StreamsManifest>({ viewableId: 'Airing:A1' })
    expect(m.kind).toBe('STREAMS')
    expect(m.title).toBe('Gece Filmi')
    expect(m.live).toBeNull()
    expect(m.bookmark).toBeNull()
  })

  it('ACCESS_DENIED yetki ayrıntısını taşır; NOT_FOUND / BAD_REQUEST', async () => {
    const m = await manifest<ManifestError>({ viewableId: 'Video:1005' })
    expect(m.error).toEqual({
      code: 'ACCESS_DENIED',
      message: 'Bu film Sinema paketinde.',
      access: { state: 'UPSELL', reasonText: 'Bu film Sinema paketinde.', requiredProduct: 'sinema' },
    })
    expect((await manifest<ManifestError>({ viewableId: 'Video:777' })).error.code).toBe('NOT_FOUND')
    expect((await manifest<ManifestError>({ viewableId: 'Channel:99' })).error.code).toBe('NOT_FOUND')
    expect((await manifest<ManifestError>({ viewableId: 'Bilinmeyen' })).error.code).toBe('BAD_REQUEST')
  })
})

describe('ön hazırlık, sayaçlar ve CDN sıralaması', () => {
  it('reqName=prefetch/licensedManifest → isPrefetch, yer imi yok, ayrı sayaç', async () => {
    const before = app.services.playback.stats()
    const m = await manifest<StreamsManifest>({}, 'prefetch/licensedManifest')
    expect(m.isPrefetch).toBe(true)
    expect(m.bookmark).toBeNull()
    const mid = app.services.playback.stats()
    expect(mid.prefetchIssued).toBe(before.prefetchIssued + 1)
    expect(mid.manifestsIssued).toBe(before.manifestsIssued)
    expect(mid.activeSessions).toBe(before.activeSessions)
    await manifest({})
    const after = app.services.playback.stats()
    expect(after.manifestsIssued).toBe(before.manifestsIssued + 1)
    expect(after.activeSessions).toBe(before.activeSessions + 1)
  })

  it('cdnHints sırası uygulanır; kapalı düğüm listeden çıkar', async () => {
    await app.inject({ method: 'POST', url: '/api/debug/oca/c102-ist001-ix', payload: { down: true } })
    const m = await manifest<StreamsManifest>({
      cdnHints: ['cloud-ist-origin', 'c201-ank001-isp', 'bilinmeyen', 'anycast'],
    })
    expect(m.cdns.map((c) => c.id)).toEqual(['cloud-ist-origin', 'c201-ank001-isp', 'c101-ist001-ix'])
    expect(m.cdns.map((c) => c.rank)).toEqual([1, 2, 3])
    expect(m.videoTracks[0]!.streams[0]!.urls.map((u) => u.cdnId)).toEqual([
      'cloud-ist-origin',
      'c201-ank001-isp',
      'c101-ist001-ix',
    ])
  })

  it('ipucu yoksa cihazın son FTL sıralaması kullanılır', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/ftl/report',
      payload: {
        iter: 0,
        pulse: 0,
        results: [
          { name: 'oc.ix.proxy', cdnId: 'c201-ank001-isp', ok: true, ttfbMs: 5, totalMs: 8, bytes: 5120, kbps: 5000 },
          { name: 'cloud', cdnId: 'cloud-ist-origin', ok: true, ttfbMs: 9, totalMs: 12, bytes: 5120, kbps: 3000 },
        ],
      },
    })
    const m = await manifest<StreamsManifest>({})
    expect(m.cdns.map((c) => c.id)).toEqual(['c201-ank001-isp', 'cloud-ist-origin', 'c101-ist001-ix', 'c102-ist001-ix'])
  })

  it('tüm düğümler kapalıysa SOURCE_UNAVAILABLE (YouTube seçeneği yine sunulur)', async () => {
    for (const id of ['c101-ist001-ix', 'c102-ist001-ix', 'c201-ank001-isp', 'cloud-ist-origin']) {
      await app.inject({ method: 'POST', url: `/api/debug/oca/${id}`, payload: { down: true } })
    }
    expect((await manifest<ManifestError>({ viewableId: 'Video:1002' })).error.code).toBe('SOURCE_UNAVAILABLE')
    expect((await manifest<EmbedManifest>({ viewableId: 'Video:1001' })).kind).toBe('EXTERNAL_EMBED')
  })
})
