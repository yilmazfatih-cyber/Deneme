/**
 * "TV'de izle" köprüsü: oynatıcı, detay ve canlı kanal kartları yansıtma isteğini buradan iletir; cihaz seçici arayüzü
 * (web/src/devices) kendini buraya kaydeder. Böylece hiçbir özellik cihaz arayüzüne doğrudan bağımlı olmaz.
 */
export interface CastRequest {
  viewableId: string
  /** Kaldığı yerden sürdürmek için */
  positionSec?: number
  startOver?: boolean
  tctx?: string
  /** Seçiciye başlık göstermek için */
  title?: string
}
type CastHandler = (req: CastRequest) => void

let handler: CastHandler | null = null
let available = false
const listeners = new Set<() => void>()

/** Cihaz arayüzü: seçiciyi açan işlevi kaydeder. */
export function setCastHandler(fn: CastHandler | null): void {
  handler = fn
}
/** Cihaz arayüzü: yansıtılabilecek başka bir cihaz çevrimiçi mi (simge buna göre görünür). */
export function setCastAvailable(v: boolean): void {
  if (v === available) return
  available = v
  for (const l of listeners) l()
}
/** Özellikler: yansıtma iste. İşleyici yoksa false döner. */
export function requestCast(req: CastRequest): boolean {
  if (!handler) return false
  handler(req)
  return true
}
export const isCastAvailable = (): boolean => available
export function subscribeCastAvailable(fn: () => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}
