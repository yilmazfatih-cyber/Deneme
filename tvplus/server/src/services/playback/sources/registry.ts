/**
 * Kaynak kayıt defteri: içerikteki ContentSource → teslim edilebilir biçim.
 *   DASH / PACKAGED → STREAMS (ayrı ses/video dosyaları, bayt aralığı dizini)
 *   PROGRESSIVE     → tek dosya
 *   YOUTUBE(_LIVE)  → gömme tanımı
 * LINEAR kanallar manifest katmanında EPG ile çözülür (o anki videonun kendi kaynağına iner).
 */
import { resolve, sep } from 'node:path'
import type { ByteRange, CodecProfile } from '../../../../../shared/playback'
import type { ContentSource, ContentTimedText } from '../../../../../shared/content-schema'
import type { AppConfig } from '../../../kernel/config'
import type { StreamInfo } from '../../../kernel/services'
import { upstreamSize } from '../../oca/upstream'
import { createDashLoader, SourceUnavailableError, type DashLoader, type DashRep, type ParsedDash } from './dash'
import { normalizeLang } from './languages'
import { loadPackaged } from './packaged'

export { SourceUnavailableError }

export type StreamLocation =
  | { kind: 'remote'; url: string; mime: string; size: number }
  | { kind: 'local'; path: string; mime: string; size: number }

export interface StreamRep {
  type: 'video' | 'audio'
  loc: StreamLocation
  mimeType: string
  codecs: string
  profile: CodecProfile
  bitrateKbps: number
  width: number | null
  height: number | null
  lang: string | null
  channels: number | null
  /** Özgün (ana) ses dili mi */
  isMain: boolean
  init: ByteRange
  index: ByteRange
  size: number
}
export interface TextRef {
  lang: string
  /** içerikte verilmiş ad (yoksa dil adından üretilir) */
  label: string | null
  kind: 'SUBTITLES' | 'CC'
  format: 'vtt' | 'ttml'
  url?: string
  /** mutlak yerel yol */
  path?: string
}
export type Deliverable =
  | { kind: 'STREAMS'; durationSec: number | null; video: StreamRep[]; audio: StreamRep[]; text: TextRef[] }
  | { kind: 'PROGRESSIVE'; url: string; mimeType: string; size: number | null; text: TextRef[] }
  | { kind: 'EMBED'; videoId: string | null; liveChannelId: string | null; startSec: number }

export interface ResolveContext {
  /** content/subtitles klasörü (katalogdan, istek anında) */
  subtitlesDir: string | null
  /** PROGRESSIVE boyu öğrenilmiş mi (nesne kayıt defterinden) */
  knownSize?: (url: string) => number | null
}

export interface SourceRegistry {
  resolve(source: ContentSource, ctx: ResolveContext): Promise<Deliverable>
  /** Yalnızca önbellekten (eş zamanlı, ağsız). */
  peek(source: ContentSource, ctx: ResolveContext): Deliverable | null
  dash: DashLoader
}

const kbps = (bandwidth: number) => Math.max(1, Math.round(bandwidth / 1000))

function fromDashRep(r: DashRep): StreamRep {
  return {
    type: r.type,
    loc: { kind: 'remote', url: r.url, mime: r.mimeType, size: r.size },
    mimeType: r.mimeType,
    codecs: r.codecs,
    profile: r.profile,
    bitrateKbps: kbps(r.bandwidth),
    width: r.width,
    height: r.height,
    lang: r.lang,
    channels: r.channels,
    isMain: r.isMain,
    init: r.init,
    index: r.index,
    size: r.size,
  }
}

export function timedTextRefs(list: ContentTimedText[] | undefined, subtitlesDir: string | null): TextRef[] {
  const out: TextRef[] = []
  for (const t of list ?? []) {
    const base = {
      lang: normalizeLang(t.lang),
      label: t.label || null,
      kind: t.kind ?? 'SUBTITLES',
      format: t.format,
    } as const
    if (t.url) out.push({ ...base, url: t.url })
    else if (t.file && subtitlesDir) {
      const root = resolve(subtitlesDir)
      const p = resolve(root, t.file)
      if (p.startsWith(root + sep)) out.push({ ...base, path: p })
    }
  }
  return out
}

function mergeDash(main: ParsedDash, extra: ParsedDash | null, content: TextRef[]): Deliverable {
  const audio = main.audio.map(fromDashRep)
  if (extra) {
    const groups = new Set(audio.map((a) => `${a.lang}|${a.channels}`))
    for (const r of extra.audio) {
      if (groups.has(`${r.lang}|${r.channels}`)) continue
      audio.push({ ...fromDashRep(r), isMain: false })
    }
  }
  const text: TextRef[] = [...content]
  for (const t of main.text) text.push({ lang: t.lang, label: null, kind: t.kind, format: t.format, url: t.url })
  return { kind: 'STREAMS', durationSec: main.durationSec, video: main.video.map(fromDashRep), audio, text }
}

function packagedDeliverable(mediaDir: string, id: string, content: TextRef[]): Deliverable | null {
  const pkg = loadPackaged(mediaDir, id)
  if (!pkg) return null
  const reps: StreamRep[] = pkg.index.streams.map((s) => ({
    type: s.type,
    loc: { kind: 'local', path: pkg.paths.get(s.file)!, mime: s.mimeType, size: s.sizeBytes },
    mimeType: s.mimeType,
    codecs: s.codecs,
    profile: s.profile,
    bitrateKbps: s.bitrateKbps,
    width: s.width ?? null,
    height: s.height ?? null,
    lang: s.type === 'audio' ? normalizeLang(s.language) : null,
    channels: s.type === 'audio' ? (s.channels ?? 2) : null,
    isMain: s.type === 'audio',
    init: s.init,
    index: s.index,
    size: s.sizeBytes,
  }))
  const byRate = (a: StreamRep, b: StreamRep) => a.bitrateKbps - b.bitrateKbps
  return {
    kind: 'STREAMS',
    durationSec: pkg.index.durationSec,
    video: reps.filter((r) => r.type === 'video').sort(byRate),
    audio: reps.filter((r) => r.type === 'audio').sort(byRate),
    text: content,
  }
}

export function createSourceRegistry(config: AppConfig): SourceRegistry {
  const dash = createDashLoader(config)
  const sizeCache = new Map<string, number>()

  function sync(source: ContentSource, ctx: ResolveContext, allowDash: boolean): Deliverable | null {
    const content = 'timedText' in source ? timedTextRefs(source.timedText, ctx.subtitlesDir) : []
    switch (source.type) {
      case 'DASH': {
        if (!allowDash) return null
        const main = dash.peek(source.manifest)
        if (!main) return null
        const extra = source.extraAudioManifest ? dash.peek(source.extraAudioManifest) : null
        return mergeDash(main, extra, content)
      }
      case 'PACKAGED':
        return packagedDeliverable(config.mediaDir, source.id, content)
      case 'PROGRESSIVE':
        return {
          kind: 'PROGRESSIVE',
          url: source.url,
          mimeType: source.mimeType,
          size: source.sizeBytes ?? ctx.knownSize?.(source.url) ?? sizeCache.get(source.url) ?? null,
          text: content,
        }
      case 'YOUTUBE':
        return { kind: 'EMBED', videoId: source.videoId, liveChannelId: null, startSec: source.startSec ?? 0 }
      case 'YOUTUBE_LIVE':
        return { kind: 'EMBED', videoId: source.videoId ?? null, liveChannelId: source.channelId, startSec: 0 }
      case 'LINEAR':
        return null
    }
  }

  return {
    dash,
    peek: (source, ctx) => {
      try {
        return sync(source, ctx, true)
      } catch {
        return null
      }
    },
    async resolve(source, ctx) {
      if (source.type === 'DASH') {
        const content = timedTextRefs(source.timedText, ctx.subtitlesDir)
        const main = await dash.load(source.manifest)
        let extra: ParsedDash | null = null
        if (source.extraAudioManifest) extra = await dash.load(source.extraAudioManifest).catch(() => null)
        return mergeDash(main, extra, content)
      }
      if (source.type === 'PACKAGED') {
        const d = packagedDeliverable(config.mediaDir, source.id, timedTextRefs(source.timedText, ctx.subtitlesDir))
        if (!d) throw new SourceUnavailableError(`Paketlenmiş içerik bulunamadı: ${source.id}`)
        return d
      }
      if (source.type === 'LINEAR') throw new SourceUnavailableError('Doğrusal kaynak doğrudan çözülemez')
      const d = sync(source, ctx, false)!
      // Durağan kipte boy sorulmaz: tarayıcı <video src> ile kendisi öğrenir (köken yönlendirmeli olabilir)
      if (d.kind === 'PROGRESSIVE' && d.size === null && !config.offline && !config.staticHost) {
        try {
          const size = await upstreamSize(config, d.url, 4000)
          sizeCache.set(d.url, size)
          return { ...d, size }
        } catch {
          /* boyu bilinmeden de sunulur; OCA ilk istekte öğrenir */
        }
      }
      return d
    },
  }
}

/** Rozetler için özet (katalog/keşif "HD", "5.1", altyazı dilleri). */
export function streamInfoOf(d: Deliverable, runtimeSec: number | null): StreamInfo | null {
  if (d.kind !== 'STREAMS') return null
  const uniq = (xs: string[]) => [...new Set(xs)]
  return {
    maxHeight: Math.max(0, ...d.video.map((v) => v.height ?? 0)),
    has51: d.audio.some((a) => (a.channels ?? 0) >= 6),
    textLanguages: uniq(d.text.map((t) => t.lang)),
    audioLanguages: uniq(d.audio.map((a) => a.lang ?? 'und')),
    durationSec: d.durationSec ?? runtimeSec,
  }
}
