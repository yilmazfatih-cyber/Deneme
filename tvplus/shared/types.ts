/**
 * GraphQL dışındaki tel biçimleri: açılış bağlamı, Falcor JSON Graph, olay günlüğü, bildirim yoklaması, hata ayıklama.
 * (GraphQL biçimleri shared/graphql/schema.graphql içindedir; oynatma hattı shared/playback.ts.)
 */

export type MembershipStatus = 'ANONYMOUS' | 'CURRENT_MEMBER' | 'FORMER_MEMBER'

export interface ProfileSummary {
  guid: string
  name: string
  avatarUrl: string
  isKids: boolean
  maturityLevel: number
}

/**
 * Sunucunun ilk HTML'e gömdüğü bağlam (Netflix `reactContext` karşılığı):
 * `<script id="tvp-boot" type="application/json">…</script>`.
 * Geliştirmede (Vite) HTML'e gömülemediği için istemci GET /api/boot ile aynı gövdeyi alır.
 */
export interface BootContext {
  buildId: string
  region: string
  serverTime: string // ISO
  membershipStatus: MembershipStatus
  /** Üye değilse null */
  account: null | { accountId: string; planName: string; products: string[] }
  profiles: ProfileSummary[]
  /** Profil seçilmediyse null → "Kim izliyor?" kapısı */
  activeProfile: ProfileSummary | null
  /** Cihaz seri numarası; her API isteğinde x-tvplus-esn başlığıyla gider */
  esn: string
  /** CSRF belirteci (Falcor gövdesi `authURL`, GraphQL mutasyon başlığı) */
  authURL: string | null
  persistedQueryVersion: number
  featureFlags: Record<string, boolean>
  /** İlk satırların Falcor önbelleği (ilk boyama için); yoksa null */
  falcorCache: JsonGraph | null
}

/* ───────────── Falcor (eski üye API'si) ───────────── */

export type FalcorKey = string | number
/** İstekte `{ from, length }` biçimi de kabul edilir; motor bunu `{ from, to }` biçimine çevirir. */
export interface FalcorRange {
  from: number
  to: number
}
export type FalcorKeySet = FalcorKey | FalcorRange | (FalcorKey | FalcorRange)[]
export type FalcorPath = FalcorKeySet[]

export type JsonGraphAtom<T = unknown> = { $type: 'atom'; value?: T; $expires?: number; $size?: number }
export type JsonGraphRef = { $type: 'ref'; value: FalcorKey[]; $size?: number }
export type JsonGraphError = { $type: 'error'; value: { message: string; code?: string } }
export type JsonGraphLeaf = JsonGraphAtom | JsonGraphRef | JsonGraphError
export interface JsonGraph {
  [key: string]: JsonGraph | JsonGraphLeaf
}
/** POST /api/member/pathEvaluator yanıtı. İstek gövdesi form kodlu: yinelenen `path=<JSON dizi>` + `authURL=`. */
export interface PathEvaluatorResponse {
  paths: FalcorPath[]
  jsonGraph: JsonGraph
}

/* ───────────── Olay günlüğü (Netflix Ichnaea) ───────────── */

export type ClientEventName =
  | 'navigate'
  | 'impression' // satır/kart görünür oldu
  | 'focus' // kart üzerine gelindi / odaklandı
  | 'click'
  | 'search'
  | 'playlist'
  | 'rating'
  | 'ftl.result'
  | 'playback.intent' // oynat'a basıldı
  | 'playback.start' // ilk kare
  | 'playback.heartbeat'
  | 'playback.rebuffer'
  | 'playback.bitrateSwitch'
  | 'playback.cdnSwitch'
  | 'playback.error'
  | 'playback.end'
  | 'preview.start'
  | 'notification.open'

export interface ClientEvent {
  name: ClientEventName
  /** epoch ms (istemci saati) */
  ts: number
  /** oturum içi artan sıra numarası */
  seq: number
  /** konum izleme bağlamı (bkz. shared/tctx.ts) */
  tctx?: string
  data: Record<string, unknown>
}
/** POST /log/web/cl/1 */
export interface EventBatch {
  sessionId: string
  /** istemcinin yollama anı (saat kayması düzeltmesi için) */
  sentAt: number
  events: ClientEvent[]
}
export interface EventBatchResponse {
  accepted: number
  dropped: number
  /** kalan kota (x-tvplus-izci başlığında da `~0=true~RL=<kalan>` olarak döner) */
  rateLimitRemaining: number
}

/* ───────────── Bildirimler (uzun yoklama) ─────────────
 * GET /push?cursor=<n>&wait=25 → en çok `wait` saniye bekler; yeni bildirim yoksa { events: [], cursor } döner.
 */
export interface PushEvent {
  id: string
  cursor: number
  kind: 'NEW_CONTENT' | 'REMINDER' | 'SYSTEM'
  title: string
  body: string
  /** Uygulama içi hedef (hash yolu) */
  href: string | null
  createdAt: string
  read: boolean
}
export interface PushResponse {
  events: PushEvent[]
  cursor: number
}

/* ───────────── Hata ayıklama (Kaputun altı paneli) ───────────── */

export interface OcaNodeState {
  id: string
  name: string
  type: 'IX' | 'ISP' | 'ANYCAST' | 'CLOUD'
  location: string
  /** yapay koşullar */
  latencyMs: number
  throughputKbps: number | null // null = sınırsız
  errorRate: number // 0–1
  down: boolean
  /** sayaçlar */
  requests: number
  bytesServed: number
  cacheHits: number
  cacheMisses: number
}
/** GET /api/debug/oca → OcaNodeState[] ; POST /api/debug/oca/:node  gövde: Partial<Pick<OcaNodeState,'latencyMs'|'throughputKbps'|'errorRate'|'down'>> */
export interface DebugServerState {
  uptimeSec: number
  region: string
  oca: OcaNodeState[]
  events: { total: number; lastBatchAt: string | null; byName: Record<string, number> }
  playback: { activeSessions: number; manifestsIssued: number; prefetchIssued: number }
  catalog: { titles: number; playables: number; channels: number; bySourceKind: Record<string, number> }
}

/** Standart REST hata gövdesi. */
export interface ApiError {
  error: { code: string; message: string; traceId?: string }
}
