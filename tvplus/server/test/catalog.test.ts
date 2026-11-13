import { cpSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { norm, stableId } from '../../shared/text'
import { createCatalog } from '../src/services/catalog/catalog'
import { loadContent, type ContentLogLevel } from '../src/services/catalog/load'
import { createAlanApp, FIXTURE_CONTENT_DIR, ID, KID, TEEN } from './fixtures/alan'

const tmp = () => mkdtempSync(join(tmpdir(), 'tvplus-alan-'))
const collectLog = () => {
  const lines: { level: ContentLogLevel; message: string }[] = []
  return { lines, log: (level: ContentLogLevel, message: string) => void lines.push({ level, message }) }
}

describe('içerik yükleme hoşgörüsü', () => {
  it('klasör yoksa boş katalog açılır', () => {
    const { lines, log } = collectLog()
    const bundle = loadContent(join(tmp(), 'yok'), log)
    const cat = createCatalog(bundle, { contentDir: 'x', log, services: () => ({}) })
    expect(cat.allTitles()).toEqual([])
    expect(cat.listChannels()).toEqual([])
    expect(cat.stats()).toEqual({ titles: 0, playables: 0, channels: 0, bySourceKind: {} })
    expect(lines.some((l) => l.level === 'warn')).toBe(true)
  })

  it('bozuk JSON dosyası atlanır, hata günlüğe yazılır, diğerleri yüklenir', () => {
    const dir = tmp()
    cpSync(FIXTURE_CONTENT_DIR, dir, { recursive: true })
    writeFileSync(join(dir, 'titles', 'bozuk.json'), '[{ "videoId": 1, ')
    writeFileSync(join(dir, 'collections.json'), '{"değil": "dizi"}')
    const { lines, log } = collectLog()
    const bundle = loadContent(dir, log)
    expect(bundle.titles.length).toBe(9)
    expect(bundle.collections).toEqual([])
    const errors = lines.filter((l) => l.level === 'error').map((l) => l.message)
    expect(errors.some((m) => m.includes('bozuk.json') && m.includes('okunamadı'))).toBe(true)
    expect(errors.some((m) => m.includes('collections.json') && m.includes('dizi değil'))).toBe(true)
  })

  it('geçersiz kayıt tek başına atlanır; yinelenen videoId düşer', () => {
    const dir = tmp()
    cpSync(FIXTURE_CONTENT_DIR, dir, { recursive: true })
    const good = {
      videoId: 80050001,
      slug: 'deneme',
      type: 'MOVIE',
      title: 'Deneme',
      year: 2020,
      synopsis: 'Yeterince uzun bir özet metni burada yer alıyor.',
      shortSynopsis: 'Kısa özet.',
      genres: ['dram'],
      maturity: { rating: 'GENEL' },
      sources: [{ type: 'YOUTUBE', videoId: 'abcdefghijk' }],
      license: { name: 'x', attribution: 'y' },
    }
    const dup = { ...good, slug: 'kopya', title: 'Kopya Sintel', videoId: ID.sintel }
    const bad = { ...good, videoId: 80050002, genres: ['olmayan-tur'] }
    writeFileSync(join(dir, 'titles', 'zz-ek.json'), JSON.stringify([good, bad, dup]))
    const { lines, log } = collectLog()
    const cat = createCatalog(loadContent(dir, log), { contentDir: dir, log, services: () => ({}) })
    expect(cat.getTitle(80050001)?.title).toBe('Deneme')
    expect(cat.getTitle(80050002)).toBeNull()
    expect(cat.getTitle(ID.sintel)?.title).toBe('Sintel') // ilk gelen kalır
    const errors = lines.filter((l) => l.level === 'error').map((l) => l.message)
    expect(errors.some((m) => m.includes('80050002'))).toBe(true)
    expect(errors.some((m) => m.includes(`Yinelenen videoId ${ID.sintel}`))).toBe(true)
  })
})

describe('katalog servisi', () => {
  let app: FastifyInstance
  beforeAll(async () => {
    app = await createAlanApp()
  })
  afterAll(async () => {
    await app.close()
  })

  it('örnek içeriği dizinler', () => {
    const cat = app.services.catalog
    const s = cat.stats()
    expect(s.titles).toBe(9)
    // 8 film + 4 bölüm + 1 fragman
    expect(s.playables).toBe(13)
    expect(s.channels).toBe(5)
    expect(s.bySourceKind.DASH).toBe(5)
    expect(s.bySourceKind.LINEAR).toBe(1)
    expect(cat.listChannels().map((c) => c.number)).toEqual([1, 2, 3, 4, 5])
  })

  it('oynatılabilir yaprakları çözer (film, bölüm, ek video; dizi değil)', () => {
    const cat = app.services.catalog
    expect(cat.getPlayable(ID.sintel)).toMatchObject({
      kind: 'MOVIE',
      displayTitle: 'Sintel',
      titleId: ID.sintel,
      runtimeSec: 888,
    })
    expect(cat.getPlayable(ID.cam_s1e2)).toMatchObject({
      kind: 'EPISODE',
      displayTitle: 'Caminandes · S1 B2 · Gran Dillama',
      titleId: ID.caminandes,
      kids: true,
    })
    expect(cat.getPlayable(ID.cam_s1e2)?.promo).toBeNull()
    expect(cat.getPlayable(ID.sintelTrailer)).toMatchObject({
      kind: 'SUPPLEMENTAL',
      titleId: ID.sintel,
      displayTitle: 'Sintel · Sintel fragmanı',
    })
    expect(cat.getPlayable(ID.tears)?.requiredProduct).toBe('sinema-paketi')
    expect(cat.getPlayable(ID.caminandes)).toBeNull()
    expect(cat.getPlayable(1)).toBeNull()
    expect(cat.listPlayables(ID.caminandes).map((p) => p.videoId)).toEqual([
      ID.cam_s1e1,
      ID.cam_s1e2,
      ID.cam_s2e1,
      ID.cam_s2e2,
    ])
    expect(cat.listPlayables(ID.sintel).map((p) => p.videoId)).toEqual([ID.sintel, ID.sintelTrailer])
    expect(cat.titleOf(ID.cam_s2e1)?.videoId).toBe(ID.caminandes)
    expect(cat.titleOf(ID.sintelTrailer)?.videoId).toBe(ID.sintel)
  })

  it('kişi dizini: oyuncu + yönetmen + yaratıcı, kararlı kimlik', () => {
    const cat = app.services.catalog
    const ton = cat.people().find((p) => p.name === 'Ton Roosendaal')
    expect(ton?.personId).toBe(stableId(norm('Ton Roosendaal')))
    expect(ton?.videoIds).toEqual([ID.sintel, ID.bbb, ID.tears, ID.cosmos, ID.spring, ID.caminandes])
    expect(cat.getPerson(stableId(norm('F. W. Murnau')))?.videoIds).toEqual([ID.nosferatu])
  })

  it('görünürlük: olgunluk seviyesi ve çocuk profili', () => {
    const cat = app.services.catalog
    expect(cat.isVisibleTo(null, ID.nosferatu)).toBe(true)
    expect(cat.isVisibleTo(TEEN, ID.nosferatu)).toBe(false)
    expect(cat.isVisibleTo(TEEN, ID.sintel)).toBe(true)
    expect(cat.isVisibleTo(KID, ID.sintel)).toBe(false)
    expect(cat.isVisibleTo(KID, ID.bbb)).toBe(true)
    expect(cat.isVisibleTo(KID, ID.cam_s1e1)).toBe(true)
    expect(cat.isVisibleTo(KID, 123)).toBe(false)
  })

  it('görsel kaynağı eşlemesi', () => {
    const cat = app.services.catalog
    expect(cat.getArtworkSource(`Video:${ID.sintel}`, 'BOXART')).toMatchObject({
      sourceUrl: 'https://img.example.org/sintel/boxart.jpg',
      title: 'Sintel',
      subtitle: '2010',
      seed: `Video:${ID.sintel}`,
    })
    expect(cat.getArtworkSource(`Video:${ID.sintel}`, 'STORY_ART')?.sourceUrl).toBe(
      'https://img.example.org/sintel/story.jpg',
    )
    expect(cat.getArtworkSource(`Video:${ID.sintel}`, 'BILLBOARD')?.sourceUrl).toBe(
      'https://img.example.org/sintel/story.jpg',
    )
    // boxart yok → storyArt
    expect(cat.getArtworkSource(`Video:${ID.spring}`, 'BOXART')?.sourceUrl).toBe(
      'https://img.example.org/spring/story.jpg',
    )
    // görsel hiç yok → üretilen kapak
    expect(cat.getArtworkSource(`Video:${ID.anadolu}`, 'BOXART')).toMatchObject({
      sourceUrl: null,
      localFile: null,
      title: "Anadolu'nun Sesleri",
    })
    expect(cat.getArtworkSource(`Video:${ID.sintel}`, 'TITLE_LOGO')).toMatchObject({
      sourceUrl: null,
      localFile: null,
      title: 'Sintel',
    })
    // bölüm → üst başlığın görseli
    expect(cat.getArtworkSource(`Video:${ID.cam_s1e2}`, 'EPISODE_STILL')).toMatchObject({
      sourceUrl: 'https://img.example.org/caminandes/story.jpg',
      subtitle: 'S1 B2 · Gran Dillama',
    })
    expect(cat.getArtworkSource('Channel:1', 'CHANNEL_LOGO')).toMatchObject({
      localFile: 'brand/channels/trt-1.png',
      title: 'TRT 1',
    })
    expect(cat.getArtworkSource('Channel:2', 'CHANNEL_LOGO')).toMatchObject({
      localFile: null,
      sourceUrl: null,
      title: 'Haber Kanalı',
    })
    expect(cat.getArtworkSource(`Profile:${KID.guid}`, 'AVATAR')).toMatchObject({
      localFile: 'brand/avatar-1.png',
      title: 'Can',
    })
    expect(cat.getArtworkSource('Collection:9002', 'STORY_ART')).toMatchObject({
      sourceUrl: 'https://img.example.org/nosferatu/story.jpg',
      title: 'Sessiz sinema klasikleri',
    })
    // Yayın: videosu varsa video görseli, yoksa kanal logosu
    expect(cat.getArtworkSource('Airing:1-20261113-2200', 'STORY_ART')).toMatchObject({
      sourceUrl: 'https://img.example.org/nosferatu/story.jpg',
      title: 'Gece Sineması: Nosferatu',
      subtitle: 'TRT 1',
    })
    // Videosuz yayın: logo 16:9'a gerilmez; program adıyla kapak üretilir, tohum program + kanala göre
    const news = cat.getArtworkSource('Airing:1-20261113-1900', 'STORY_ART')!
    expect(news).toMatchObject({ sourceUrl: null, localFile: null, title: 'Ana Haber', subtitle: 'TRT 1' })
    expect(cat.getArtworkSource('Airing:1-20261112-1900', 'STORY_ART')!.seed).toBe(news.seed) // aynı program, başka gün
    expect(cat.getArtworkSource('Airing:2-20261113-1900', 'STORY_ART')!.seed).not.toBe(news.seed) // başka kanal
    expect(cat.getArtworkSource('Airing:1-20261113-0900', 'STORY_ART')!.seed).not.toBe(news.seed) // başka program
    expect(cat.getArtworkSource('Airing:1-20261113-1900', 'BOXART')).toMatchObject({ sourceUrl: null, localFile: null })
    expect(cat.getArtworkSource('Airing:1-20261113-1900', 'CHANNEL_LOGO')).toMatchObject({
      localFile: 'brand/channels/trt-1.png',
    })
    // videolu yayın (görselsiz video) da logo değil, videonun kapağı
    expect(cat.getArtworkSource('Airing:4-20261113-0700', 'STORY_ART')).toMatchObject({
      localFile: null,
      title: 'Çizgi Film Kuşağı',
    })
    expect(cat.getArtworkSource('Video:1', 'BOXART')).toBeNull()
    expect(cat.getArtworkSource('Channel:99', 'CHANNEL_LOGO')).toBeNull()
    expect(cat.getArtworkSource('bozuk', 'BOXART')).toBeNull()
  })

  it('posterFit: başlıktan; kendi görseli olan bölümde kendisinden; koleksiyonda görseli kullanılan videodan', () => {
    const cat = app.services.catalog
    for (const type of ['BOXART', 'STORY_ART', 'BILLBOARD', 'TITLE_LOGO', 'EPISODE_STILL'] as const) {
      expect(cat.getArtworkSource(`Video:${ID.sintel}`, type)?.posterFit).toBe('crop')
    }
    expect(cat.getArtworkSource(`Video:${ID.bbb}`, 'BOXART')?.posterFit).toBe('contain') // varsayılan
    expect(cat.getArtworkSource(`Video:${ID.caminandes}`, 'BOXART')?.posterFit).toBe('crop')
    expect(cat.getArtworkSource(`Video:${ID.cam_s1e1}`, 'BOXART')).toMatchObject({
      posterFit: 'crop',
      sourceUrl: 'https://img.example.org/caminandes/boxart.jpg',
    })
    expect(cat.getArtworkSource(`Video:${ID.cam_s2e1}`, 'BOXART')).toMatchObject({
      posterFit: 'contain',
      sourceUrl: 'https://img.example.org/caminandes/s2e1.jpg',
    })
    expect(cat.getArtworkSource('Collection:9001', 'BOXART')?.posterFit).toBe('crop') // ilk video Sintel
    expect(cat.getArtworkSource('Collection:9002', 'BOXART')?.posterFit).toBe('contain')
  })

  it('koleksiyonlar, ana sayfa düzeni, duyurular', () => {
    const cat = app.services.catalog
    expect(cat.collectionsOf(ID.sintel).map((c) => c.collectionId)).toEqual([9001])
    expect(cat.homeLayout()?.billboard).toEqual([ID.sintel, ID.tears, ID.caminandes])
    expect(cat.interstitials().map((i) => i.id)).toEqual(['canli-tanitim', 'geri-al'])
    expect(cat.subtitlesDir()).toBe(join(FIXTURE_CONTENT_DIR, 'subtitles'))
  })
})
