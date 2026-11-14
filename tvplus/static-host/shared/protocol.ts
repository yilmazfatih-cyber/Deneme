/**
 * Sayfa ↔ arka uç (worker) tel sözleşmesi. İstek kimlikleri `<istemci>:<sıra>` biçimindedir: aynı arka ucu paylaşan
 * sekmeler ve çerçeveler birbirinin kimliğiyle çakışmaz, lider sekme yanıtları önekten yönlendirir.
 */

export interface WireRequest {
  id: string
  method: string
  /** Yol + sorgu (`/api/boot?vd=tv`) */
  url: string
  headers: [string, string][]
  body: ArrayBuffer | null
  protocol: 'http' | 'https'
  host: string
}

/** Arka ucun açılış durumu (sayfadaki bekleme ekranı gösterir). */
export interface BackendStatus {
  phase: 'baslatiliyor' | 'icerik' | 'kayitlar' | 'sunucu' | 'hazir' | 'hata'
  text: string
  /** Hazır olunca: açılış süresi (ms) */
  ms?: number
}

export type ToBackend =
  | { t: 'req'; req: WireRequest }
  | { t: 'abort'; id: string }
  /** Bekleyen yazımları hemen IndexedDB'ye boşalt (sayfa kapanıyor). */
  | { t: 'flush' }
  /** Bu istemci gidiyor: açık akışları kapat. */
  | { t: 'bye'; client: string }
  /** İstemci canlılık kilidi adı (Web Locks): kilit serbest kalınca istemci ölmüş sayılır. */
  | { t: 'hello'; client: string; lock: string | null }
  | { t: 'alive'; client: string }

export type FromBackend =
  | { t: 'status'; status: BackendStatus }
  | { t: 'head'; id: string; status: number; headers: [string, string][] }
  | { t: 'data'; id: string; chunk: ArrayBuffer }
  | { t: 'end'; id: string }
  | { t: 'fail'; id: string; message: string }
  | { t: 'log'; level: string; msg: string }

/** Arka uca giden yollar (shared/constants ROUTES ve sunucu kabuğunun API önekleriyle aynı). */
export const API_PREFIXES = ['/graphql', '/api', '/msl', '/oca', '/img', '/log', '/push'] as const

export function isApiPath(pathname: string): boolean {
  return API_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))
}

/** İçerik paketinin site içindeki adı (derlemede üretilir, worker açılışta indirir). */
export const CONTENT_PACK_FILE = 'tvp-icerik.json'

export interface ContentPack {
  /** Paket oluşturma anı + özet: değişince tarayıcı yeniden indirir */
  version: string
  /** Worker'ın bellek içi dosya sistemindeki mutlak yol (`/content/...`, `/app/...`) → UTF-8 metin */
  files: Record<string, string>
}
