import { existsSync, mkdtempSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import sharp from 'sharp'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ARTWORK_SPECS, buildArtwork, type ArtworkTypeName } from '../src/kernel/imageUrls'
import type { ArtworkSource, CatalogService } from '../src/kernel/services'
import { parseImagePath } from '../src/services/image/plugin'
import { coverWindow, letterboxBounds, parseFocal } from '../src/services/image/render'
import { imageFetcher } from '../src/services/image/source'
import { initialsOf } from '../src/services/image/generated'
import { createTestApp } from './helpers'

const gen = (title: string, seed: string, extra: Partial<ArtworkSource> = {}): ArtworkSource => ({
  sourceUrl: null,
  localFile: null,
  title,
  subtitle: null,
  seed,
  focal: '50% 35%',
  ...extra,
})

const sources: Record<string, ArtworkSource> = {
  'Video:1': gen('Gökyüzünün Işığı', 'Video:1', { subtitle: '2024 · Dram' }),
  'Video:2': gen('Başka Bir Başlık', 'Video:2'),
  'Video:3': gen('Uzak Kaynak', 'Video:3', { sourceUrl: 'https://i.ytimg.com/vi/aqz-KE-bpKQ/maxresdefault.jpg' }),
  'Channel:1': gen('TRT Haber', 'Channel:1', { localFile: 'brand/channels/trt-haber.png' }),
  'Channel:2': gen('Kanal D', 'Channel:2'),
  'Profile:a': gen('Ayşe', 'Profile:a', { localFile: 'brand/avatar-1.png' }),
  'Profile:b': gen('ılgın', 'Profile:b'),
}

let app: FastifyInstance | null = null
async function makeApp(overrides: Parameters<typeof createTestApp>[0] = {}) {
  app = await createTestApp(overrides)
  const getArtworkSource = vi.fn((id: string) => sources[id] ?? null)
  app.services.catalog = { getArtworkSource } as unknown as CatalogService
  return { app, getArtworkSource }
}
afterEach(async () => {
  vi.restoreAllMocks()
  await app?.close()
  app = null
})

const get = (a: FastifyInstance, url: string, headers: Record<string, string> = {}) => a.inject({ method: 'GET', url, headers })

describe('görsel API: doğrulama', () => {
  it('yol ayrıştırma', () => {
    expect(parseImagePath({ type: 'boxart', size: '368x552', file: 'Video%3A1.webp' })).toEqual({
      type: 'BOXART',
      entityId: 'Video:1',
      width: 368,
      height: 552,
      format: 'webp',
    })
    expect(parseImagePath({ type: 'BOXART', size: '368x552', file: 'Video:1.webp' })).toBeNull()
    expect(parseImagePath({ type: 'poster', size: '368x552', file: 'Video:1.webp' })).toBeNull()
    expect(parseImagePath({ type: 'boxart', size: '368', file: 'Video:1.webp' })).toBeNull()
    expect(parseImagePath({ type: 'boxart', size: '368x552', file: 'Video:1.png' })).toBeNull()
  })

  it('imzasız / yanlış imzalı istek 403, biçimi bozuk istek 400', async () => {
    const { app } = await makeApp()
    const a = buildArtwork(app.config, 'BOXART', 'Video:1')
    const bare = a.url.split('?')[0] ?? ''
    const r1 = await get(app, bare)
    expect(r1.statusCode).toBe(403)
    expect(r1.json().error.code).toBe('IMAGE_SIGNATURE_INVALID')
    expect(r1.json().error.message).toBeTypeOf('string')
    const r2 = await get(app, `${bare}?r=AAAAAAAA`)
    expect(r2.statusCode).toBe(403)
    // Başka varlığın imzası bu varlıkta geçmez
    const other = buildArtwork(app.config, 'BOXART', 'Video:2')
    const r3 = await get(app, `${bare}?${other.url.split('?')[1]}`)
    expect(r3.statusCode).toBe(403)
    const r4 = await get(app, '/img/v1/poster/368x552/Video%3A1.webp?r=x')
    expect(r4.statusCode).toBe(400)
  })

  it('imzası geçerli ama normalleştirilmemiş boyut 400', async () => {
    const { app } = await makeApp()
    // İmzayı üretmek için kernel'in imzalayıcısını kullan: normalleştirilmemiş boyutla aynı biçimi elle kur
    const { createHmac } = await import('node:crypto')
    const { deriveKey } = await import('../src/kernel/config')
    const r = createHmac('sha256', deriveKey(app.config, 'image-url')).update('BOXART|300x450|Video:1|webp').digest().subarray(0, 6).toString('base64url')
    const res = await get(app, `/img/v1/boxart/300x450/${encodeURIComponent('Video:1')}.webp?r=${r}`)
    expect(res.statusCode).toBe(400)
    expect(res.json().error.code).toBe('IMAGE_SIZE_INVALID')
  })

  it('katalogda olmayan varlık 404', async () => {
    const { app } = await makeApp()
    const res = await get(app, buildArtwork(app.config, 'BOXART', 'Video:999').url)
    expect(res.statusCode).toBe(404)
    expect(res.json().error.code).toBe('IMAGE_NOT_FOUND')
  })
})

describe('görsel API: çizim', () => {
  const types = Object.keys(ARTWORK_SPECS) as ArtworkTypeName[]
  const entityFor = (t: ArtworkTypeName) => (t === 'CHANNEL_LOGO' ? 'Channel:2' : t === 'AVATAR' ? 'Profile:b' : 'Video:1')

  for (const type of types)
    for (const format of ['webp', 'jpg'] as const)
      it(`${type} ${format} istenen boyut ve biçimde üretilir`, async () => {
        const { app } = await makeApp()
        const a = buildArtwork(app.config, type, entityFor(type), { format })
        const res = await get(app, a.url)
        expect(res.statusCode).toBe(200)
        expect(res.headers['content-type']).toBe(format === 'jpg' ? 'image/jpeg' : 'image/webp')
        expect(res.headers['cache-control']).toBe('public, max-age=31536000, immutable')
        expect(res.headers.etag).toMatch(/^".+"$/)
        const meta = await sharp(res.rawPayload).metadata()
        expect(meta.format).toBe(format === 'jpg' ? 'jpeg' : 'webp')
        expect(meta.width).toBe(a.width)
        expect(meta.height).toBe(a.height)
      })

  it('büyük boyut da istenen ölçüde', async () => {
    const { app } = await makeApp()
    const a = buildArtwork(app.config, 'BILLBOARD', 'Video:1', { width: 1920 })
    const meta = await sharp((await get(app, a.url)).rawPayload).metadata()
    expect([meta.width, meta.height]).toEqual([1920, 1080])
  })

  it('üretilen kapak tohum için belirlenimci, tohumlar arasında farklı', async () => {
    const { app } = await makeApp()
    const raw = async (id: string) => {
      const res = await get(app, buildArtwork(app.config, 'BOXART', id, { format: 'jpg' }).url)
      return sharp(res.rawPayload).raw().toBuffer()
    }
    const a1 = await raw('Video:1')
    const b = await raw('Video:2')
    await app.close()
    // Yeni uygulama, yeni veri klasörü: önbellek yok, yeniden çizilir
    const second = await makeApp()
    const res = await get(second.app, buildArtwork(second.app.config, 'BOXART', 'Video:1', { format: 'jpg' }).url)
    expect(res.headers['x-tvplus-img']).toContain('cache=miss')
    const a2 = await sharp(res.rawPayload).raw().toBuffer()
    expect(a2.equals(a1)).toBe(true)
    // Farklı tohum: ortalama piksel farkı belirgin
    let diff = 0
    for (let i = 0; i < a1.length; i++) diff += Math.abs((a1[i] ?? 0) - (b[i] ?? 0))
    expect(diff / a1.length).toBeGreaterThan(5)
  })

  it('üretilen kapak gri yer tutucu değil: renkli ve koyu', async () => {
    const { app } = await makeApp()
    const res = await get(app, buildArtwork(app.config, 'STORY_ART', 'Video:2').url)
    const st = await sharp(res.rawPayload).stats()
    const [r, g, b] = st.channels.map((c) => c.mean)
    expect(Math.max(r ?? 0, g ?? 0, b ?? 0)).toBeLessThan(110) // koyu zemin
    expect(Math.max(r ?? 0, g ?? 0, b ?? 0) - Math.min(r ?? 0, g ?? 0, b ?? 0)).toBeGreaterThan(3) // renk tonu var
  })

  it('yerel dosya (web/public) kullanılır: kanal logosu ve avatar', async () => {
    const { app } = await makeApp()
    const ch = await get(app, buildArtwork(app.config, 'CHANNEL_LOGO', 'Channel:1').url)
    expect(ch.statusCode).toBe(200)
    expect(ch.headers['x-tvplus-img']).toContain('local')
    const meta = await sharp(ch.rawPayload).metadata()
    expect(meta.hasAlpha).toBe(true)
    // Kenar boşluğu saydam
    const { data, info } = await sharp(ch.rawPayload).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    expect(data[3]).toBe(0)
    expect(info.width).toBe(128)
    const av = await get(app, buildArtwork(app.config, 'AVATAR', 'Profile:a').url)
    expect(av.headers['x-tvplus-img']).toContain('local')
  })

  it('web/public dışına çıkan yerel yol reddedilir, kapak üretilir', async () => {
    const { app } = await makeApp()
    sources['Profile:x'] = gen('Xavier', 'Profile:x', { localFile: '../../package.json' })
    const res = await get(app, buildArtwork(app.config, 'AVATAR', 'Profile:x').url)
    expect(res.statusCode).toBe(200)
    expect(res.headers['x-tvplus-img']).toContain('generated')
    delete sources['Profile:x']
  })

  it('disk önbelleği: ikinci istek önbellekten, aynı ETag; If-None-Match → 304', async () => {
    const dataDir = mkdtempSync(join(tmpdir(), 'tvplus-img-'))
    const first = await makeApp({ dataDir })
    const url = buildArtwork(first.app.config, 'BOXART', 'Video:1').url
    const r1 = await get(first.app, url)
    expect(r1.headers['x-tvplus-img']).toBe('generated; cache=miss')
    expect(existsSync(join(dataDir, 'img-cache'))).toBe(true)
    await first.app.close()
    const second = await makeApp({ dataDir })
    const r2 = await get(second.app, url)
    expect(r2.headers['x-tvplus-img']).toBe('generated; cache=hit')
    expect(r2.headers.etag).toBe(r1.headers.etag)
    expect(r2.rawPayload.equals(r1.rawPayload)).toBe(true)
    const r3 = await get(second.app, url, { 'if-none-match': String(r1.headers.etag) })
    expect(r3.statusCode).toBe(304)
  })

  it('aynı adrese eşzamanlı istekler tek çizime iner', async () => {
    const dataDir = mkdtempSync(join(tmpdir(), 'tvplus-img-'))
    const { app } = await makeApp({ dataDir })
    const url = buildArtwork(app.config, 'STORY_ART', 'Video:2').url
    const all = await Promise.all([1, 2, 3, 4, 5].map(() => get(app, url)))
    expect(all.every((r) => r.statusCode === 200)).toBe(true)
    expect(new Set(all.map((r) => r.headers.etag)).size).toBe(1)
    const files = readdirSync(join(dataDir, 'img-cache'), { recursive: true }).filter((f) => String(f).endsWith('.webp'))
    expect(files).toHaveLength(1)
  })

  it('çevrimdışı: ağa hiç çıkılmaz, kapak üretilir ve uzun önbelleklenmez', async () => {
    const spy = vi.spyOn(imageFetcher, 'fetch')
    const { app } = await makeApp({ offline: true })
    const res = await get(app, buildArtwork(app.config, 'BOXART', 'Video:3').url)
    expect(res.statusCode).toBe(200)
    expect(spy).not.toHaveBeenCalled()
    expect(res.headers['x-tvplus-img']).toBe('fallback; cache=miss')
    expect(res.headers['cache-control']).toBe('public, max-age=300')
  })

  it('çevrimiçi: uzak kaynak bir kez okunur, asıl dosya diske yazılır, odaklı kırpılır', async () => {
    const png = await sharp({ create: { width: 640, height: 360, channels: 3, background: { r: 200, g: 40, b: 40 } } })
      .png()
      .toBuffer()
    const spy = vi.spyOn(imageFetcher, 'fetch').mockResolvedValue({ status: 200, contentType: 'image/png', body: png })
    const dataDir = mkdtempSync(join(tmpdir(), 'tvplus-img-'))
    const { app } = await makeApp({ offline: false, dataDir })
    const story = await get(app, buildArtwork(app.config, 'STORY_ART', 'Video:3').url)
    expect(story.headers['x-tvplus-img']).toBe('remote; cache=miss')
    const box = await get(app, buildArtwork(app.config, 'BOXART', 'Video:3').url)
    expect(box.statusCode).toBe(200)
    expect(box.headers['x-tvplus-img']).toBe('source-cache; cache=miss')
    expect(spy).toHaveBeenCalledTimes(1)
    expect(readdirSync(join(dataDir, 'img-src'))).toHaveLength(1)
    // Kırpılan yatay görsel kaynağın rengini taşır
    const st = await sharp(story.rawPayload).stats()
    expect(st.channels[0]?.mean ?? 0).toBeGreaterThan(150)
  })

  it("yatay kaynaktan afiş: 'contain' ve 'crop' istenen boyutta, birbirinden farklı; belirtilmezse 'contain'", async () => {
    // 16:9, sol yarı kırmızı sağ yarı mavi, üstte ve altta siyah şerit (letterbox ayıklaması da çalışsın)
    const W = 640
    const H = 480
    const raw = Buffer.alloc(W * H * 3)
    for (let y = 60; y < 420; y++)
      for (let x = 0; x < W; x++) {
        const o = (y * W + x) * 3
        if (x < W / 2) raw[o] = 220
        else raw[o + 2] = 220
      }
    const png = await sharp(raw, { raw: { width: W, height: H, channels: 3 } }).png().toBuffer()
    vi.spyOn(imageFetcher, 'fetch').mockResolvedValue({ status: 200, contentType: 'image/png', body: png })
    const url = 'https://ornek.test/kare.png'
    sources['Video:20'] = gen('Afiş Testi', 'x', { sourceUrl: url, posterFit: 'contain' })
    sources['Video:21'] = gen('Afiş Testi', 'x', { sourceUrl: url, posterFit: 'crop' })
    sources['Video:22'] = gen('Afiş Testi', 'x', { sourceUrl: url })
    try {
      const { app } = await makeApp({ offline: false })
      const render = async (id: string, width?: number) => {
        const a = buildArtwork(app.config, 'BOXART', id, { width, format: 'jpg' })
        const res = await get(app, a.url)
        expect(res.statusCode).toBe(200)
        const out = await sharp(res.rawPayload).raw().toBuffer({ resolveWithObject: true })
        expect([out.info.width, out.info.height]).toEqual([a.width, a.height])
        return out.data
      }
      for (const width of [368, 112]) {
        const contain = await render('Video:20', width)
        const crop = await render('Video:21', width)
        const dflt = await render('Video:22', width)
        expect(dflt.equals(contain)).toBe(true)
        expect(crop.equals(contain)).toBe(false)
      }
      // 'contain' kaynağın tamamını gösterir: görsel bandında hem kırmızı hem mavi yarı görünür.
      // 'crop' ortadan 2:3 pencere alır; aynı satırda iki rengi de taşır ama sol kenar kırmızı, sağ kenar mavidir.
      const { data, info } = await sharp((await get(app, buildArtwork(app.config, 'BOXART', 'Video:20').url)).rawPayload)
        .raw()
        .toBuffer({ resolveWithObject: true })
      const px = (x: number, y: number) => {
        const o = (y * info.width + x) * info.channels
        return [data[o] ?? 0, data[o + 1] ?? 0, data[o + 2] ?? 0]
      }
      const bandY = Math.round(info.height * 0.085 + 40)
      const [lr, , lb] = px(20, bandY)
      const [rr, , rb] = px(info.width - 20, bandY)
      expect(lr).toBeGreaterThan(150)
      expect(lb).toBeLessThan(80)
      expect(rb).toBeGreaterThan(150)
      expect(rr).toBeLessThan(80)
    } finally {
      for (const id of ['Video:20', 'Video:21', 'Video:22']) delete sources[id]
    }
  })

  it("afiş düzeni disk önbelleği anahtarının parçası", async () => {
    const png = await sharp({ create: { width: 640, height: 360, channels: 3, background: { r: 30, g: 120, b: 200 } } })
      .png()
      .toBuffer()
    vi.spyOn(imageFetcher, 'fetch').mockResolvedValue({ status: 200, contentType: 'image/png', body: png })
    const dataDir = mkdtempSync(join(tmpdir(), 'tvplus-img-'))
    sources['Video:30'] = gen('Önbellek', 'x', { sourceUrl: 'https://ornek.test/b.png', posterFit: 'crop' })
    try {
      const first = await makeApp({ offline: false, dataDir })
      const url = buildArtwork(first.app.config, 'BOXART', 'Video:30').url
      const r1 = await get(first.app, url)
      expect(r1.headers['x-tvplus-img']).toContain('cache=miss')
      expect((await get(first.app, url)).headers['x-tvplus-img']).toContain('cache=hit')
      // İçerik 'contain'e geçti: aynı adres yeniden çizilir, eski kırpılmış afiş sunulmaz
      sources['Video:30'] = { ...sources['Video:30'], posterFit: 'contain' } as ArtworkSource
      const r2 = await get(first.app, url)
      expect(r2.headers['x-tvplus-img']).toContain('cache=miss')
      expect(r2.headers.etag).not.toBe(r1.headers.etag)
    } finally {
      delete sources['Video:30']
    }
  })

  it('çevrimiçi ama kaynak okunamadı: yedek kapak, kısa önbellek', async () => {
    vi.spyOn(imageFetcher, 'fetch').mockRejectedValue(new Error('zaman aşımı'))
    const { app } = await makeApp({ offline: false })
    const res = await get(app, buildArtwork(app.config, 'STORY_ART', 'Video:3').url)
    expect(res.statusCode).toBe(200)
    expect(res.headers['x-tvplus-img']).toBe('fallback; cache=miss')
    expect(res.headers['cache-control']).toBe('public, max-age=300')
  })
})

describe('görsel yardımcıları', () => {
  it('odak ayrıştırma (CSS object-position)', () => {
    expect(parseFocal('50% 35%')).toEqual({ x: 0.5, y: 0.35 })
    expect(parseFocal('left top')).toEqual({ x: 0, y: 0 })
    expect(parseFocal('top')).toEqual({ x: 0.5, y: 0 })
    expect(parseFocal('right 20%')).toEqual({ x: 1, y: 0.2 })
    expect(parseFocal('')).toEqual({ x: 0.5, y: 0.5 })
  })

  it('kırpma penceresi odağa göre konumlanır', () => {
    expect(coverWindow(1280, 720, 2 / 3, { x: 0, y: 0.5 })).toEqual({ left: 0, top: 0, width: 480, height: 720 })
    expect(coverWindow(1280, 720, 2 / 3, { x: 1, y: 0.5 })).toEqual({ left: 800, top: 0, width: 480, height: 720 })
    expect(coverWindow(480, 720, 16 / 9, { x: 0.5, y: 0.5 }).height).toBe(270)
  })

  it('siyah şerit (letterbox) ayıklanır, koyu sahne bozulmaz', async () => {
    const w = 480
    const h = 360
    const data = Buffer.alloc(w * h * 3)
    for (let y = 45; y < 315; y++) for (let x = 0; x < w; x++) data.fill(120, (y * w + x) * 3, (y * w + x) * 3 + 3)
    const b = letterboxBounds({ data, width: w, height: h, channels: 3 })
    expect(b.top).toBeGreaterThanOrEqual(45)
    expect(b.top).toBeLessThan(50)
    expect(b.height).toBeLessThanOrEqual(270)
    // Yalnızca üstte koyu bant (simetrik değil) → kırpılmaz
    const data2 = Buffer.alloc(w * h * 3, 120)
    data2.fill(0, 0, w * 60 * 3)
    expect(letterboxBounds({ data: data2, width: w, height: h, channels: 3 }).top).toBe(0)
  })

  it('kanal baş harfleri', () => {
    expect(initialsOf('TRT Haber')).toBe('TRT')
    expect(initialsOf('TRT 1')).toBe('TRT 1')
    expect(initialsOf('Kanal D')).toBe('KD')
    expect(initialsOf('show tv')).toBe('ST')
    expect(initialsOf('İzmir')).toBe('İZ')
  })
})
