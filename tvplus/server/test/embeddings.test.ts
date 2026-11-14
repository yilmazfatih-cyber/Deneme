/**
 * Gömme katmanının saf parçaları: çözümleme dosyası şeması, özellik çıkarımı (sentetik kare ve PCM), karma ve
 * kodlayıcıların belirlenimciliği, bağlam karışımı, havuzlama, en yakın k, PCA, http ve dosya sağlayıcıları.
 */
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  HIST_BINS,
  KEYFRAMES_FILE,
  zKeyframesFile,
  zSceneDetectFile,
  type AudioFeatures,
  type VisualFeatures,
} from '../../shared/shots-schema'
import { createDosyaProvider, readImportDir } from '../src/services/embeddings/dosya'
import {
  AUDIO_WINDOW,
  audioFeatures,
  averageVisual,
  edgeDensity,
  lumaOf,
  motionEstimate,
  visualFeatures,
  type RawFrame,
} from '../src/services/embeddings/features'
import { charGrams, fnv1a, foldTr, mulberry32, projectionMatrix, wordsOf } from '../src/services/embeddings/hashing'
import { createHttpProvider, EMBEDDING_PROTOCOL, EmbeddingHttpError } from '../src/services/embeddings/http'
import {
  checkOutput,
  type EmbeddingInput,
  type GlobalContext,
  type ShotInput,
} from '../src/services/embeddings/provider'
import {
  BLOCK_OFFSETS,
  TABAN_DIMS,
  TABAN_PARAMS,
  TABAN_VERSION,
  contextVector,
  createTabanProvider,
  tabanEmbed,
} from '../src/services/embeddings/taban'
import { cosine, dot, norm, pca2, topK } from '../src/services/embeddings/vectors'

const CONTENT_SHOTS = join(__dirname, '..', '..', 'content', 'shots')

/* ───────────── yardımcılar ───────────── */

function solid(w: number, h: number, rgb: [number, number, number]): RawFrame {
  const data = new Uint8Array(w * h * 3)
  for (let i = 0; i < w * h; i++) data.set(rgb, i * 3)
  return { data, width: w, height: h, channels: 3 }
}

function sine(freq: number, amp: number, seconds: number, rate = 16000): Float32Array {
  const out = new Float32Array(Math.round(seconds * rate))
  for (let i = 0; i < out.length; i++) out[i] = amp * Math.sin((2 * Math.PI * freq * i) / rate)
  return out
}

const VIS = (over: Partial<VisualFeatures> = {}): VisualFeatures => ({
  hist: [0.05, 0.03, 0.01, 0, 0, 0, 0.02, 0.01, 0, 0, 0, 0.01, 0.4, 0.3, 0.2, 0.1],
  bright: 0.35,
  contrast: 0.19,
  sat: 0.33,
  colorful: 0.25,
  edges: 0.33,
  motion: 0.15,
  ...over,
})
const AUD = (over: Partial<AudioFeatures> = {}): AudioFeatures => ({
  loud: -22,
  silence: 0.1,
  zcr: 0.1,
  centroid: 1500,
  ...over,
})

function ctx(over: Partial<GlobalContext> = {}, tags: Partial<GlobalContext['tags']> = {}): GlobalContext {
  return {
    titleId: 1,
    type: 'MOVIE',
    title: 'Ejderhanın Peşinde',
    synopsis: 'Genç bir kadın kaybolan ejderhasını bulmak için karlı dağlara doğru tehlikeli bir yolculuğa çıkar.',
    genres: ['animasyon', 'fantastik'],
    moods: ['duygusal'],
    keywords: ['ejderha'],
    tags: { basis: 'NONE', scales: {}, facets: {}, descriptors: [], ...tags },
    ...over,
  }
}

function input(shots: ShotInput[], context = ctx(), videoText = ''): EmbeddingInput {
  return { videoId: 10, titleId: 1, method: 'SCENE_DETECT', durationSec: 60, videoText, shots, context }
}

function shotsFixture(n = 6): ShotInput[] {
  return Array.from({ length: n }, (_, i) => ({
    index: i,
    startSec: i * 5,
    endSec: i * 5 + 5,
    visual: VIS({
      bright: 0.2 + 0.1 * i,
      edges: 0.1 + 0.05 * i,
      hist: VIS().hist.map((x, k) => (k === i ? x + 0.1 : x)),
    }),
    audio: AUD({ loud: -30 + 3 * i, centroid: 1000 + 200 * i }),
    text: i % 2 === 0 ? `Ejderha ${i}. kez gökyüzünde görünür.` : '',
  }))
}

const row = (m: Float32Array, i: number, d = TABAN_DIMS) => m.subarray(i * d, (i + 1) * d)
const blockNorm2 = (v: ArrayLike<number>, offset: number, size: number) => {
  let s = 0
  for (let i = offset; i < offset + size; i++) s += v[i]! * v[i]!
  return s
}

/* ───────────── şema ───────────── */

describe('çekim çözümlemesi şeması', () => {
  it('depodaki çözümleme dosyaları şemaya uyar', () => {
    const files = readdirSync(CONTENT_SHOTS).filter((f) => f.endsWith('.json'))
    expect(files).toContain(KEYFRAMES_FILE)
    let scene = 0
    for (const f of files) {
      const raw: unknown = JSON.parse(readFileSync(join(CONTENT_SHOTS, f), 'utf8'))
      if (f === KEYFRAMES_FILE) {
        const k = zKeyframesFile.parse(raw)
        expect(k.videos.length).toBeGreaterThan(0)
        for (const v of k.videos) expect(v.shots.length).toBeGreaterThan(0)
      } else {
        const s = zSceneDetectFile.parse(raw)
        scene++
        expect(f).toBe(`${s.videoId}.json`)
        // çekimler sıralı, bitişik ve süreyi kaplıyor
        s.shots.forEach((sh, i) => {
          expect(sh.i).toBe(i)
          if (i > 0) expect(sh.s).toBe(s.shots[i - 1]!.e)
        })
        expect(s.shots.at(-1)!.e).toBeCloseTo(s.durationSec, 2)
      }
    }
    expect(scene).toBeGreaterThanOrEqual(2)
  })

  it('bozuk kaydı reddeder', () => {
    const bad = {
      version: 1,
      method: 'KEYFRAMES',
      generatedAt: 'x',
      textSource: 'SYNOPSIS',
      sprite: null,
      videos: [
        {
          videoId: 1,
          titleId: 1,
          youtubeId: null,
          durationSec: 10,
          tried: 1,
          fetched: 1,
          flags: [],
          shots: [{ i: 0, s: 0, e: 10, v: { ...VIS(), hist: [0.5] }, a: null, t: '', k: null }],
        },
      ],
    }
    expect(zKeyframesFile.safeParse(bad).success).toBe(false)
  })
})

/* ───────────── özellik çıkarımı ───────────── */

describe('görüntü özellikleri (sentetik kareler)', () => {
  it('düz kırmızı: tek ton kutusu, tam doygunluk, kenar yok', () => {
    const v = visualFeatures(solid(16, 8, [255, 0, 0]))
    expect(v.hist).toHaveLength(HIST_BINS)
    expect(v.hist[0]).toBe(1)
    expect(v.hist.slice(1, 12).every((x) => x === 0)).toBe(true)
    expect(v.sat).toBe(1)
    expect(v.edges).toBe(0)
    expect(v.contrast).toBe(0)
    expect(v.colorful).toBeCloseTo((0.3 * Math.hypot(255, 127.5)) / 150, 2) // tek renk: yalnız ortalama terimi
    expect(v.motion).toBeNull()
  })

  it('gri ve siyah karelerde ton kutuları boş, karanlıkta doygunluk 0', () => {
    const grey = visualFeatures(solid(8, 8, [128, 128, 128]))
    expect(grey.hist.slice(0, 12).every((x) => x === 0)).toBe(true)
    expect(grey.colorful).toBe(0)
    const nearBlack = visualFeatures(solid(8, 8, [6, 2, 1]))
    expect(nearBlack.sat).toBe(0)
    expect(nearBlack.hist[12]).toBe(1) // en karanlık açıklık kutusu
  })

  it('yarı siyah yarı beyaz: karşıtlık 0.5, sınırda kenar', () => {
    const f = solid(16, 16, [0, 0, 0])
    for (let y = 0; y < 16; y++) for (let x = 8; x < 16; x++) f.data.set([255, 255, 255], (y * 16 + x) * 3)
    const v = visualFeatures(f)
    expect(v.bright).toBeCloseTo(0.5, 2)
    expect(v.contrast).toBeCloseTo(0.5, 2)
    expect(v.edges).toBeGreaterThan(0.1)
    expect(v.edges).toBeLessThan(0.2) // yalnız iki sütun
    expect(edgeDensity(lumaOf(solid(4, 4, [9, 9, 9])), 4, 4)).toBe(0)
  })

  it('hareket: aynı kare 0, ters kare 1', () => {
    const a = solid(8, 8, [0, 0, 0])
    expect(motionEstimate(a, a)).toBe(0)
    expect(motionEstimate(a, solid(8, 8, [255, 255, 255]))).toBe(1)
    expect(() => motionEstimate(a, solid(4, 4, [0, 0, 0]))).toThrow()
  })

  it('orta karelerin ortalaması', () => {
    const v = averageVisual([VIS({ bright: 0.2 }), VIS({ bright: 0.4 })], 0.5)
    expect(v.bright).toBeCloseTo(0.3, 6)
    expect(v.motion).toBe(0.5)
  })
})

describe('ses özellikleri (sentetik PCM)', () => {
  it('sessizlik', () => {
    const a = audioFeatures(new Float32Array(16000), 16000)
    expect(a).toEqual({ loud: -90, silence: 1, zcr: 0, centroid: 0 })
  })

  it('1 kHz sinüs: yükseklik, sıfır geçiş, spektral merkez', () => {
    const a = audioFeatures(sine(1000, 0.5, 1), 16000)
    expect(a.loud).toBeCloseTo(20 * Math.log10(0.5 / Math.SQRT2), 0)
    expect(a.silence).toBe(0)
    expect(a.zcr).toBeCloseTo(2000 / 16000, 2)
    expect(Math.abs(a.centroid - 1000)).toBeLessThan(120)
    const high = audioFeatures(sine(4000, 0.5, 1), 16000)
    expect(high.centroid).toBeGreaterThan(a.centroid + 2000)
  })

  it('yarısı sessiz parça', () => {
    const pcm = new Float32Array(AUDIO_WINDOW * 20)
    pcm.set(sine(500, 0.3, (AUDIO_WINDOW * 10) / 16000))
    expect(audioFeatures(pcm, 16000).silence).toBeCloseTo(0.5, 2)
  })
})

/* ───────────── karma ve belirlenimcilik ───────────── */

describe('Türkçe katlama ve karma', () => {
  it('katlama ve sözcükler', () => {
    expect(foldTr('IŞIĞIN Çocuğu, İstanbul’da!')).toBe('isigin cocugu istanbul da')
    expect(wordsOf('Bu bir ejderha ve bölümün 3. dizisi')).toEqual(['ejderha'])
    expect(charGrams('ev')).toEqual(['#ev', 'ev#'])
  })

  it('karma, tohumlu sayılar ve izdüşüm belirlenimci', () => {
    expect(fnv1a('ejderha')).toBe(fnv1a('ejderha'))
    expect(fnv1a('ejderha', 1)).not.toBe(fnv1a('ejderha', 2))
    const a = mulberry32(42)
    const b = mulberry32(42)
    expect([a(), a(), a()]).toEqual([b(), b(), b()])
    const m1 = projectionMatrix(50, 16, 7)
    const m2 = projectionMatrix(50, 16, 7)
    expect(Buffer.from(m1.buffer).equals(Buffer.from(m2.buffer))).toBe(true)
    const values = new Set(Array.from(m1, (x) => Math.round(x * 1000)))
    expect([...values].sort()).toEqual([-1732, 0, 1732])
  })
})

describe('taban kodlayıcı', () => {
  it('aynı girdi → bit bit aynı çıktı; sürüm sabitlerden türer', async () => {
    const inp = input(shotsFixture())
    const a = tabanEmbed(inp)
    const b = await createTabanProvider().embed(JSON.parse(JSON.stringify(inp)) as EmbeddingInput)
    expect(b).not.toBeNull()
    expect(Buffer.from(a.shots.buffer).equals(Buffer.from(b!.shots.buffer))).toBe(true)
    expect(Buffer.from(a.pooled.buffer).equals(Buffer.from(b!.pooled.buffer))).toBe(true)
    expect(TABAN_VERSION).toMatch(/^taban-2\.[0-9a-f]{8}$/)
    expect(checkOutput(a, inp, TABAN_DIMS)).toBeNull()
    expect(a.dims).toBe(TABAN_DIMS)
  })

  it('altın değer: başka makinede de aynı baytlar (aşkın işlev kullanılmaz)', () => {
    const out = tabanEmbed(input(shotsFixture()))
    const digest = createHash('sha256')
      .update(Buffer.from(out.shots.buffer))
      .update(Buffer.from(out.pooled.buffer))
      .digest('hex')
    expect(digest.slice(0, 16)).toBe(GOLDEN)
  })

  it('tüm çekim ve havuz vektörleri birim uzunlukta', () => {
    const out = tabanEmbed(input(shotsFixture()))
    for (let i = 0; i < 6; i++) expect(norm(row(out.shots, i))).toBeCloseTo(1, 5)
    expect(norm(out.pooled)).toBeCloseTo(1, 5)
  })

  it('genel bağlam her çekimi ve havuzu değiştirir: farklı etiket → farklı vektör', () => {
    const shots = shotsFixture()
    const plain = tabanEmbed(input(shots))
    const tagged = tabanEmbed(
      input(shots, ctx({}, { basis: 'CONSENSUS', scales: { romantizm: 4 }, descriptors: ['romantik'] })),
    )
    for (let i = 0; i < shots.length; i++)
      expect(cosine(row(plain.shots, i), row(tagged.shots, i))).toBeLessThan(0.9999)
    expect(cosine(plain.pooled, tagged.pooled)).toBeLessThan(0.999)
    // yalnız bağlam bloğu değişir; görüntü/ses/metin blokları aynı kalır (bağlamlama öncesi aynı girdiler)
    const vis = (v: Float32Array) => Array.from(v.subarray(BLOCK_OFFSETS.VISUAL, BLOCK_OFFSETS.VISUAL + 4))
    expect(vis(row(plain.shots, 0)).map((x) => Math.sign(x))).toEqual(
      vis(row(tagged.shots, 0)).map((x) => Math.sign(x)),
    )
  })

  it('yakın etiketler → yakın vektörler (ölçekler termometre kodlu)', () => {
    const shots = shotsFixture()
    const at = (romantizm: number, siddet: number) =>
      tabanEmbed(input(shots, ctx({}, { basis: 'CONSENSUS', scales: { romantizm, siddet } }))).pooled
    const r4 = at(4, 1)
    const r5 = at(5, 1)
    const r0 = at(0, 1)
    const r4s5 = at(4, 5)
    expect(cosine(r4, r5)).toBeGreaterThan(cosine(r4, r0))
    expect(cosine(r4, at(3, 1))).toBeGreaterThan(cosine(r4, at(1, 1)))
    expect(cosine(r4, r5)).toBeGreaterThan(cosine(r4, r4s5))
    // yüz değerleri: ortak değer daha yakın
    const f = (mekan: string[]) => contextVector(ctx({}, { basis: 'CONSENSUS', facets: { mekan } }))
    expect(cosine(f(['uzay', 'gemi']), f(['uzay']))).toBeGreaterThan(cosine(f(['uzay', 'gemi']), f(['koy'])))
  })

  it('etiket yokken bağlam özet, tür, ruh hâli ve anahtar sözcükten gelir', () => {
    const base = contextVector(ctx())
    expect(norm(base)).toBeCloseTo(1, 6)
    expect(cosine(base, contextVector(ctx({ genres: ['belgesel'] })))).toBeLessThan(0.99)
    expect(cosine(base, contextVector(ctx({ moods: ['karanlik'] })))).toBeLessThan(0.99)
    expect(cosine(base, contextVector(ctx({ synopsis: 'Bir aşçı köyünde ekmek yapar.' })))).toBeLessThan(0.9)
    const empty = contextVector(ctx({ title: '', synopsis: '', genres: [], moods: [], keywords: [], type: 'MOVIE' }))
    expect(norm(empty)).toBeCloseTo(1, 6) // tür belirteci (MOVIE) kalır
  })

  it('havuz: dört kip varken her bloğun payı POOL_FUSION', () => {
    const out = tabanEmbed(input(shotsFixture()))
    const B = TABAN_PARAMS.BLOCKS
    const P = TABAN_PARAMS.POOL_FUSION
    expect(blockNorm2(out.pooled, BLOCK_OFFSETS.VISUAL, B.VISUAL)).toBeCloseTo(P.VISUAL, 4)
    expect(blockNorm2(out.pooled, BLOCK_OFFSETS.AUDIO, B.AUDIO)).toBeCloseTo(P.AUDIO, 4)
    expect(blockNorm2(out.pooled, BLOCK_OFFSETS.TEXT, B.TEXT)).toBeCloseTo(P.TEXT, 4)
    expect(blockNorm2(out.pooled, BLOCK_OFFSETS.CONTEXT, B.CONTEXT)).toBeCloseTo(P.CONTEXT, 4)
  })

  it('eksik kipin bloğu sıfır; yalnız metinli yapımda havuz = bağlam', () => {
    const textOnly = tabanEmbed(input([{ index: 0, startSec: 0, endSec: 100, visual: null, audio: null, text: '' }]))
    const B = TABAN_PARAMS.BLOCKS
    expect(blockNorm2(textOnly.pooled, BLOCK_OFFSETS.VISUAL, B.VISUAL)).toBe(0)
    expect(blockNorm2(textOnly.pooled, BLOCK_OFFSETS.CONTEXT, B.CONTEXT)).toBeCloseTo(1, 6)
    const c = contextVector(ctx())
    expect(dot(textOnly.pooled.subarray(BLOCK_OFFSETS.CONTEXT), c)).toBeCloseTo(1, 5)
  })

  it('bağlamlama: bir çekimin değişmesi ±2 komşuyu etkiler, daha uzağı etkilemez', () => {
    const a = shotsFixture()
    const b = shotsFixture()
    b[0] = { ...b[0]!, visual: VIS({ bright: 0.95, sat: 0.9, edges: 0.9 }) }
    const ea = tabanEmbed(input(a))
    const eb = tabanEmbed(input(b))
    expect(cosine(row(ea.shots, 1), row(eb.shots, 1))).toBeLessThan(0.99999)
    expect(cosine(row(ea.shots, 2), row(eb.shots, 2))).toBeLessThan(0.99999)
    expect(Buffer.from(row(ea.shots, 3).slice().buffer).equals(Buffer.from(row(eb.shots, 3).slice().buffer))).toBe(true)
  })

  it('bölüm özeti metin kipine girer', () => {
    const shots = shotsFixture().map((s) => ({ ...s, text: '' }))
    const a = tabanEmbed(input(shots, ctx(), 'Köyde ekmek yapımı anlatılıyor.'))
    const b = tabanEmbed(input(shots, ctx(), 'Uzay istasyonunda bir onarım.'))
    const B = TABAN_PARAMS.BLOCKS
    expect(blockNorm2(a.pooled, BLOCK_OFFSETS.TEXT, B.TEXT)).toBeGreaterThan(0)
    expect(cosine(a.pooled, b.pooled)).toBeLessThan(0.99)
  })
})

/* ───────────── en yakın k ve PCA ───────────── */

describe('en yakın k', () => {
  it('kaba kuvvet sıralamasıyla aynı; eşit puanda küçük anahtar önce', () => {
    const rnd = mulberry32(5)
    const dims = 8
    const n = 500
    const m = new Float32Array(n * dims)
    for (let i = 0; i < m.length; i++) m[i] = rnd() - 0.5
    const q = Float32Array.from({ length: dims }, () => rnd() - 0.5)
    const got = topK(m, dims, q, 10)
    const brute = Array.from({ length: n }, (_, r) => ({
      r,
      s: dot(m.subarray(r * dims, (r + 1) * dims), Float32Array.from(q)),
    }))
      .sort((a, b) => b.s - a.s || a.r - b.r)
      .slice(0, 10)
    expect(got.map((h) => h.row)).toEqual(brute.map((b) => b.r))

    const same = new Float32Array(5 * 2).fill(0.5)
    expect(topK(same, 2, [1, 1], 3).map((h) => h.row)).toEqual([0, 1, 2])
    expect(topK(same, 2, [1, 1], 3, { tieKey: (r) => -r }).map((h) => h.row)).toEqual([4, 3, 2])
    expect(topK(same, 2, [1, 1], 10, { skip: (r) => r % 2 === 0 }).map((h) => h.row)).toEqual([1, 3])
    expect(topK(same, 2, [1, 1], 0)).toEqual([])
  })
})

describe('PCA (kuvvet yinelemesi)', () => {
  it('belirlenimci ve baskın ekseni bulur', () => {
    const rnd = mulberry32(9)
    const dims = 6
    const n = 200
    const m = new Float32Array(n * dims)
    for (let r = 0; r < n; r++) {
      const t = rnd() * 10 - 5
      for (let d = 0; d < dims; d++) m[r * dims + d] = (d === 2 ? t : d === 4 ? t * 0.3 : 0) + (rnd() - 0.5) * 0.2
    }
    const a = pca2(m, dims)
    const b = pca2(m.slice(), dims)
    expect(Array.from(a.x)).toEqual(Array.from(b.x))
    expect(Array.from(a.y)).toEqual(Array.from(b.y))
    const varOf = (v: Float64Array) => v.reduce((s, x) => s + x * x, 0) / v.length
    expect(varOf(a.x)).toBeGreaterThan(10 * varOf(a.y))
    expect(a.variance[0]).toBeGreaterThan(a.variance[1])
  })
})

/* ───────────── http sağlayıcısı (yerel sahte sunucu) ───────────── */

describe('http sağlayıcısı', () => {
  let server: Server
  let url = ''
  let mode: 'ok' | 'wrongDims' | 'slow' | 'flaky' | 'badCount' = 'ok'
  let posts = 0
  let gets = 0
  let failuresLeft = 0
  const DIMS = 4

  beforeAll(async () => {
    server = createServer((req: IncomingMessage, res: ServerResponse) => {
      let body = ''
      req.on('data', (c: Buffer) => (body += c.toString()))
      req.on('end', () => {
        const send = (status: number, v: unknown) => {
          res.writeHead(status, { 'content-type': 'application/json' })
          res.end(JSON.stringify(v))
        }
        if (req.method === 'GET') {
          gets++
          return send(200, { protocol: EMBEDDING_PROTOCOL, model: { id: 'sahte', version: '1', dims: DIMS } })
        }
        posts++
        const { input: inp } = JSON.parse(body) as { input: EmbeddingInput }
        const vec = (i: number) => [1, i, 0, 2]
        if (mode === 'slow') return setTimeout(() => send(200, {}), 500)
        if (mode === 'flaky' && failuresLeft-- > 0) return send(503, { error: 'meşgul' })
        if (mode === 'wrongDims')
          return send(200, { videoId: inp.videoId, shots: inp.shots.map(() => [1, 2]), pooled: [1, 2] })
        if (mode === 'badCount') return send(200, { videoId: inp.videoId, shots: [], pooled: vec(0) })
        send(200, { videoId: inp.videoId, shots: inp.shots.map((_, i) => vec(i)), pooled: vec(9) })
      })
    })
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/embed`
  })
  afterAll(() => new Promise<void>((r) => server.close(() => r())))

  const inp = () => input(shotsFixture(3))

  it('başarı: model bilgisi, boyut, birim uzunluk', async () => {
    mode = 'ok'
    const p = createHttpProvider({ url, backoffMs: 1 })
    await p.init()
    expect(p.version).toBe('http:sahte@1')
    expect(p.dims).toBe(DIMS)
    const out = await p.embed(inp())
    expect(out!.shots).toHaveLength(3 * DIMS)
    expect(norm(out!.shots.subarray(0, DIMS))).toBeCloseTo(1, 5)
    expect(norm(out!.pooled)).toBeCloseTo(1, 5)
  })

  it('yanlış boyut ve yanlış sayı yeniden denenmeden reddedilir', async () => {
    const p = createHttpProvider({ url, backoffMs: 1 })
    await p.init()
    for (const m of ['wrongDims', 'badCount'] as const) {
      mode = m
      const before = posts
      await expect(p.embed(inp())).rejects.toBeInstanceOf(EmbeddingHttpError)
      expect(posts - before).toBe(1)
    }
  })

  it('zaman aşımı: yeniden dener, sonunda hata', async () => {
    mode = 'slow'
    const p = createHttpProvider({ url, timeoutMs: 80, retries: 2, backoffMs: 1 })
    await p.init()
    const before = posts
    await expect(p.embed(inp())).rejects.toThrow(/yanıt vermedi/)
    expect(posts - before).toBe(3)
  })

  it('geçici 503 sonrası yeniden denemeyle başarı', async () => {
    mode = 'flaky'
    failuresLeft = 2
    const p = createHttpProvider({ url, retries: 2, backoffMs: 1 })
    const before = posts
    const out = await p.embed(inp())
    expect(out).not.toBeNull()
    expect(posts - before).toBe(3)
    expect(gets).toBeGreaterThan(0)
  })

  it('bağlanamayan sunucu: anlaşılır hata', async () => {
    const p = createHttpProvider({ url: 'http://127.0.0.1:9/yok', retries: 0, timeoutMs: 500 })
    await expect(p.init()).rejects.toThrow(/bağlanılamadı|yanıt vermedi/)
  })
})

/* ───────────── dosya sağlayıcısı ───────────── */

describe('dosya sağlayıcısı', () => {
  const dir = mkdtempSync(join(tmpdir(), 'tvplus-dosya-'))
  const importDir = join(dir, 'embeddings', 'import')
  mkdirSync(importDir, { recursive: true })

  it('içe aktarır; eksik yaprak null; çekim sayısı uyuşmazsa hata; bozuk satır raporlanır', async () => {
    writeFileSync(
      join(importDir, 'a.jsonl'),
      [
        JSON.stringify({ kind: 'model', id: 'gercek', version: '7', dims: 3 }),
        JSON.stringify({
          kind: 'video',
          videoId: 10,
          shots: [
            [1, 0, 0],
            [0, 2, 0],
            [0, 0, 3],
          ],
        }),
        'bozuk satır',
        JSON.stringify({ kind: 'video', videoId: 11, shots: [[1, 2]] }),
      ].join('\n'),
    )
    const p = createDosyaProvider(dir)
    await p.init()
    expect(p.dims).toBe(3)
    expect(p.version).toMatch(/^dosya:gercek@7#[0-9a-f]{12}$/)
    expect(p.summary()!.rejected.map((r) => r.where)).toEqual(['a.jsonl:3', 'a.jsonl:4'])
    const out = await p.embed(input(shotsFixture(3)))
    expect(out!.shots[4]).toBeCloseTo(1, 6) // ikinci satır birim uzunlukta
    expect(norm(out!.pooled)).toBeCloseTo(1, 6)
    expect(await p.embed({ ...input(shotsFixture(3)), videoId: 99 })).toBeNull()
    await expect(p.embed(input(shotsFixture(2)))).rejects.toThrow(/3 çekim vektörü/)
  })

  it('dosyalar arasında boyut farklıysa reddeder', () => {
    writeFileSync(join(importDir, 'b.jsonl'), JSON.stringify({ kind: 'model', id: 'x', version: '1', dims: 5 }))
    expect(() => readImportDir(importDir)).toThrow(/dims 5/)
  })

  it('model satırı yoksa açıklayıcı hata', async () => {
    await expect(createDosyaProvider(mkdtempSync(join(tmpdir(), 'tvplus-bos-'))).init()).rejects.toThrow(/vektör yok/)
  })
})

/** tabanEmbed(input(shotsFixture())) çıktısının sha256 özetinin ilk 16 hanesi (sabitler değişince güncellenir). */
const GOLDEN = '53f598750b4ff025'
