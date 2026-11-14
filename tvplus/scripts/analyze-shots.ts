/**
 * Çekim çözümlemesi (`npm run analyze:shots -- <videoId|all> [--force] [--cache <klasör>]`) — docs/ICERIK_ZEKASI.md §8.
 *
 * GELİŞTİRME ARACIDIR: ffmpeg/ffprobe yalnız burada kullanılır; çıktılar content/shots altına yazılır ve depoya girer.
 * Sunucu vektörleri bu dosyalardan çevrimdışı kurar (ağ yok, ffmpeg yok).
 *
 *   SCENE_DETECT  DASH kaynağı olan yapımlar (kendi CDN hattımızdaki açık filmler): en düşük görüntü temsili ve bir ses
 *                 parçası önbellek klasörüne indirilir (uzak adres ffmpeg'e verilmez) → sahne değişim puanları → çekim
 *                 sınırları (eşik, en kısa çekim, üst sınır) → çekim başına orta kare özellikleri, ilk/son kare hareketi,
 *                 ses özellikleri, altyazı metni (Türkçe öncelikli) → content/shots/<videoId>.json + <videoId>.jpg paftası.
 *   KEYFRAMES     YouTube yaprakları: yalnız i.ytimg.com hazır kareleri (hqdefault, 1, 2, 3; saniyede en çok 4 istek,
 *                 her kare bir kez indirilir ve önbellekte tutulur) → sözde çekimler (yalnız görüntü). Görseli olmayan
 *                 yapımlar (ör. arşiv filmleri) yalnız metin kaydı alır (NO_IMAGE). Hepsi content/shots/keyframes.json.
 *
 *   --media       `<videoId> --media <yerel dosya> [--subs <.vtt|.srt|.ttml>] [--note "<kaynak>"]`: tek bir katalog
 *                 yaprağını başlığın kendi kaynağı yerine yerel bir dosyadan çözümler (ör. uygulamada YouTube'dan gömülen
 *                 ama CC-BY medyası başka yerde bulunan açık filmler). Normal bir SCENE_DETECT dosyası + pafta yazılır,
 *                 kaynağı `media.source = 'LOCAL'`, `media.note`, `media.sha256` alanlarına kaydedilir ve yaprak
 *                 birleşik KEYFRAMES dosyasından çıkarılır (sonraki `all` çalıştırmaları onu geri eklemez).
 *
 * Aynı girdiyle yeniden çalıştırmak bir şey değiştirmez (var olan çıktılar --force verilmedikçe korunur).
 */
import { execFileSync, spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  closeSync,
  createWriteStream,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  readSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, extname, join, resolve } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import type { ReadableStream as WebReadableStream } from 'node:stream/web'
import prettier from 'prettier'
import sharp from 'sharp'
import { EnvHttpProxyAgent, fetch } from 'undici'
import { CONTENT_FILES, zTitlesFile, type ContentSource, type ContentTitle } from '../shared/content-schema'
import {
  KEYFRAMES_FILE,
  SHOTS_DIR,
  SHOTS_SCHEMA_VERSION,
  STILL_NAMES,
  STILL_SPANS,
  type StillName,
  zKeyframesFile,
  zSceneDetectFile,
  type KeyframesFile,
  type KeyframesVideo,
  type SceneDetectFile,
  type ShotFlag,
  type ShotRecord,
  type SpriteInfo,
  type VisualFeatures,
} from '../shared/shots-schema'
import {
  audioFeatures,
  averageVisual,
  motionEstimate,
  round,
  visualFeatures,
  type RawFrame,
} from '../server/src/services/embeddings/features'
import { letterboxBounds } from '../server/src/services/image/render'
import { parseMpd } from '../server/src/services/playback/sources/dash'
import { parseTtml, parseVtt, type Cue } from '../server/src/services/subtitles/convert'
import { ROOT_DIR, defaultContentDir, titleFiles } from './lib/content'
import { isMain, sleep } from './lib/net'

/* ───────────── Ayarlar (hepsi raporlanır ve SCENE_DETECT dosyasına yazılır) ───────────── */

/** ffmpeg `scene` puanı (0–1) bu eşiği aşan kare yeni çekimin başı sayılır. */
export const SCENE_THRESHOLD = 0.12
/** Bundan kısa çekim olmaz: daha yakın iki kesimden puanı düşük olan atılır. */
export const MIN_SHOT_SEC = 1.0
/** Yaprak başına en çok çekim; aşılırsa en zayıf kesimler atılır (CAPPED). */
export const MAX_SHOTS = 400
/** Çözümleme kare genişliği (piksel) ve kare hızı. */
export const FRAME_WIDTH = 160
export const ANALYSIS_FPS = 8
/** Ses: mono, 16 kHz. */
export const AUDIO_RATE = 16000
/** Pafta hücresi genişliği (yükseklik en-boy oranından) ve JPEG kalitesi. */
export const SPRITE_CELL_W = 96
export const SPRITE_COLS = 16
export const SPRITE_QUALITY = 70
/** KEYFRAMES paftası: 16:9 küçük hücreler. */
export const STILL_CELL_W = 80
export const STILL_CELL_H = 45
/** i.ytimg.com isteklerinin arası (≤ 4 istek/sn). */
export const STILL_GAP_MS = 260
/** Çekim metninin üst sınırı (karakter). */
export const SHOT_TEXT_MAX = 400

const STILLS = STILL_NAMES
const stillUrl = (id: string, name: StillName) =>
  `https://i.ytimg.com/vi/${id}/${name === 'hq' ? 'hqdefault' : name}.jpg`

/* ───────────── Saf yardımcılar (testlerde sınanır) ───────────── */

export interface SceneScore {
  t: number
  score: number
}

/** `metadata=print` çıktısından (kare zamanı, sahne puanı) çiftleri. */
export function parseSceneScores(text: string): SceneScore[] {
  const out: SceneScore[] = []
  let t: number | null = null
  for (const line of text.split('\n')) {
    const m = /pts_time:([\d.]+)/.exec(line)
    if (m) {
      t = Number(m[1])
      continue
    }
    const s = /lavfi\.scene_score=([\d.]+)/.exec(line)
    if (s && t !== null) {
      out.push({ t, score: Number(s[1]) })
      t = null
    }
  }
  return out
}

/**
 * Kesim seçimi: eşiği aşan kareler aday; birbirine (ya da başa/sona) `minShotSec`'ten yakın adaylardan puanı yüksek
 * olan kalır; sayı `maxShots - 1` kesimi aşarsa en düşük puanlılar atılır. Dönen: sıralı kesim zamanları + kırpıldı mı.
 */
export function chooseCuts(
  scores: SceneScore[],
  durationSec: number,
  opts: { threshold: number; minShotSec: number; maxShots: number },
): { cuts: number[]; capped: boolean } {
  const cand = scores
    .filter((s) => s.score >= opts.threshold && s.t >= opts.minShotSec && durationSec - s.t >= opts.minShotSec)
    .sort((a, b) => a.t - b.t)
  const kept: SceneScore[] = []
  for (const c of cand) {
    const last = kept[kept.length - 1]
    if (last && c.t - last.t < opts.minShotSec) {
      if (c.score > last.score) {
        const prev = kept[kept.length - 2]
        if (!prev || c.t - prev.t >= opts.minShotSec) kept[kept.length - 1] = c
      }
      continue
    }
    kept.push(c)
  }
  let capped = false
  if (kept.length > opts.maxShots - 1) {
    capped = true
    const strongest = [...kept].sort((a, b) => b.score - a.score || a.t - b.t).slice(0, opts.maxShots - 1)
    kept.length = 0
    kept.push(...strongest.sort((a, b) => a.t - b.t))
  }
  return { cuts: kept.map((k) => round(k.t, 3)), capped }
}

/** Kesimlerden çekim aralıkları. */
export function spansOf(cuts: number[], durationSec: number): [number, number][] {
  const edges = [0, ...cuts, durationSec]
  const out: [number, number][] = []
  for (let i = 0; i + 1 < edges.length; i++) out.push([round(edges[i]!, 3), round(edges[i + 1]!, 3)])
  return out
}

const TICKS = 10_000_000
/** Altyazı satırlarını çekimlere dağıtır: orta noktası çekimin içinde kalan her satır o çekime aittir. */
export function textForSpans(cues: Cue[], spans: [number, number][]): string[] {
  const out = spans.map(() => [] as string[])
  for (const c of cues) {
    const mid = (c.begin + c.end) / 2 / TICKS
    const idx = spans.findIndex(([s, e], i) => mid >= s && (mid < e || i === spans.length - 1))
    if (idx < 0) continue
    const text = c.lines
      .map((l) => l.map((r) => r.text).join(''))
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim()
    if (text) out[idx]!.push(text)
  }
  return out.map((parts) => {
    const s = parts.join(' ')
    return s.length > SHOT_TEXT_MAX ? `${s.slice(0, SHOT_TEXT_MAX - 1).trimEnd()}…` : s
  })
}

/** Bir çekim için okunacak kare sıraları (ANALYSIS_FPS ölçeğinde): ilk, son ve %40/%50/%60 noktaları. */
export function frameIndicesOf(span: [number, number], fps: number): { first: number; last: number; mids: number[] } {
  const [s, e] = span
  const first = Math.floor(s * fps) + 1
  const last = Math.max(first, Math.ceil(e * fps) - 2)
  const at = (p: number) => Math.min(last, Math.max(first, Math.round((s + (e - s) * p) * fps)))
  const mids = [...new Set([at(0.4), at(0.5), at(0.6)])]
  return { first, last, mids }
}

/* ───────────── İçerik ───────────── */

export interface PlayableRef {
  videoId: number
  titleId: number
  displayTitle: string
  runtimeSec: number | null
  sources: ContentSource[]
}

/** Katalog servisiyle aynı sıra: film → kendisi; dizi → bölümler; ardından ek videolar. */
export function playablesOf(t: ContentTitle): PlayableRef[] {
  const out: PlayableRef[] = []
  if (t.type === 'MOVIE')
    out.push({
      videoId: t.videoId,
      titleId: t.videoId,
      displayTitle: t.title,
      runtimeSec: t.runtimeSec,
      sources: t.sources,
    })
  for (const s of t.seasons)
    for (const e of s.episodes)
      out.push({
        videoId: e.videoId,
        titleId: t.videoId,
        displayTitle: `${t.title} · S${s.number} B${e.number}`,
        runtimeSec: e.runtimeSec,
        sources: e.sources,
      })
  for (const sp of t.supplementals)
    out.push({
      videoId: sp.videoId,
      titleId: t.videoId,
      displayTitle: `${t.title} · ${sp.title}`,
      runtimeSec: sp.runtimeSec,
      sources: sp.sources,
    })
  return out
}

export function loadTitles(contentDir: string): ContentTitle[] {
  return titleFiles(contentDir).flatMap((f) => zTitlesFile.parse(JSON.parse(readFileSync(f, 'utf8'))))
}

/* ───────────── Ağ ───────────── */

let agent: EnvHttpProxyAgent | null = null
const dispatcher = () => (agent ??= new EnvHttpProxyAgent())
const UA = 'TVplus-ShotAnalysis/1.0'

/** Dosyayı (yoksa) önbelleğe indirir; uzak adres hiçbir zaman ffmpeg'e verilmez. */
async function download(url: string, file: string, log: (s: string) => void): Promise<void> {
  if (existsSync(file) && statSync(file).size > 0) return
  mkdirSync(join(file, '..'), { recursive: true })
  const res = await fetch(url, {
    dispatcher: dispatcher(),
    headers: { 'user-agent': UA },
    signal: AbortSignal.timeout(300_000),
  })
  if (res.status !== 200 || !res.body) throw new Error(`İndirilemedi (${res.status}): ${url}`)
  const tmp = `${file}.part`
  await pipeline(Readable.fromWeb(res.body as WebReadableStream<Uint8Array>), createWriteStream(tmp))
  execFileSync('mv', [tmp, file])
  log(`  indirildi: ${url.split('/').pop()} (${(statSync(file).size / 1e6).toFixed(1)} MB)`)
}

async function fetchText(url: string, file: string): Promise<string> {
  if (existsSync(file)) return readFileSync(file, 'utf8')
  const res = await fetch(url, {
    dispatcher: dispatcher(),
    headers: { 'user-agent': UA },
    signal: AbortSignal.timeout(30_000),
  })
  if (res.status !== 200) throw new Error(`İndirilemedi (${res.status}): ${url}`)
  const text = await res.text()
  mkdirSync(join(file, '..'), { recursive: true })
  writeFileSync(file, text)
  return text
}

/* ───────────── ffmpeg ───────────── */

const FFMPEG = process.env.FFMPEG ?? 'ffmpeg'

function ffmpegVersion(): string {
  const out = execFileSync(FFMPEG, ['-version'], { encoding: 'utf8' })
  return /ffmpeg version (\S+)/.exec(out)?.[1] ?? 'bilinmiyor'
}

/** ffmpeg'i çalıştırır; stdout'u parça parça `onData`'ya verir. */
function runFfmpeg(args: string[], onData: (chunk: Buffer) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const p = spawn(FFMPEG, ['-hide_banner', '-nostats', '-loglevel', 'error', ...args], {
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let err = ''
    p.stdout.on('data', onData)
    p.stderr.on('data', (d: Buffer) => (err += d.toString()))
    p.on('error', reject)
    p.on('close', (code) =>
      code === 0 ? resolve() : reject(new Error(`ffmpeg çıkış kodu ${code}: ${err.slice(-500)}`)),
    )
  })
}

async function sceneScores(video: string, cacheFile: string): Promise<SceneScore[]> {
  if (!existsSync(cacheFile)) {
    let out = ''
    await runFfmpeg(
      [
        '-i',
        video,
        '-an',
        '-vf',
        `scale=${FRAME_WIDTH}:-2,select='gte(scene,0)',metadata=print:file=-`,
        '-f',
        'null',
        '-',
      ],
      (d) => (out += d.toString()),
    )
    writeFileSync(cacheFile, out)
  }
  return parseSceneScores(readFileSync(cacheFile, 'utf8'))
}

/** Kare boyutu: FRAME_WIDTH genişlik, yükseklik en-boy oranından (çift sayıya yuvarlanmış). */
function frameSize(video: string): { w: number; h: number } {
  const out = execFileSync(
    process.env.FFPROBE ?? 'ffprobe',
    ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', video],
    { encoding: 'utf8' },
  ).trim()
  const [w, h] = out.split(',').map(Number)
  if (!w || !h) throw new Error(`Kare boyutu okunamadı: ${out}`)
  return { w: FRAME_WIDTH, h: Math.max(2, Math.round((FRAME_WIDTH * h) / w / 2) * 2) }
}

/** Videoyu ANALYSIS_FPS hızında ham RGB olarak akıtır; yalnız istenen sıralardaki kareleri saklar. */
async function grabFrames(
  video: string,
  size: { w: number; h: number },
  wanted: Set<number>,
): Promise<Map<number, RawFrame>> {
  const frameBytes = size.w * size.h * 3
  const frames = new Map<number, RawFrame>()
  let buf: Buffer = Buffer.alloc(0)
  let idx = 0
  await runFfmpeg(
    [
      '-i',
      video,
      '-an',
      '-vf',
      `fps=${ANALYSIS_FPS},scale=${size.w}:${size.h}`,
      '-pix_fmt',
      'rgb24',
      '-f',
      'rawvideo',
      '-',
    ],
    (chunk) => {
      buf = buf.length ? Buffer.concat([buf, chunk]) : chunk
      while (buf.length >= frameBytes) {
        if (wanted.has(idx))
          frames.set(idx, {
            data: new Uint8Array(buf.subarray(0, frameBytes)),
            width: size.w,
            height: size.h,
            channels: 3,
          })
        buf = buf.subarray(frameBytes)
        idx++
      }
    },
  )
  return frames
}

async function decodePcm(audio: string, cacheFile: string): Promise<Float32Array> {
  if (!existsSync(cacheFile)) {
    const chunks: Buffer[] = []
    await runFfmpeg(['-i', audio, '-vn', '-ac', '1', '-ar', String(AUDIO_RATE), '-f', 'f32le', '-'], (d) =>
      chunks.push(d),
    )
    writeFileSync(cacheFile, Buffer.concat(chunks))
  }
  const b = readFileSync(cacheFile)
  return new Float32Array(b.buffer, b.byteOffset, Math.floor(b.length / 4))
}

/* ───────────── Pafta ───────────── */

async function buildSprite(
  cells: (RawFrame | null)[],
  cellW: number,
  cellH: number,
  file: string,
): Promise<SpriteInfo | null> {
  const present = cells.filter((c): c is RawFrame => c !== null)
  if (present.length === 0) return null
  const cols = Math.min(SPRITE_COLS, cells.length)
  const rows = Math.ceil(cells.length / cols)
  const composites = await Promise.all(
    cells.map(async (c, i) =>
      c
        ? {
            input: await sharp(c.data, { raw: { width: c.width, height: c.height, channels: 3 } })
              .resize(cellW, cellH, { fit: 'cover' })
              .png()
              .toBuffer(),
            left: (i % cols) * cellW,
            top: Math.floor(i / cols) * cellH,
          }
        : null,
    ),
  )
  const body = await sharp({
    create: { width: cols * cellW, height: rows * cellH, channels: 3, background: { r: 0, g: 0, b: 0 } },
  })
    .composite(composites.filter((c): c is NonNullable<typeof c> => c !== null))
    .jpeg({ quality: SPRITE_QUALITY, mozjpeg: true })
    .toBuffer()
  // Aynı baytlar zaten yazılıysa dosyaya dokunulmaz (yeniden çalıştırma çalışma ağacını kirletmesin).
  if (!existsSync(file) || !readFileSync(file).equals(body)) writeFileSync(file, body)
  return { file: file.split('/').pop()!, cols, cellW, cellH, count: cells.length }
}

/* ───────────── Yazma ───────────── */

/** Depo biçimlendiricisinin (prettier) çıktısıyla aynı metni yazar; `npm run format` dosyaları değiştirmez. */
async function writeFormattedJson(file: string, value: unknown): Promise<number> {
  // Yapılandırma deponun kendi ayarlarından okunur (TVP_CONTENT_DIR depo dışındaysa da aynı biçim çıksın).
  const options = (await prettier.resolveConfig(join(ROOT_DIR, 'content', 'shots', 'x.json'))) ?? {}
  const text = await prettier.format(JSON.stringify(value), { ...options, parser: 'json', filepath: file })
  writeFileSync(file, text)
  return Buffer.byteLength(text)
}

/* ───────────── Yerel medya (--media) ───────────── */

/** SRT'yi WebVTT çözümleyicisinin okuyacağı biçime getirir (zaman damgasındaki virgül VTT çözümleyicisince kabul edilir). */
export function srtToVtt(srt: string): string {
  return `WEBVTT\n\n${srt.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n')}`
}

/** Altyazı metnini uzantısına göre çözer: .vtt · .srt · .ttml/.xml/.dfxp */
export function parseSubtitleText(raw: string, file: string): Cue[] {
  const ext = extname(file).toLowerCase()
  if (ext === '.srt') return parseVtt(srtToVtt(raw))
  if (ext === '.ttml' || ext === '.xml' || ext === '.dfxp') return parseTtml(raw)
  return parseVtt(raw)
}

/** Dosya adından dil: "sintel.tr.srt" → 'tr'; bulunamazsa 'und' (belirsiz). */
export function subtitleLangOf(file: string): string {
  return /\.([a-z]{2,3})\.(vtt|srt|ttml|xml|dfxp)$/i.exec(basename(file))?.[1]?.toLowerCase() ?? 'und'
}

/** Yerel medyanın süresi, ses akışı olup olmadığı ve SHA-256 özeti (ffprobe; yalnız bu araçta). */
function probeLocalMedia(file: string): {
  path: string
  durationSec: number | null
  hasAudio: boolean
  sha256: string
} {
  const path = resolve(file)
  if (!existsSync(path) || !statSync(path).isFile()) throw new Error(`Medya dosyası bulunamadı: ${file}`)
  const out = execFileSync(
    process.env.FFPROBE ?? 'ffprobe',
    ['-v', 'error', '-show_entries', 'format=duration:stream=codec_type', '-of', 'json', path],
    { encoding: 'utf8' },
  )
  const info = JSON.parse(out) as { format?: { duration?: string }; streams?: { codec_type?: string }[] }
  const streams = info.streams ?? []
  if (!streams.some((st) => st.codec_type === 'video')) throw new Error(`Görüntü akışı yok: ${file}`)
  const d = Number(info.format?.duration)
  const hash = createHash('sha256')
  const fd = openSync(path, 'r')
  try {
    const buf = Buffer.alloc(4 * 1024 * 1024)
    for (let n = readSync(fd, buf); n > 0; n = readSync(fd, buf)) hash.update(buf.subarray(0, n))
  } finally {
    closeSync(fd)
  }
  return {
    path,
    durationSec: Number.isFinite(d) && d > 0 ? d : null,
    hasAudio: streams.some((st) => st.codec_type === 'audio'),
    sha256: hash.digest('hex'),
  }
}

/** Yaprağı birleşik KEYFRAMES dosyasından çıkarır (pafta değişmez; kullanılmayan hücre kalır). Değiştiyse true. */
export async function removeFromKeyframes(outDir: string, videoId: number): Promise<boolean> {
  const file = join(outDir, KEYFRAMES_FILE)
  if (!existsSync(file)) return false
  const kf = zKeyframesFile.parse(JSON.parse(readFileSync(file, 'utf8')))
  const videos = kf.videos.filter((v) => v.videoId !== videoId)
  if (videos.length === kf.videos.length) return false
  await writeFormattedJson(file, { ...kf, videos })
  return true
}

/* ───────────── SCENE_DETECT ───────────── */

export interface LocalMediaOptions {
  /** Yerel medya dosyası (görüntü + varsa ses) */
  file: string
  /** İsteğe bağlı altyazı: .vtt, .srt, .ttml/.xml (dil dosya adından: film.tr.srt → 'tr') */
  subs: string | null
  /** Serbest metin: medyanın nereden geldiği (adres, lisans) */
  note: string | null
}

interface Ctx {
  contentDir: string
  outDir: string
  cacheDir: string
  force: boolean
  /** Sahne eşiği (varsayılan SCENE_THRESHOLD; --threshold ile ayarlanır) */
  threshold: number
  /** `--media`: tek yaprağı başlığın kaynağı yerine bu yerel dosyadan çözümle */
  media: LocalMediaOptions | null
  log: (s: string) => void
}

async function subtitleCues(
  p: PlayableRef,
  ctx: Ctx,
  mpdTexts: { url: string; lang: string; format: 'vtt' | 'ttml' }[],
) {
  const dash = p.sources.find((s) => s.type === 'DASH')
  const own = dash && dash.type === 'DASH' ? dash.timedText : []
  const list = [
    ...own.map((t) => ({ lang: t.lang, format: t.format, url: t.url, file: t.file })),
    ...mpdTexts.map((t) => ({ lang: t.lang, format: t.format, url: t.url, file: undefined })),
  ]
  const order = (l: string) => (l === 'tr' ? 0 : l === 'en' ? 1 : 2)
  list.sort((a, b) => order(a.lang) - order(b.lang))
  if (ctx.media?.subs) {
    const raw = readFileSync(ctx.media.subs, 'utf8')
    const cues = parseSubtitleText(raw, ctx.media.subs)
    if (cues.length) return { lang: subtitleLangOf(ctx.media.subs), cues }
    ctx.log(`  altyazı dosyasında satır bulunamadı: ${ctx.media.subs}`)
  }
  for (const t of list) {
    try {
      let raw: string
      if (t.file) raw = readFileSync(join(ctx.contentDir, CONTENT_FILES.subtitlesDir, t.file), 'utf8')
      else if (t.url) raw = await fetchText(t.url, join(ctx.cacheDir, String(p.videoId), `sub-${t.lang}.${t.format}`))
      else continue
      const cues = t.format === 'vtt' ? parseVtt(raw) : parseTtml(raw)
      if (cues.length) return { lang: t.lang, cues }
    } catch (e) {
      ctx.log(`  altyazı alınamadı (${t.lang}): ${(e as Error).message}`)
    }
  }
  return null
}

export interface SceneSummary {
  videoId: number
  title: string
  shots: number
  avgShotSec: number
  capped: boolean
  textLang: string | null
  bytes: number
  spriteBytes: number
  skipped: boolean
  mediaSource: 'CATALOG' | 'LOCAL'
}

async function analyzeSceneDetect(p: PlayableRef, ctx: Ctx): Promise<SceneSummary> {
  const outFile = join(ctx.outDir, `${p.videoId}.json`)
  if (!ctx.force && existsSync(outFile)) {
    const f = zSceneDetectFile.parse(JSON.parse(readFileSync(outFile, 'utf8')))
    const spriteFile = join(ctx.outDir, `${p.videoId}.jpg`)
    return {
      videoId: p.videoId,
      title: p.displayTitle,
      shots: f.shots.length,
      avgShotSec: round(f.durationSec / f.shots.length, 2),
      capped: f.flags.includes('CAPPED'),
      textLang: f.media.textLang,
      bytes: statSync(outFile).size,
      spriteBytes: existsSync(spriteFile) ? statSync(spriteFile).size : 0,
      skipped: true,
      mediaSource: f.media.source,
    }
  }
  let dir: string
  let videoFile: string
  let audioFile: string | null = null
  let duration: number | null
  let mediaInfo: Omit<SceneDetectFile['media'], 'textLang'>
  let mpdTexts: { url: string; lang: string; format: 'vtt' | 'ttml' }[] = []
  if (ctx.media) {
    const local = probeLocalMedia(ctx.media.file)
    // Önbellek klasörü medyanın özetine bağlı: başka bir dosyayla eski sahne puanları kullanılmaz.
    dir = join(ctx.cacheDir, `${p.videoId}-yerel-${local.sha256.slice(0, 12)}`)
    mkdirSync(dir, { recursive: true })
    ctx.log(`• ${p.displayTitle} (${p.videoId}) — SCENE_DETECT, yerel medya: ${basename(local.path)}`)
    videoFile = local.path
    audioFile = local.hasAudio ? local.path : null
    duration = local.durationSec ?? p.runtimeSec
    mediaInfo = {
      video: basename(local.path),
      audio: local.hasAudio ? basename(local.path) : null,
      source: 'LOCAL',
      note: ctx.media.note ?? `yerel dosya: ${basename(local.path)}`,
      sha256: local.sha256,
    }
  } else {
    const dash = p.sources.find((s) => s.type === 'DASH')
    if (!dash || dash.type !== 'DASH') throw new Error('DASH kaynağı yok (yerel dosyayla çözümlemek için --media)')
    dir = join(ctx.cacheDir, String(p.videoId))
    mkdirSync(dir, { recursive: true })
    ctx.log(`• ${p.displayTitle} (${p.videoId}) — SCENE_DETECT`)
    const mpd = parseMpd(await fetchText(dash.manifest, join(dir, 'manifest.mpd')), dash.manifest)
    const vRep = mpd.video[0]
    if (!vRep) throw new Error('Görüntü temsili yok')
    const aRep = mpd.audio[0] ?? null
    videoFile = join(dir, vRep.url.split('/').pop()!)
    await download(vRep.url, videoFile, ctx.log)
    if (aRep) {
      audioFile = join(dir, aRep.url.split('/').pop()!)
      await download(aRep.url, audioFile, ctx.log)
    }
    duration = mpd.durationSec ?? p.runtimeSec
    mpdTexts = mpd.text
    mediaInfo = {
      video: vRep.url.split('/').pop()!,
      audio: aRep ? aRep.url.split('/').pop()! : null,
      source: 'CATALOG',
      note: null,
      sha256: null,
    }
  }
  if (!duration) throw new Error('Süre bilinmiyor')

  const t0 = Date.now()
  const scores = await sceneScores(videoFile, join(dir, 'scene-scores.txt'))
  const { cuts, capped } = chooseCuts(scores, duration, {
    threshold: ctx.threshold,
    minShotSec: MIN_SHOT_SEC,
    maxShots: MAX_SHOTS,
  })
  const spans = spansOf(cuts, duration)
  ctx.log(`  sahne puanı: ${scores.length} kare, ${spans.length} çekim (${((Date.now() - t0) / 1000).toFixed(1)} sn)`)

  const size = frameSize(videoFile)
  const plan = spans.map((sp) => frameIndicesOf(sp, ANALYSIS_FPS))
  const wanted = new Set<number>()
  for (const pl of plan) [pl.first, pl.last, ...pl.mids].forEach((k) => wanted.add(k))
  const frames = await grabFrames(videoFile, size, wanted)
  const maxIdx = Math.max(...frames.keys())
  const frameAt = (k: number) => frames.get(Math.min(k, maxIdx)) ?? null

  const flags: ShotFlag[] = []
  if (capped) flags.push('CAPPED')
  let pcm: Float32Array | null = null
  if (audioFile) {
    try {
      pcm = await decodePcm(audioFile, join(dir, 'audio-16k.f32'))
    } catch (e) {
      ctx.log(`  ses çözülemedi: ${(e as Error).message}`)
    }
  }
  if (!pcm) flags.push('NO_AUDIO')
  const sub = await subtitleCues(p, ctx, mpdTexts)
  if (!sub) flags.push('NO_TEXT')
  const texts = sub ? textForSpans(sub.cues, spans) : spans.map(() => '')

  const cells: (RawFrame | null)[] = []
  const shots: ShotRecord[] = spans.map(([s, e], i) => {
    const pl = plan[i]!
    const mids = pl.mids.map(frameAt).filter((f): f is RawFrame => f !== null)
    const first = frameAt(pl.first)
    const last = frameAt(pl.last)
    const motion = first && last && pl.last > pl.first ? motionEstimate(first, last) : null
    const v: VisualFeatures | null = mids.length ? averageVisual(mids.map(visualFeatures), motion) : null
    cells.push(mids[Math.floor(mids.length / 2)] ?? null)
    const a = pcm
      ? audioFeatures(pcm.subarray(Math.floor(s * AUDIO_RATE), Math.floor(e * AUDIO_RATE)), AUDIO_RATE)
      : null
    return { i, s, e, v, a, t: texts[i] ?? '', k: v ? i : null }
  })
  const cellH = Math.max(8, Math.round((SPRITE_CELL_W * size.h) / size.w))
  const sprite = await buildSprite(cells, SPRITE_CELL_W, cellH, join(ctx.outDir, `${p.videoId}.jpg`))

  const file: SceneDetectFile = {
    version: SHOTS_SCHEMA_VERSION,
    method: 'SCENE_DETECT',
    videoId: p.videoId,
    titleId: p.titleId,
    durationSec: round(duration, 3),
    generatedAt: new Date().toISOString(),
    params: {
      ffmpeg: ffmpegVersion(),
      threshold: ctx.threshold,
      minShotSec: MIN_SHOT_SEC,
      maxShots: MAX_SHOTS,
      frameWidth: FRAME_WIDTH,
      fps: ANALYSIS_FPS,
    },
    media: { ...mediaInfo, textLang: sub?.lang ?? null },
    sprite,
    flags,
    shots,
  }
  zSceneDetectFile.parse(file)
  const bytes = await writeFormattedJson(outFile, file)
  // Bu yaprak artık gerçek çekimlerle temsil ediliyor: birleşik KEYFRAMES kaydından çıkar.
  if (await removeFromKeyframes(ctx.outDir, p.videoId)) ctx.log(`  ${KEYFRAMES_FILE} içinden çıkarıldı: ${p.videoId}`)
  return {
    videoId: p.videoId,
    title: p.displayTitle,
    shots: shots.length,
    avgShotSec: round(duration / shots.length, 2),
    capped,
    textLang: sub?.lang ?? null,
    bytes,
    spriteBytes: sprite ? statSync(join(ctx.outDir, sprite.file)).size : 0,
    skipped: false,
    mediaSource: mediaInfo.source,
  }
}

/* ───────────── KEYFRAMES ───────────── */

interface StillResult {
  frame: RawFrame | null
  status: number
}

/** Kareyi önbellekten ya da (bir kez) i.ytimg.com'dan alır; başarısızlık da önbelleğe yazılır. */
async function loadStill(id: string, name: StillName, ctx: Ctx, gate: () => Promise<void>): Promise<StillResult> {
  const dir = join(ctx.cacheDir, 'stills', id)
  const file = join(dir, `${name}.jpg`)
  const fail = join(dir, `${name}.fail`)
  let buf: Buffer | null = null
  let status = 200
  if (existsSync(file)) buf = readFileSync(file)
  else if (existsSync(fail)) status = Number(readFileSync(fail, 'utf8')) || 0
  else {
    await gate()
    try {
      const res = await fetch(stillUrl(id, name), {
        dispatcher: dispatcher(),
        headers: { 'user-agent': UA },
        signal: AbortSignal.timeout(10_000),
      })
      status = res.status
      const body = Buffer.from(await res.arrayBuffer())
      mkdirSync(dir, { recursive: true })
      if (status === 200 && body.length > 0) {
        buf = body
        writeFileSync(file, body)
      } else writeFileSync(fail, String(status))
    } catch {
      status = 0
      mkdirSync(dir, { recursive: true })
      writeFileSync(fail, '0')
    }
  }
  if (!buf) return { frame: null, status }
  const { data, info } = await sharp(buf).removeAlpha().raw().toBuffer({ resolveWithObject: true })
  const raw = { data, width: info.width, height: info.height, channels: info.channels }
  const box = letterboxBounds(raw)
  const w = 128
  const h = Math.max(8, Math.round((w * box.height) / box.width))
  const out = await sharp(data, { raw: { width: info.width, height: info.height, channels: info.channels } })
    .extract(box)
    .resize(w, h, { fit: 'fill' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  return {
    frame: { data: out.data, width: out.info.width, height: out.info.height, channels: out.info.channels },
    status,
  }
}

export interface KeyframesSummary {
  videos: number
  withImages: number
  textOnly: number
  tried: number
  fetched: number
  failed: number
  requests: number
  bytes: number
  spriteBytes: number
}

async function analyzeKeyframes(list: PlayableRef[], ctx: Ctx): Promise<KeyframesSummary> {
  const outFile = join(ctx.outDir, KEYFRAMES_FILE)
  let requests = 0
  let lastAt = 0
  const gate = async () => {
    const wait = lastAt + STILL_GAP_MS - Date.now()
    if (wait > 0) await sleep(wait)
    lastAt = Date.now()
    requests++
  }
  const videos: KeyframesVideo[] = []
  const cells: (RawFrame | null)[] = []
  for (const p of list) {
    const yt = p.sources.find((s) => s.type === 'YOUTUBE')
    const youtubeId = yt && yt.type === 'YOUTUBE' ? yt.videoId : null
    const duration = p.runtimeSec
    const flags: ShotFlag[] = []
    const shots: ShotRecord[] = []
    let tried = 0
    let fetched = 0
    if (youtubeId) {
      for (const name of STILLS) {
        tried++
        const r = await loadStill(youtubeId, name, ctx, gate)
        if (!r.frame) continue
        fetched++
        const [a, b] = STILL_SPANS[name]
        shots.push({
          i: shots.length,
          s: duration ? round(a * duration, 1) : null,
          e: duration ? round(b * duration, 1) : null,
          v: visualFeatures(r.frame),
          a: null,
          t: '',
          k: cells.length,
          src: name,
        })
        cells.push(r.frame)
      }
      if (fetched > 0 && fetched < tried) flags.push('PARTIAL_STILLS')
    }
    if (shots.length === 0) {
      flags.push('NO_IMAGE')
      shots.push({ i: 0, s: duration ? 0 : null, e: duration ?? null, v: null, a: null, t: '', k: null })
    }
    if (!duration) flags.push('NO_RUNTIME')
    flags.push('NO_AUDIO')
    videos.push({
      videoId: p.videoId,
      titleId: p.titleId,
      youtubeId,
      durationSec: duration,
      tried,
      fetched,
      flags,
      shots,
    })
  }
  const sprite = await buildSprite(
    cells,
    STILL_CELL_W,
    STILL_CELL_H,
    join(ctx.outDir, KEYFRAMES_FILE.replace('.json', '.jpg')),
  )
  const file: KeyframesFile = {
    version: SHOTS_SCHEMA_VERSION,
    method: 'KEYFRAMES',
    generatedAt: new Date().toISOString(),
    textSource: 'SYNOPSIS',
    sprite,
    videos,
  }
  zKeyframesFile.parse(file)
  // Yalnız içerik değiştiyse yaz (üretim zamanı tek başına dosyayı değiştirmesin; --force her durumda yazar).
  let bytes = existsSync(outFile) ? statSync(outFile).size : 0
  const prev: KeyframesFile | null = existsSync(outFile)
    ? zKeyframesFile.parse(JSON.parse(readFileSync(outFile, 'utf8')))
    : null
  if (
    ctx.force ||
    !prev ||
    JSON.stringify({ ...prev, generatedAt: '' }) !== JSON.stringify({ ...file, generatedAt: '' })
  )
    bytes = await writeFormattedJson(outFile, file)
  const withImages = videos.filter((v) => v.fetched > 0).length
  const tried = videos.reduce((s, v) => s + v.tried, 0)
  const fetched = videos.reduce((s, v) => s + v.fetched, 0)
  return {
    videos: videos.length,
    withImages,
    textOnly: videos.length - withImages,
    tried,
    fetched,
    failed: tried - fetched,
    requests,
    bytes,
    spriteBytes: sprite ? statSync(join(ctx.outDir, sprite.file)).size : 0,
  }
}

/* ───────────── Ana işlev ───────────── */

export function methodOf(p: PlayableRef): 'SCENE_DETECT' | 'KEYFRAMES' {
  return p.sources.some((s) => s.type === 'DASH') ? 'SCENE_DETECT' : 'KEYFRAMES'
}

export function parseArgs(argv: string[]): {
  target: string
  force: boolean
  cache: string | null
  threshold: number
  media: LocalMediaOptions | null
} {
  let target = 'all'
  let force = false
  let cache: string | null = null
  let threshold = SCENE_THRESHOLD
  let file: string | null = null
  let subs: string | null = null
  let note: string | null = null
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!
    if (a === '--force') force = true
    else if (a === '--cache') cache = argv[++i] ?? null
    else if (a === '--media') file = argv[++i] ?? null
    else if (a === '--subs') subs = argv[++i] ?? null
    else if (a === '--note') note = argv[++i] ?? null
    else if (a === '--threshold') {
      const t = Number(argv[++i])
      if (!(t > 0 && t < 1)) throw new Error('--threshold 0 ile 1 arasında olmalı')
      threshold = t
    } else if (!a.startsWith('--')) target = a
  }
  if ((subs || note) && !file) throw new Error('--subs ve --note yalnız --media ile kullanılır')
  if (file && !/^\d+$/.test(target))
    throw new Error('--media tek bir yaprak ister: npm run analyze:shots -- <videoId> --media <dosya>')
  if (note && note.length > 500) throw new Error('--note en çok 500 karakter')
  return { target, force, cache, threshold, media: file ? { file, subs, note } : null }
}

const USAGE =
  'Kullanım: npm run analyze:shots -- <videoId|all> [--force] [--cache <klasör>] [--threshold 0.12]\n' +
  '          npm run analyze:shots -- <videoId> --media <yerel dosya> [--subs <.vtt|.srt|.ttml>] [--note "<kaynak>"]'

async function main(argv: string[]): Promise<void> {
  let args: ReturnType<typeof parseArgs>
  try {
    args = parseArgs(argv)
  } catch (e) {
    console.error(`${(e as Error).message}\n${USAGE}`)
    process.exit(2)
  }
  const { target, force, cache, threshold, media } = args
  const contentDir = defaultContentDir()
  const ctx: Ctx = {
    contentDir,
    outDir: join(contentDir, SHOTS_DIR),
    cacheDir: cache ?? process.env.TVP_SHOTS_CACHE ?? join(tmpdir(), 'tvplus-shots-cache'),
    force,
    threshold,
    media,
    log: (s) => console.log(s),
  }
  if (target !== 'all' && !/^\d+$/.test(target)) {
    console.error(USAGE)
    process.exit(2)
  }
  mkdirSync(ctx.outDir, { recursive: true })
  mkdirSync(ctx.cacheDir, { recursive: true })
  const playables = loadTitles(contentDir).flatMap(playablesOf)
  const selected = target === 'all' ? playables : playables.filter((p) => p.videoId === Number(target))
  if (selected.length === 0) {
    console.error(`Yaprak bulunamadı: ${target}`)
    process.exit(2)
  }
  console.log(`Önbellek: ${ctx.cacheDir}`)
  const t0 = Date.now()
  const scenes: SceneSummary[] = []
  // Yerel medyayla (--media) üretilmiş SCENE_DETECT dosyası olan yapraklar KEYFRAMES'e geri eklenmez.
  const hasScene = (p: PlayableRef) => existsSync(join(ctx.outDir, `${p.videoId}.json`))
  if (media) scenes.push(await analyzeSceneDetect(selected[0]!, ctx))
  else
    for (const p of selected) {
      if (methodOf(p) === 'SCENE_DETECT') scenes.push(await analyzeSceneDetect(p, ctx))
      else if (hasScene(p)) {
        if (force) ctx.log(`• ${p.videoId}: yerel medyadan üretilmiş; yenilemek için --media ile çalıştırın`)
        scenes.push(await analyzeSceneDetect(p, { ...ctx, force: false }))
      }
    }
  // KEYFRAMES dosyası tüm gömme yapraklarını tek dosyada tutar: tek bir yaprak istense de hepsi yeniden yazılır
  // (önbellekteki kareler yeniden indirilmez).
  const kfList = playables.filter((x) => methodOf(x) === 'KEYFRAMES' && !hasScene(x))
  const kfWanted = !media && selected.some((x) => methodOf(x) === 'KEYFRAMES' && !hasScene(x))
  const kf = kfWanted ? await analyzeKeyframes(kfList, ctx) : null

  console.log('\nÖzet')
  for (const s of scenes)
    console.log(
      `  SCENE_DETECT ${s.videoId} ${s.title}: ${s.shots} çekim, ort. ${s.avgShotSec} sn${s.capped ? ' (üst sınır)' : ''}, ` +
        `metin: ${s.textLang ?? 'yok'}, ${(s.bytes / 1024).toFixed(0)} KB + pafta ${(s.spriteBytes / 1024).toFixed(0)} KB` +
        (s.skipped ? ' — var olan dosya (değişmedi; yenilemek için --force)' : '') +
        (s.mediaSource === 'LOCAL' ? ' [yerel medya]' : ''),
    )
  if (kf)
    console.log(
      `  KEYFRAMES: ${kf.videos} yaprak (${kf.withImages} kareli, ${kf.textOnly} yalnız metin); kare ${kf.fetched}/${kf.tried} ` +
        `(başarısız ${kf.failed}, bu çalıştırmada ağ isteği ${kf.requests}); ${(kf.bytes / 1024).toFixed(0)} KB + pafta ` +
        `${(kf.spriteBytes / 1024).toFixed(0)} KB`,
    )
  console.log(`Süre: ${((Date.now() - t0) / 1000).toFixed(1)} sn`)
}

if (isMain(import.meta.url))
  main(process.argv.slice(2)).catch((e: unknown) => {
    console.error(e instanceof Error ? e.message : e)
    process.exit(1)
  })
