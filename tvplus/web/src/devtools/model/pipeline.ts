/**
 * "Oynatma hattı" sekmesinin görünüm modeli. devbus olaylarından beş adımı kurar:
 *   ① FTL yoklaması → ② MSL anahtar sağlama → ③ lisanslı manifest → ④ bayt-aralığı akışı → ⑤ TTML altyazı.
 * Kaynak YouTube gömmesiyse ④–⑤ yerine gömme oynatıcının durum zaman çizgisi tutulur.
 * Saf işlevdir: zaman olayın kendi `at` alanından okunur, Date.now() kullanılmaz.
 */
import { FTL_PULSE_DELAYS_MS } from '../../../../shared/constants'
import type { DevEvent } from '../../lib/devbus'
import { arr, bool, field, keepLast, num, obj, str, toEpochMs, type Detail } from './read'

/* ───────────── tipler ───────────── */

export interface FtlTarget {
  name: string
  cdnId: string
  ok: boolean
  ttfbMs: number | null
  totalMs: number | null
  kbps: number | null
  winner: boolean
}
export interface FtlPulse {
  /** 0'dan başlayan darbe sırası */
  index: number
  at: number
  targets: FtlTarget[]
  winnerCdnId: string | null
}
export interface FtlView {
  iter: number
  pulses: FtlPulse[]
  totalPulses: number
  /** Bir sonraki darbenin yaklaşık zamanı (epoch ms); darbeler bittiyse null */
  nextPulseAt: number | null
}

export interface MslView {
  scheme: string | null
  serial: number | null
  /** epoch ms */
  renewalAt: number | null
  expiresAt: number | null
  lastMessageId: number | null
  messages: number
  provisionedAt: number | null
  lastAt: number
  lastOk: boolean
  lastLabel: string
}

export interface Rung {
  bitrateKbps: number
  height: number | null
  width: number | null
  profile: string | null
  streamId: string | null
}
export interface CdnRank {
  id: string
  rank: number
  type: string | null
  location: string | null
  name: string | null
}
export type ManifestKind = 'STREAMS' | 'PROGRESSIVE' | 'EXTERNAL_EMBED' | 'UNKNOWN'
export interface ManifestView {
  at: number
  viewableId: string
  kind: ManifestKind
  prefetch: boolean
  title: string | null
  video: Rung[]
  audio: string[]
  text: string[]
  cdns: CdnRank[]
  /** epoch ms */
  expiresAt: number | null
  ok: boolean
}

export interface RangeBlock {
  id: number
  at: number
  type: 'video' | 'audio'
  cdnId: string | null
  start: number | null
  end: number | null
  bytes: number
  ms: number | null
  ttfbMs: number | null
  kbps: number | null
  streamId: string | null
  segment: number | null
  ok: boolean
}
export interface Sample {
  at: number
  kbps: number
}
export interface Marker {
  id: number
  at: number
  kind: 'abr' | 'cdn'
  /** 'up' | 'down' yalnızca ABR için */
  dir: 'up' | 'down' | null
  text: string
  reason: string | null
}
export interface BufferView {
  at: number
  videoSec: number | null
  audioSec: number | null
  state: string | null
}
export interface StreamingView {
  video: RangeBlock[]
  audio: RangeBlock[]
  headerRequests: number
  requests: number
  totalBytes: number
  /** video aralıklarının ölçülen hızı */
  samples: Sample[]
  /** ABR'nin bant genişliği tahmini */
  estimates: Sample[]
  currentKbps: number | null
  currentHeight: number | null
  currentStreamId: string | null
  activeCdn: string | null
  buffer: BufferView | null
  markers: Marker[]
}

export interface TtmlView {
  at: number
  language: string | null
  cues: number | null
  tickRate: number | null
  ok: boolean
}

export interface EmbedState {
  at: number
  state: string
}
export interface EmbedView {
  videoId: string | null
  states: EmbedState[]
  error: string | null
}

export interface PlayerView {
  at: number
  state: string | null
  viewableId: string | null
  positionSec: number | null
}

export type SourceKind = 'none' | 'streams' | 'progressive' | 'embed'

export interface PipelineState {
  ftl: FtlView | null
  msl: MslView | null
  manifest: ManifestView | null
  prefetchCount: number
  lastPrefetch: { at: number; viewableId: string } | null
  source: SourceKind
  streaming: StreamingView
  ttml: TtmlView | null
  embed: EmbedView | null
  player: PlayerView | null
}

/* ───────────── sınırlar ───────────── */

export const LANE_BLOCKS = 12
const MAX_SAMPLES = 60
const MAX_MARKERS = 20
const MAX_EMBED_STATES = 10

export function emptyStreaming(): StreamingView {
  return {
    video: [],
    audio: [],
    headerRequests: 0,
    requests: 0,
    totalBytes: 0,
    samples: [],
    estimates: [],
    currentKbps: null,
    currentHeight: null,
    currentStreamId: null,
    activeCdn: null,
    buffer: null,
    markers: [],
  }
}

export function initialPipeline(): PipelineState {
  return {
    ftl: null,
    msl: null,
    manifest: null,
    prefetchCount: 0,
    lastPrefetch: null,
    source: 'none',
    streaming: emptyStreaming(),
    ttml: null,
    embed: null,
    player: null,
  }
}

/* ───────────── ① FTL ───────────── */

function readFtlTargets(d: Detail, winnerKey: string | null): { targets: FtlTarget[]; winnerCdnId: string | null } {
  const targets: FtlTarget[] = arr(field(d, 'results')).flatMap((r) => {
    const o = obj(r)
    if (!o) return []
    return [
      {
        name: str(o.name) ?? '?',
        cdnId: str(o.cdnId) ?? '?',
        ok: bool(o.ok) ?? true,
        ttfbMs: num(o.ttfbMs),
        totalMs: num(o.totalMs),
        kbps: num(o.kbps),
        winner: false,
      },
    ]
  })
  let win = winnerKey ? targets.find((t) => t.cdnId === winnerKey || t.name === winnerKey) : undefined
  if (!win) {
    // Kazanan bildirilmediyse: başarılı olanlar içinde toplam süresi en kısa olan.
    for (const t of targets) {
      if (!t.ok || t.totalMs === null) continue
      if (!win || (win.totalMs ?? Infinity) > t.totalMs) win = t
    }
  }
  if (win) win.winner = true
  return { targets, winnerCdnId: win?.cdnId ?? null }
}

function winnerKeyOf(v: unknown): string | null {
  const o = obj(v)
  if (o) return str(o.cdnId) ?? str(o.name)
  return str(v)
}

/** Darbe sırası: önce etiketteki "darbe N" (1'den başlar), yoksa detail.pulse (0'dan başlar sayılır). */
function pulseIndex(e: DevEvent): number {
  const m = /darbe\s*(\d+)/i.exec(e.label)
  if (m) return Math.max(0, Number(m[1]) - 1)
  return Math.max(0, num(field(e.detail, 'pulse')) ?? 0)
}

function reduceFtl(prev: FtlView | null, e: DevEvent): FtlView {
  const d = e.detail
  const iter = num(field(d, 'iter')) ?? prev?.iter ?? 0
  const index = pulseIndex(e)
  const { targets, winnerCdnId } = readFtlTargets(d, winnerKeyOf(field(d, 'winner')))
  const pulse: FtlPulse = { index, at: e.at, targets, winnerCdnId }
  const base = prev && prev.iter === iter && index > 0 ? prev.pulses.filter((p) => p.index !== index) : []
  const pulses = [...base, pulse].sort((a, b) => a.index - b.index)
  const delays: readonly number[] = FTL_PULSE_DELAYS_MS
  const cur = delays[index]
  const next = delays[index + 1]
  const nextPulseAt = cur !== undefined && next !== undefined ? e.at + (next - cur) : null
  return { iter, pulses, totalPulses: delays.length, nextPulseAt }
}

/* ───────────── ② MSL ───────────── */

function reduceMsl(prev: MslView | null, e: DevEvent): MslView {
  const d = e.detail
  const provision = /provision/i.test(e.label)
  const serial = num(field(d, 'serialnumber'))
  const base: MslView = prev ?? {
    scheme: null,
    serial: null,
    renewalAt: null,
    expiresAt: null,
    lastMessageId: null,
    messages: 0,
    provisionedAt: null,
    lastAt: e.at,
    lastOk: true,
    lastLabel: e.label,
  }
  return {
    scheme: str(field(d, 'scheme')) ?? base.scheme,
    serial: serial ?? base.serial,
    renewalAt: toEpochMs(field(d, 'renewalwindow')) ?? base.renewalAt,
    expiresAt: toEpochMs(field(d, 'expiration')) ?? base.expiresAt,
    lastMessageId: num(field(d, 'messageid')) ?? base.lastMessageId,
    messages: base.messages + (provision ? 0 : 1),
    provisionedAt: provision && e.ok ? e.at : base.provisionedAt,
    lastAt: e.at,
    lastOk: e.ok,
    lastLabel: e.label,
  }
}

/* ───────────── ③ manifest ───────────── */

function readRungs(v: unknown): Rung[] {
  return arr(v)
    .flatMap((r) => {
      const o = obj(r)
      const kbps = o ? num(o.bitrateKbps) : null
      if (!o || kbps === null) return []
      return [{ bitrateKbps: kbps, height: num(o.height), width: num(o.width), profile: str(o.profile), streamId: str(o.streamId) }]
    })
    .sort((a, b) => a.bitrateKbps - b.bitrateKbps)
}

/** Ses/altyazı parçası: dizgeyse kendisi, nesneyse "Türkçe · 2.0 · 128 kbps" gibi kısa etiket. */
function trackLabel(v: unknown): string | null {
  const s = str(v)
  if (s !== null) return s
  const o = obj(v)
  if (!o) return null
  const parts = [str(o.languageDescription) ?? str(o.language) ?? str(o.trackId)]
  const ch = str(o.channels)
  if (ch) parts.push(ch)
  const t = str(o.type)
  if (t === 'CC') parts.push('işitme engelliler için')
  const kbps = num(o.bitrateKbps)
  if (kbps !== null) parts.push(`${kbps} kbps`)
  const list = parts.filter((p): p is string => !!p)
  return list.length ? list.join(' · ') : null
}

function readCdns(v: unknown): CdnRank[] {
  const list = arr(v).flatMap((c, i): CdnRank[] => {
    const s = str(c)
    if (s !== null) return [{ id: s, rank: i + 1, type: null, location: null, name: null }]
    const o = obj(c)
    if (!o) return []
    const id = str(o.id) ?? str(o.cdnId)
    if (!id) return []
    return [{ id, rank: num(o.rank) ?? i + 1, type: str(o.type), location: str(o.location), name: str(o.name) }]
  })
  return list.sort((a, b) => a.rank - b.rank)
}

function readKind(v: unknown): ManifestKind {
  return v === 'STREAMS' || v === 'PROGRESSIVE' || v === 'EXTERNAL_EMBED' ? v : 'UNKNOWN'
}

function sourceOf(kind: ManifestKind): SourceKind {
  if (kind === 'STREAMS') return 'streams'
  if (kind === 'PROGRESSIVE') return 'progressive'
  if (kind === 'EXTERNAL_EMBED') return 'embed'
  return 'none'
}

function readManifest(e: DevEvent): ManifestView {
  const d = e.detail
  return {
    at: e.at,
    viewableId: str(field(d, 'viewableId')) ?? e.label,
    kind: readKind(field(d, 'kind')),
    prefetch: bool(field(d, 'prefetch')) ?? false,
    title: str(field(d, 'title')),
    video: readRungs(field(d, 'video')),
    audio: arr(field(d, 'audio')).flatMap((a) => trackLabel(a) ?? []),
    text: arr(field(d, 'text')).flatMap((a) => trackLabel(a) ?? []),
    cdns: readCdns(field(d, 'cdns')),
    expiresAt: toEpochMs(field(d, 'expiration')),
    ok: e.ok,
  }
}

function reduceManifest(s: PipelineState, e: DevEvent): PipelineState {
  const m = readManifest(e)
  if (m.prefetch) {
    const next: PipelineState = { ...s, prefetchCount: s.prefetchCount + 1, lastPrefetch: { at: e.at, viewableId: m.viewableId } }
    // Gerçek oynatma sürerken ön hazırlık manifesti ekrandakini değiştirmez.
    if (!s.manifest || s.manifest.prefetch) next.manifest = m
    return next
  }
  // Gerçek manifest = yeni oynatma: akış, altyazı ve gömme durumu sıfırlanır.
  const streaming = emptyStreaming()
  streaming.activeCdn = m.cdns[0]?.id ?? null
  return { ...s, manifest: m, source: sourceOf(m.kind), streaming, ttml: null, embed: null }
}

/* ───────────── ④ bayt aralıkları, ABR, tampon, CDN ───────────── */

function rungByKbps(m: ManifestView | null, kbps: number | null): Rung | null {
  if (!m || kbps === null || !m.video.length) return null
  let best: Rung | null = null
  for (const r of m.video) if (!best || Math.abs(r.bitrateKbps - kbps) < Math.abs(best.bitrateKbps - kbps)) best = r
  return best
}

function reduceRange(s: PipelineState, e: DevEvent): PipelineState {
  const d = e.detail
  const type = str(field(d, 'type'))
  const st = s.streaming
  if (type === 'header') {
    return { ...s, streaming: { ...st, headerRequests: st.headerRequests + 1, requests: st.requests + 1, totalBytes: st.totalBytes + rangeBytes(d) } }
  }
  if (type !== 'video' && type !== 'audio') return s
  const block: RangeBlock = {
    id: e.id,
    at: e.at,
    type,
    cdnId: str(field(d, 'cdnId')),
    start: num(field(d, 'start')),
    end: num(field(d, 'end')),
    bytes: rangeBytes(d),
    ms: e.ms ?? null,
    ttfbMs: num(field(d, 'ttfbMs')),
    kbps: num(field(d, 'kbps')),
    streamId: str(field(d, 'streamId')),
    segment: num(field(d, 'segment')),
    ok: e.ok,
  }
  const next: StreamingView = {
    ...st,
    requests: st.requests + 1,
    totalBytes: st.totalBytes + block.bytes,
    activeCdn: e.ok && block.cdnId ? block.cdnId : st.activeCdn,
  }
  if (type === 'video') {
    next.video = keepLast([...st.video, block], LANE_BLOCKS)
    if (block.kbps !== null && e.ok) next.samples = keepLast([...st.samples, { at: e.at, kbps: block.kbps }], MAX_SAMPLES)
    // Video akışının kimliği manifest basamağıyla eşleşirse etkin basamak odur.
    const rung = block.streamId && s.manifest ? s.manifest.video.find((r) => r.streamId === block.streamId) : undefined
    if (rung) {
      next.currentStreamId = block.streamId
      next.currentKbps = rung.bitrateKbps
      next.currentHeight = rung.height
    }
  } else {
    next.audio = keepLast([...st.audio, block], LANE_BLOCKS)
  }
  return { ...s, source: s.source === 'none' ? 'streams' : s.source, streaming: next }
}

function rangeBytes(d: Detail): number {
  const b = num(field(d, 'bytes'))
  if (b !== null) return b
  const a = num(field(d, 'start'))
  const z = num(field(d, 'end'))
  return a !== null && z !== null ? z - a + 1 : 0
}

function kbpsOf(v: unknown): number | null {
  const o = obj(v)
  if (o) return num(o.bitrateKbps) ?? num(o.kbps)
  return num(v)
}

function reduceAbr(s: PipelineState, e: DevEvent): PipelineState {
  const d = e.detail
  const st = s.streaming
  const from = kbpsOf(field(d, 'from'))
  const to = kbpsOf(field(d, 'to'))
  const est = num(field(d, 'estimateKbps'))
  const bufferSec = num(field(d, 'bufferSec'))
  const dir: 'up' | 'down' | null = from !== null && to !== null ? (to >= from ? 'up' : 'down') : /↓/.test(e.label) ? 'down' : /↑/.test(e.label) ? 'up' : null
  const rung = rungByKbps(s.manifest, to)
  const marker: Marker = { id: e.id, at: e.at, kind: 'abr', dir, text: e.label, reason: str(field(d, 'reason')) }
  const next: StreamingView = {
    ...st,
    currentKbps: to ?? st.currentKbps,
    currentHeight: rung?.height ?? (to !== null ? null : st.currentHeight),
    currentStreamId: rung?.streamId ?? st.currentStreamId,
    estimates: est !== null ? keepLast([...st.estimates, { at: e.at, kbps: est }], MAX_SAMPLES) : st.estimates,
    // İlk karar (from yok) bir geçiş değildir; işaret yalnızca gerçek değişimde konur.
    markers: from !== null || dir !== null ? keepLast([...st.markers, marker], MAX_MARKERS) : st.markers,
    buffer: bufferSec !== null && !st.buffer ? { at: e.at, videoSec: bufferSec, audioSec: null, state: null } : st.buffer,
  }
  return { ...s, streaming: next }
}

function reduceBuffer(s: PipelineState, e: DevEvent): PipelineState {
  const d = e.detail
  const prev = s.streaming.buffer
  const buffer: BufferView = {
    at: e.at,
    videoSec: num(field(d, 'videoSec')) ?? prev?.videoSec ?? null,
    audioSec: num(field(d, 'audioSec')) ?? prev?.audioSec ?? null,
    state: str(field(d, 'state')) ?? prev?.state ?? null,
  }
  return { ...s, streaming: { ...s.streaming, buffer } }
}

function reduceCdn(s: PipelineState, e: DevEvent): PipelineState {
  const d = e.detail
  const to = str(field(d, 'to'))
  const from = str(field(d, 'from'))
  const st = s.streaming
  // Yalnızca düğüm değişimi (yük devri) bir işarettir; ilk seçim yalnızca etkin düğümü belirler.
  const isSwitch = from !== null && to !== null && from !== to
  const marker: Marker = { id: e.id, at: e.at, kind: 'cdn', dir: null, text: e.label, reason: str(field(d, 'reason')) }
  return {
    ...s,
    streaming: { ...st, activeCdn: to ?? st.activeCdn, markers: isSwitch ? keepLast([...st.markers, marker], MAX_MARKERS) : st.markers },
  }
}

/* ───────────── ⑤ TTML, gömme, oynatıcı ───────────── */

const YT_STATES: Record<number, string> = { [-1]: 'UNSTARTED', 0: 'ENDED', 1: 'PLAYING', 2: 'PAUSED', 3: 'BUFFERING', 5: 'CUED' }

function embedStateOf(e: DevEvent): string | null {
  const v = field(e.detail, 'state')
  const n = typeof v === 'number' ? v : null
  if (n !== null) return YT_STATES[n] ?? String(n)
  const s = str(v)
  if (s) return s.toUpperCase()
  const m = /:\s*([A-Z_]+)\s*$/.exec(e.label)
  return m?.[1] ?? null
}

function reduceEmbed(s: PipelineState, e: DevEvent): PipelineState {
  const state = embedStateOf(e)
  const prev = s.embed ?? { videoId: null, states: [], error: null }
  let states = prev.states
  if (state && states[states.length - 1]?.state !== state) states = keepLast([...states, { at: e.at, state }], MAX_EMBED_STATES)
  const err = field(e.detail, 'error')
  const embed: EmbedView = {
    videoId: str(field(e.detail, 'videoId')) ?? prev.videoId,
    states,
    error: err === undefined || err === null ? (e.ok ? prev.error : e.label) : String(err),
  }
  return { ...s, embed, source: s.source === 'none' || s.source === 'embed' ? 'embed' : s.source }
}

function reduceTtml(s: PipelineState, e: DevEvent): PipelineState {
  const d = e.detail
  return {
    ...s,
    ttml: { at: e.at, language: str(field(d, 'language')), cues: num(field(d, 'cues')), tickRate: num(field(d, 'tickRate')), ok: e.ok },
  }
}

function reducePlayer(s: PipelineState, e: DevEvent): PipelineState {
  const d = e.detail
  return {
    ...s,
    player: {
      at: e.at,
      state: str(field(d, 'state')) ?? (e.label.replace(/^durum:\s*/, '') || null),
      viewableId: str(field(d, 'viewableId')) ?? s.player?.viewableId ?? null,
      positionSec: num(field(d, 'positionSec')),
    },
  }
}

/* ───────────── giriş noktası ───────────── */

export function reducePipeline(s: PipelineState, e: DevEvent): PipelineState {
  switch (e.cat) {
    case 'ftl':
      return { ...s, ftl: reduceFtl(s.ftl, e) }
    case 'msl':
      return { ...s, msl: reduceMsl(s.msl, e) }
    case 'manifest':
      return reduceManifest(s, e)
    case 'range':
      return reduceRange(s, e)
    case 'abr':
      return reduceAbr(s, e)
    case 'buffer':
      return reduceBuffer(s, e)
    case 'cdn':
      return reduceCdn(s, e)
    case 'ttml':
      return reduceTtml(s, e)
    case 'embed':
      return reduceEmbed(s, e)
    case 'player':
      return reducePlayer(s, e)
    default:
      return s
  }
}

export function reducePipelineAll(s: PipelineState, events: readonly DevEvent[]): PipelineState {
  let out = s
  for (const e of events) out = reducePipeline(out, e)
  return out
}

/** Etkin basamağın manifest dizisindeki sırası (vurgulamak için); yoksa -1. */
export function activeRungIndex(m: ManifestView | null, st: StreamingView): number {
  if (!m || !m.video.length) return -1
  if (st.currentStreamId) {
    const i = m.video.findIndex((r) => r.streamId === st.currentStreamId)
    if (i >= 0) return i
  }
  const r = rungByKbps(m, st.currentKbps)
  return r ? m.video.indexOf(r) : -1
}
