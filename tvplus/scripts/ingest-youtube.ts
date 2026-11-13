/**
 * YouTube içerik hattı (`npm run ingest:youtube -- <kip>`). Yalnızca anahtarsız, herkese açık uçlar kullanılır.
 *
 *   (kipsiz)            İçerikteki tüm YOUTUBE / YOUTUBE_LIVE kaynaklarını denetler, tablo basar,
 *                       content/.youtube-report.json yazar. Çıkış kodu 0.
 *   --check             Aynısı; bozuk bir şey varsa çıkış kodu 1.
 *   --fix-art           storyArt'ı boş YouTube başlık/bölümlerine i.ytimg.com küçük resmini yazar.
 *   --channel <UC…>     Kanalın son videolarını içerik iskeleti (ContentTitle) olarak basar.
 *   --dir <klasör>      İçerik klasörü (varsayılan: content/ ya da TVP_CONTENT_DIR).
 */
import { join } from 'node:path'
import { XMLParser } from 'fast-xml-parser'
import {
  allocateIds,
  collectSources,
  defaultContentDir,
  isObj,
  readJson,
  slugify,
  titleFiles,
  usedVideoIds,
  writeJson,
  type Json,
} from './lib/content'
import { httpGet, isMain, sleep, type HttpGet } from './lib/net'

export interface YoutubeDeps {
  get: HttpGet
  sleep: (ms: number) => Promise<void>
  now: () => Date
  log: (line: string) => void
}
export const REQUEST_GAP_MS = 150

export type VideoState = 'ok' | 'embed-disabled' | 'missing' | 'error' | 'wrong-channel'
export interface VideoCheck {
  ok: boolean
  status: number
  state: VideoState
  title: string | null
  author: string | null
}
export interface ChannelCheck {
  ok: boolean
  /** Akışın HTTP durumu; akış başarısızsa kanal sayfasının durumu */
  status: number
  title: string | null
  latestVideoId: string | null
  /** Hangi uçla doğrulandı: Atom akışı ya da (akış yanıt vermezse) kanal sayfası */
  via: 'feed' | 'page' | null
}
export interface YoutubeReport {
  checkedAt: string
  videos: Record<string, VideoCheck & { usedBy: string[] }>
  channels: Record<string, ChannelCheck & { usedBy: string[] }>
}

/** oEmbed yanıtını sınıflandırır: 200 tamam · 401/403 gömme kapalı · 400/404 yok · diğerleri hata. */
export function classifyOembed(status: number, body: string): VideoCheck {
  if (status === 200) {
    try {
      const j = JSON.parse(body) as { title?: unknown; author_name?: unknown }
      return {
        ok: true,
        status,
        state: 'ok',
        title: typeof j.title === 'string' ? j.title : null,
        author: typeof j.author_name === 'string' ? j.author_name : null,
      }
    } catch {
      return { ok: true, status, state: 'ok', title: null, author: null }
    }
  }
  if (status === 401 || status === 403) return { ok: false, status, state: 'embed-disabled', title: null, author: null }
  if (status === 400 || status === 404) return { ok: false, status, state: 'missing', title: null, author: null }
  return { ok: false, status, state: 'error', title: null, author: null }
}

export interface FeedEntry {
  videoId: string
  title: string
  published: string
  author: string | null
  description: string
  thumbnail: string | null
}
export interface ParsedFeed {
  channelTitle: string | null
  entries: FeedEntry[]
}

const asArray = <T>(v: T | T[] | undefined): T[] => (v === undefined ? [] : Array.isArray(v) ? v : [v])
const str = (v: unknown): string =>
  typeof v === 'string'
    ? v
    : typeof v === 'number'
      ? String(v)
      : isObj(v) && typeof v['#text'] === 'string'
        ? v['#text']
        : ''

/** YouTube kanal akışını (Atom) ayrıştırır. */
export function parseChannelFeed(xml: string): ParsedFeed {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    parseTagValue: false,
    parseAttributeValue: false,
  })
  const doc = parser.parse(xml) as Record<string, unknown>
  const feed = doc.feed
  if (!isObj(feed)) return { channelTitle: null, entries: [] }
  const entries: FeedEntry[] = []
  for (const e of asArray(feed.entry as Json | Json[] | undefined)) {
    if (!isObj(e)) continue
    const group = isObj(e['media:group']) ? e['media:group'] : {}
    const thumb = isObj(group['media:thumbnail']) ? str(group['media:thumbnail']['@_url']) : ''
    const author = isObj(e.author) ? str(e.author.name) : ''
    const videoId = str(e['yt:videoId'])
    if (!videoId) continue
    entries.push({
      videoId,
      title: str(e.title),
      published: str(e.published),
      author: author || null,
      description: str(group['media:description']),
      thumbnail: thumb || null,
    })
  }
  return { channelTitle: str(feed.title) || null, entries }
}

/** "2 gün önce" / "3 years ago" gibi göreli tarihten yaklaşık ISO tarih (bilinmiyorsa bugün). */
export function approximateDate(text: string, now: Date): string {
  const m =
    /(\d+)\s*(saniye|sn\.|dakika|dk\.|saat|sa\.|gün|hafta|hf\.|ay|yıl|second|minute|hour|day|week|month|year)/i.exec(
      text,
    )
  const d = new Date(now)
  if (m && m[1] && m[2]) {
    const n = Number(m[1])
    const unit = m[2].toLocaleLowerCase('tr-TR')
    if (/^(gün|day)/.test(unit)) d.setUTCDate(d.getUTCDate() - n)
    else if (/^(hafta|hf|week)/.test(unit)) d.setUTCDate(d.getUTCDate() - 7 * n)
    else if (/^(ay|month)/.test(unit)) d.setUTCMonth(d.getUTCMonth() - n)
    else if (/^(yıl|year)/.test(unit)) d.setUTCFullYear(d.getUTCFullYear() - n)
  }
  return d.toISOString().slice(0, 10)
}

/**
 * Yedek: kanalın /videos sayfasındaki ytInitialData'dan son videolar (Atom akışı yanıt vermediğinde).
 * Açıklama sayfada yoktur; yayın tarihi göreli metinden yaklaşık hesaplanır.
 */
export function parseChannelVideosPage(html: string, now: Date): ParsedFeed {
  const m = /var ytInitialData = (\{.*?\});<\/script>/s.exec(html)
  if (!m || !m[1]) return { channelTitle: null, entries: [] }
  let data: unknown
  try {
    data = JSON.parse(m[1])
  } catch {
    return { channelTitle: null, entries: [] }
  }
  const entries: FeedEntry[] = []
  const seen = new Set<string>()
  let channelTitle: string | null = null
  const walk = (v: unknown) => {
    if (Array.isArray(v)) v.forEach(walk)
    else if (isObj(v)) {
      const cmr = v.channelMetadataRenderer
      if (isObj(cmr) && typeof cmr.title === 'string') channelTitle = cmr.title
      const l = v.lockupViewModel
      if (
        isObj(l) &&
        l.contentType === 'LOCKUP_CONTENT_TYPE_VIDEO' &&
        typeof l.contentId === 'string' &&
        !seen.has(l.contentId)
      ) {
        seen.add(l.contentId)
        const meta =
          isObj(l.metadata) && isObj(l.metadata.lockupMetadataViewModel) ? l.metadata.lockupMetadataViewModel : {}
        const title = isObj(meta.title) ? str(meta.title.content) : ''
        // Satırlardaki son parça genellikle "2 gün önce"
        const texts: string[] = []
        const collect = (x: unknown) => {
          if (Array.isArray(x)) x.forEach(collect)
          else if (isObj(x)) {
            if (isObj(x.text) && typeof x.text.content === 'string') texts.push(x.text.content)
            Object.values(x).forEach(collect)
          }
        }
        collect(meta.metadata)
        const rel = texts.find((t) => /önce|ago/i.test(t)) ?? ''
        entries.push({
          videoId: l.contentId,
          title,
          published: approximateDate(rel, now),
          author: null,
          description: '',
          thumbnail: `https://i.ytimg.com/vi/${l.contentId}/hqdefault.jpg`,
        })
      }
      Object.values(v).forEach(walk)
    }
  }
  walk(data)
  return { channelTitle, entries }
}

/** İçerikteki YouTube video ve kanal kimliklerini, kullanıldıkları yerlerle toplar. */
export function collectYoutubeRefs(contentDir: string): {
  videos: Map<string, string[]>
  channels: Map<string, string[]>
  /** Canlı kanalın yedek videosu → o kanalın kimliği (video gerçekten o kanala mı ait diye bakılır) */
  liveVideos: Map<string, string>
} {
  const videos = new Map<string, string[]>()
  const channels = new Map<string, string[]>()
  const liveVideos = new Map<string, string>()
  const add = (m: Map<string, string[]>, id: string, where: string) => m.set(id, [...(m.get(id) ?? []), where])
  for (const ref of collectSources(contentDir)) {
    const where = `${ref.file} ${ref.path}`
    if (ref.source.type === 'YOUTUBE') add(videos, ref.source.videoId, where)
    else if (ref.source.type === 'YOUTUBE_LIVE') {
      add(channels, ref.source.channelId, where)
      if (ref.source.videoId) {
        add(videos, ref.source.videoId, where)
        liveVideos.set(ref.source.videoId, ref.source.channelId)
      }
    }
  }
  return { videos, channels, liveVideos }
}

/** Yükleyen adı ile kanal adı aynı kanalı mı gösteriyor (harf büyüklüğü, Türkçe harfler ve noktalama yok sayılır). */
export function sameChannelName(author: string | null, channelTitle: string | null): boolean {
  const fold = (x: string) =>
    x
      .toLocaleLowerCase('tr-TR')
      .replace(/[ıİ]/g, 'i')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]/g, '')
  if (!author || !channelTitle) return true // bilinmiyorsa hüküm verme
  const a = fold(author)
  const c = fold(channelTitle)
  return a.length > 0 && c.length > 0 && (a.includes(c) || c.includes(a))
}

export const oembedUrl = (id: string) =>
  `https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${id}`)}&format=json`
export const feedUrl = (channelId: string) =>
  `https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(channelId)}`

export async function checkVideo(id: string, deps: Pick<YoutubeDeps, 'get'>): Promise<VideoCheck> {
  try {
    const res = await deps.get(oembedUrl(id), { timeoutMs: 8000 })
    return classifyOembed(res.status, res.text)
  } catch {
    return { ok: false, status: 0, state: 'error', title: null, author: null }
  }
}

export const channelPageUrl = (channelId: string) => `https://www.youtube.com/channel/${encodeURIComponent(channelId)}`

const decodeEntities = (s: string) =>
  s
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')

/**
 * Kanal sayfasından varlık denetimi. YouTube olmayan kanal için de 200 döndürür; bu yüzden sayfada kanalın kendi
 * kimliği (`"externalId":"<id>"` ya da canonical bağlantı) aranır.
 */
export function parseChannelPage(html: string, channelId: string): { exists: boolean; title: string | null } {
  const exists =
    html.includes(`"externalId":"${channelId}"`) ||
    html.includes(`<link rel="canonical" href="https://www.youtube.com/channel/${channelId}"`)
  const og = /<meta property="og:title" content="([^"]*)"/.exec(html)?.[1]
  return { exists, title: exists && og ? decodeEntities(og) : null }
}

/**
 * Kanal denetimi: önce Atom akışı (200 → var). Akış başka bir durum dönerse (bu uç zaman zaman var olan kanallar için
 * de 404 veriyor) kanal sayfasına düşülür.
 */
export async function checkChannel(
  id: string,
  deps: Pick<YoutubeDeps, 'get'> & Partial<Pick<YoutubeDeps, 'sleep'>>,
): Promise<ChannelCheck> {
  let feedStatus = 0
  try {
    const res = await deps.get(feedUrl(id), { timeoutMs: 8000 })
    feedStatus = res.status
    if (res.status === 200) {
      const feed = parseChannelFeed(res.text)
      return {
        ok: true,
        status: 200,
        title: feed.channelTitle,
        latestVideoId: feed.entries[0]?.videoId ?? null,
        via: 'feed',
      }
    }
  } catch {
    /* sayfaya düş */
  }
  try {
    await deps.sleep?.(REQUEST_GAP_MS)
    const page = await deps.get(channelPageUrl(id), { timeoutMs: 8000 })
    if (page.status === 200) {
      const p = parseChannelPage(page.text, id)
      if (p.exists) return { ok: true, status: 200, title: p.title, latestVideoId: null, via: 'page' }
    }
    return {
      ok: false,
      status: page.status === 200 ? 404 : page.status || feedStatus,
      title: null,
      latestVideoId: null,
      via: null,
    }
  } catch {
    return { ok: false, status: feedStatus, title: null, latestVideoId: null, via: null }
  }
}

const STATE_TEXT: Record<VideoState, string> = {
  ok: 'tamam',
  'embed-disabled': 'gömme kapalı',
  missing: 'yok',
  error: 'hata',
  'wrong-channel': 'başka kanal',
}

/** Tüm YouTube kaynaklarını denetler; rapor nesnesini döndürür (dosyaya yazmaz). */
export async function runCheck(contentDir: string, deps: YoutubeDeps): Promise<YoutubeReport> {
  const refs = collectYoutubeRefs(contentDir)
  const report: YoutubeReport = { checkedAt: deps.now().toISOString(), videos: {}, channels: {} }
  let first = true
  const gap = async () => {
    if (!first) await deps.sleep(REQUEST_GAP_MS)
    first = false
  }
  for (const [id, usedBy] of refs.videos) {
    await gap()
    report.videos[id] = { ...(await checkVideo(id, deps)), usedBy }
  }
  for (const [id, usedBy] of refs.channels) {
    await gap()
    report.channels[id] = { ...(await checkChannel(id, deps)), usedBy }
  }
  // Canlı kanalın yedek videosu o kanalın kendi yayını olmalı; başka kanalın videosuysa sorunlu say.
  for (const [videoId, channelId] of refs.liveVideos) {
    const v = report.videos[videoId]
    const c = report.channels[channelId]
    if (v?.ok && c?.ok && !sameChannelName(v.author, c.title))
      report.videos[videoId] = { ...v, ok: false, state: 'wrong-channel' }
  }
  return report
}

export function isReportBroken(r: YoutubeReport): boolean {
  return Object.values(r.videos).some((v) => !v.ok) || Object.values(r.channels).some((c) => !c.ok)
}

const cut = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)
const pad = (s: string, n: number) => (s.length >= n ? s : s + ' '.repeat(n - s.length))

export function formatReportTable(r: YoutubeReport): string {
  const lines: string[] = []
  const vids = Object.entries(r.videos)
  const chans = Object.entries(r.channels)
  lines.push(`Videolar (${vids.length}):`)
  lines.push(`  ${pad('Kimlik', 13)}${pad('Durum', 15)}${pad('HTTP', 6)}Başlık — Yükleyen`)
  for (const [id, v] of vids)
    lines.push(
      `  ${pad(id, 13)}${pad(`${v.ok ? '✓' : '✗'} ${STATE_TEXT[v.state]}`, 15)}${pad(String(v.status || '—'), 6)}${v.title ? cut(`${v.title} — ${v.author ?? '?'}`, 70) : cut(v.usedBy[0] ?? '', 70)}`,
    )
  lines.push(`Kanallar (${chans.length}):`)
  lines.push(`  ${pad('Kimlik', 26)}${pad('Durum', 10)}${pad('Uç', 7)}Kanal adı`)
  for (const [id, c] of chans)
    lines.push(
      `  ${pad(id, 26)}${pad(c.ok ? '✓ tamam' : c.status === 0 ? '✗ hata' : '✗ yok', 10)}${pad(c.via === 'feed' ? 'akış' : c.via === 'page' ? 'sayfa' : String(c.status || '—'), 7)}${c.title ?? cut(c.usedBy[0] ?? '', 60)}`,
    )
  const badV = vids.filter(([, v]) => !v.ok).length
  const badC = chans.filter(([, c]) => !c.ok).length
  lines.push(
    badV + badC === 0 ? 'Sonuç: tüm YouTube kaynakları erişilebilir.' : `Sonuç: ${badV} video, ${badC} kanal sorunlu.`,
  )
  return lines.join('\n')
}

/** YouTube küçük resmi: maxresdefault varsa o, yoksa hqdefault. */
export async function pickThumbnail(videoId: string, deps: Pick<YoutubeDeps, 'get'>): Promise<string> {
  const max = `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`
  try {
    const res = await deps.get(max, { timeoutMs: 6000 })
    if (res.status === 200) return max
  } catch {
    /* hqdefault'a düş */
  }
  return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`
}

export interface ArtFix {
  file: string
  path: string
  videoId: string
  storyArt: string
}

/** storyArt'ı boş YouTube kaynaklı başlık/bölümleri doldurur; dosyaları 2 boşluk girintiyle yeniden yazar. */
export async function fixArt(contentDir: string, deps: YoutubeDeps): Promise<ArtFix[]> {
  const fixes: ArtFix[] = []
  let first = true
  const firstYoutubeId = (sources: Json | undefined): string | null => {
    if (!Array.isArray(sources)) return null
    for (const s of sources) if (isObj(s) && s.type === 'YOUTUBE' && typeof s.videoId === 'string') return s.videoId
    return null
  }
  for (const file of titleFiles(contentDir)) {
    let data: Json
    try {
      data = readJson(file)
    } catch {
      deps.log(`! ${file}: JSON okunamadı, atlandı`)
      continue
    }
    if (!Array.isArray(data)) continue
    const rel = file.slice(contentDir.length + 1)
    let changed = false
    const visit = async (node: Json, path: string) => {
      if (!isObj(node)) return
      const yt = firstYoutubeId(node.sources)
      if (!yt) return
      const art = isObj(node.artwork) ? node.artwork : null
      if (art && typeof art.storyArt === 'string' && art.storyArt) return
      if (!first) await deps.sleep(REQUEST_GAP_MS)
      first = false
      const url = await pickThumbnail(yt, deps)
      if (art) art.storyArt = url
      else node.artwork = { storyArt: url }
      changed = true
      fixes.push({ file: rel, path, videoId: yt, storyArt: url })
    }
    for (let ti = 0; ti < data.length; ti++) {
      const t = data[ti]
      if (!isObj(t)) continue
      await visit(t, `[${ti}]`)
      if (Array.isArray(t.seasons))
        for (let si = 0; si < t.seasons.length; si++) {
          const season = t.seasons[si]
          if (!isObj(season) || !Array.isArray(season.episodes)) continue
          for (let ei = 0; ei < season.episodes.length; ei++)
            await visit(season.episodes[ei] ?? null, `[${ti}].seasons[${si}].episodes[${ei}]`)
        }
    }
    if (changed) writeJson(file, data)
  }
  return fixes
}

/** Kanal akışı girdilerinden düzenlemeye hazır ContentTitle iskeletleri (8003xxxx–8006xxxx aralığında boş kimliklerle). */
export function feedToSkeletons(
  feed: ParsedFeed,
  opts: { usedIds: Set<number>; today: string; limit?: number },
): Json[] {
  const entries = feed.entries.slice(0, opts.limit ?? 15)
  const ids = allocateIds(opts.usedIds, 80030001, 80069999, entries.length)
  return entries.map((e, i) => {
    const desc = e.description.replace(/\s+/g, ' ').trim()
    const year = Number(e.published.slice(0, 4)) || Number(opts.today.slice(0, 4))
    const synopsis =
      desc.length >= 20 ? cut(desc, 400) : `${e.title} — ${e.author ?? 'YouTube'} kanalından. (Özet yazılacak.)`
    return {
      videoId: ids[i] ?? 0,
      slug: slugify(e.title) || e.videoId.toLowerCase(),
      type: 'MOVIE',
      title: e.title,
      year,
      synopsis,
      shortSynopsis: cut(desc || e.title, 140),
      genres: ['yasam'],
      moods: [],
      maturity: { rating: 'GENEL', reasons: [] },
      runtimeSec: null,
      sources: [{ type: 'YOUTUBE', videoId: e.videoId }],
      artwork: {
        boxart: null,
        storyArt: e.thumbnail ?? `https://i.ytimg.com/vi/${e.videoId}/hqdefault.jpg`,
        focal: '50% 35%',
      },
      license: {
        name: 'YouTube standart lisansı',
        attribution: `© ${e.author ?? 'YouTube'} · yayın tarihi ${e.published.slice(0, 10)}`,
        url: `https://www.youtube.com/watch?v=${e.videoId}`,
      },
      availability: { addedAt: opts.today },
    } satisfies Json
  })
}

function parseArgs(argv: string[]): {
  mode: 'report' | 'check' | 'fix-art' | 'channel'
  channelId: string | null
  dir: string
} {
  let mode: 'report' | 'check' | 'fix-art' | 'channel' = 'report'
  let channelId: string | null = null
  let dir = defaultContentDir()
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--check') mode = 'check'
    else if (a === '--fix-art') mode = 'fix-art'
    else if (a === '--channel') {
      mode = 'channel'
      channelId = argv[++i] ?? null
    } else if (a === '--dir') dir = argv[++i] ?? dir
    else throw new Error(`Bilinmeyen seçenek: ${a}`)
  }
  return { mode, channelId, dir }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const deps: YoutubeDeps = { get: httpGet, sleep, now: () => new Date(), log: (l) => console.log(l) }
  if (args.mode === 'channel') {
    if (!args.channelId || !/^UC[\w-]{22}$/.test(args.channelId)) {
      console.error('Kanal kimliği gerekli: --channel UCxxxxxxxxxxxxxxxxxxxxxx')
      process.exit(2)
    }
    const res = await httpGet(feedUrl(args.channelId), { timeoutMs: 8000 })
    let feed: ParsedFeed
    if (res.status === 200) feed = parseChannelFeed(res.text)
    else {
      // Atom akışı bazen var olan kanallar için de 404 döner: kanalın video sayfasına düşülür.
      console.error(`Atom akışı yanıt vermedi (HTTP ${res.status}); kanalın video sayfası okunuyor…`)
      await sleep(REQUEST_GAP_MS)
      const page = await httpGet(`${channelPageUrl(args.channelId)}/videos`, { timeoutMs: 10000 })
      feed = page.status === 200 ? parseChannelVideosPage(page.text, new Date()) : { channelTitle: null, entries: [] }
      if (feed.entries.length === 0) {
        console.error(`Kanalın videoları okunamadı (akış HTTP ${res.status}, sayfa HTTP ${page.status}).`)
        process.exit(1)
      }
      console.error('Not: video sayfasında açıklama yoktur; yayın tarihleri yaklaşıktır.')
    }
    console.error(`Kanal: ${feed.channelTitle ?? '?'} · ${feed.entries.length} video`)
    for (const e of feed.entries) console.error(`  ${e.published.slice(0, 10)}  ${e.videoId}  ${cut(e.title, 70)}`)
    const skeletons = feedToSkeletons(feed, {
      usedIds: usedVideoIds(args.dir),
      today: new Date().toISOString().slice(0, 10),
    })
    console.error(
      'İskeletler (stdout): türleri, özeti ve olgunluk işaretini düzenleyip content/titles/ altına ekleyin.',
    )
    console.log(JSON.stringify(skeletons, null, 2))
    return
  }
  if (args.mode === 'fix-art') {
    const fixes = await fixArt(args.dir, deps)
    for (const f of fixes)
      console.log(`  ${f.file} ${f.path}  ${f.videoId} → ${f.storyArt.replace(/^.*\/vi\/[^/]+\//, '')}`)
    console.log(fixes.length ? `${fixes.length} görsel adresi yazıldı.` : 'Düzeltilecek storyArt yok.')
    return
  }
  const report = await runCheck(args.dir, deps)
  writeJson(join(args.dir, '.youtube-report.json'), report as unknown as Json)
  console.log(formatReportTable(report))
  console.log(`Rapor: ${join(args.dir, '.youtube-report.json')}`)
  if (args.mode === 'check' && isReportBroken(report)) process.exit(1)
}

if (isMain(import.meta.url))
  main().catch((e: unknown) => {
    console.error(`Hata: ${(e as Error).message}`)
    process.exit(2)
  })
