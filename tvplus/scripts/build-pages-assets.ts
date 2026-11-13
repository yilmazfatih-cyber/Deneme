/**
 * Durağan barındırma (GitHub Pages) için görselleri önceden üretir: `npx tsx scripts/build-pages-assets.ts [--out <klasör>]
 * [--concurrency 3] [--force] [--dry]`.
 *
 * Sunucu kipinde görseller istek anında sharp ile çizilir (/img/v1/…?r=imza). Durağan kipte sunucu yoktur ve sorgu dizgisi
 * çeşit seçemez; bu yüzden uygulamanın başvurabileceği HER çeşit burada, gerçek görsel hattıyla (render/pipeline) düz
 * dosya olarak yazılır. Yollar site yollarıdır (kök = `tvplus/pages-assets/`, Pages'te sitenin kökü):
 *   img/<tip>/<G>x<Y>/<varlık>.webp                               katalog, kanal, avatar, program görselleri
 *   subtitles/<dosya>                                              content/subtitles altındaki yerel altyazılar
 *   api/studio/embeddings/videos/<id>/shots/<i>/keyframe.jpg       stüdyo çekim ana kareleri (paftadan kırpılır)
 * Çeşitler ve adres düzeni `server/src/kernel/imageUrls.ts` (STATIC_WIDTHS, staticArtworkPath) ile birebir aynıdır.
 *
 * Yinelenebilir: var olan dosya yeniden üretilmez (--force hariç). Kaynağı indirilemeyip yedek kapakla yazılanlar
 * `img/.yedek.json` içinde tutulur ve sonraki çalıştırmada yeniden denenir. Uzak kaynaklar yalnız görsel adresleridir
 * (YouTube için yalnız i.ytimg.com küçük resimleri; youtube.com sayfaları asla istenmez), düşük eşzamanlılıkla ve
 * istekler arası bekleme ile alınır; hata olursa atlanır ve raporlanır. Kaynak önbelleği: .data/pages-build.
 */
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs'
import { writeFile, rename } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import sharp from 'sharp'
import { EnvHttpProxyAgent, fetch } from 'undici'
import { SHOTS_DIR } from '../shared/shots-schema'
import { airingEntityId, channelEntityId, collectionEntityId, videoEntityId } from '../shared/tctx'
import { buildApp } from '../server/src/app'
import type { ArtworkSource } from '../server/src/kernel/services'
import { STATIC_WIDTHS, normalizeSize, staticArtworkPath, type ArtworkTypeName } from '../server/src/kernel/imageUrls'
import { KEYFRAME_QUALITY } from '../server/src/services/embeddings/service'
import { loadShotIndex } from '../server/src/services/embeddings/shots'
import { AVATAR_KEYS } from '../server/src/services/identity/avatars'
import { createImagePipeline } from '../server/src/services/image/pipeline'
import { imageFetcher, type SourceFetcher } from '../server/src/services/image/source'
import { PAGES_ASSETS_DIR, STATIC_SUBTITLES_DIR, staticAliasOf } from '../server/src/services/image/staticAssets'
import { isMain, sleep } from './lib/net'

const ROOT = resolve(import.meta.dirname, '..')
const VIDEO_TYPES: ArtworkTypeName[] = ['BOXART', 'STORY_ART', 'BILLBOARD', 'TITLE_LOGO', 'EPISODE_STILL']
const COLLECTION_TYPES: ArtworkTypeName[] = ['STORY_ART', 'BOXART']
const FALLBACK_FILE = 'img/.yedek.json'
/** Uzak isteklerde kullanılan genel kullanıcı ajanı (kişisel bilgi içermez). */
const USER_AGENT = 'Mozilla/5.0 (compatible; TVplus-PagesBuild/1.0)'
/** İzin verilen görsel kaynağı kökenleri; youtube.com sayfaları bilerek yok. */
const ALLOWED_HOSTS = [/^i\.ytimg\.com$/, /^i[0-9]\.ytimg\.com$/]
const MIN_GAP_MS = 250

interface Options {
  out: string
  concurrency: number
  force: boolean
  dry: boolean
}

interface Job {
  path: string
  type: ArtworkTypeName
  entityId: string
  width: number
  height: number
  source: () => ArtworkSource | null
}

function parseArgs(argv: string[]): Options {
  const o: Options = { out: join(ROOT, PAGES_ASSETS_DIR), concurrency: 3, force: false, dry: false }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--out') o.out = resolve(argv[++i] ?? o.out)
    else if (a === '--concurrency') o.concurrency = Math.max(1, Math.min(6, Number(argv[++i]) || 3))
    else if (a === '--force') o.force = true
    else if (a === '--dry') o.dry = true
  }
  return o
}

/** Nazik uzak okuyucu: yalnız izinli kökenler, en çok 2 eşzamanlı istek, istekler arası en az 250 ms. */
function politeFetcher(log: (s: string) => void): SourceFetcher {
  const agent = new EnvHttpProxyAgent()
  let active = 0
  let last = 0
  const waiters: (() => void)[] = []
  const acquire = async () => {
    while (active >= 2) await new Promise<void>((r) => waiters.push(r))
    active++
    const gap = last + MIN_GAP_MS - Date.now()
    last = Math.max(Date.now(), last + MIN_GAP_MS)
    if (gap > 0) await sleep(gap)
  }
  const release = () => {
    active--
    waiters.shift()?.()
  }
  return async (url, timeoutMs) => {
    const host = new URL(url).hostname
    if (!ALLOWED_HOSTS.some((re) => re.test(host))) {
      log(`  atlandı (izinsiz köken): ${host}`)
      throw new Error(`İzinsiz köken: ${host}`)
    }
    await acquire()
    try {
      const res = await fetch(url, {
        dispatcher: agent,
        signal: AbortSignal.timeout(timeoutMs),
        headers: { accept: 'image/avif,image/webp,image/png,image/jpeg,image/*;q=0.8', 'user-agent': USER_AGENT },
      })
      const body = Buffer.from(await res.arrayBuffer())
      return { status: res.status, contentType: res.headers.get('content-type'), body }
    } finally {
      release()
    }
  }
}

async function writeAtomic(file: string, body: Buffer): Promise<void> {
  mkdirSync(dirname(file), { recursive: true })
  const tmp = `${file}.${process.pid}.tmp`
  await writeFile(tmp, body)
  await rename(tmp, file)
}

function readJson<T>(file: string, fallback: T): T {
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as T
  } catch {
    return fallback
  }
}

function dirSize(dir: string): { files: number; bytes: number } {
  let files = 0
  let bytes = 0
  if (!existsSync(dir)) return { files, bytes }
  for (const name of readdirSync(dir, { recursive: true, encoding: 'utf8' })) {
    const p = join(dir, name)
    const st = statSync(p)
    if (st.isFile() && !name.endsWith('.json')) {
      files++
      bytes += st.size
    }
  }
  return { files, bytes }
}

const mb = (b: number) => `${(b / 1024 / 1024).toFixed(1)} MB`

export async function buildPagesAssets(opts: Options): Promise<{ missing: string[]; fallbacks: string[] }> {
  const t0 = Date.now()
  const log = (s: string) => process.stdout.write(`${s}\n`)
  log(`TV+ durağan görseller → ${opts.out}`)

  // Katalog, EPG ve kimlik servisleri için uygulama örneği (ağsız, diske yazmaz, dinlemez)
  const tmpData = mkdtempSync(join(tmpdir(), 'tvp-pages-'))
  const app = await buildApp({
    dataDir: tmpData,
    isTest: true,
    offline: true,
    logLevel: 'silent',
    secret: 'pages-build',
    sampleViewing: false,
    staticHost: false,
  })
  await app.ready()
  const { catalog, epg } = app.services
  const alias = staticAliasOf(app)

  const jobs = new Map<string, Job>()
  const add = (type: ArtworkTypeName, entityId: string, source: () => ArtworkSource | null) => {
    for (const w of STATIC_WIDTHS[type]) {
      const { width, height } = normalizeSize(type, w)
      const path = staticArtworkPath(type, entityId, width, height)
      if (!jobs.has(path)) jobs.set(path, { path, type, entityId, width, height, source })
    }
  }

  // 1) Videolar: başlıklar, bölümler, oynatılabilir yapraklar
  const videoIds = new Set<number>()
  for (const t of catalog.allTitles()) {
    videoIds.add(t.videoId)
    for (const id of catalog.episodeIds(t.videoId)) videoIds.add(id)
    for (const p of catalog.listPlayables(t.videoId)) videoIds.add(p.videoId)
  }
  for (const id of videoIds) {
    const eid = videoEntityId(id)
    for (const type of VIDEO_TYPES) add(type, eid, () => catalog.getArtworkSource(eid, type))
  }
  // 2) Koleksiyonlar
  for (const c of catalog.allCollections()) {
    const eid = collectionEntityId(c.collectionId)
    for (const type of COLLECTION_TYPES) add(type, eid, () => catalog.getArtworkSource(eid, type))
  }
  // 3) Kanal logoları
  for (const ch of catalog.listChannels()) {
    const eid = channelEntityId(ch.channelId)
    add('CHANNEL_LOGO', eid, () => catalog.getArtworkSource(eid, 'CHANNEL_LOGO'))
  }
  // 4) Avatarlar (profil görselleri durağan kipte Avatar:<anahtar> dosyasıdır)
  for (const key of AVATAR_KEYS) {
    const eid = `Avatar:${key}`
    add('AVATAR', eid, () => catalog.getArtworkSource(eid, 'AVATAR'))
  }
  // 5) Videosuz yayınlar (program adı + kanal). EPG şablonları her gün yinelenir; birkaç günlük pencere hepsini kapsar.
  const now = epg.now().getTime()
  const from = new Date(now - 2 * 86_400_000)
  const to = new Date(now + 7 * 86_400_000)
  for (const ch of catalog.listChannels()) {
    for (const a of epg.airings(ch.channelId, from, to)) {
      const aid = airingEntityId(a.airingId)
      const target = alias(aid, 'STORY_ART')
      if (target.startsWith('Video:')) continue // video görseli 1) ile üretildi
      add('STORY_ART', target, () => catalog.getArtworkSource(aid, 'STORY_ART'))
    }
  }

  const imgDir = join(opts.out, 'img')
  const fallbackFile = join(opts.out, FALLBACK_FILE)
  const prevFallbacks = new Set(readJson<string[]>(fallbackFile, []))
  const all = [...jobs.values()]
  const todo = all.filter((j) => opts.force || prevFallbacks.has(j.path) || !existsSync(join(opts.out, j.path)))
  log(`  ${all.length} görsel çeşidi (${all.length - todo.length} hazır, ${todo.length} üretilecek)`)

  const missing: string[] = []
  const fallbacks = new Set([...prevFallbacks].filter((p) => jobs.has(p)))
  if (!opts.dry && todo.length > 0) {
    const original = imageFetcher.fetch
    imageFetcher.fetch = politeFetcher(log)
    const pipeline = createImagePipeline({
      dataDir: join(ROOT, '.data', 'pages-build'),
      publicDir: join(ROOT, 'web', 'public'),
      offline: false,
    })
    let done = 0
    let next = 0
    const tick = () => {
      done++
      if (done % 50 === 0 || done === todo.length) log(`  … ${done}/${todo.length}`)
    }
    const worker = async () => {
      while (next < todo.length) {
        const j = todo[next++]!
        try {
          const src = j.source()
          if (!src) {
            missing.push(`${j.path} (kaynak yok)`)
            continue
          }
          const out = await pipeline.get(
            { type: j.type, entityId: j.entityId, width: j.width, height: j.height, format: 'webp' },
            src,
          )
          await writeAtomic(join(opts.out, j.path), out.body)
          if (out.origin === 'fallback') {
            fallbacks.add(j.path)
            log(`  yedek kapak (kaynak alınamadı): ${j.path}`)
          } else fallbacks.delete(j.path)
        } catch (err) {
          missing.push(`${j.path} (${(err as Error).message})`)
        } finally {
          tick()
        }
      }
    }
    try {
      await Promise.all(Array.from({ length: opts.concurrency }, worker))
    } finally {
      imageFetcher.fetch = original
    }
    mkdirSync(imgDir, { recursive: true })
    await writeAtomic(fallbackFile, Buffer.from(JSON.stringify([...fallbacks].sort(), null, 1)))
  }

  // 6) Yerel altyazılar (oynatıcı doğrudan okur)
  const subsSrc = catalog.subtitlesDir()
  let subs = 0
  if (!opts.dry && existsSync(subsSrc)) {
    for (const name of readdirSync(subsSrc)) {
      const dst = join(opts.out, STATIC_SUBTITLES_DIR, name)
      if (!opts.force && existsSync(dst)) continue
      mkdirSync(dirname(dst), { recursive: true })
      copyFileSync(join(subsSrc, name), dst)
      subs++
    }
  }

  // 7) Stüdyo çekim ana kareleri (paftadan kırpılır; sunucudaki keyframe ucunun birebir aynısı)
  let keyframes = 0
  if (!opts.dry) {
    const contentDir = app.config.contentDir
    for (const v of loadShotIndex(contentDir).videos.values()) {
      const sp = v.sprite
      if (!sp) continue
      const file = join(contentDir, SHOTS_DIR, sp.file)
      if (!existsSync(file)) continue
      for (let i = 0; i < v.shots.length; i++) {
        const cell = v.shots[i]?.k
        if (cell === null || cell === undefined || cell >= sp.count) continue
        const dst = join(
          opts.out,
          'api',
          'studio',
          'embeddings',
          'videos',
          String(v.videoId),
          'shots',
          String(i),
          'keyframe.jpg',
        )
        if (!opts.force && existsSync(dst)) continue
        const body = await sharp(file)
          .extract({
            left: (cell % sp.cols) * sp.cellW,
            top: Math.floor(cell / sp.cols) * sp.cellH,
            width: sp.cellW,
            height: sp.cellH,
          })
          .jpeg({ quality: KEYFRAME_QUALITY })
          .toBuffer()
        await writeAtomic(dst, body)
        keyframes++
      }
    }
  }

  await app.close()
  rmSync(tmpData, { recursive: true, force: true })

  const size = dirSize(opts.out)
  log(`  altyazı: ${subs} kopyalandı · çekim ana karesi: ${keyframes} üretildi`)
  log(`Bitti: ${size.files} dosya, ${mb(size.bytes)}, ${((Date.now() - t0) / 1000).toFixed(1)} sn`)
  if (fallbacks.size > 0) log(`Yedek kapakla yazılan (sonraki çalıştırmada yeniden denenir): ${fallbacks.size}`)
  if (missing.length > 0) {
    log(`Eksik kalan: ${missing.length}`)
    for (const m of missing.slice(0, 40)) log(`  - ${m}`)
  }
  return { missing, fallbacks: [...fallbacks] }
}

if (isMain(import.meta.url)) {
  buildPagesAssets(parseArgs(process.argv.slice(2))).then(
    () => process.exit(0),
    (err: unknown) => {
      process.stderr.write(`build-pages-assets: ${(err as Error).stack ?? String(err)}\n`)
      process.exit(1)
    },
  )
}
