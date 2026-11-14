/**
 * Gömme servisi: çekim çözümlemesi + genel bağlam → sağlayıcı → çekim ve başlık vektörleri → benzerlik, izdüşüm.
 *
 * - Kurulum arka planda yürür (`ready()` bitene kadar false); olay döngüsünü tıkamamak için yapraklar arasında verim.
 * - Önbellek: <dataDir>/embeddings/cache/<sağlayıcı>/<videoId>.json — anahtar (sağlayıcı sürümü, girdi özeti). Girdi
 *   özeti çekim dosyasını, katalog metnini ve GEÇERLİ ETİKETLERİ kapsar: `tagging.revision()` değişince kurulum yeniden
 *   tetiklenir, ama yalnız etiketi (ya da içeriği) değişen yapraklar yeniden kodlanır; kalanlar önbellekten gelir.
 * - Dizin: tüm çekim vektörleri tek bitişik Float32 matriste, başlık vektörleri ayrı bir matriste (dizi = bölüm
 *   vektörlerinin ortalaması). En yakın k: matris üzerinde doğrusal tarama (bkz. vectors.topK).
 */
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import sharp from 'sharp'
import type {
  EffectiveTags,
  EmbeddingInfo,
  EmbeddingModality,
  NeighborShot,
  NeighborTitle,
  ProjectionPoint,
  ShotSummary,
} from '../../../../shared/intelligence'
import { SHOTS_DIR, type SpriteInfo } from '../../../../shared/shots-schema'
import { ROUTES } from '../../../../shared/constants'
import type { EmbeddingService, TaggingService } from '../../kernel/intelligence'
import type { CatalogService } from '../../kernel/services'
import {
  checkOutput,
  type EmbeddingInput,
  type EmbeddingOutput,
  type EmbeddingProvider,
  type ShotMethod,
} from './provider'
import { buildInput, embeddablePlayables, loadShotIndex, stableJson, type VideoShots } from './shots'
import { normalize, pca2, topK } from './vectors'

export const CACHE_FORMAT = 1
/** Kurulumda kaç yaprakta bir olay döngüsüne verim verilir. */
export const YIELD_EVERY = 4
/** Bellekte tutulan kırpılmış anahtar kare sayısı. */
export const KEYFRAME_CACHE_SIZE = 600
export const KEYFRAME_QUALITY = 82

export interface EmbeddingDeps {
  dataDir: string
  contentDir: string
  catalog: () => CatalogService
  /** Etiketleme servisi (yoksa ya da fırlatırsa bağlam etiketsiz kurulur) */
  tagging: () => TaggingService | null
  provider: EmbeddingProvider
  log: { info: (msg: string) => void; warn: (msg: string) => void }
  /**
   * false (testler): ilk kurulum yalnız whenReady / rebuild / REST uçlarıyla başlar; başka servislerin ready() ya da
   * similarTitles() çağrıları kurulum başlatmaz (başka alanların testleri gömme kurulumunu beklemesin).
   * Kurulmuş bir dizin varken etiket değişikliği her durumda arka planda yeniden kurulumu tetikler.
   */
  autoStart: boolean
}

export interface BuildStats {
  startedAt: string
  ms: number
  /** Önbellekten gelen / yeniden kodlanan / sağlayıcıda olmayan yaprak */
  reused: number
  computed: number
  skipped: number
  failed: { videoId: number; reason: string }[]
  tagRevision: number
  /** Kurulum dizini değiştirdi mi (değişmediyse revision() artmaz) */
  changed: boolean
  error: string | null
}

interface ShotMeta {
  startSec: number
  endSec: number
  text: string
  hasAudio: boolean
  /** paftadaki hücre (yoksa null) */
  cell: number | null
}

interface VideoEntry {
  videoId: number
  titleId: number
  method: ShotMethod
  /** Çekim matrisindeki ilk satır */
  offset: number
  count: number
  shots: ShotMeta[]
  sprite: SpriteInfo | null
}

interface Index {
  dims: number
  builtAt: string
  tagRevision: number
  modalities: EmbeddingModality[]
  videos: Map<number, VideoEntry>
  /** satır → yaprak (videos dizisindeki sıra) */
  shotVideo: Int32Array
  shotMatrix: Float32Array
  videoOrder: VideoEntry[]
  titleIds: number[]
  titleRow: Map<number, number>
  titleMatrix: Float32Array
  sceneDetected: number
  /** Yedekli sağlayıcıda: asıl modelden gelen / yedeğe düşen yaprak sayısı (yoksa null) */
  coverage: { model: number; fallback: number } | null
  projection: ProjectionPoint[] | null
}

/** Kurulumda yaprak başına tutulan özet (tam girdi tutulmaz: 500 bin çekimde yüzlerce MB eder). */
interface BuiltVideo {
  videoId: number
  titleId: number
  method: ShotMethod
  shots: ShotMeta[]
  sprite: SpriteInfo | null
  out: EmbeddingOutput
}

const MODALITY_ORDER: EmbeddingModality[] = ['VISUAL', 'AUDIO', 'TEXT', 'CONTEXT']

function builtVideo(input: EmbeddingInput, out: EmbeddingOutput, rec: VideoShots | null): BuiltVideo {
  return {
    videoId: input.videoId,
    titleId: input.titleId,
    method: input.method,
    shots: input.shots.map((s, i) => ({
      startSec: s.startSec,
      endSec: s.endSec,
      text: s.text,
      hasAudio: s.audio !== null,
      cell: rec?.shots[i]?.k ?? null,
    })),
    sprite: rec?.sprite ?? null,
    out,
  }
}

interface CacheEntry {
  version: string
  hash: string
  dims: number
  out: EmbeddingOutput
}

export interface EmbeddingServiceImpl extends EmbeddingService {
  /** Vektörler hazır ve güncel olana dek bekler (gerekirse kurulumu başlatır). */
  whenReady(): Promise<void>
  /** Kurulumu yeniden çalıştırır (önbellek geçerliyse yalnız değişen yapraklar kodlanır). */
  rebuild(): Promise<BuildStats>
  lastBuild(): BuildStats | null
  /** Yedekli sağlayıcıda (depodaki model + taban) kapsama; değilse null */
  coverage(): { model: number; fallback: number } | null
  /** Başlık komşuları; başlığın vektörü yoksa null */
  titleNeighbors(titleId: number, limit: number): NeighborTitle[] | null
  shots(videoId: number): ShotSummary[] | null
  shotNeighbors(videoId: number, index: number, limit: number, sameVideo: boolean): NeighborShot[] | null
  projection(): ProjectionPoint[]
  /** Çekimin anahtar karesi (paftadan kırpılmış JPEG); yoksa null */
  keyframe(videoId: number, index: number): Promise<Buffer | null>
  /** Vektörü olan yapraklar (katalog sırasıyla) */
  videoIds(): number[]
  /** Bir yaprağın çekim vektörleri (test ve dışa aktarım için; satır düzenli) */
  videoVectors(videoId: number): { shots: Float32Array; count: number; pooled: Float32Array } | null
  /** Arka plan kurulumunu başlatır (açılışta) */
  start(): void
  close(): void
}

const yieldNow = () => new Promise<void>((r) => setImmediate(r))
const b64 = (a: Float32Array) => Buffer.from(a.buffer, a.byteOffset, a.byteLength).toString('base64')
const fromB64 = (s: string) => {
  const b = Buffer.from(s, 'base64')
  const copy = new Uint8Array(b.length)
  copy.set(b)
  return new Float32Array(copy.buffer, 0, Math.floor(b.length / 4))
}
const round4 = (x: number) => Math.round(x * 10000) / 10000

export const keyframeUrl = (videoId: number, index: number) =>
  `${ROUTES.STUDIO}/embeddings/videos/${videoId}/shots/${index}/keyframe.jpg`

export function createEmbeddingService(deps: EmbeddingDeps): EmbeddingServiceImpl {
  const provider = deps.provider
  const cacheDir = join(deps.dataDir, 'embeddings', 'cache', provider.id)
  const memCache = new Map<number, CacheEntry>()
  let index: Index | null = null
  let revision = 0
  let last: BuildStats | null = null
  let running: Promise<BuildStats> | null = null
  let queued: Promise<BuildStats> | null = null
  let providerReady = false
  let closed = false
  const keyframes = new Map<string, Buffer>()

  const tagRevision = () => {
    try {
      return deps.tagging()?.revision() ?? 0
    } catch {
      return 0
    }
  }
  const effective = (titleId: number): EffectiveTags | null => {
    try {
      return deps.tagging()?.effective(titleId) ?? null
    } catch (e) {
      deps.log.warn(`gömme: etiketler okunamadı (${titleId}): ${(e as Error).message}`)
      return null
    }
  }

  function readCache(videoId: number): CacheEntry | null {
    const mem = memCache.get(videoId)
    if (mem) return mem
    const file = join(cacheDir, `${videoId}.json`)
    if (!existsSync(file)) return null
    try {
      const raw = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>
      if (raw.format !== CACHE_FORMAT) return null
      const dims = Number(raw.dims)
      const entry: CacheEntry = {
        version: String(raw.version),
        hash: String(raw.hash),
        dims,
        out: { dims, shots: fromB64(String(raw.shots)), pooled: fromB64(String(raw.pooled)) },
      }
      memCache.set(videoId, entry)
      return entry
    } catch {
      return null
    }
  }

  async function writeCache(videoId: number, entry: CacheEntry): Promise<void> {
    memCache.set(videoId, entry)
    try {
      mkdirSync(cacheDir, { recursive: true })
      const file = join(cacheDir, `${videoId}.json`)
      const tmp = `${file}.${process.pid}.tmp`
      await writeFile(
        tmp,
        JSON.stringify({
          format: CACHE_FORMAT,
          version: entry.version,
          hash: entry.hash,
          dims: entry.dims,
          shots: b64(entry.out.shots),
          pooled: b64(entry.out.pooled),
        }),
      )
      await rename(tmp, file)
    } catch (e) {
      deps.log.warn(`gömme: önbellek yazılamadı (${videoId}): ${(e as Error).message}`)
    }
  }

  async function doBuild(): Promise<BuildStats> {
    const t0 = Date.now()
    const stats: BuildStats = {
      startedAt: new Date(t0).toISOString(),
      ms: 0,
      reused: 0,
      computed: 0,
      skipped: 0,
      failed: [],
      tagRevision: tagRevision(),
      changed: false,
      error: null,
    }
    try {
      if (!providerReady) {
        await provider.init()
        providerReady = true
      }
      const catalog = deps.catalog()
      const shotIndex = loadShotIndex(deps.contentDir)
      for (const p of shotIndex.problems) deps.log.warn(`gömme: ${p.file} okunamadı: ${p.reason}`)
      const items: BuiltVideo[] = []
      const modalities = new Set<EmbeddingModality>()
      const coverage = provider.covers ? { model: 0, fallback: 0 } : null
      let n = 0
      for (const title of catalog.allTitles()) {
        const tags = effective(title.videoId)
        for (const p of embeddablePlayables(catalog, title)) {
          if (closed) throw new Error('kapatıldı')
          const rec = shotIndex.videos.get(p.videoId) ?? null
          const input = buildInput(catalog, title, p, tags, rec)
          const hash = createHash('sha256').update(stableJson(input)).digest('hex').slice(0, 32)
          const cached = readCache(p.videoId)
          let out: EmbeddingOutput | null = null
          if (cached && cached.version === provider.version && cached.hash === hash && cached.dims === provider.dims) {
            out = cached.out
            stats.reused++
          } else {
            try {
              out = await provider.embed(input)
              if (!out) {
                stats.skipped++
                continue
              }
              const problem = checkOutput(out, input, provider.dims)
              if (problem) throw new Error(problem)
              stats.computed++
              await writeCache(p.videoId, { version: provider.version, hash, dims: provider.dims, out })
            } catch (e) {
              stats.failed.push({ videoId: p.videoId, reason: (e as Error).message })
              continue
            }
          }
          for (const m of provider.modalities([input])) modalities.add(m)
          if (coverage && provider.covers) {
            if (provider.covers(input)) coverage.model++
            else coverage.fallback++
          }
          items.push(builtVideo(input, out, rec))
          if (++n % YIELD_EVERY === 0) await yieldNow()
        }
      }
      const prev = index
      index = assemble(
        items,
        stats.tagRevision,
        MODALITY_ORDER.filter((m) => modalities.has(m)),
      )
      index.coverage = coverage
      if (coverage)
        deps.log.info(
          `gömme: ${provider.modelVersion ?? provider.version} — ${coverage.model} yaprak modelden, ` +
            `${coverage.fallback} yaprak taban yedeğinden`,
        )
      stats.changed =
        prev === null ||
        stats.computed > 0 ||
        prev.videoOrder.length !== index.videoOrder.length ||
        prev.dims !== index.dims
      if (stats.changed) revision++
      keyframes.clear()
    } catch (e) {
      stats.error = (e as Error).message
      deps.log.warn(`gömme: kurulum başarısız: ${stats.error}`)
    }
    stats.ms = Date.now() - t0
    last = stats
    if (stats.failed.length)
      deps.log.warn(
        `gömme: ${stats.failed.length} yaprak kodlanamadı (ilk: ${stats.failed[0]!.videoId} — ${stats.failed[0]!.reason})`,
      )
    deps.log.info(
      `gömme: ${provider.id} ${provider.version} — ${stats.computed} kodlandı, ${stats.reused} önbellekten, ` +
        `${stats.skipped} atlandı, ${stats.failed.length} hata, ${stats.ms} ms`,
    )
    return stats
  }

  function assemble(items: BuiltVideo[], tagRev: number, modalities: EmbeddingModality[]): Index {
    const dims = provider.dims
    const totalShots = items.reduce((s, it) => s + it.shots.length, 0)
    const shotMatrix = new Float32Array(totalShots * dims)
    const shotVideo = new Int32Array(totalShots)
    const videos = new Map<number, VideoEntry>()
    const videoOrder: VideoEntry[] = []
    const pooledOf = new Map<number, Float32Array>()
    let offset = 0
    let sceneDetected = 0
    for (const it of items) {
      const count = it.shots.length
      shotMatrix.set(it.out.shots, offset * dims)
      shotVideo.fill(videoOrder.length, offset, offset + count)
      const entry: VideoEntry = {
        videoId: it.videoId,
        titleId: it.titleId,
        method: it.method,
        offset,
        count,
        shots: it.shots,
        sprite: it.sprite,
      }
      // Bellek önbelleği artık bitişik matrisin görünümlerini tutar (kopya yok).
      const cached = memCache.get(entry.videoId)
      if (cached)
        cached.out = { dims, shots: shotMatrix.subarray(offset * dims, (offset + count) * dims), pooled: it.out.pooled }
      videos.set(entry.videoId, entry)
      videoOrder.push(entry)
      pooledOf.set(entry.videoId, it.out.pooled)
      if (entry.method === 'SCENE_DETECT') sceneDetected++
      offset += count
    }
    // Başlık vektörleri: film → kendi yaprağı; dizi → bölümlerin ortalaması (katalog sırasıyla)
    const byTitle = new Map<number, Float32Array[]>()
    for (const it of items) {
      const list = byTitle.get(it.titleId) ?? []
      list.push(pooledOf.get(it.videoId)!)
      byTitle.set(it.titleId, list)
    }
    const titleIds = [...byTitle.keys()]
    const titleMatrix = new Float32Array(titleIds.length * dims)
    const titleRow = new Map<number, number>()
    titleIds.forEach((id, row) => {
      const v = new Float64Array(dims)
      for (const p of byTitle.get(id)!) for (let d = 0; d < dims; d++) v[d]! += p[d]!
      normalize(v)
      titleMatrix.set(v, row * dims)
      titleRow.set(id, row)
    })
    return {
      dims,
      builtAt: new Date().toISOString(),
      tagRevision: tagRev,
      modalities,
      videos,
      shotVideo,
      shotMatrix,
      videoOrder,
      titleIds,
      titleRow,
      titleMatrix,
      sceneDetected,
      coverage: null,
      projection: null,
    }
  }

  function requestBuild(): Promise<BuildStats> {
    if (!running) {
      running = doBuild().finally(() => {
        running = null
      })
      return running
    }
    queued ??= running.then(() => {
      queued = null
      return requestBuild()
    })
    return queued
  }

  /** Etiketler değiştiyse (ya da hiç kurulmadıysa) arka planda kurulumu başlatır. */
  function refreshIfStale(): void {
    if (closed || running) return
    if (!index) {
      if (deps.autoStart) void requestBuild()
    } else if (index.tagRevision !== tagRevision()) void requestBuild()
  }

  const titleNeighbors = (titleId: number, limit: number): NeighborTitle[] | null => {
    refreshIfStale()
    const ix = index
    const row = ix?.titleRow.get(titleId)
    if (!ix || row === undefined) return null
    const q = ix.titleMatrix.subarray(row * ix.dims, (row + 1) * ix.dims)
    return topK(ix.titleMatrix, ix.dims, q, limit, {
      skip: (r) => r === row,
      tieKey: (r) => ix.titleIds[r]!,
    }).map((h) => ({ titleId: ix.titleIds[h.row]!, score: round4(h.score) }))
  }

  const service: EmbeddingServiceImpl = {
    info(): EmbeddingInfo {
      refreshIfStale()
      return {
        provider: provider.id,
        modelVersion: provider.modelVersion ?? provider.version,
        dims: index?.dims ?? provider.dims,
        titles: index?.titleIds.length ?? 0,
        shots: index ? index.shotVideo.length : 0,
        modalities: index?.modalities ?? [],
        builtAt: index?.builtAt ?? null,
        sceneDetected: index?.sceneDetected ?? 0,
      }
    },
    ready: () => {
      refreshIfStale()
      return index !== null
    },
    titleVector(titleId) {
      refreshIfStale()
      const row = index?.titleRow.get(titleId)
      if (!index || row === undefined) return null
      return index.titleMatrix.slice(row * index.dims, (row + 1) * index.dims)
    },
    similarTitles: (titleId, limit) => titleNeighbors(titleId, limit) ?? [],
    revision: () => revision,
    async whenReady() {
      if (running) await running
      if (!index || index.tagRevision !== tagRevision()) await requestBuild()
    },
    rebuild: () => requestBuild(),
    lastBuild: () => last,
    coverage: () => index?.coverage ?? null,
    titleNeighbors,
    shots(videoId) {
      refreshIfStale()
      const v = index?.videos.get(videoId)
      if (!v) return null
      return v.shots.map((s, i) => ({
        videoId,
        index: i,
        startSec: s.startSec,
        endSec: s.endSec,
        text: v.method === 'SCENE_DETECT' ? s.text : '',
        hasAudio: s.hasAudio,
        keyframeUrl: s.cell !== null && v.sprite ? keyframeUrl(videoId, i) : null,
      }))
    },
    shotNeighbors(videoId, shotIndex, limit, sameVideo) {
      refreshIfStale()
      const ix = index
      const v = ix?.videos.get(videoId)
      if (!ix || !v || shotIndex < 0 || shotIndex >= v.count) return null
      const row = v.offset + shotIndex
      const q = ix.shotMatrix.subarray(row * ix.dims, (row + 1) * ix.dims)
      return topK(ix.shotMatrix, ix.dims, q, limit, {
        // aynı videonun çekimleri bitişik satırlardır: aralık atlanır (sameVideo=true ise yalnız kendisi)
        skipRange: sameVideo ? [row, row + 1] : [v.offset, v.offset + v.count],
      }).map((h) => {
        const e = ix.videoOrder[ix.shotVideo[h.row]!]!
        const i = h.row - e.offset
        const s = e.shots[i]!
        return {
          videoId: e.videoId,
          titleId: e.titleId,
          index: i,
          startSec: s.startSec,
          endSec: s.endSec,
          score: round4(h.score),
          keyframeUrl: s.cell !== null && e.sprite ? keyframeUrl(e.videoId, i) : null,
        }
      })
    },
    projection() {
      refreshIfStale()
      const ix = index
      if (!ix) return []
      if (!ix.projection) {
        const { x, y } = pca2(ix.titleMatrix, ix.dims)
        ix.projection = ix.titleIds.map((titleId, r) => ({ titleId, x: round4(x[r]!), y: round4(y[r]!) }))
      }
      return ix.projection
    },
    async keyframe(videoId, shotIndex) {
      const v = index?.videos.get(videoId)
      const s = v?.shots[shotIndex]
      if (!v || !s || s.cell === null || !v.sprite) return null
      const key = `${videoId}:${shotIndex}`
      const hit = keyframes.get(key)
      if (hit) {
        keyframes.delete(key)
        keyframes.set(key, hit)
        return hit
      }
      const sp = v.sprite
      const file = join(deps.contentDir, SHOTS_DIR, sp.file)
      if (!existsSync(file) || s.cell >= sp.count) return null
      const body = await sharp(file)
        .extract({
          left: (s.cell % sp.cols) * sp.cellW,
          top: Math.floor(s.cell / sp.cols) * sp.cellH,
          width: sp.cellW,
          height: sp.cellH,
        })
        .jpeg({ quality: KEYFRAME_QUALITY })
        .toBuffer()
      keyframes.set(key, body)
      if (keyframes.size > KEYFRAME_CACHE_SIZE) keyframes.delete(keyframes.keys().next().value!)
      return body
    },
    videoIds: () => index?.videoOrder.map((v) => v.videoId) ?? [],
    videoVectors(videoId) {
      const v = index?.videos.get(videoId)
      const c = memCache.get(videoId)
      if (!index || !v || !c) return null
      return {
        shots: index.shotMatrix.slice(v.offset * index.dims, (v.offset + v.count) * index.dims),
        count: v.count,
        pooled: c.out.pooled,
      }
    },
    start() {
      if (!closed && !index && !running) void requestBuild()
    },
    close() {
      closed = true
    },
  }
  return service
}
