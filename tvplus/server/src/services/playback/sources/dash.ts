/**
 * "On-demand" DASH çözümleyici: uzak MPD'den temsil başına tek dosya + bayt aralığı dizini
 * (BaseURL, SegmentBase@indexRange, Initialization@range) çıkarır. Dosya boyları `Range: bytes=0-0`
 * isteğiyle öğrenilir. Sonuç <dataDir>/mpd-cache altında 24 saat saklanır; çevrimdışıyken eski kayıt da kullanılır.
 */
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { XMLParser } from 'fast-xml-parser'
import type { ByteRange, CodecProfile } from '../../../../../shared/playback'
import type { AppConfig } from '../../../kernel/config'
import { upstreamSize, upstreamText } from '../../oca/upstream'
import { normalizeLang } from './languages'

export interface DashRep {
  type: 'video' | 'audio'
  url: string
  mimeType: string
  codecs: string
  profile: CodecProfile
  /** bit/sn */
  bandwidth: number
  width: number | null
  height: number | null
  lang: string | null
  channels: number | null
  isMain: boolean
  init: ByteRange
  index: ByteRange
  size: number
}
export interface DashText {
  url: string
  lang: string
  format: 'vtt' | 'ttml'
  kind: 'SUBTITLES' | 'CC'
}
export interface ParsedDash {
  version: number
  url: string
  fetchedAt: number
  durationSec: number | null
  video: DashRep[]
  audio: DashRep[]
  text: DashText[]
}

const CACHE_VERSION = 1
export const MPD_TTL_MS = 24 * 60 * 60 * 1000

export class SourceUnavailableError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SourceUnavailableError'
  }
}

/** ISO 8601 süre: PT888.053S, PT1H2M3.5S */
export function parseIsoDuration(s: string | undefined): number | null {
  if (!s) return null
  const m = /^P(?:(\d+(?:\.\d+)?)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?)?$/.exec(s.trim())
  if (!m) return null
  return Number(m[1] ?? 0) * 86400 + Number(m[2] ?? 0) * 3600 + Number(m[3] ?? 0) * 60 + Number(m[4] ?? 0)
}

/** mimeType + codecs → profil (desteklenmeyen birleşimde null). */
export function profileOf(mimeType: string, codecs: string): CodecProfile | null {
  const c = codecs.toLowerCase()
  if (mimeType === 'video/webm' && (c.startsWith('vp9') || c.startsWith('vp09'))) return 'vp9-webm'
  if (mimeType === 'video/mp4' && (c.startsWith('avc1') || c.startsWith('avc3'))) return 'h264-mp4'
  if (mimeType === 'audio/webm' && c.startsWith('opus')) return 'opus-webm'
  if (mimeType === 'audio/mp4' && c.startsWith('mp4a')) return 'aac-mp4'
  return null
}

function parseRange(s: string | undefined): ByteRange | null {
  const m = s ? /^(\d+)-(\d+)$/.exec(s.trim()) : null
  return m ? { start: Number(m[1]), end: Number(m[2]) } : null
}

type XEl = Record<string, unknown>
const arr = (v: unknown): XEl[] => (Array.isArray(v) ? (v as XEl[]) : v && typeof v === 'object' ? [v as XEl] : [])
const str = (el: XEl | undefined, name: string): string | undefined => {
  const v = el?.[`@_${name}`]
  return v === undefined || v === null ? undefined : String(v)
}
const baseUrlOf = (el: XEl | undefined): string | undefined => {
  const b = el ? arr(el.BaseURL)[0] ?? (typeof el.BaseURL === 'string' ? el.BaseURL : undefined) : undefined
  if (typeof b === 'string') return b.trim()
  if (b && typeof b === 'object' && '#text' in b) return String((b as XEl)['#text']).trim()
  return undefined
}

/** MPD metnini çözer (boylar henüz bilinmez: size = -1). */
export function parseMpd(xml: string, mpdUrl: string): Omit<ParsedDash, 'fetchedAt' | 'version'> {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    removeNSPrefix: true,
    parseAttributeValue: false,
    parseTagValue: false,
    isArray: (name) => ['Period', 'AdaptationSet', 'Representation', 'Role', 'BaseURL', 'Accessibility'].includes(name),
  })
  const doc = parser.parse(xml) as XEl
  const mpd = doc.MPD as XEl | undefined
  if (!mpd) throw new Error('MPD kök öğesi yok')
  const profiles = str(mpd, 'profiles') ?? ''
  if (str(mpd, 'type') === 'dynamic') throw new Error('Canlı (dynamic) MPD desteklenmiyor')
  if (profiles && !profiles.includes('on-demand')) {
    // yine de SegmentBase'li temsilleri dener; olmayanlar aşağıda atlanır
  }
  const durationSec = parseIsoDuration(str(mpd, 'mediaPresentationDuration'))
  const mpdBase = new URL(baseUrlOf(mpd) ?? '', mpdUrl).toString()
  const video: DashRep[] = []
  const audio: DashRep[] = []
  const text: DashText[] = []
  const period = arr(mpd.Period)[0]
  if (!period) throw new Error('MPD içinde Period yok')
  const periodBase = new URL(baseUrlOf(period) ?? '', mpdBase).toString()

  for (const set of arr(period.AdaptationSet)) {
    const setBase = new URL(baseUrlOf(set) ?? '', periodBase).toString()
    const roles = arr(set.Role).map((r) => str(r, 'value') ?? '')
    const access = arr(set.Accessibility).map((r) => str(r, 'value') ?? '')
    const isMain = roles.includes('main')
    const setMime = str(set, 'mimeType')
    const contentType = str(set, 'contentType')
    const lang = str(set, 'lang') ?? null
    const setChannels = channelsOf(set)
    const setSegBase = arr(set.SegmentBase)[0] ?? (set.SegmentBase as XEl | undefined)

    for (const rep of arr(set.Representation)) {
      const mimeType = str(rep, 'mimeType') ?? setMime ?? ''
      const url = new URL(baseUrlOf(rep) ?? '', setBase).toString()
      const kind = contentType ?? mimeType.split('/')[0]
      if (kind === 'text' || mimeType.startsWith('text/') || mimeType === 'application/ttml+xml') {
        const format = mimeType === 'text/vtt' || /\.(webvtt|vtt)$/i.test(url) ? 'vtt' : mimeType === 'application/ttml+xml' || /\.(ttml|xml|dfxp)$/i.test(url) ? 'ttml' : null
        if (!format) continue
        const cc = roles.includes('caption') || access.some((a) => a.includes('caption') || a === '2')
        text.push({ url, lang: normalizeLang(lang), format, kind: cc ? 'CC' : 'SUBTITLES' })
        continue
      }
      const codecs = str(rep, 'codecs') ?? str(set, 'codecs') ?? ''
      const profile = profileOf(mimeType, codecs)
      if (!profile) continue
      const seg = (arr(rep.SegmentBase)[0] ?? (rep.SegmentBase as XEl | undefined)) ?? setSegBase
      const index = parseRange(str(seg, 'indexRange'))
      const initEl = seg ? (arr(seg.Initialization)[0] ?? (seg.Initialization as XEl | undefined)) : undefined
      const init = parseRange(str(initEl, 'range'))
      if (!index || !init) continue // on-demand değil (SegmentTemplate vb.)
      const type: 'video' | 'audio' = mimeType.startsWith('video/') ? 'video' : 'audio'
      const out: DashRep = {
        type,
        url,
        mimeType,
        codecs,
        profile,
        bandwidth: Number(str(rep, 'bandwidth') ?? 0),
        width: type === 'video' ? Number(str(rep, 'width') ?? str(set, 'width') ?? 0) || null : null,
        height: type === 'video' ? Number(str(rep, 'height') ?? str(set, 'height') ?? 0) || null : null,
        lang: type === 'audio' ? normalizeLang(lang) : null,
        channels: type === 'audio' ? (channelsOf(rep) ?? setChannels ?? 2) : null,
        isMain,
        init,
        index,
        size: -1,
      }
      ;(type === 'video' ? video : audio).push(out)
    }
  }
  video.sort((a, b) => a.bandwidth - b.bandwidth)
  audio.sort((a, b) => a.bandwidth - b.bandwidth)
  return { url: mpdUrl, durationSec, video, audio, text }
}

function channelsOf(el: XEl): number | null {
  const acc = arr(el.AudioChannelConfiguration)[0] ?? (el.AudioChannelConfiguration as XEl | undefined)
  const v = str(acc, 'value')
  if (!v) return null
  const scheme = str(acc, 'schemeIdUri') ?? ''
  if (/^\d+$/.test(v) && !scheme.includes('dolby')) return Number(v)
  // Dolby kanal maskesi (onaltılık): bit sayısı kabaca kanal sayısıdır
  const mask = parseInt(v, 16)
  if (!Number.isFinite(mask)) return null
  let n = 0
  for (let m = mask; m; m &= m - 1) n++
  return n || null
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array<R>(items.length)
  let next = 0
  const worker = async () => {
    while (next < items.length) {
      const i = next++
      out[i] = await fn(items[i]!)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return out
}

export interface DashLoader {
  load(url: string): Promise<ParsedDash>
  /** Yalnızca bellek/disk (ağa çıkmaz, eş zamanlı). */
  peek(url: string): ParsedDash | null
}

export function createDashLoader(config: AppConfig): DashLoader {
  const dir = join(config.dataDir, 'mpd-cache')
  const memory = new Map<string, ParsedDash>()
  const inflight = new Map<string, Promise<ParsedDash>>()
  const fileOf = (url: string) => join(dir, `${createHash('sha1').update(url).digest('hex')}.json`)

  function readDisk(url: string): ParsedDash | null {
    const file = fileOf(url)
    if (!existsSync(file)) return null
    try {
      const p = JSON.parse(readFileSync(file, 'utf8')) as ParsedDash
      return p.version === CACHE_VERSION && p.url === url ? p : null
    } catch {
      return null
    }
  }
  function writeDisk(p: ParsedDash) {
    mkdirSync(dir, { recursive: true })
    const file = fileOf(p.url)
    const tmp = `${file}.${process.pid}.tmp`
    writeFileSync(tmp, JSON.stringify(p))
    renameSync(tmp, file)
  }

  async function fetchAndParse(url: string): Promise<ParsedDash> {
    const xml = await upstreamText(config, url, 8000)
    const parsed = parseMpd(xml, url)
    const withSize = async (r: DashRep): Promise<DashRep | null> => {
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          return { ...r, size: await upstreamSize(config, r.url, 6000) }
        } catch {
          /* bir kez daha dene */
        }
      }
      return null // boyu öğrenilemeyen temsil sunulmaz
    }
    const reps = await mapLimit([...parsed.video, ...parsed.audio], 6, withSize)
    const ok = reps.filter((r): r is DashRep => r !== null)
    const result: ParsedDash = {
      version: CACHE_VERSION,
      fetchedAt: Date.now(),
      ...parsed,
      video: ok.filter((r) => r.type === 'video'),
      audio: ok.filter((r) => r.type === 'audio'),
    }
    if (result.video.length === 0 && result.audio.length === 0) throw new Error('MPD içinde sunulabilir temsil yok')
    return result
  }

  return {
    peek(url) {
      const m = memory.get(url)
      if (m) return m
      const d = readDisk(url)
      if (d) memory.set(url, d)
      return d
    },
    async load(url) {
      const now = Date.now()
      const mem = memory.get(url)
      if (mem && (config.offline || now - mem.fetchedAt < MPD_TTL_MS)) return mem
      const disk = mem ?? readDisk(url)
      if (disk && (config.offline || now - disk.fetchedAt < MPD_TTL_MS)) {
        memory.set(url, disk)
        return disk
      }
      if (config.offline) throw new SourceUnavailableError('Çevrimdışı ve MPD önbellekte yok')
      let p = inflight.get(url)
      if (!p) {
        p = fetchAndParse(url)
          .then((r) => {
            memory.set(url, r)
            try {
              writeDisk(r)
            } catch {
              /* disk yazılamadı: bellekte kalsın */
            }
            return r
          })
          .finally(() => inflight.delete(url))
        inflight.set(url, p)
      }
      try {
        return await p
      } catch (err) {
        if (disk) return disk // eski kayıt, yoktan iyidir
        throw new SourceUnavailableError(`MPD alınamadı: ${(err as Error).message}`)
      }
    },
  }
}
