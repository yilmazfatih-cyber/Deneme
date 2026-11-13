/**
 * İçerik hattının kodlama/paketleme adımı (Netflix'te kodlama boru hattı + paketleyici):
 *
 *   npm run package:title -- --input <video> --id <slug> [--ladder 240,360,480] [--codecs vp9,h264]
 *                            [--lang tr] [--gop 2] [--speed fast|good] [--media-dir <klasör>]
 *
 * ffmpeg ile hizalı GOP'lu (≈2 sn) bir video merdiveni + ses üretir. Her akış tek dosyadır ve uzak DASH
 * varlıkları gibi bayt aralığıyla adreslenir:
 *   MP4  : fragmanlı, ftyp + moov (başlatma) ardından dosyanın önünde tek bir sidx (dizin)
 *   WebM : EBML + Info + Tracks (başlatma), kümelerden ÖNCE Cues (dizin)
 * Sonra her çıktı ayrıştırılıp aralıklar doğrulanır ve <mediaDir>/packaged/<id>/index.json yazılır
 * (biçim: server/src/services/playback/sources/packaged.ts).
 */
import { execFile } from 'node:child_process'
import { existsSync, mkdirSync, openSync, readSync, closeSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'
import { promisify } from 'node:util'
import { pathToFileURL } from 'node:url'
import { loadConfig } from '../server/src/kernel/config'
import { mp4Layout, mp4TopLevelBoxes, webmLayout } from '../server/src/services/playback/sources/containers'
import { packagedDir, zPackagedIndex, type PackagedIndex, type PackagedStream } from '../server/src/services/playback/sources/packaged'

const run = promisify(execFile)

export type VideoCodec = 'vp9' | 'h264'

export interface PackageOptions {
  input: string
  id: string
  mediaDir: string
  /** video yükseklikleri */
  ladder?: number[]
  codecs?: VideoCodec[]
  /** ses dili (ISO 639-1) */
  lang?: string
  /** GOP / parça süresi (sn) */
  gopSec?: number
  /** 'fast' testler ve önizleme için; 'good' gerçek paketleme için */
  speed?: 'fast' | 'good'
  /** yükseklik → kbit/sn (VP9 için; H.264 ×1.4) — verilmezse tablo kullanılır */
  bitrates?: Record<number, number>
  audioKbps?: number
  log?: (msg: string) => void
}

/** VP9 için yükseklik → hedef bit hızı (kbit/sn). H.264 aynı kalite için ≈ 1,4 katı ister. */
const VP9_KBPS: Record<number, number> = { 144: 120, 180: 160, 240: 300, 360: 550, 480: 900, 576: 1200, 720: 1800, 1080: 3300 }
const nearestKbps = (h: number, table: Record<number, number>) => {
  if (table[h]) return table[h]
  const keys = Object.keys(table).map(Number).sort((a, b) => a - b)
  const k = keys.find((x) => x >= h) ?? keys[keys.length - 1]!
  return Math.round((table[k]! * h) / k)
}

interface Probe {
  durationSec: number
  width: number
  height: number
  fps: number
  hasAudio: boolean
}

async function probe(input: string): Promise<Probe> {
  const { stdout } = await run('ffprobe', [
    '-v',
    'error',
    '-show_entries',
    'stream=codec_type,width,height,avg_frame_rate,r_frame_rate:format=duration',
    '-of',
    'json',
    input,
  ])
  const j = JSON.parse(stdout) as {
    streams: { codec_type: string; width?: number; height?: number; avg_frame_rate?: string; r_frame_rate?: string }[]
    format: { duration?: string }
  }
  const v = j.streams.find((s) => s.codec_type === 'video')
  if (!v || !v.width || !v.height) throw new Error('Girdide video akışı yok')
  const rate = (s: string | undefined) => {
    const [a, b] = (s ?? '0/1').split('/').map(Number)
    return a && b ? a / b : 0
  }
  const fps = rate(v.avg_frame_rate) || rate(v.r_frame_rate) || 25
  return {
    durationSec: Number(j.format.duration ?? 0),
    width: v.width,
    height: v.height,
    fps,
    hasAudio: j.streams.some((s) => s.codec_type === 'audio'),
  }
}

function readHead(file: string, bytes: number): Buffer {
  const fd = openSync(file, 'r')
  try {
    const buf = Buffer.alloc(Math.min(bytes, statSync(file).size))
    readSync(fd, buf, 0, buf.length, 0)
    return buf
  } finally {
    closeSync(fd)
  }
}

/** moov içindeki avcC kutusundan RFC 6381 codec dizgesi: avc1.PPCCLL */
function avcCodecString(head: Buffer): string {
  const i = head.indexOf('avcC', 0, 'latin1')
  if (i < 0 || i + 8 > head.length) return 'avc1.4d401f'
  const hex = (n: number) => n.toString(16).padStart(2, '0')
  return `avc1.${hex(head.readUInt8(i + 5))}${hex(head.readUInt8(i + 6))}${hex(head.readUInt8(i + 7))}`
}

interface Layout {
  init: { start: number; end: number }
  index: { start: number; end: number }
  segments: number
  durationSec: number
  codecs: string | null
  lastEnd: number
}

/** Çıktıyı ayrıştırır; dizin dosyanın önünde değilse ya da aralıklar tutarsızsa hata fırlatır. */
export function inspectOutput(file: string, container: 'mp4' | 'webm'): Layout {
  const size = statSync(file).size
  let headBytes = 1024 * 1024
  for (;;) {
    const head = readHead(file, headBytes)
    try {
      if (container === 'mp4') {
        const l = mp4Layout(head)
        const refs = l.sidx.references
        const lastEnd = refs[refs.length - 1]?.range.end ?? -1
        if (refs.length === 0) throw new Error('sidx boş')
        if (refs[0]!.range.start !== l.index.end + 1) throw new Error('ilk parça sidx kutusunun hemen ardında değil')
        if (lastEnd > size - 1) throw new Error('sidx dosya sonunun ötesini gösteriyor')
        const moofAt = mp4TopLevelBoxes(readHead(file, refs[0]!.range.start + 16).subarray(refs[0]!.range.start), 1)[0]
        if (!moofAt || moofAt.type !== 'moof') throw new Error('ilk parça moof ile başlamıyor')
        return {
          init: l.init,
          index: l.index,
          segments: refs.length,
          durationSec: l.sidx.durationSec,
          codecs: head.indexOf('avcC', 0, 'latin1') >= 0 ? avcCodecString(head) : null,
          lastEnd,
        }
      }
      const l = webmLayout(head)
      if (l.cues.length === 0) throw new Error('Cues boş')
      if (l.firstClusterOffset !== null && l.cues[0]!.clusterOffset !== l.firstClusterOffset) throw new Error('ilk Cue ilk kümeyi göstermiyor')
      for (const c of l.cues) if (c.clusterOffset >= size) throw new Error('Cue dosya sonunun ötesini gösteriyor')
      return { init: l.init, index: l.index, segments: l.cues.length, durationSec: l.durationSec ?? 0, codecs: null, lastEnd: size - 1 }
    } catch (err) {
      if (headBytes < size && /okunan bölümün dışında/.test((err as Error).message)) {
        headBytes *= 4
        continue
      }
      throw new Error(`${basename(file)}: ${(err as Error).message}`)
    }
  }
}

interface Job {
  file: string
  type: 'video' | 'audio'
  codec: 'vp9' | 'h264' | 'opus' | 'aac'
  height?: number
  width?: number
  kbps: number
  args: string[]
}

export async function packageTitle(opts: PackageOptions): Promise<PackagedIndex> {
  const log = opts.log ?? (() => undefined)
  if (!/^[a-z0-9-]+$/.test(opts.id)) throw new Error('--id yalnızca küçük harf, rakam ve tire içerebilir')
  const input = resolve(opts.input)
  if (!existsSync(input)) throw new Error(`Girdi bulunamadı: ${input}`)
  const info = await probe(input)
  const gopSec = opts.gopSec ?? 2
  const gop = Math.max(1, Math.round(info.fps * gopSec))
  const codecs: VideoCodec[] = opts.codecs?.length ? opts.codecs : ['vp9']
  const speed = opts.speed ?? 'good'
  const lang = (opts.lang ?? 'und').toLowerCase()
  const table = opts.bitrates ?? VP9_KBPS
  const audioKbps = opts.audioKbps ?? 96

  // Kaynaktan büyük basamak üretilmez (en az bir basamak kalır).
  let ladder = [...new Set(opts.ladder?.length ? opts.ladder : [240, 360, 480])].sort((a, b) => a - b)
  const fitting = ladder.filter((h) => h <= info.height)
  ladder = fitting.length > 0 ? fitting : [Math.min(ladder[0]!, info.height - (info.height % 2))]

  const finalDir = packagedDir(opts.mediaDir, opts.id)
  const stage = `${finalDir}.tmp-${process.pid}`
  rmSync(stage, { recursive: true, force: true })
  mkdirSync(stage, { recursive: true })

  const keyframes = ['-force_key_frames', `expr:gte(t,n_forced*${gopSec})`, '-g', String(gop), '-keyint_min', String(gop)]
  const jobs: Job[] = []
  for (const codec of codecs) {
    for (const h of ladder) {
      const w = Math.max(2, Math.round((info.width * h) / info.height / 2) * 2)
      const base = nearestKbps(h, table)
      const kbps = codec === 'h264' ? Math.round(base * 1.4) : base
      const scale = ['-vf', `scale=${w}:${h}`, '-pix_fmt', 'yuv420p']
      const rate = ['-b:v', `${kbps}k`, '-maxrate', `${Math.round(kbps * 1.5)}k`, '-bufsize', `${kbps * 2}k`]
      if (codec === 'vp9') {
        const spd = speed === 'fast' ? ['-deadline', 'realtime', '-cpu-used', '8'] : ['-deadline', 'good', '-cpu-used', '2']
        jobs.push({
          file: `v-${h}p-${kbps}k-vp9.webm`,
          type: 'video',
          codec,
          height: h,
          width: w,
          kbps,
          args: ['-map', '0:v:0', '-an', '-c:v', 'libvpx-vp9', ...rate, ...scale, ...keyframes, ...spd, '-row-mt', '1', '-f', 'webm', '-dash', '1', '-cues_to_front', '1'],
        })
      } else {
        jobs.push({
          file: `v-${h}p-${kbps}k-h264.mp4`,
          type: 'video',
          codec,
          height: h,
          width: w,
          kbps,
          args: [
            '-map', '0:v:0', '-an', '-c:v', 'libx264', '-preset', speed === 'fast' ? 'veryfast' : 'medium',
            '-profile:v', h >= 720 ? 'high' : 'main', ...rate, ...scale, ...keyframes, '-sc_threshold', '0',
            '-movflags', '+frag_keyframe+empty_moov+default_base_moof+global_sidx+skip_trailer', '-f', 'mp4',
          ],
        })
      }
    }
    if (info.hasAudio) {
      if (codec === 'vp9') {
        jobs.push({
          file: `a-${lang}-${audioKbps}k-opus.webm`,
          type: 'audio',
          codec: 'opus',
          kbps: audioKbps,
          args: ['-map', '0:a:0', '-vn', '-c:a', 'libopus', '-b:a', `${audioKbps}k`, '-ac', '2', '-f', 'webm', '-dash', '1', '-cues_to_front', '1', '-cluster_time_limit', String(gopSec * 1000)],
        })
      } else {
        const aac = Math.max(audioKbps, 128)
        jobs.push({
          file: `a-${lang}-${aac}k-aac.mp4`,
          type: 'audio',
          codec: 'aac',
          kbps: aac,
          args: ['-map', '0:a:0', '-vn', '-c:a', 'aac', '-b:a', `${aac}k`, '-ac', '2', '-frag_duration', String(gopSec * 1_000_000), '-movflags', '+empty_moov+default_base_moof+global_sidx+skip_trailer', '-f', 'mp4'],
        })
      }
    }
  }

  const streams: PackagedStream[] = []
  try {
    for (const job of jobs) {
      const out = join(stage, job.file)
      log(`kodlanıyor: ${job.file}`)
      await run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', input, ...job.args, out], { maxBuffer: 16 * 1024 * 1024 })
      const container = job.file.endsWith('.webm') ? 'webm' : 'mp4'
      const layout = inspectOutput(out, container)
      const sizeBytes = statSync(out).size
      const durationSec = layout.durationSec || info.durationSec
      const codecString = job.codec === 'vp9' ? 'vp9' : job.codec === 'opus' ? 'opus' : job.codec === 'aac' ? 'mp4a.40.2' : (layout.codecs ?? 'avc1.4d401f')
      streams.push({
        file: job.file,
        type: job.type,
        mimeType: `${job.type}/${container}` as PackagedStream['mimeType'],
        codecs: codecString,
        profile: job.codec === 'vp9' ? 'vp9-webm' : job.codec === 'h264' ? 'h264-mp4' : job.codec === 'opus' ? 'opus-webm' : 'aac-mp4',
        bitrateKbps: Math.max(1, Math.round((sizeBytes * 8) / Math.max(0.001, durationSec) / 1000)),
        sizeBytes,
        ...(job.type === 'video' ? { width: job.width!, height: job.height! } : { language: lang, channels: 2 }),
        init: layout.init,
        index: layout.index,
        durationSec: Math.round(durationSec * 1000) / 1000,
        segments: layout.segments,
      })
      log(`  ✓ başlatma ${layout.init.start}-${layout.init.end}, dizin ${layout.index.start}-${layout.index.end}, ${layout.segments} parça, ${sizeBytes} bayt`)
    }
    const index: PackagedIndex = zPackagedIndex.parse({
      version: 1,
      id: opts.id,
      createdAt: new Date().toISOString(),
      durationSec: Math.round(info.durationSec * 1000) / 1000 || Math.max(...streams.map((s) => s.durationSec)),
      gopSec,
      source: basename(input),
      streams,
    })
    writeFileSync(join(stage, 'index.json'), JSON.stringify(index, null, 2) + '\n')
    rmSync(finalDir, { recursive: true, force: true })
    renameSync(stage, finalDir)
    return index
  } catch (err) {
    rmSync(stage, { recursive: true, force: true })
    throw err
  }
}

/* ───────────── komut satırı ───────────── */

function parseArgs(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {}
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!
    if (!a.startsWith('--')) continue
    const [k, inline] = a.slice(2).split('=', 2) as [string, string | undefined]
    if (inline !== undefined) out[k] = inline
    else if (argv[i + 1] && !argv[i + 1]!.startsWith('--')) out[k] = argv[++i]!
    else out[k] = 'true'
  }
  return out
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (!args.input || !args.id) {
    console.error('Kullanım: npm run package:title -- --input <video> --id <slug> [--ladder 240,360,480] [--codecs vp9,h264] [--lang tr]')
    process.exit(2)
  }
  const codecs = (args.codecs ?? 'vp9').split(',').map((s) => s.trim()) as VideoCodec[]
  for (const c of codecs) if (c !== 'vp9' && c !== 'h264') throw new Error(`Bilinmeyen codec: ${c}`)
  const mediaDir = args['media-dir'] ? resolve(args['media-dir']) : loadConfig().mediaDir
  const t0 = Date.now()
  const index = await packageTitle({
    input: args.input,
    id: args.id,
    mediaDir,
    ladder: args.ladder ? args.ladder.split(',').map(Number).filter((n) => n > 0) : undefined,
    codecs,
    lang: args.lang,
    gopSec: args.gop ? Number(args.gop) : undefined,
    speed: args.speed === 'fast' ? 'fast' : 'good',
    log: (m) => console.log(m),
  })
  console.log(`Paketlendi: ${packagedDir(mediaDir, index.id)}/index.json — ${index.streams.length} akış, ${((Date.now() - t0) / 1000).toFixed(1)} sn`)
  console.log(`İçerikte kullanmak için: { "type": "PACKAGED", "id": "${index.id}" }`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((err: unknown) => {
    console.error(`Paketleme başarısız: ${(err as Error).message}`)
    process.exit(1)
  })
}
