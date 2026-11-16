/**
 * Afiş seçiminin uçları: çeşit kimliğinin katalogda ve görsel ucunda çözülmesi (imza dahil), durağan kip adresleri,
 * Falcor `videos[id].storyArt|boxart` ve GraphQL `Video.artwork` alanlarının profile göre çeşidi, olay akışından
 * öğrenme, yönetici panelinin afiş bölümü ve içerikteki adayların geçerliliği.
 */
import type { FastifyInstance } from 'fastify'
import { afterEach, describe, expect, it } from 'vitest'
import type { EventBatch } from '../../shared/types'
import { evaluatePaths } from '../src/falcor/engine'
import { resolvers } from '../src/graphql/resolvers/index'
import type { AppConfig } from '../src/kernel/config'
import type { FalcorRouteContext, Passport } from '../src/kernel/context'
import { staticArtworkPath, staticSize, verifyImageSignature } from '../src/kernel/imageUrls'
import { artworkEntityId, canonicalVideoEntity, parseVideoEntity } from '../src/services/artwork/ids'
import { artworkEventsOf } from '../src/services/artwork/plugin'
import { titleArtwork, titleArtworkEntityId } from '../src/services/artwork/present'
import { buildViewerInsight, INSIGHT_LIMITS } from '../src/services/insights/viewer'
import { staticAliasOf } from '../src/services/image/staticAssets'
import { validateContent } from '../../scripts/validate-content'
import { ADULT, fakeIdentity, fakeRequest, gqlContext, KID, passport, TEEN } from './fixtures/alan'
import { createTestApp } from './helpers'

const apps: FastifyInstance[] = []
afterEach(async () => {
  while (apps.length) await apps.pop()!.close()
})

const SINTEL = 80010001
const TEARS = 80010002
const NOW = new Date('2026-11-16T09:00:00.000Z')

async function setup(overrides: Partial<AppConfig> = {}) {
  const app = await createTestApp({ artworkPersonalization: true, artworkEpsilon: 1, ...overrides })
  apps.push(app)
  app.services.identity = fakeIdentity
  return app
}

const falcorCtx = (app: FastifyInstance, pp: Passport): FalcorRouteContext => ({
  req: fakeRequest(),
  passport: pp,
  services: app.services,
  config: app.config,
  flags: { webp: 'true' },
})

async function falcorArt(app: FastifyInstance, pp: Passport, id: number, key: 'storyArt' | 'boxart' | 'billboardArt') {
  const r = await evaluatePaths(falcorCtx(app, pp), [['videos', id, key]])
  const node = (r.jsonGraph as Record<string, Record<string, Record<string, { value: { url: string; key: string } }>>>)
    .videos![String(id)]![key]!
  return node.value
}

type ArtworkResolver = (
  p: { videoId: number },
  a: { type: string; params?: { width?: number } | null },
  ctx: unknown,
) => { url: string; key: string }
const gqlArt = (app: FastifyInstance, pp: Passport, id: number, type: string, width?: number) =>
  ((resolvers.Movie as Record<string, unknown>).artwork as ArtworkResolver)(
    { videoId: id },
    { type, params: width ? { width } : null },
    gqlContext(app, pp),
  )

/** Gerçek içerikte iki profilin farklı çeşit aldığı ilk film (ε = 1: her başlıkta deterministik keşif) */
function titleWhereProfilesDiffer(app: FastifyInstance): number {
  for (const t of app.services.catalog.allTitles()) {
    if (t.type !== 'MOVIE' || t.artwork.alternates.length === 0) continue
    if (app.services.artwork.pick(ADULT.guid, t.videoId).key !== app.services.artwork.pick(TEEN.guid, t.videoId).key)
      return t.videoId
  }
  throw new Error('farklı çeşit alan başlık bulunamadı')
}

describe('afiş çeşidi kimlikleri ve görsel kaynağı', () => {
  it('kimlik ayrıştırma', () => {
    expect(parseVideoEntity('Video:80010001~k2')).toEqual({ videoId: SINTEL, key: 'k2' })
    expect(parseVideoEntity('Video:80010001')).toEqual({ videoId: SINTEL, key: '' })
    expect(parseVideoEntity('Video:80010001~K2')).toBeNull()
    expect(parseVideoEntity('Channel:1')).toBeNull()
    expect(artworkEntityId(SINTEL, '')).toBe('Video:80010001')
  })

  it('katalog: STORY_ART ve (boxart yoksa) BOXART adayın görselinden; bilinmeyen anahtar ve diğer tipler varsayılan', async () => {
    const app = await setup()
    const cat = app.services.catalog
    const t = cat.getTitle(SINTEL)!
    const k2 = t.artwork.alternates.find((a) => a.key === 'k2')!
    expect(cat.getArtworkSource('Video:80010001~k2', 'STORY_ART')).toMatchObject({
      sourceUrl: k2.storyArt,
      seed: 'Video:80010001',
      posterFit: t.artwork.posterFit,
    })
    expect(cat.getArtworkSource('Video:80010001~k2', 'BOXART')!.sourceUrl).toBe(k2.storyArt)
    const def = cat.getArtworkSource('Video:80010001', 'STORY_ART')!
    expect(cat.getArtworkSource('Video:80010001~zz', 'STORY_ART')!.sourceUrl).toBe(def.sourceUrl)
    expect(cat.getArtworkSource('Video:80010001~k2', 'BILLBOARD')!.sourceUrl).toBe(
      cat.getArtworkSource('Video:80010001', 'BILLBOARD')!.sourceUrl,
    )
    const show = cat.allTitles().find((x) => x.type === 'SHOW' && x.artwork.alternates.length > 0)!
    const ep = cat.episodeIds(show.videoId)[0]!
    expect(cat.getArtworkSource(`Video:${ep}~k1`, 'STORY_ART')!.sourceUrl).toBe(
      cat.getArtworkSource(`Video:${ep}`, 'STORY_ART')!.sourceUrl,
    )
    expect(cat.getArtworkSource('Video:abc~k1', 'STORY_ART')).toBeNull()
  })

  it('elle verilmiş boxart varsa BOXART kişiselleşmez', async () => {
    const app = await setup()
    const t = app.services.catalog.getTitle(SINTEL)!
    const withBox = { ...t, artwork: { ...t.artwork, boxart: 'https://i.ytimg.com/vi/x/poster.jpg' } }
    expect(canonicalVideoEntity(() => withBox, 'Video:80010001~k2', 'BOXART')).toBe('Video:80010001')
    expect(canonicalVideoEntity(() => withBox, 'Video:80010001~k2', 'STORY_ART')).toBe('Video:80010001~k2')
    const svcs = { ...app.services, catalog: { ...app.services.catalog, getTitle: () => withBox } }
    const ctx = { config: app.config, services: svcs, passport: passport(ADULT) }
    expect(titleArtworkEntityId(ctx, 'BOXART', SINTEL)).toBe('Video:80010001')
  })
})

describe('afiş çeşidi adresleri', () => {
  it('sunucu kipi: imza çeşidi kapsar, görsel ucu çeşidi verir, kurcalanmış kimlik reddedilir', async () => {
    const app = await setup()
    const ctx = { config: app.config, services: app.services, passport: passport(ADULT) }
    const key = app.services.artwork.pick(ADULT.guid, TEARS).key || 'k1'
    const eid = artworkEntityId(TEARS, key)
    const a = titleArtwork({ ...ctx, services: { ...app.services, artwork: undefined } }, 'STORY_ART', TEARS)
    expect(a.url).toContain(`${encodeURIComponent(`Video:${TEARS}`)}.webp`)
    const v = titleArtwork(ctx, 'STORY_ART', TEARS, { width: 600 })
    const expected = app.services.artwork.pick(ADULT.guid, TEARS).key
    expect(v.key).toBe(`STORY_ART|${artworkEntityId(TEARS, expected)}|608x342`)
    const sig = new URL(v.url, 'http://x').searchParams.get('r')!
    expect(
      verifyImageSignature(
        app.config,
        { type: 'STORY_ART', entityId: artworkEntityId(TEARS, expected), width: 608, height: 342, format: 'webp' },
        sig,
      ),
    ).toBe(true)
    // Görsel ucu: çevrimdışı test uygulamasında kaynak yedek kapakla çizilir ama çeşit kimliği kabul edilir
    const url = `/img/v1/story_art/608x342/${encodeURIComponent(eid)}.webp`
    const signed = titleArtwork(
      {
        ...ctx,
        services: {
          ...app.services,
          artwork: { ...app.services.artwork, pick: () => ({ key, mode: 'PERSONAL', reason: '' }) },
        },
      },
      'STORY_ART',
      TEARS,
      { width: 600 },
    )
    expect(signed.url.startsWith(url)).toBe(true)
    const res = await app.inject({ method: 'GET', url: signed.url })
    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toBe('image/webp')
    const other = key === 'k1' ? 'k2' : 'k1'
    const tampered = signed.url.replace(`~${key}.webp`, `~${other}.webp`)
    expect((await app.inject({ method: 'GET', url: tampered })).statusCode).toBe(403)
  })

  it('durağan kip: çeşit dosya adına geçer; bilinmeyen anahtar ve kişiselleşmeyen tip varsayılan dosyaya eşlenir', async () => {
    const app = await setup({ staticHost: true })
    const alias = staticAliasOf(app)
    expect(alias('Video:80010001~k2', 'STORY_ART')).toBe('Video:80010001~k2')
    expect(alias('Video:80010001~k2', 'BOXART')).toBe('Video:80010001~k2')
    expect(alias('Video:80010001~zz', 'STORY_ART')).toBe('Video:80010001')
    expect(alias('Video:80010001~k2', 'BILLBOARD')).toBe('Video:80010001')
    const pp = passport(ADULT)
    const ctx = { config: app.config, services: app.services, passport: pp }
    const key = app.services.artwork.pick(ADULT.guid, TEARS).key
    const a = titleArtwork(ctx, 'STORY_ART', TEARS, { width: 600 })
    const { width, height } = staticSize('STORY_ART', 600)
    expect(a.url).toBe(staticArtworkPath('STORY_ART', artworkEntityId(TEARS, key), width, height))
    if (key) expect(a.url).toContain('_7e' + key)
    const b = titleArtwork(ctx, 'BOXART', TEARS)
    expect(b.url).toBe(staticArtworkPath('BOXART', artworkEntityId(TEARS, key), 368, 552))
  })
})

describe('Falcor ve GraphQL: profile göre çeşit', () => {
  it('iki profil farklı çeşit alabilir, aynı profil hep aynısını; iki uç aynı adresi verir', async () => {
    const app = await setup()
    const id = titleWhereProfilesDiffer(app)
    const a1 = await falcorArt(app, passport(ADULT), id, 'storyArt')
    const a2 = await falcorArt(app, passport(ADULT), id, 'storyArt')
    const t1 = await falcorArt(app, passport(TEEN), id, 'storyArt')
    expect(a1.url).toBe(a2.url)
    expect(a1.url).not.toBe(t1.url)
    const ka = app.services.artwork.pick(ADULT.guid, id).key
    expect(a1.key).toBe(`STORY_ART|${artworkEntityId(id, ka)}|608x342`)
    const box = await falcorArt(app, passport(ADULT), id, 'boxart')
    expect(box.key).toBe(`BOXART|${artworkEntityId(id, ka)}|368x552`)
    // Billboard kişiselleşmez
    expect((await falcorArt(app, passport(ADULT), id, 'billboardArt')).key).toBe(`BILLBOARD|Video:${id}|1280x720`)
    // GraphQL aynı helper: aynı adres
    expect(gqlArt(app, passport(ADULT), id, 'STORY_ART', 600).url).toBe(a1.url)
    expect(gqlArt(app, passport(TEEN), id, 'STORY_ART', 600).url).toBe(t1.url)
    expect(gqlArt(app, passport(ADULT), id, 'TITLE_LOGO').key).toBe(`TITLE_LOGO|Video:${id}|400x160`)
  })

  it('profilsiz ve çocuk profili varsayılanı alır; bayrak kapalıyken herkes varsayılan', async () => {
    const app = await setup()
    const anon = await falcorArt(app, passport(null, null), SINTEL, 'storyArt')
    expect(anon.key).toBe(`STORY_ART|Video:${SINTEL}|608x342`)
    expect(gqlArt(app, passport(KID), SINTEL, 'STORY_ART', 600).key).toBe(`STORY_ART|Video:${SINTEL}|608x342`)
    const off = await setup({ artworkPersonalization: false })
    for (const pp of [passport(ADULT), passport(TEEN)])
      expect((await falcorArt(off, pp, TEARS, 'storyArt')).key).toBe(`STORY_ART|Video:${TEARS}|608x342`)
  })
})

describe('olay akışından öğrenme', () => {
  it('olaylar ayrıştırılır: videoId, viewableId, entityIds (çeşit kimliği dahil), artworkKey', () => {
    const batch: EventBatch = {
      sessionId: 's',
      sentAt: 0,
      events: [
        {
          name: 'impression',
          ts: 1,
          seq: 1,
          data: { entityIds: ['Video:80010001~k2', 'Video:80010002', 'Channel:1'] },
        },
        { name: 'click', ts: 2, seq: 2, data: { videoId: SINTEL, artworkKey: 'k3' } },
        { name: 'click', ts: 3, seq: 3, data: { viewableId: 'Video:80010002~k1' } },
        { name: 'playback.start', ts: 4, seq: 4, data: { videoId: SINTEL } },
      ],
    }
    expect(artworkEventsOf(batch)).toEqual([
      { videoId: SINTEL, event: 'impression', key: 'k2' },
      { videoId: TEARS, event: 'impression', key: null },
      { videoId: SINTEL, event: 'click', key: 'k3' },
      { videoId: TEARS, event: 'click', key: 'k1' },
    ])
  })

  it('olay servisine gelen gösterim/tıklama sayaçlara yazılır (profilsiz paket sayılmaz)', async () => {
    const app = await setup({ artworkEpsilon: 0 })
    const batch: EventBatch = {
      sessionId: 's',
      sentAt: Date.now(),
      events: [
        { name: 'impression', ts: Date.now(), seq: 1, data: { entityIds: [`Video:${SINTEL}~k2`] } },
        { name: 'click', ts: Date.now(), seq: 2, data: { videoId: SINTEL, artworkKey: 'k2' } },
      ],
    }
    app.services.events.ingest(batch, null)
    expect(app.services.artwork.summary(ADULT.guid)).toEqual({ segment: 'all', impressions: 0, clicks: 0 })
    app.services.events.ingest(batch, ADULT.guid)
    expect(app.services.artwork.summary(ADULT.guid)).toEqual({ segment: 'all', impressions: 1, clicks: 1 })
    const k2 = app.services.artwork.explain(ADULT.guid, SINTEL)!.candidates.find((c) => c.key === 'k2')!
    expect(k2).toMatchObject({ impressions: 1, clicks: 1 })
  })
})

describe('yönetici paneli: afiş bölümü', () => {
  it('ana sayfadaki adayı olan en çok 6 başlık, 480 px önizleme, tek seçilen ve not', async () => {
    const app = await setup()
    const adult = app.services.identity.getProfile(ADULT.guid)!
    const ins = buildViewerInsight(app.services, adult, NOW, app.config)
    expect(ins.artwork).toBeDefined()
    const art = ins.artwork!
    expect(art.enabled).toBe(true)
    expect(art.titles.length).toBeGreaterThan(0)
    expect(art.titles.length).toBeLessThanOrEqual(INSIGHT_LIMITS.artworkTitles)
    expect(new Set(art.titles.map((t) => t.titleId)).size).toBe(art.titles.length)
    for (const t of art.titles) {
      expect(t.candidates.length).toBeGreaterThanOrEqual(2)
      expect(t.candidates.filter((c) => c.chosen)).toHaveLength(1)
      expect(t.candidates[0]!.key).toBe('')
      expect(t.mode).toBe('EXPLORE')
      for (const c of t.candidates)
        expect(c.url).toMatch(/^\/img\/v1\/story_art\/480x270\/Video%3A\d+(~[a-z0-9]+)?\.webp\?r=/)
    }
    expect(art.note).toBe('Henüz gösterim yok: seçimler görsel üsluba dayanıyor.')
  })

  it('servis kapalıyken alan gelmez', async () => {
    const app = await setup({ artworkPersonalization: false })
    const ins = buildViewerInsight(app.services, app.services.identity.getProfile(ADULT.guid)!, NOW, app.config)
    expect(ins.artwork).toBeUndefined()
  })
})

describe('içerik', () => {
  it('adaylı içerik doğrulamadan geçer; adaylar tekil anahtarlı ve görüntü özellikli', async () => {
    const app = await setup()
    const report = validateContent(app.config.contentDir)
    expect(report.errors).toEqual([])
    const withAlt = app.services.catalog.allTitles().filter((t) => t.artwork.alternates.length > 0)
    expect(withAlt.length).toBeGreaterThan(40)
    for (const t of withAlt) {
      const keys = t.artwork.alternates.map((a) => a.key)
      expect(new Set(keys).size).toBe(keys.length)
      for (const a of t.artwork.alternates) {
        expect(new URL(a.storyArt).hostname).toBe('i.ytimg.com')
        expect(a.visual).not.toBeNull()
        expect(a.storyArt).not.toBe(t.artwork.storyArt)
      }
    }
  })
})
