/**
 * Depoda gelen eğitilmiş vektörler (content/models/<model-id>/): TVP_EMBEDDING_PROVIDER verilmemişse kullanılır,
 * kapsanmayan yapraklar taban yedeğine düşer; açık seçim her zaman kazanır. İçerik klasörü geçici bir kopyadır.
 */
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import type { EmbeddingInfo, NeighborTitle } from '../../shared/intelligence'
import { zSceneDetectFile } from '../../shared/shots-schema'
import { embeddingsInternals } from '../src/services/embeddings/plugin'
import { findShippedModel } from '../src/services/embeddings/models'
import { TABAN_DIMS } from '../src/services/embeddings/taban'
import { cosine } from '../src/services/embeddings/vectors'
import { createTestApp } from './helpers'

const REAL_CONTENT = join(__dirname, '..', '..', 'content')
const SINTEL = 80010001
const TEARS = 80010002
const NOSFERATU = 80020003
const CALIGARI = 80020002
const B = '/api/studio/embeddings'

const shotCount = (id: number) =>
  zSceneDetectFile.parse(JSON.parse(readFileSync(join(REAL_CONTENT, 'shots', `${id}.json`), 'utf8'))).shots.length

interface Fixture {
  contentDir: string
  modelDir: string
}

/** Gerçek içeriğin kopyası + content/models/<id>/ (manifest + JSONL). */
function fixture(opts: {
  id?: string
  version?: string
  dims?: number
  builtAt?: string
  manifest?: Record<string, unknown>
  lines?: string[]
}): Fixture {
  const contentDir = mkdtempSync(join(tmpdir(), 'tvplus-models-'))
  // Gerçek içeriğin kopyası, ama depodaki modeller olmadan (yalnız bu testin modeli sınansın)
  cpSync(REAL_CONTENT, contentDir, { recursive: true, filter: (src) => !src.startsWith(join(REAL_CONTENT, 'models')) })
  const id = opts.id ?? 'deneme-model'
  const dims = opts.dims ?? 4
  const modelDir = join(contentDir, 'models', id)
  mkdirSync(modelDir, { recursive: true })
  writeFileSync(
    join(modelDir, 'manifest.json'),
    JSON.stringify({
      format: 'tvplus-embedding/1',
      id,
      version: opts.version ?? '1',
      dims,
      builtAt: opts.builtAt ?? '2026-11-20T10:00:00Z',
      modalities: ['VISUAL', 'AUDIO', 'TEXT', 'CONTEXT'],
      ...opts.manifest,
    }),
  )
  const rows = (n: number, base: number[]) => Array.from({ length: n }, (_, i) => [...base, i / n])
  const lines = opts.lines ?? [
    JSON.stringify({ kind: 'model', id, version: opts.version ?? '1', dims }),
    JSON.stringify({ kind: 'video', videoId: SINTEL, titleId: SINTEL, shots: rows(shotCount(SINTEL), [1, 0, 0]) }),
    JSON.stringify({ kind: 'video', videoId: TEARS, titleId: TEARS, shots: rows(shotCount(TEARS), [0.9, 0.2, 0]) }),
    // çekim sayısı uyuşmuyor → bu yaprak taban yedeğine düşmeli
    JSON.stringify({
      kind: 'video',
      videoId: NOSFERATU,
      titleId: NOSFERATU,
      shots: [
        [0, 0, 1, 0],
        [0, 1, 0, 0],
      ],
    }),
  ]
  writeFileSync(join(modelDir, 'vectors.jsonl'), lines.join('\n'))
  return { contentDir, modelDir }
}

describe('depodaki eğitilmiş vektörler', () => {
  const saved = process.env.TVP_EMBEDDING_PROVIDER
  beforeAll(() => {
    delete process.env.TVP_EMBEDDING_PROVIDER
  })
  afterEach(() => {
    if (saved === undefined) delete process.env.TVP_EMBEDDING_PROVIDER
    else process.env.TVP_EMBEDDING_PROVIDER = saved
    delete process.env.TVP_EMBEDDING_PROVIDER
  })

  it('sağlayıcı seçilmemişse modeli kullanır; kapsanmayanlar taban yedeğinde, iki aile ayrık', async () => {
    const fx = fixture({})
    const app = await createTestApp({ contentDir: fx.contentDir })
    try {
      const svc = embeddingsInternals(app)
      await svc.whenReady()
      const res = await app.inject({ method: 'GET', url: B })
      const info = res.json<EmbeddingInfo>()
      expect(info.provider).toBe('dosya')
      expect(info.modelVersion).toBe('deneme-model@1')
      expect(info.dims).toBe(4 + TABAN_DIMS)
      expect(res.headers['x-tvplus-embed-model-videos']).toBe('2')
      const total = svc.videoIds().length
      expect(res.headers['x-tvplus-embed-fallback-videos']).toBe(String(total - 2))
      expect(svc.coverage()).toEqual({ model: 2, fallback: total - 2 })
      // Sintel'in en yakını modelde Tears of Steel; taban ailesiyle kosinüs 0
      const nb = (await app.inject({ method: 'GET', url: `${B}/titles/${SINTEL}/neighbors?first=3` })).json<
        NeighborTitle[]
      >()
      expect(nb[0]!.titleId).toBe(TEARS)
      expect(nb[0]!.score).toBeGreaterThan(0.9)
      expect(nb[1]!.score).toBe(0)
      expect(cosine(svc.titleVector(SINTEL)!, svc.titleVector(NOSFERATU)!)).toBe(0)
      // Nosferatu (sayı uyuşmadı) ve kapsanmayan başlıklar taban uzayında birbirine benzer
      const nos = (await app.inject({ method: 'GET', url: `${B}/titles/${NOSFERATU}/neighbors?first=1` })).json<
        NeighborTitle[]
      >()
      expect(nos[0]!.titleId).toBe(CALIGARI)
      // çekim komşuları da kendi ailesinde
      const shots = (await app.inject({ method: 'GET', url: `${B}/videos/${SINTEL}/shots/5/neighbors?first=3` })).json<
        { videoId: number }[]
      >()
      expect(shots.every((s) => s.videoId === TEARS)).toBe(true)
    } finally {
      await app.close()
    }
  })

  it('açık TVP_EMBEDDING_PROVIDER=taban her zaman kazanır', async () => {
    const fx = fixture({})
    process.env.TVP_EMBEDDING_PROVIDER = 'taban'
    const app = await createTestApp({ contentDir: fx.contentDir })
    try {
      const res = await app.inject({ method: 'POST', url: `${B}/rebuild` })
      const info = res.json<EmbeddingInfo>()
      expect(info.provider).toBe('taban')
      expect(info.dims).toBe(TABAN_DIMS)
      expect(embeddingsInternals(app).coverage()).toBeNull()
    } finally {
      await app.close()
    }
  })

  it('geçersiz manifest yok sayılır (taban); en yeni geçerli model seçilir', () => {
    const bad = fixture({ manifest: { dims: 8 } }) // JSONL'deki dims 4 ile uyuşmuyor
    const scan = findShippedModel(bad.contentDir)
    expect(scan.model).toBeNull()
    expect(scan.problems[0]!.reason).toMatch(/uyuşmuyor/)

    const fx = fixture({ id: 'eski', builtAt: '2026-01-01T00:00:00Z' })
    const newer = join(fx.contentDir, 'models', 'yeni')
    mkdirSync(newer)
    writeFileSync(
      join(newer, 'manifest.json'),
      JSON.stringify({
        format: 'tvplus-embedding/1',
        id: 'yeni',
        version: '2',
        dims: 2,
        builtAt: '2026-12-01T00:00:00Z',
      }),
    )
    writeFileSync(
      join(newer, 'v.jsonl'),
      [
        JSON.stringify({ kind: 'model', id: 'yeni', version: '2', dims: 2 }),
        JSON.stringify({
          kind: 'video',
          videoId: SINTEL,
          shots: Array.from({ length: shotCount(SINTEL) }, () => [1, 0]),
        }),
      ].join('\n'),
    )
    const two = findShippedModel(fx.contentDir)
    expect(two.model!.manifest.id).toBe('yeni')
    expect(two.problems).toEqual([])

    // klasör adı ≠ id, eksik alan
    const wrong = fixture({ id: 'a', manifest: { id: 'b' } })
    expect(findShippedModel(wrong.contentDir).problems[0]!.reason).toMatch(/klasör adıyla/)
    const missing = fixture({ manifest: { builtAt: 'dün' } })
    expect(findShippedModel(missing.contentDir).problems[0]!.reason).toMatch(/builtAt/)
  })

  it('geçersiz modelle açılış: uyarı verir, taban kullanılır', async () => {
    const fx = fixture({ manifest: { format: 'baska/2' } })
    const app = await createTestApp({ contentDir: fx.contentDir })
    try {
      const info = (await app.inject({ method: 'POST', url: `${B}/rebuild` })).json<EmbeddingInfo>()
      expect(info.provider).toBe('taban')
    } finally {
      await app.close()
    }
  })
})
