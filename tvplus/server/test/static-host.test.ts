/**
 * Durağan barındırma kipi (`config.staticHost`, GitHub Pages): görsel adresleri önceden üretilmiş dosyaları gösterir,
 * manifest OCA vekili yerine doğrudan açık kaynak adreslerini verir. Bayrak kapalıyken davranış değişmez.
 */
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type {
  LicensedManifest,
  ManifestRequest,
  MslEnvelope,
  ProgressiveManifest,
  StreamsManifest,
} from '../../shared/playback'
import { loadConfig } from '../src/kernel/config'
import {
  buildArtwork,
  setStaticArtworkAlias,
  staticArtworkPath,
  staticEntitySlug,
  staticSize,
} from '../src/kernel/imageUrls'
import { createStaticAlias } from '../src/services/image/staticAssets'
import { STATIC_ORIGIN_CDN } from '../src/services/playback/manifest'
import { parseMpd } from '../src/services/playback/sources/dash'
import { createTestApp } from './helpers'
import { openResponse, provisionClient, sealRequest, type MslClient } from './msl-client'
import { fakePassport, installFakes, playable, usePassport } from './playback-fakes'

describe('durağan görsel adresleri', () => {
  const base = loadConfig({ dataDir: mkdtempSync(join(tmpdir(), 'tvplus-durgan-')), secret: 's' })

  it('bayrak kapalıyken imzalı /img/v1 adresi aynen kalır', () => {
    const a = buildArtwork({ ...base, staticHost: false }, 'BOXART', 'Video:80010001', { width: 368 })
    expect(a.url).toMatch(/^\/img\/v1\/boxart\/368x552\/Video%3A80010001\.webp\?r=/)
  })

  it('bayrak açıkken göreli düz dosya yolu; genişlik merdivene, biçim webp', () => {
    const cfg = { ...base, staticHost: true }
    const a = buildArtwork(cfg, 'STORY_ART', 'Video:80010001', { width: 600, format: 'jpg' })
    expect(a.url).toBe('img/story_art/640x360/Video_3a80010001.webp')
    expect(a.width).toBe(640)
    expect(staticSize('BOXART', 2000).width).toBe(736)
    expect(staticSize('CHANNEL_LOGO', 96).width).toBe(128)
    expect(staticEntitySlug('Program:27:Dünya Turu')).toBe('Program_3a27_3aD_c3_bcnya_20Turu')
    expect(staticArtworkPath('AVATAR', 'Avatar:yuz-01', 160, 160)).toBe('img/avatar/160x160/Avatar_3ayuz-01.webp')
  })

  it('sayılamayan varlıklar eşlenir (profil → avatar, yayın → video ya da program)', () => {
    const cfg = { ...base, staticHost: true }
    const alias = createStaticAlias({
      profileAvatar: (guid) => (guid === 'P1' ? 'yuz-03' : null),
      airing: (id) =>
        id === '1-20261113-2000'
          ? { channelId: 1, title: 'Sintel', videoId: 80010001 }
          : id === '27-20261113-0900'
            ? { channelId: 27, title: 'Dünya Turu', videoId: null }
            : null,
      hasVideo: (v) => v === 80010001,
    })
    setStaticArtworkAlias(cfg, alias)
    expect(buildArtwork(cfg, 'AVATAR', 'Profile:P1').url).toBe('img/avatar/160x160/Avatar_3ayuz-03.webp')
    expect(buildArtwork(cfg, 'STORY_ART', 'Airing:1-20261113-2000').url).toContain('/Video_3a80010001.webp')
    expect(buildArtwork(cfg, 'STORY_ART', 'Airing:27-20261113-0900').url).toContain('/Program_3a27_3aD_c3_bcnya_20Turu')
    expect(buildArtwork(cfg, 'STORY_ART', 'Airing:bilinmiyor').url).toContain('/Airing_3abilinmiyor.webp')
  })
})

const MPD_URL = 'https://ornek-koken.invalid/sintel/dash.mpd'
const rep = (id: string, mime: string, codecs: string, bw: number, file: string, extra = '') =>
  `<Representation id="${id}" bandwidth="${bw}" codecs="${codecs}" mimeType="${mime}" ${extra}><BaseURL>${file}</BaseURL>` +
  `<SegmentBase indexRange="800-3500"><Initialization range="0-799"/></SegmentBase></Representation>`
const MPD = `<?xml version="1.0"?>
<MPD xmlns="urn:mpeg:dash:schema:mpd:2011" type="static" mediaPresentationDuration="PT888S"><Period id="0">
  <AdaptationSet contentType="text" lang="en"><Representation id="t1" bandwidth="256" mimeType="text/vtt"><BaseURL>s-eng.webvtt</BaseURL></Representation></AdaptationSet>
  <AdaptationSet contentType="video">${rep('h1', 'video/mp4', 'avc1.4d401f', 417975, 'v-240.mp4', 'width="426" height="182"')}</AdaptationSet>
  <AdaptationSet contentType="audio" lang="en">${rep('a1', 'audio/mp4', 'mp4a.40.2', 132445, 'a-eng.mp4')}</AdaptationSet>
</Period></MPD>`

describe('durağan kip manifesti (OCA yok, doğrudan kaynak)', () => {
  let app: FastifyInstance
  let client: MslClient
  let work: string

  async function manifest<T = LicensedManifest>(req: Partial<ManifestRequest>): Promise<T> {
    const body: ManifestRequest = {
      viewableId: 'Video:2001',
      prefetch: false,
      profiles: ['h264-mp4', 'aac-mp4'],
      supportsMse: true,
      uiLanguage: 'tr',
      ...req,
    }
    const res = await app.inject({
      method: 'POST',
      url: '/msl/v1/playapi/licensedManifest?reqName=licensedManifest',
      payload: await sealRequest(client, body),
    })
    expect(res.statusCode).toBe(200)
    return (await openResponse<T>(client, res.json() as MslEnvelope)).payload
  }

  beforeAll(async () => {
    work = mkdtempSync(join(tmpdir(), 'tvplus-durgan-oynatma-'))
    const subtitlesDir = join(work, 'altyazi')
    mkdirSync(subtitlesDir)
    writeFileSync(join(subtitlesDir, 'klip.tr.vtt'), 'WEBVTT\n\n00:01.000 --> 00:02.500\nMerhaba\n')
    app = await createTestApp({ staticHost: true })
    // MPD'yi ağa çıkmadan önbelleğe koy
    const parsed = parseMpd(MPD, MPD_URL)
    const sized = (r: (typeof parsed.video)[number]) => ({ ...r, size: 1_000_000 + r.bandwidth })
    const dir = join(app.config.dataDir, 'mpd-cache')
    mkdirSync(dir, { recursive: true })
    writeFileSync(
      join(dir, `${createHash('sha1').update(MPD_URL).digest('hex')}.json`),
      JSON.stringify({
        version: 1,
        fetchedAt: Date.now(),
        ...parsed,
        video: parsed.video.map(sized),
        audio: parsed.audio.map(sized),
      }),
    )
    const fakes = installFakes(app, subtitlesDir)
    usePassport(app, fakePassport())
    client = await provisionClient(app, 'TVPWCH-MC-DURGAN')
    fakes.playables.set(
      2001,
      playable({
        videoId: 2001,
        sources: [
          { type: 'PACKAGED', id: 'yerel', timedText: [] },
          {
            type: 'DASH',
            manifest: MPD_URL,
            timedText: [{ lang: 'tr', label: 'Türkçe', format: 'vtt', file: 'klip.tr.vtt', kind: 'SUBTITLES' }],
          },
        ],
      }),
    )
    fakes.playables.set(
      2002,
      playable({
        videoId: 2002,
        sources: [
          { type: 'PROGRESSIVE', url: 'https://archive.invalid/film.mp4', mimeType: 'video/mp4', timedText: [] },
        ],
      }),
    )
  })
  afterAll(async () => {
    await app.close()
    rmSync(work, { recursive: true, force: true })
  })

  it('DASH: paket atlanır; akış adresleri doğrudan kaynak (yer tutucusuz), tek sözde CDN', async () => {
    const m = await manifest<StreamsManifest>({})
    expect(m.kind).toBe('STREAMS')
    expect(m.cdns).toEqual([STATIC_ORIGIN_CDN])
    const urls = m.videoTracks[0]!.streams.flatMap((s) => s.urls)
    expect(urls).toEqual([{ cdnId: STATIC_ORIGIN_CDN.id, url: 'https://ornek-koken.invalid/sintel/v-240.mp4' }])
    expect(JSON.stringify(m)).not.toContain('/oca/')
    const texts = Object.fromEntries(m.timedTextTracks.map((t) => [t.language, t.urls[0]!.url]))
    expect(texts.tr).toBe('subtitles/klip.tr.vtt')
    expect(texts.en).toBe('https://ornek-koken.invalid/sintel/s-eng.webvtt')
  })

  it('PROGRESSIVE: <video src> için kaynağın kendi adresi', async () => {
    const m = await manifest<ProgressiveManifest>({ viewableId: 'Video:2002' })
    expect(m.kind).toBe('PROGRESSIVE')
    expect(m.urls).toEqual([{ cdnId: STATIC_ORIGIN_CDN.id, url: 'https://archive.invalid/film.mp4' }])
  })

  it('görsel eklentisi /img/v1 ucunu kurmaz', async () => {
    const res = await app.inject({ method: 'GET', url: '/img/v1/boxart/368x552/Video%3A1.webp?r=x' })
    expect(res.statusCode).toBe(404)
  })
})
