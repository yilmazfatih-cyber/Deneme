/**
 * Afiş adayları (yazım aracı): `npx tsx scripts/build-artwork-alternates.ts [--dry] [--force] [--only <videoId>]`.
 *
 * YouTube kaynaklı her başlık için videonun otomatik karelerinden en çok 3 yatay aday bulur ve başlığın
 * `artwork.alternates` (anahtar k1…k3, ad "Kare 1"…) ile varsayılan görselin `artwork.visual` alanını
 * content/titles/*.json dosyalarına yazar. Afiş seçimi servisi (server/src/services/artwork) bu adaylar arasından
 * profile göre seçer; sunucu çalışırken görsel çözmez, özellikler burada bir kez hesaplanır.
 *
 *   · Yalnız resmî küçük resim sunucusu: https://i.ytimg.com/vi/<id>/<kalite><n>.jpg (n = 1..3; kalite sırası
 *     maxres → sd → hq, her kare için ilk bulunan). youtube.com sayfaları ve başka kökenler ASLA istenmez.
 *   · Neredeyse siyah kareler ve varsayılan görselin ya da birbirinin neredeyse aynısı olan kareler atlanır.
 *   · Görüntü özellikleri çekim çözümlemesiyle aynı tanımlardır (server/src/services/embeddings/features.ts
 *     visualFeatures; siyah bantlar kırpılıp 128 px genişliğe indirilmiş kare).
 *   · Elle yazılmış adaylar (k1…k3 dışındaki anahtarlar) korunur; i.ytimg.com'daysa görüntü özellikleri doldurulur.
 *   · İndirilen kareler .data/artwork-alternates altında önbelleklenir (başarısızlık da; --force yeniden dener).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import prettier from 'prettier'
import sharp from 'sharp'
import { EnvHttpProxyAgent, fetch } from 'undici'
import { letterboxBounds } from '../server/src/services/image/render'
import { round, visualFeatures } from '../server/src/services/embeddings/features'
import { ROOT_DIR, defaultContentDir, isObj, readJson, titleFiles, type Json, type JsonObject } from './lib/content'
import { isMain, sleep } from './lib/net'

/** Kare numaraları ve denenen kaliteler (sırayla; ilk bulunan alınır) */
export const FRAME_NUMBERS = [1, 2, 3] as const
export const QUALITIES = ['maxres', 'sd', 'hq'] as const
/** Bu ortalama parlaklığın (luma, 0–1) altındaki kare "neredeyse siyah" sayılır */
export const BLACK_BRIGHTNESS = 0.06
/** Küçültülmüş (32×18) luma farkının ortalaması bunun altındaysa iki kare "neredeyse aynı" sayılır */
export const DUPLICATE_DISTANCE = 0.045
/** Bu aracın yönettiği aday anahtarı (k1…k3); diğer anahtarlar elle yazılmıştır ve korunur */
export const AUTO_KEY = /^k[1-3]$/
const MAX_ALTERNATES = 6
const HOST = 'i.ytimg.com'
const GAP_MS = 200
const UA = 'TVplus-ArtworkTool/1.0'

export interface Visual {
  bright: number
  sat: number
  colorful: number
  edges: number
}
export interface Analyzed {
  visual: Visual
  /** 32×18 luma (0–1), yinelenme denetimi için */
  thumb: Float32Array
}

export const frameUrl = (id: string, quality: (typeof QUALITIES)[number], n: number) =>
  `https://${HOST}/vi/${id}/${quality}${n}.jpg`

/** i.ytimg.com adresinden YouTube kimliği; başka kökense null. */
export function youtubeIdOfUrl(url: string | null | undefined): string | null {
  if (!url) return null
  try {
    const u = new URL(url)
    if (!/^i[0-9]?\.ytimg\.com$/.test(u.hostname)) return null
    const m = /^\/vi(?:_webp)?\/([A-Za-z0-9_-]{6,})\//.exec(u.pathname)
    return m ? m[1]! : null
  } catch {
    return null
  }
}

/**
 * Başlığın YouTube kimliği: varsayılan görsel bir YouTube küçük resmiyse onun videosu (adaylar aynı videodan gelsin),
 * yoksa filmin YouTube kaynağı, yoksa ilk YouTube kaynaklı bölüm. YouTube'la ilgisi yoksa null.
 */
export function youtubeIdOfTitle(t: JsonObject): string | null {
  const art = isObj(t.artwork) ? t.artwork : null
  const fromArt = youtubeIdOfUrl(typeof art?.storyArt === 'string' ? art.storyArt : null)
  if (fromArt) return fromArt
  const ytOf = (sources: Json | undefined): string | null => {
    if (!Array.isArray(sources)) return null
    for (const s of sources) if (isObj(s) && s.type === 'YOUTUBE' && typeof s.videoId === 'string') return s.videoId
    return null
  }
  const own = ytOf(t.sources)
  if (own) return own
  if (Array.isArray(t.seasons))
    for (const s of t.seasons)
      if (isObj(s) && Array.isArray(s.episodes))
        for (const e of s.episodes) {
          const id = isObj(e) ? ytOf(e.sources) : null
          if (id) return id
        }
  return null
}

/** İki küçük luma karesinin ortalama mutlak farkı (0–1). */
export function thumbDistance(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length || a.length === 0) return 1
  let s = 0
  for (let i = 0; i < a.length; i++) s += Math.abs(a[i]! - b[i]!)
  return s / a.length
}

/** Görseli çözer: siyah bantlar kırpılır, özellikler 128 px genişlikte (çekim çözümlemesiyle aynı) hesaplanır. */
export async function analyzeImage(buf: Buffer): Promise<Analyzed> {
  const { data, info } = await sharp(buf).removeAlpha().raw().toBuffer({ resolveWithObject: true })
  const box = letterboxBounds({ data, width: info.width, height: info.height, channels: info.channels })
  const raw = { raw: { width: info.width, height: info.height, channels: info.channels } }
  const w = 128
  const h = Math.max(8, Math.round((w * box.height) / box.width))
  const small = await sharp(data, raw)
    .extract(box)
    .resize(w, h, { fit: 'fill' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  const v = visualFeatures({
    data: small.data,
    width: small.info.width,
    height: small.info.height,
    channels: small.info.channels,
  })
  const tiny = await sharp(data, raw).extract(box).resize(32, 18, { fit: 'fill' }).greyscale().raw().toBuffer()
  const thumb = new Float32Array(32 * 18)
  for (let i = 0; i < thumb.length; i++) thumb[i] = (tiny[i] ?? 0) / 255
  return { visual: { bright: v.bright, sat: v.sat, colorful: v.colorful, edges: v.edges }, thumb }
}

/* ───────────── Ağ (yalnız i.ytimg.com) ───────────── */

interface Ctx {
  cacheDir: string
  force: boolean
  requests: number
  lastAt: number
  agent: EnvHttpProxyAgent | null
  log: (s: string) => void
}

/** Adresi önbellekten ya da (bir kez) i.ytimg.com'dan okur; yoksa null. Başka köken reddedilir. */
async function load(url: string, ctx: Ctx): Promise<Buffer | null> {
  const u = new URL(url)
  if (u.protocol !== 'https:' || !/^i[0-9]?\.ytimg\.com$/.test(u.hostname))
    throw new Error(`İzinsiz köken: ${u.hostname}`)
  const name = u.pathname.replace(/^\/+/, '').replace(/[^A-Za-z0-9._-]+/g, '_')
  const file = join(ctx.cacheDir, name)
  const fail = `${file}.fail`
  if (!ctx.force) {
    if (existsSync(file)) return readFileSync(file)
    if (existsSync(fail)) return null
  }
  const wait = ctx.lastAt + GAP_MS - Date.now()
  if (wait > 0) await sleep(wait)
  ctx.lastAt = Date.now()
  ctx.requests++
  ctx.agent ??= new EnvHttpProxyAgent()
  mkdirSync(ctx.cacheDir, { recursive: true })
  try {
    const res = await fetch(url, {
      dispatcher: ctx.agent,
      headers: { 'user-agent': UA, accept: 'image/jpeg,image/*;q=0.8' },
      signal: AbortSignal.timeout(10_000),
    })
    const body = Buffer.from(await res.arrayBuffer())
    const type = res.headers.get('content-type') ?? ''
    if (res.status === 200 && body.length > 0 && /^image\//i.test(type)) {
      writeFileSync(file, body)
      return body
    }
    writeFileSync(fail, String(res.status))
    return null
  } catch (err) {
    // Ağ hatası önbelleğe yazılmaz: sonraki çalıştırmada yeniden denenir
    ctx.log(`  ağ hatası: ${url} (${(err as Error).message})`)
    return null
  }
}

/* ───────────── Başlık işleme ───────────── */

export interface TitleOutcome {
  videoId: number
  youtubeId: string
  defaultVisual: Visual | null
  kept: { key: string; url: string }[]
  skipped: { n: number; why: string }[]
}

/** Başlığı yerinde günceller (ham JSON). Değişiklik olursa true. */
async function processTitle(t: JsonObject, ctx: Ctx, out: TitleOutcome[]): Promise<boolean> {
  const youtubeId = youtubeIdOfTitle(t)
  if (!youtubeId) return false
  const art: JsonObject = isObj(t.artwork) ? t.artwork : (t.artwork = { boxart: null, storyArt: null })
  const outcome: TitleOutcome = {
    videoId: typeof t.videoId === 'number' ? t.videoId : 0,
    youtubeId,
    defaultVisual: null,
    kept: [],
    skipped: [],
  }
  const before = JSON.stringify(art)

  // Varsayılan görsel
  const seen: Float32Array[] = []
  const defaultUrl = typeof art.storyArt === 'string' ? art.storyArt : null
  if (defaultUrl && youtubeIdOfUrl(defaultUrl)) {
    const buf = await load(defaultUrl, ctx)
    if (buf) {
      try {
        const a = await analyzeImage(buf)
        outcome.defaultVisual = a.visual
        seen.push(a.thumb)
      } catch {
        ctx.log(`  varsayılan görsel çözülemedi: ${defaultUrl}`)
      }
    }
  }

  // Elle yazılmış adaylar korunur (i.ytimg.com'dalarsa özellikleri doldurulur)
  const manual: JsonObject[] = []
  for (const a of Array.isArray(art.alternates) ? art.alternates : []) {
    if (!isObj(a) || typeof a.key !== 'string' || AUTO_KEY.test(a.key)) continue
    if ((a.visual === undefined || a.visual === null) && typeof a.storyArt === 'string' && youtubeIdOfUrl(a.storyArt)) {
      const buf = await load(a.storyArt, ctx)
      if (buf) {
        try {
          const r = await analyzeImage(buf)
          a.visual = { ...r.visual }
          seen.push(r.thumb)
        } catch {
          /* çözülemedi: özelliksiz kalır */
        }
      }
    }
    manual.push(a)
  }

  // Otomatik kareler
  const auto: JsonObject[] = []
  for (const n of FRAME_NUMBERS) {
    if (manual.length + auto.length >= MAX_ALTERNATES) break
    let found: { url: string; buf: Buffer } | null = null
    for (const q of QUALITIES) {
      const url = frameUrl(youtubeId, q, n)
      if (url === defaultUrl) {
        found = null
        outcome.skipped.push({ n, why: 'varsayılanla aynı adres' })
        break
      }
      const buf = await load(url, ctx)
      if (buf) {
        found = { url, buf }
        break
      }
    }
    if (!found) {
      if (!outcome.skipped.some((s) => s.n === n)) outcome.skipped.push({ n, why: 'kare yok' })
      continue
    }
    let a: Analyzed
    try {
      a = await analyzeImage(found.buf)
    } catch {
      outcome.skipped.push({ n, why: 'çözülemedi' })
      continue
    }
    if (a.visual.bright < BLACK_BRIGHTNESS) {
      outcome.skipped.push({ n, why: `neredeyse siyah (${a.visual.bright})` })
      continue
    }
    const near = seen.map((s) => thumbDistance(s, a.thumb)).filter((d) => d < DUPLICATE_DISTANCE)
    if (near.length) {
      outcome.skipped.push({ n, why: `neredeyse aynı (fark ${round(Math.min(...near))})` })
      continue
    }
    seen.push(a.thumb)
    auto.push({ key: `k${n}`, storyArt: found.url, label: `Kare ${n}`, visual: { ...a.visual } })
    outcome.kept.push({ key: `k${n}`, url: found.url })
  }

  const alternates = [...auto, ...manual]
  if (alternates.length) art.alternates = alternates
  else delete art.alternates
  if (outcome.defaultVisual) art.visual = { ...outcome.defaultVisual }
  out.push(outcome)
  return JSON.stringify(art) !== before
}

/**
 * Depo biçimlendiricisinin (prettier) çıktısıyla aynı metni yazar. Girdi 2 boşluk girintilidir: prettier açılış
 * süslü parantezinden sonra satır sonu olan nesneleri açık bırakır, böylece dosyanın mevcut biçimi korunur.
 */
async function writeFormattedJson(file: string, value: Json): Promise<void> {
  const options = (await prettier.resolveConfig(join(ROOT_DIR, 'content', 'titles', 'x.json'))) ?? {}
  const text = await prettier.format(JSON.stringify(value, null, 2), { ...options, parser: 'json', filepath: file })
  writeFileSync(file, text)
}

export interface Options {
  contentDir: string
  dry: boolean
  force: boolean
  only: number | null
}

export async function buildArtworkAlternates(opts: Options): Promise<TitleOutcome[]> {
  const log = (s: string) => process.stdout.write(`${s}\n`)
  const ctx: Ctx = {
    cacheDir: join(ROOT_DIR, '.data', 'artwork-alternates'),
    force: opts.force,
    requests: 0,
    lastAt: 0,
    agent: null,
    log,
  }
  const outcomes: TitleOutcome[] = []
  let filesChanged = 0
  for (const file of titleFiles(opts.contentDir)) {
    const data = readJson(file)
    if (!Array.isArray(data)) continue
    let changed = false
    for (const t of data) {
      if (!isObj(t)) continue
      if (opts.only !== null && t.videoId !== opts.only) continue
      if (await processTitle(t, ctx, outcomes)) changed = true
      const o = outcomes[outcomes.length - 1]
      if (o && o.videoId === t.videoId)
        log(
          `  ${o.videoId} ${String(t.title ?? '')}: ${o.kept.length} aday` +
            (o.skipped.length ? ` · atlanan: ${o.skipped.map((s) => `${s.n} ${s.why}`).join(', ')}` : ''),
        )
    }
    if (changed && !opts.dry) {
      await writeFormattedJson(file, data)
      filesChanged++
    }
  }
  const withAlt = outcomes.filter((o) => o.kept.length > 0)
  log(
    `Bitti: ${outcomes.length} YouTube başlığı · ${withAlt.length} başlığa ${withAlt.reduce((s, o) => s + o.kept.length, 0)} aday` +
      ` · ${ctx.requests} istek · ${opts.dry ? 'deneme (yazılmadı)' : `${filesChanged} dosya güncellendi`}`,
  )
  return outcomes
}

function parseArgs(argv: string[]): Options {
  const o: Options = { contentDir: defaultContentDir(), dry: false, force: false, only: null }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--dry') o.dry = true
    else if (a === '--force') o.force = true
    else if (a === '--only') o.only = Number(argv[++i]) || null
    else if (a === '--content') o.contentDir = argv[++i] ?? o.contentDir
  }
  return o
}

if (isMain(import.meta.url)) {
  buildArtworkAlternates(parseArgs(process.argv.slice(2))).then(
    () => process.exit(0),
    (err: unknown) => {
      process.stderr.write(`build-artwork-alternates: ${(err as Error).stack ?? String(err)}\n`)
      process.exit(1)
    },
  )
}
