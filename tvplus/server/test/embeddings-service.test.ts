/**
 * Gömme servisi ve uçları: kurulum, önbellek, etiket değişince yalnız ilgili yaprağın yeniden kodlanması, başlık ve
 * çekim komşuları, izdüşüm, anahtar kare, doğrulama, erişim kancası ve yazma koruması, dosya ve http sağlayıcıları.
 * Gerçek içerik (content/titles + content/shots) kullanılır; ağ yok.
 */
import { copyFileSync, cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import sharp from 'sharp'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { HEADERS } from '../../shared/constants'
import type {
  EffectiveTags,
  EmbeddingInfo,
  NeighborShot,
  NeighborTitle,
  ProjectionPoint,
  ShotSummary,
} from '../../shared/intelligence'
import { KEYFRAMES_FILE, zKeyframesFile, zSceneDetectFile } from '../../shared/shots-schema'
import type { BootContext } from '../../shared/types'
import type { TaggingService } from '../src/kernel/intelligence'
import { EMBEDDING_PROTOCOL } from '../src/services/embeddings/http'
import { embeddingsInternals } from '../src/services/embeddings/plugin'
import type { EmbeddingInput } from '../src/services/embeddings/provider'
import { TABAN_DIMS } from '../src/services/embeddings/taban'
import { cosine } from '../src/services/embeddings/vectors'
import { createTestApp } from './helpers'

// Bu dosyanın beklentileri taban sağlayıcısına göredir: content/models altında bir model olsa da açıkça taban seçilir.
process.env.TVP_EMBEDDING_PROVIDER ??= 'taban'

const SINTEL = 80010001
const TEARS = 80010002
const NOSFERATU = 80020003
const CALIGARI = 80020002
const SHOTS_DIR = join(__dirname, '..', '..', 'content', 'shots')
const sintelShots = zSceneDetectFile.parse(JSON.parse(readFileSync(join(SHOTS_DIR, `${SINTEL}.json`), 'utf8')))

const B = '/api/studio/embeddings'

/** Depodaki tüm SCENE_DETECT dosyaları (sayıları depoyla değişir; testler sayıya değil değişmezlere bakar). */
const sceneFiles = () =>
  readdirSync(SHOTS_DIR)
    .filter((f) => f.endsWith('.json') && f !== KEYFRAMES_FILE)
    .map((f) => zSceneDetectFile.parse(JSON.parse(readFileSync(join(SHOTS_DIR, f), 'utf8'))))
const keyframesFile = () => zKeyframesFile.parse(JSON.parse(readFileSync(join(SHOTS_DIR, KEYFRAMES_FILE), 'utf8')))

/**
 * Küçük içerik ağacı: gerçek katalog + yalnız iki SCENE_DETECT dosyası (Sintel, Tears of Steel) + birleşik KEYFRAMES
 * dosyası; content/models yok. Sayıya bağlı beklentiler bunun üzerinde sınanır.
 */
function smallContent(): string {
  const real = join(SHOTS_DIR, '..')
  const dir = mkdtempSync(join(tmpdir(), 'tvplus-emb-icerik-'))
  for (const name of readdirSync(real))
    if (name !== 'shots' && name !== 'models') cpSync(join(real, name), join(dir, name), { recursive: true })
  mkdirSync(join(dir, 'shots'))
  for (const f of [`${SINTEL}.json`, `${SINTEL}.jpg`, `${TEARS}.json`, `${TEARS}.jpg`, KEYFRAMES_FILE, 'keyframes.jpg'])
    copyFileSync(join(SHOTS_DIR, f), join(dir, 'shots', f))
  return dir
}

/** Etiketleri testin denetlediği sahte etiketleme servisi (gerçek servisin yerine konur). */
function fakeTagging(app: FastifyInstance) {
  const real = app.services.tagging
  const state = { rev: 100, tags: new Map<number, Partial<EffectiveTags>>() }
  const svc: TaggingService = {
    vocabulary: () => real.vocabulary(),
    sheets: () => [],
    revision: () => state.rev,
    effective: (titleId) => ({
      titleId,
      rubricVersion: 'test',
      basis: state.tags.has(titleId) ? 'CONSENSUS' : 'NONE',
      sheetCount: 0,
      agreement: null,
      scales: {},
      facets: {},
      descriptors: [],
      ...state.tags.get(titleId),
    }),
  }
  app.services.tagging = svc
  return state
}

describe('gömme servisi (taban, gerçek içerik)', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    app = await createTestApp()
  })
  afterAll(async () => {
    await app.close()
  })

  it('test açılışı kurulumu beklemez; ilk erişimde kurulur', async () => {
    const svc = embeddingsInternals(app)
    expect(svc.lastBuild()).toBeNull()
    const t0 = Date.now()
    await svc.whenReady()
    expect(Date.now() - t0).toBeLessThan(10_000)
    expect(svc.ready()).toBe(true)
    expect(svc.revision()).toBe(1)
  })

  it('GET /embeddings bilgisi (değişmezler: sahne algılamalı yaprak sayısı diskteki dosya sayısıdır)', async () => {
    const res = await app.inject({ method: 'GET', url: B })
    expect(res.statusCode).toBe(200)
    const info = res.json<EmbeddingInfo>()
    expect(info.provider).toBe('taban')
    expect(info.modelVersion).toMatch(/^taban-/)
    expect(info.dims).toBe(TABAN_DIMS)
    expect(info.titles).toBe(app.services.catalog.allTitles().length)
    const scenes = sceneFiles()
    expect(info.sceneDetected).toBe(scenes.length)
    expect(info.shots).toBeGreaterThanOrEqual(scenes.reduce((n, f) => n + f.shots.length, 0))
    expect(info.modalities).toEqual(['VISUAL', 'AUDIO', 'TEXT', 'CONTEXT'])
    expect(info.builtAt).not.toBeNull()
  })

  it('başlık komşuları: sıralı, kendisi hariç, ilk N; sessiz klasikler birbirine yakın', async () => {
    const res = await app.inject({ method: 'GET', url: `${B}/titles/${SINTEL}/neighbors?first=5` })
    expect(res.statusCode).toBe(200)
    const list = res.json<NeighborTitle[]>()
    expect(list).toHaveLength(5)
    expect(list.some((n) => n.titleId === SINTEL)).toBe(false)
    for (let i = 1; i < list.length; i++) expect(list[i - 1]!.score).toBeGreaterThanOrEqual(list[i]!.score)
    const nos = (await app.inject({ method: 'GET', url: `${B}/titles/${NOSFERATU}/neighbors?first=1` })).json<
      NeighborTitle[]
    >()
    expect(nos[0]!.titleId).toBe(CALIGARI)
    // servis arayüzü de aynı sonucu verir
    expect(app.services.embeddings.similarTitles(SINTEL, 5)).toEqual(list)
    const v = app.services.embeddings.titleVector(SINTEL)!
    expect(v).toHaveLength(TABAN_DIMS)
    expect(app.services.embeddings.titleVector(123)).toBeNull()
  })

  it('doğrulama ve bulunamayan kayıtlar', async () => {
    for (const url of [
      `${B}/titles/abc/neighbors`,
      `${B}/titles/${SINTEL}/neighbors?first=0`,
      `${B}/titles/${SINTEL}/neighbors?first=101`,
      `${B}/titles/${SINTEL}/neighbors?first=x`,
      `${B}/videos/-1/shots`,
      `${B}/videos/${SINTEL}/shots/1/neighbors?sameVideo=belki`,
    ]) {
      const res = await app.inject({ method: 'GET', url })
      expect(res.statusCode, url).toBe(400)
      expect(res.json<{ error: { code: string } }>().error.code).toBe('INVALID_REQUEST')
    }
    expect((await app.inject({ method: 'GET', url: `${B}/titles/123/neighbors` })).statusCode).toBe(404)
    expect((await app.inject({ method: 'GET', url: `${B}/videos/123/shots` })).statusCode).toBe(404)
    expect((await app.inject({ method: 'GET', url: `${B}/videos/${SINTEL}/shots/9999/neighbors` })).statusCode).toBe(
      404,
    )
    expect((await app.inject({ method: 'GET', url: `${B}/videos/${SINTEL}/shots/9999/keyframe.jpg` })).statusCode).toBe(
      404,
    )
  })

  it('her çözümlenmiş yaprağın çekim listesi dosyasıyla aynı; anahtar kare paftadan kırpılır', async () => {
    for (const f of sceneFiles()) {
      const res = await app.inject({ method: 'GET', url: `${B}/videos/${f.videoId}/shots` })
      expect(res.statusCode, String(f.videoId)).toBe(200)
      const shots = res.json<ShotSummary[]>()
      expect(shots, String(f.videoId)).toHaveLength(f.shots.length)
      shots.forEach((s, i) => {
        const r = f.shots[i]!
        expect([s.index, s.startSec, s.endSec, s.text, s.hasAudio]).toEqual([i, r.s, r.e, r.t, r.a !== null])
        expect(s.keyframeUrl !== null).toBe(r.k !== null && f.sprite !== null)
      })
      const withKf = shots.find((s) => s.keyframeUrl)
      if (!withKf) continue
      const img = await app.inject({ method: 'GET', url: withKf.keyframeUrl! })
      expect(img.statusCode, withKf.keyframeUrl!).toBe(200)
      expect(img.headers['content-type']).toBe('image/jpeg')
      const meta = await sharp(img.rawPayload).metadata()
      expect([meta.width, meta.height]).toEqual([f.sprite!.cellW, f.sprite!.cellH])
      // ikinci istek önbellekten (aynı bayt)
      const again = await app.inject({ method: 'GET', url: withKf.keyframeUrl! })
      expect(again.rawPayload.equals(img.rawPayload)).toBe(true)
    }
    // KEYFRAMES yaprakları: çekim metni boş (özet çekimde söylenen bir şey değildir), ses yok
    const kf = keyframesFile().videos.find((v) => v.fetched > 0)
    if (kf) {
      const yt = (await app.inject({ method: 'GET', url: `${B}/videos/${kf.videoId}/shots` })).json<ShotSummary[]>()
      expect(yt).toHaveLength(kf.shots.length)
      expect(yt.every((s) => !s.hasAudio && s.text === '' && s.keyframeUrl)).toBe(true)
    }
  })

  it('çekim komşuları: varsayılan olarak başka videolardan; sameVideo=true aynı videoyu da katar', async () => {
    const res = await app.inject({ method: 'GET', url: `${B}/videos/${SINTEL}/shots/20/neighbors?first=6` })
    expect(res.statusCode).toBe(200)
    const list = res.json<NeighborShot[]>()
    expect(list).toHaveLength(6)
    expect(list.every((n) => n.videoId !== SINTEL)).toBe(true)
    for (let i = 1; i < list.length; i++) expect(list[i - 1]!.score).toBeGreaterThanOrEqual(list[i]!.score)
    const same = (
      await app.inject({ method: 'GET', url: `${B}/videos/${SINTEL}/shots/20/neighbors?first=6&sameVideo=true` })
    ).json<NeighborShot[]>()
    expect(same.some((n) => n.videoId === SINTEL)).toBe(true)
    expect(same.some((n) => n.videoId === SINTEL && n.index === 20)).toBe(false)
    expect(same[0]!.titleId).toBeGreaterThan(0)
  })

  it('izdüşüm: her başlık için bir nokta, iki çağrıda aynı', async () => {
    const a = (await app.inject({ method: 'GET', url: `${B}/projection` })).json<ProjectionPoint[]>()
    const b = (await app.inject({ method: 'GET', url: `${B}/projection` })).json<ProjectionPoint[]>()
    expect(a).toHaveLength(app.services.catalog.allTitles().length)
    expect(a).toEqual(b)
    expect(new Set(a.map((p) => `${p.x},${p.y}`)).size).toBeGreaterThan(a.length / 2)
  })

  it('yeniden kurulum: hiçbir şey değişmediyse her yaprak önbellekten gelir, sürüm sayacı artmaz', async () => {
    const rev = app.services.embeddings.revision()
    const before = app.services.embeddings.similarTitles(TEARS, 10)
    const res = await app.inject({ method: 'POST', url: `${B}/rebuild` })
    expect(res.statusCode).toBe(200)
    expect(res.headers['x-tvplus-embed-computed']).toBe('0')
    expect(Number(res.headers['x-tvplus-embed-reused'])).toBeGreaterThan(100)
    expect(app.services.embeddings.revision()).toBe(rev)
    expect(app.services.embeddings.similarTitles(TEARS, 10)).toEqual(before)
  })

  it('etiket değişince (revision) yalnız o başlığın yaprakları yeniden kodlanır ve vektör kayar', async () => {
    const svc = embeddingsInternals(app)
    const tags = fakeTagging(app)
    // revision değişti → yeniden kurulum (gerçek etiketleme servisi künyeden öneri üretiyorsa girdiler de değişir)
    await svc.whenReady()
    expect(svc.lastBuild()!.tagRevision).toBe(100)
    const before = Float32Array.from(svc.titleVector(SINTEL)!)
    const otherBefore = Float32Array.from(svc.titleVector(TEARS)!)
    tags.tags.set(SINTEL, { scales: { romantizm: 4, siddet: 3 }, descriptors: ['romantik'] })
    tags.rev++
    expect(svc.ready()).toBe(true) // eski vektörler kurulum sürerken kullanılır
    await svc.whenReady()
    expect(svc.lastBuild()!.computed).toBe(1)
    expect(cosine(before, svc.titleVector(SINTEL)!)).toBeLessThan(0.999)
    expect(Array.from(svc.titleVector(TEARS)!)).toEqual(Array.from(otherBefore))
    // Tears of Steel'e aynı etiketler verilince ikisi birbirine yaklaşır
    const pairBefore = cosine(svc.titleVector(SINTEL)!, svc.titleVector(TEARS)!)
    tags.tags.set(TEARS, { scales: { romantizm: 4, siddet: 3 }, descriptors: ['romantik'] })
    tags.rev++
    await svc.whenReady()
    expect(cosine(svc.titleVector(SINTEL)!, svc.titleVector(TEARS)!)).toBeGreaterThan(pairBefore + 0.02)
  })

  it('disk önbelleği: aynı veri klasörüyle açılan ikinci uygulama hiçbir şeyi yeniden kodlamaz', async () => {
    const app2 = await createTestApp({ dataDir: app.config.dataDir })
    try {
      fakeTagging(app2)
      const svc2 = embeddingsInternals(app2)
      await svc2.whenReady()
      // Sintel ve Tears etiketleri sahte serviste yok: o ikisi yeniden kodlanır, kalanlar diskten gelir
      expect(svc2.lastBuild()!.computed).toBe(2)
      expect(svc2.lastBuild()!.reused).toBeGreaterThan(100)
    } finally {
      await app2.close()
    }
  })
})

describe('küçük içerik ağacı (sayıya bağlı beklentiler)', () => {
  it('iki sahne algılamalı yaprak, gerisi KEYFRAMES; modeller klasörü yok → taban', async () => {
    const contentDir = smallContent()
    const app = await createTestApp({ contentDir })
    try {
      const info = (await app.inject({ method: 'POST', url: `${B}/rebuild` })).json<EmbeddingInfo>()
      expect(info.provider).toBe('taban')
      expect(info.sceneDetected).toBe(2)
      expect(info.titles).toBe(app.services.catalog.allTitles().length)
      const kf = zKeyframesFile.parse(JSON.parse(readFileSync(join(contentDir, 'shots', KEYFRAMES_FILE), 'utf8')))
      const expected =
        sintelShots.shots.length +
        zSceneDetectFile.parse(JSON.parse(readFileSync(join(contentDir, 'shots', `${TEARS}.json`), 'utf8'))).shots
          .length +
        kf.videos
          .filter((v) => v.videoId !== SINTEL && v.videoId !== TEARS)
          .filter((v) => app.services.catalog.getPlayable(v.videoId))
          .reduce((n, v) => n + v.shots.length, 0)
      // çözümlemesi olmayan yapraklar tek sözde çekimle temsil edilir
      const embedded = embeddingsInternals(app).videoIds()
      const covered = new Set([SINTEL, TEARS, ...kf.videos.map((v) => v.videoId)])
      expect(info.shots).toBe(expected + embedded.filter((id) => !covered.has(id)).length)
    } finally {
      await app.close()
    }
  })
})

describe('stüdyo erişimi ve yazma koruması', () => {
  let app: FastifyInstance
  beforeAll(async () => {
    app = await createTestApp({ studioAccess: 'member', studioKey: 'anahtar-123' })
  })
  afterAll(async () => {
    await app.close()
  })

  it('oturumsuz okuma 401; anahtarla okuma ve yazma 200', async () => {
    expect((await app.inject({ method: 'GET', url: B })).statusCode).toBe(401)
    expect((await app.inject({ method: 'POST', url: `${B}/rebuild` })).statusCode).toBe(401)
    const h = { [HEADERS.STUDIO_KEY]: 'anahtar-123' }
    expect((await app.inject({ method: 'GET', url: B, headers: h })).statusCode).toBe(200)
    expect((await app.inject({ method: 'POST', url: `${B}/rebuild`, headers: h })).statusCode).toBe(200)
    expect((await app.inject({ method: 'GET', url: B, headers: { [HEADERS.STUDIO_KEY]: 'yanlis' } })).statusCode).toBe(
      401,
    )
  })

  it('üye oturumuyla yazma authURL ister', async () => {
    const login = await app.inject({ method: 'POST', url: '/api/login' })
    expect(login.statusCode).toBe(200)
    const cookies: Record<string, string> = {}
    const take = (res: { cookies: { name: string; value: string }[] }) => {
      for (const c of res.cookies) cookies[c.name] = c.value
    }
    take(login)
    const guid = login.json<BootContext>().profiles[0]!.guid
    const sw = await app.inject({ method: 'POST', url: '/api/profiles/switch', cookies, payload: { guid } })
    take(sw)
    const authURL = sw.json<BootContext>().authURL
    expect((await app.inject({ method: 'GET', url: B, cookies })).statusCode).toBe(200)
    const denied = await app.inject({ method: 'POST', url: `${B}/rebuild`, cookies })
    expect(denied.statusCode).toBe(403)
    expect(denied.json<{ error: { code: string } }>().error.code).toBe('CSRF')
    const ok = await app.inject({
      method: 'POST',
      url: `${B}/rebuild`,
      cookies,
      headers: { [HEADERS.AUTH_URL]: authURL ?? '' },
    })
    expect(ok.statusCode).toBe(200)
  })

  it('stüdyo kapalıysa 404', async () => {
    const off = await createTestApp({ studioAccess: 'off' })
    try {
      expect((await off.inject({ method: 'GET', url: B })).statusCode).toBe(404)
    } finally {
      await off.close()
    }
  })
})

describe('dosya sağlayıcısı uçtan uca', () => {
  it('içe aktarılan vektörlerle komşular; dosyada olmayan başlık 404', async () => {
    const dataDir = mkdtempSync(join(tmpdir(), 'tvplus-emb-dosya-'))
    const dir = join(dataDir, 'embeddings', 'import')
    mkdirSync(dir, { recursive: true })
    const tearsCount = zSceneDetectFile.parse(JSON.parse(readFileSync(join(SHOTS_DIR, `${TEARS}.json`), 'utf8'))).shots
      .length
    const rows = (n: number, base: number[]) => Array.from({ length: n }, (_, i) => [...base, i / n])
    writeFileSync(
      join(dir, 'model.jsonl'),
      [
        JSON.stringify({ kind: 'model', id: 'dis-model', version: '3', dims: 4 }),
        JSON.stringify({ kind: 'video', videoId: SINTEL, shots: rows(sintelShots.shots.length, [1, 0, 0]) }),
        JSON.stringify({ kind: 'video', videoId: TEARS, shots: rows(tearsCount, [0.9, 0.1, 0]) }),
        JSON.stringify({ kind: 'video', videoId: NOSFERATU, shots: [[0, 0, 1, 0]] }),
      ].join('\n'),
    )
    const app = await createTestApp({ dataDir, embedding: { provider: 'dosya', url: null } })
    try {
      await embeddingsInternals(app).whenReady()
      const info = (await app.inject({ method: 'GET', url: B })).json<EmbeddingInfo>()
      expect(info.provider).toBe('dosya')
      expect(info.modelVersion).toMatch(/^dosya:dis-model@3#/)
      expect(info.dims).toBe(4)
      expect(info.titles).toBe(3)
      const nb = (await app.inject({ method: 'GET', url: `${B}/titles/${SINTEL}/neighbors?first=2` })).json<
        NeighborTitle[]
      >()
      expect(nb.map((n) => n.titleId)).toEqual([TEARS, NOSFERATU])
      expect((await app.inject({ method: 'GET', url: `${B}/titles/80030001/neighbors` })).statusCode).toBe(404)
      expect(embeddingsInternals(app).lastBuild()!.skipped).toBeGreaterThan(100)
    } finally {
      await app.close()
    }
  })

  it('içe aktarma dosyası yoksa uçlar 503, bilgi ucu çalışır', async () => {
    const app = await createTestApp({ embedding: { provider: 'dosya', url: null } })
    try {
      const res = await app.inject({ method: 'GET', url: `${B}/projection` })
      expect(res.statusCode).toBe(503)
      expect(res.json<{ error: { code: string; message: string } }>().error.message).toMatch(/vektör yok/)
      expect((await app.inject({ method: 'GET', url: B })).json<EmbeddingInfo>().titles).toBe(0)
      expect((await app.inject({ method: 'POST', url: `${B}/rebuild` })).statusCode).toBe(503)
    } finally {
      await app.close()
    }
  })
})

describe('http sağlayıcısı uçtan uca (yerel sahte model sunucusu)', () => {
  let server: Server
  let url = ''
  let received: EmbeddingInput[] = []
  beforeAll(async () => {
    server = createServer((req, res) => {
      let body = ''
      req.on('data', (c: Buffer) => (body += c.toString()))
      req.on('end', () => {
        res.writeHead(200, { 'content-type': 'application/json' })
        if (req.method === 'GET')
          return res.end(
            JSON.stringify({ protocol: EMBEDDING_PROTOCOL, model: { id: 'sahte', version: '2', dims: 3 } }),
          )
        const { input } = JSON.parse(body) as { input: EmbeddingInput }
        received.push(input)
        // Bir yaprakta bilerek yanlış boyut: o yaprak atlanmalı, kalanlar kurulmalı
        const d = input.videoId === NOSFERATU ? 2 : 3
        const g = input.context.genres.includes('belgesel') ? 1 : 0
        res.end(
          JSON.stringify({
            videoId: input.videoId,
            shots: input.shots.map(() => Array.from({ length: d }, (_, i) => (i === g ? 1 : 0.1))),
            pooled: Array.from({ length: d }, (_, i) => (i === g ? 1 : 0.1)),
          }),
        )
      })
    })
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/`
  })
  afterAll(() => new Promise<void>((r) => server.close(() => r())))

  it('aynı girdi JSON olarak gider; bağlam ve çekimler taşınır; hatalı yaprak atlanır', async () => {
    const app = await createTestApp({ embedding: { provider: 'http', url } })
    try {
      received = []
      const res = await app.inject({ method: 'POST', url: `${B}/rebuild` })
      expect(res.statusCode).toBe(200)
      expect(res.headers['x-tvplus-embed-failed']).toBe('1')
      const info = res.json<EmbeddingInfo>()
      expect(info.provider).toBe('http')
      expect(info.modelVersion).toBe('http:sahte@2')
      expect(info.dims).toBe(3)
      const sintel = received.find((r) => r.videoId === SINTEL)!
      expect(sintel.shots).toHaveLength(sintelShots.shots.length)
      expect(sintel.context.synopsis.length).toBeGreaterThan(20)
      expect(sintel.context.tags.basis).toBeDefined()
      expect(sintel.shots[0]!.visual!.hist).toHaveLength(16)
      expect((await app.inject({ method: 'GET', url: `${B}/titles/${NOSFERATU}/neighbors` })).statusCode).toBe(404)
      // ikinci kurulum: model sunucusuna yalnız önceki hatalı yaprak gider
      received = []
      const again = await app.inject({ method: 'POST', url: `${B}/rebuild` })
      expect(again.headers['x-tvplus-embed-computed']).toBe('0')
      expect(received.map((r) => r.videoId)).toEqual([NOSFERATU])
    } finally {
      await app.close()
    }
  })

  it('TVP_EMBEDDING_URL yoksa anlaşılır 503', async () => {
    const app = await createTestApp({ embedding: { provider: 'http', url: null } })
    try {
      const res = await app.inject({ method: 'GET', url: `${B}/projection` })
      expect(res.statusCode).toBe(503)
      expect(res.json<{ error: { message: string } }>().error.message).toMatch(/TVP_EMBEDDING_URL/)
    } finally {
      await app.close()
    }
  })
})
