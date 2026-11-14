/**
 * Lisanslı manifest (Netflix licensedManifest): viewableId → kaynak seçimi → imzalı OCA adresleri.
 *   Video:<id>   → katalogdaki oynatılabilir video (promo: true → tanıtım kaynağı, en çok 480p)
 *   Channel:<id> → kanalın kaynağı (YOUTUBE_LIVE → gömme; LINEAR → yayındaki videonun akışları + katılma konumu)
 *   Airing:<id>  → yayının videosu, baştan (geri al / baştan başlat)
 * Kaynak seçimi içerikteki sırayla yürür; preferredSource, supportsMse ve profil pazarlığına uyar.
 *
 * Durağan kip (`config.staticHost`, GitHub Pages): OCA vekili yoktur. Akış ve tek dosya adresleri doğrudan açık
 * kaynağın adresidir (tek sözde CDN: STATIC_ORIGIN_CDN; istemci bayt aralığını `Range` başlığıyla ister), altyazılar
 * kaynağın kendi VTT/TTML belgesi ya da önceden kopyalanmış yerel dosyadır (istemci biçimi içerikten tanır).
 * Yerel paketlenmiş içerik (PACKAGED) sunulamaz; sıradaki kaynağa geçilir.
 */
import { randomBytes } from 'node:crypto'
import { relative, sep } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import type { ContentSource } from '../../../../shared/content-schema'
import type {
  AudioTrack,
  CdnInfo,
  CodecProfile,
  EmbedManifest,
  LicensedManifest,
  ManifestBase,
  ManifestError,
  ManifestRequest,
  MediaStream,
  ProgressiveManifest,
  StreamsManifest,
  TimedTextTrack,
} from '../../../../shared/playback'
import type { Passport } from '../../kernel/context'
import type { AccessDecision, PlayableVideo } from '../../kernel/services'
import { staticSubtitlePath } from '../image/staticAssets'
import { DEFAULT_NODE_ORDER } from '../oca/nodes'
import type { Plane } from './plane'
import { languageName, normalizeLang } from './sources/languages'
import {
  SourceUnavailableError,
  type Deliverable,
  type ResolveContext,
  type StreamRep,
  type TextRef,
} from './sources/registry'

const VIDEO_PROFILES: readonly CodecProfile[] = ['vp9-webm', 'h264-mp4']
const AUDIO_PROFILES: readonly CodecProfile[] = ['opus-webm', 'aac-mp4']
export const PROMO_MAX_HEIGHT = 480

/** Durağan kipte tek "CDN": içeriğin açık kaynağı (istemci doğrudan oradan okur). */
export const STATIC_ORIGIN_CDN: CdnInfo = {
  id: 'kaynak',
  name: 'Açık kaynak (doğrudan)',
  rank: 1,
  type: 'CLOUD',
  location: 'Kaynağın kendi sunucusu',
}

export const zManifestRequest = z.object({
  viewableId: z.string().min(3).max(100),
  prefetch: z.boolean().default(false),
  promo: z.boolean().optional(),
  startOver: z.boolean().optional(),
  /** Bilinmeyen profiller reddedilmez, yok sayılır (ileriye uyum). */
  profiles: z.array(z.string().max(32)).max(16).default([]),
  supportsMse: z.boolean().default(false),
  preferredSource: z.enum(['OWN_CDN', 'YOUTUBE']).optional(),
  cdnHints: z.array(z.string().max(64)).max(16).optional(),
  uiLanguage: z.string().max(16).default('tr'),
})

export type ManifestResult =
  { ok: true; manifest: LicensedManifest } | { ok: false; status: number; body: ManifestError }

const err = (
  status: number,
  code: ManifestError['error']['code'],
  message: string,
  access?: AccessDecision,
): ManifestResult => ({
  ok: false,
  status,
  body: {
    error: {
      code,
      message,
      ...(access
        ? {
            access: {
              state: access.state,
              reasonText: access.reasonText ?? '',
              requiredProduct: access.requiredProduct,
            },
          }
        : {}),
    },
  },
})

const isOwn = (s: ContentSource) => s.type === 'DASH' || s.type === 'PACKAGED' || s.type === 'PROGRESSIVE'
const isYoutube = (s: ContentSource) => s.type === 'YOUTUBE' || s.type === 'YOUTUBE_LIVE'

export function alternativesOf(sources: ContentSource[]): ('OWN_CDN' | 'YOUTUBE')[] {
  const out: ('OWN_CDN' | 'YOUTUBE')[] = []
  if (sources.some(isOwn)) out.push('OWN_CDN')
  if (sources.some(isYoutube)) out.push('YOUTUBE')
  return out
}

function orderSources(sources: ContentSource[], preferred: ManifestRequest['preferredSource']): ContentSource[] {
  if (!preferred) return sources
  const want = preferred === 'YOUTUBE' ? isYoutube : isOwn
  return [...sources.filter(want), ...sources.filter((s) => !want(s))]
}

/** CDN sıralaması: istemci ipucu → saklı FTL sıralaması → varsayılan; kapalı düğümler atlanır. */
export function rankCdns(plane: Plane, hints: string[] | undefined, stored: string[] | null): CdnInfo[] {
  const base = hints && hints.length > 0 ? hints : (stored ?? [])
  const order: string[] = []
  for (const id of [...base, ...DEFAULT_NODE_ORDER]) {
    const n = plane.nodes.get(id)
    if (n && !n.down && !order.includes(id)) order.push(id)
  }
  return order.map((id, i) => plane.nodes.cdnInfo(id, i + 1)!).filter(Boolean)
}

interface Target {
  title: string
  videoId: number | null
  playable: PlayableVideo | null
  sources: ContentSource[]
  live: ManifestBase['live']
  /** gömme/akış başlangıç konumu (sn) — promo ofseti ya da doğrusal katılma */
  startSec: number | null
  allowBookmark: boolean
  promo: boolean
  attribution: ManifestBase['attribution']
  alternatives: ManifestBase['alternatives']
}

const attributionOf = (p: PlayableVideo | null): ManifestBase['attribution'] =>
  p ? { license: p.license.name, text: p.license.attribution, ...(p.license.url ? { url: p.license.url } : {}) } : null

function resolveTarget(
  app: FastifyInstance,
  passport: Passport,
  req: z.infer<typeof zManifestRequest>,
): Target | ManifestResult {
  const m = /^(Video|Channel|Airing):(.+)$/.exec(req.viewableId)
  if (!m) return err(400, 'BAD_REQUEST', 'viewableId biçimi tanınmadı.')
  const [, kind, rawId] = m
  const { catalog, entitlement, epg } = app.services
  if (!catalog) return err(404, 'NOT_FOUND', 'Katalog hazır değil.')
  const checkAccess = (decision: AccessDecision | null): ManifestResult | null =>
    decision && decision.state !== 'PLAYABLE'
      ? err(403, 'ACCESS_DENIED', decision.reasonText ?? 'Bu içerik şu an izlenemiyor.', decision)
      : null

  if (kind === 'Video') {
    const id = Number(rawId)
    const playable = Number.isInteger(id) ? catalog.getPlayable(id) : null
    if (!playable) return err(404, 'NOT_FOUND', 'İçerik bulunamadı.')
    const denied = checkAccess(entitlement ? entitlement.accessForVideo(passport, id) : null)
    if (denied) return denied
    const usePromo = !!req.promo && !!playable.promo
    return {
      title: playable.displayTitle,
      videoId: id,
      playable,
      sources: usePromo ? [playable.promo!.source] : playable.sources,
      live: null,
      startSec: usePromo ? playable.promo!.offsetSec : null,
      allowBookmark: !req.promo,
      promo: !!req.promo,
      attribution: attributionOf(playable),
      alternatives: alternativesOf(playable.sources),
    }
  }

  if (kind === 'Channel') {
    const id = Number(rawId)
    const channel = Number.isInteger(id) ? catalog.getChannel(id) : null
    if (!channel) return err(404, 'NOT_FOUND', 'Kanal bulunamadı.')
    const denied = checkAccess(entitlement ? entitlement.accessForChannel(passport, id) : null)
    if (denied) return denied
    if (channel.source.type === 'LINEAR') {
      const pos = epg?.linearPosition(id) ?? null
      const playable = pos ? catalog.getPlayable(pos.videoId) : null
      if (!pos || !playable) return err(503, 'SOURCE_UNAVAILABLE', 'Kanalda şu an yayın yok.')
      // Doğrusal kanal kendi CDN'imizden akar: önce kendi kaynakları
      const sources = [...playable.sources.filter(isOwn), ...playable.sources.filter((s) => !isOwn(s))]
      return {
        title: `${channel.name} · ${pos.airing.title}`,
        videoId: pos.videoId,
        playable,
        sources,
        live: {
          startAt: pos.airing.startAt.toISOString(),
          endAt: pos.airing.endAt.toISOString(),
          joinOffsetMs: Math.max(0, Math.round(pos.offsetSec * 1000)),
          seekable: true,
        },
        startSec: Math.max(0, pos.offsetSec),
        allowBookmark: false,
        promo: false,
        attribution: attributionOf(playable),
        alternatives: alternativesOf(playable.sources),
      }
    }
    const now = new Date()
    const airing = epg?.currentAiring(id, now) ?? null
    return {
      title: airing ? `${channel.name} · ${airing.title}` : channel.name,
      videoId: null,
      playable: null,
      sources: [channel.source],
      live: {
        startAt: (airing?.startAt ?? now).toISOString(),
        endAt: airing ? airing.endAt.toISOString() : null,
        joinOffsetMs: airing ? Math.max(0, now.getTime() - airing.startAt.getTime()) : 0,
        seekable: false,
      },
      startSec: null,
      allowBookmark: false,
      promo: false,
      attribution: null,
      alternatives: alternativesOf([channel.source]),
    }
  }

  // Airing
  const airing = epg?.getAiring(rawId!) ?? null
  if (!airing) return err(404, 'NOT_FOUND', 'Yayın bulunamadı.')
  const denied = checkAccess(entitlement ? entitlement.accessForChannel(passport, airing.channelId) : null)
  if (denied) return denied
  const playable = airing.videoId !== null ? catalog.getPlayable(airing.videoId) : null
  if (!playable) return err(503, 'SOURCE_UNAVAILABLE', 'Bu yayının kaydı yok.')
  const deniedVideo = checkAccess(entitlement ? entitlement.accessForVideo(passport, playable.videoId) : null)
  if (deniedVideo) return deniedVideo
  return {
    title: airing.title,
    videoId: playable.videoId,
    playable,
    sources: playable.sources,
    live: null,
    startSec: 0,
    allowBookmark: false,
    promo: false,
    attribution: attributionOf(playable),
    alternatives: alternativesOf(playable.sources),
  }
}

/**
 * Profil pazarlığı. Video: istemcinin ilk tercih ettiği ve başlıkta bulunan profil (tüm akışlar aynı profilde,
 * böylece ABR geçişi kesintisizdir). Ses: her parça için ayrı ayrı, istemcinin sırasıyla o parçanın sahip olduğu
 * ilk profil (MSE'de ses SourceBuffer'ı videodan farklı kapta olabilir; parça değişimi changeType ile yapılır).
 * Hiçbir ses parçası sunulamıyorsa (başlıkta ses varken) kaynak uyumsuzdur.
 */
export function negotiate(
  d: Extract<Deliverable, { kind: 'STREAMS' }>,
  profiles: string[],
): { video: CodecProfile; audio: CodecProfile[] } | null {
  const video = profiles.find(
    (p): p is CodecProfile => VIDEO_PROFILES.includes(p as CodecProfile) && d.video.some((v) => v.profile === p),
  )
  if (!video) return null
  const audio = profiles.filter(
    (p, i): p is CodecProfile => AUDIO_PROFILES.includes(p as CodecProfile) && profiles.indexOf(p) === i,
  )
  if (d.audio.length === 0) return { video, audio }
  if (!d.audio.some((a) => audio.includes(a.profile))) return null
  return { video, audio }
}

const newId = (prefix: string) => `${prefix}${randomBytes(9).toString('base64url')}`

export async function buildManifest(
  app: FastifyInstance,
  plane: Plane,
  passport: Passport,
  input: z.infer<typeof zManifestRequest>,
  storedRanking: string[] | null,
): Promise<ManifestResult> {
  const target = resolveTarget(app, passport, input)
  if ('ok' in target) return target

  const nowSec = Math.floor(Date.now() / 1000)
  const e = plane.signer.expiry(nowSec)
  const staticHost = app.config.staticHost
  const cdns = staticHost ? [STATIC_ORIGIN_CDN] : rankCdns(plane, input.cdnHints, storedRanking)
  let subtitlesDir: string | null = null
  try {
    subtitlesDir = app.services.catalog?.subtitlesDir() ?? null
  } catch {
    subtitlesDir = null
  }
  const ctx: ResolveContext = {
    subtitlesDir,
    knownSize: (url) => {
      const rec = plane.objects.find({ kind: 'remote', url, mime: '', size: null })
      return rec && rec.loc.kind === 'remote' ? rec.loc.size : null
    },
  }

  let bookmark: ManifestBase['bookmark'] = null
  if (target.startSec !== null && target.promo) bookmark = { positionMs: Math.round(target.startSec * 1000) }
  else if (target.allowBookmark && !input.prefetch && target.videoId !== null && passport.profile) {
    try {
      const b = app.services.progress?.getBookmark(passport.profile.guid, target.videoId) ?? null
      if (b && b.positionSec > 0) bookmark = { positionMs: Math.round(b.positionSec * 1000) }
    } catch {
      bookmark = null
    }
  }

  const base = (durationSec: number | null): ManifestBase => ({
    viewableId: input.viewableId,
    manifestId: newId('M'),
    playbackContextId: newId('P'),
    expiration: e * 1000,
    isPrefetch: input.prefetch,
    title: target.title,
    durationMs:
      durationSec !== null
        ? Math.round(durationSec * 1000)
        : target.playable?.runtimeSec
          ? target.playable.runtimeSec * 1000
          : null,
    live: target.live,
    bookmark,
    alternatives: target.alternatives,
    attribution: target.attribution,
  })

  let unavailable = false
  let anyCdnNeeded = false
  for (const src of orderSources(target.sources, input.preferredSource)) {
    if (src.type === 'LINEAR') continue
    if (src.type === 'YOUTUBE' || src.type === 'YOUTUBE_LIVE') {
      const m: EmbedManifest = {
        ...base(target.playable?.runtimeSec ?? null),
        kind: 'EXTERNAL_EMBED',
        provider: 'YOUTUBE',
        videoId: src.type === 'YOUTUBE' ? src.videoId : (src.videoId ?? null),
        liveChannelId: src.type === 'YOUTUBE_LIVE' ? src.channelId : null,
        startSec: Math.floor(target.startSec ?? (src.type === 'YOUTUBE' ? (src.startSec ?? 0) : 0)),
      }
      return { ok: true, manifest: m }
    }
    if ((src.type === 'DASH' || src.type === 'PACKAGED') && !input.supportsMse) continue
    // Durağan kipte yerel paket dosyaları yayımlanmaz (media/ git'e girmez): sıradaki kaynak denenir
    if (staticHost && src.type === 'PACKAGED') continue
    anyCdnNeeded = true
    if (cdns.length === 0) {
      unavailable = true
      continue
    }
    let d: Deliverable
    try {
      d = await plane.sources.resolve(src, ctx)
    } catch (e2) {
      if (!(e2 instanceof SourceUnavailableError)) app.log.warn({ err: (e2 as Error).message }, 'kaynak çözülemedi')
      unavailable = true
      continue
    }
    if (d.kind === 'STREAMS') {
      const pick = negotiate(d, input.profiles)
      if (!pick) continue
      const m: StreamsManifest = {
        ...base(d.durationSec),
        kind: 'STREAMS',
        videoTracks: [{ trackId: 'V-main', streams: videoStreams(plane, d, pick.video, cdns, e, target.promo) }],
        audioTracks: audioTracks(plane, d, pick.audio, cdns, e, input.uiLanguage),
        timedTextTracks: textTracks(plane, d.text, cdns, e, input.uiLanguage, subtitlesDir),
        cdns,
        license: { type: 'ACCESS_GRANT', grantId: newId('G') },
      }
      return { ok: true, manifest: m }
    }
    if (d.kind === 'PROGRESSIVE') {
      let urls: ProgressiveManifest['urls']
      if (staticHost) urls = [{ cdnId: STATIC_ORIGIN_CDN.id, url: d.url }]
      else {
        const rec = plane.objects.register({ kind: 'remote', url: d.url, mime: d.mimeType, size: d.size })
        urls = cdns.map((c) => ({ cdnId: c.id, url: `/oca/${c.id}/file?${plane.signer.query(c.id, rec.o, rec.v, e)}` }))
      }
      const m: ProgressiveManifest = {
        ...base(null),
        kind: 'PROGRESSIVE',
        mimeType: d.mimeType,
        sizeBytes: d.size,
        urls,
        timedTextTracks: textTracks(plane, d.text, cdns, e, input.uiLanguage, subtitlesDir),
        cdns,
      }
      return { ok: true, manifest: m }
    }
  }
  if (anyCdnNeeded && cdns.length === 0) return err(503, 'SOURCE_UNAVAILABLE', 'Şu an hizmet veren OCA düğümü yok.')
  if (unavailable) return err(503, 'SOURCE_UNAVAILABLE', 'İçerik kaynağına şu an ulaşılamıyor.')
  return err(422, 'NO_COMPATIBLE_SOURCE', 'Bu cihazın oynatabileceği bir kaynak yok.')
}

function streamUrls(
  plane: Plane,
  rep: StreamRep,
  cdns: CdnInfo[],
  e: number,
): { rec: { o: string; v: number }; urls: MediaStream['urls'] } {
  if (plane.config.staticHost) {
    // Doğrudan kaynak: yer tutucusuz adres; istemci aralığı Range başlığıyla ister. Yerel dosya burada olmaz (PACKAGED atlanır).
    const url = rep.loc.kind === 'remote' ? rep.loc.url : ''
    let h = 0
    for (const ch of url) h = (h * 31 + ch.charCodeAt(0)) >>> 0
    return { rec: { o: h.toString(36).padStart(6, '0'), v: 1 }, urls: [{ cdnId: STATIC_ORIGIN_CDN.id, url }] }
  }
  const rec = plane.objects.register(rep.loc)
  return {
    rec,
    urls: cdns.map((c) => ({
      cdnId: c.id,
      url: `/oca/${c.id}/range/{range}?${plane.signer.query(c.id, rec.o, rec.v, e)}`,
    })),
  }
}

function toStream(plane: Plane, rep: StreamRep, cdns: CdnInfo[], e: number): MediaStream {
  const { rec, urls } = streamUrls(plane, rep, cdns, e)
  const label =
    rep.type === 'video' ? `v-${rep.height ?? 0}p-${rep.bitrateKbps}k` : `a-${rep.lang ?? 'und'}-${rep.bitrateKbps}k`
  return {
    streamId: `${label}-${rec.o.slice(0, 6)}`,
    bitrateKbps: rep.bitrateKbps,
    ...(rep.type === 'video' && rep.width ? { width: rep.width } : {}),
    ...(rep.type === 'video' && rep.height ? { height: rep.height } : {}),
    codecs: rep.codecs,
    mimeType: rep.mimeType,
    container: rep.mimeType.endsWith('webm') ? 'webm' : 'mp4',
    profile: rep.profile,
    sizeBytes: rep.size,
    init: rep.init,
    index: rep.index,
    urls,
  }
}

function videoStreams(
  plane: Plane,
  d: Extract<Deliverable, { kind: 'STREAMS' }>,
  profile: CodecProfile,
  cdns: CdnInfo[],
  e: number,
  promo: boolean,
): MediaStream[] {
  let reps = d.video.filter((v) => v.profile === profile).sort((a, b) => a.bitrateKbps - b.bitrateKbps)
  if (promo) {
    const capped = reps.filter((r) => (r.height ?? 0) <= PROMO_MAX_HEIGHT)
    reps = capped.length > 0 ? capped : reps.slice(0, 1)
  }
  return reps.map((r) => toStream(plane, r, cdns, e))
}

function audioTracks(
  plane: Plane,
  d: Extract<Deliverable, { kind: 'STREAMS' }>,
  allowed: CodecProfile[],
  cdns: CdnInfo[],
  e: number,
  uiLanguage: string,
): AudioTrack[] {
  // Önce dil + kanal düzenine göre parçalar (tüm profiller), sonra her parçada istemcinin tercih ettiği ilk profil.
  const all = new Map<string, StreamRep[]>()
  for (const a of d.audio) {
    const key = `${a.lang ?? 'und'}|${(a.channels ?? 2) >= 6 ? '5.1' : '2.0'}`
    const g = all.get(key) ?? []
    g.push(a)
    all.set(key, g)
  }
  const groups = new Map<string, StreamRep[]>()
  for (const [key, reps] of all) {
    const profile = allowed.find((p) => reps.some((r) => r.profile === p))
    if (profile)
      groups.set(
        key,
        reps.filter((r) => r.profile === profile),
      )
  }
  // Özgün dil: ana (Role=main) temsillerin dili, yoksa ilk grubun dili. Aynı dilin 5.1 sürümü de özgündür.
  const entries = [...groups.entries()]
  const mainEntry = entries.find(([, reps]) => reps.some((r) => r.isMain)) ?? entries[0]
  const nativeLang = mainEntry ? mainEntry[0].split('|')[0] : null
  const tracks: AudioTrack[] = []
  for (const [key, reps] of entries) {
    const [lang, channels] = key.split('|') as [string, '2.0' | '5.1']
    const isNative = lang === nativeLang
    tracks.push({
      trackId: `A-${lang}-${channels === '5.1' ? '51' : '20'}`,
      language: lang,
      languageDescription: `${languageName(lang)}${isNative ? ' [Özgün]' : ''}`,
      channels,
      isNative,
      streams: reps.sort((a, b) => a.bitrateKbps - b.bitrateKbps).map((r) => toStream(plane, r, cdns, e)),
    })
  }
  const ui = normalizeLang(uiLanguage)
  const score = (t: AudioTrack) => (t.isNative ? 0 : t.language === ui ? 1 : 2) * 10 + (t.channels === '2.0' ? 0 : 1)
  return tracks.sort((a, b) => score(a) - score(b))
}

/** Durağan kipte altyazının doğrudan adresi: uzak belge ya da pages-assets'e kopyalanmış yerel dosya (göreli yol). */
function staticTextUrl(t: TextRef, subtitlesDir: string | null): string | null {
  if (t.url) return t.url
  if (!t.path || !subtitlesDir) return null
  const rel = relative(subtitlesDir, t.path)
  if (!rel || rel.startsWith('..')) return null
  return staticSubtitlePath(rel.split(sep).join('/'))
}

function textTracks(
  plane: Plane,
  refs: TextRef[],
  cdns: CdnInfo[],
  e: number,
  uiLanguage: string,
  subtitlesDir: string | null = null,
): TimedTextTrack[] {
  const seen = new Set<string>()
  const tracks: TimedTextTrack[] = []
  for (const t of refs) {
    const trackId = `T-${t.lang}${t.kind === 'CC' ? '-cc' : ''}`
    if (seen.has(trackId)) continue
    let urls: TimedTextTrack['urls']
    if (plane.config.staticHost) {
      // Belge VTT ya da TTML olabilir; istemci içerikten tanır (format alanı sözleşme gereği 'ttml' kalır)
      const url = staticTextUrl(t, subtitlesDir)
      if (!url) continue
      urls = [{ cdnId: STATIC_ORIGIN_CDN.id, url }]
    } else {
      const rec = plane.objects.register({ kind: 'text', url: t.url, path: t.path, format: t.format, lang: t.lang })
      urls = cdns.map((c) => ({
        cdnId: c.id,
        url: `/oca/${c.id}/timedtext/${trackId}?${plane.signer.query(c.id, rec.o, rec.v, e)}`,
      }))
    }
    seen.add(trackId)
    tracks.push({
      trackId,
      language: t.lang,
      languageDescription: t.label ?? `${languageName(t.lang)}${t.kind === 'CC' ? ' [CC]' : ''}`,
      type: t.kind,
      format: 'ttml',
      urls,
    })
  }
  const ui = normalizeLang(uiLanguage)
  return tracks.sort((a, b) => {
    const pa = a.language === ui ? 0 : 1
    const pb = b.language === ui ? 0 : 1
    return pa - pb || a.languageDescription.localeCompare(b.languageDescription, 'tr')
  })
}
