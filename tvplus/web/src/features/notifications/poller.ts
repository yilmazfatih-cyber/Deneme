/**
 * Bildirim uzun yoklaması (Netflix'te notifications.netflix.com/push):
 *   GET /push?cursor=<son>&wait=25 → sunucu en çok 25 sn bekler; yeni bildirim gelirse hemen döner.
 * Yanıt gelince imleç ilerler ve hemen yeniden sorulur. Hata olursa bekleme 2 sn'den 30 sn'ye kadar katlanır.
 * Sekme gizliyken yoklama durur (açık istek iptal edilir), görünür olunca sürer.
 *
 * Saf modül: ağ, zamanlayıcı, görünürlük ve devbus dışarıdan verilir; böylece testte sahte saatle sürülür.
 */
import type { PushEvent, PushResponse } from '../../../../shared/types'

export interface PollResponseLike {
  ok: boolean
  status: number
  json(): Promise<unknown>
}

export interface PollerDeps {
  fetch(url: string, init: { signal: AbortSignal; credentials: 'same-origin'; headers: Record<string, string> }): Promise<PollResponseLike>
  setTimeout(fn: () => void, ms: number): unknown
  clearTimeout(handle: unknown): void
  now(): number
  isHidden(): boolean
  /** Görünürlük değişince çağrılacak işlevi kaydeder; kaydı silen işlevi döndürür. */
  onVisibilityChange(fn: () => void): () => void
  headers(): Record<string, string>
  /** devbus 'push' olayı */
  emit?(label: string, detail: Record<string, unknown>, opts?: { ms?: number; ok?: boolean }): void
}

export interface PollerOptions {
  route: string
  /** Bilinen son imleç. null → ilk istek `wait=0` ile birikmiş olayları alır ve imleci öğrenir ("eşitleme"). */
  cursor: number | null
  waitSec?: number
  minBackoffMs?: number
  maxBackoffMs?: number
  /** Sunucu boş yanıtı bundan hızlı döndürürse sıcak döngüye girmemek için arada beklenir. */
  minGapMs?: number
  onEvents(events: PushEvent[], info: { initial: boolean; cursor: number }): void
}

export interface PushPoller {
  start(): void
  stop(): void
  readonly cursor: number | null
  readonly running: boolean
  /** Bir sonraki hatada beklenecek süre (test ve panel için) */
  readonly backoffMs: number
}

function isPushResponse(v: unknown): v is PushResponse {
  if (!v || typeof v !== 'object') return false
  const o = v as Record<string, unknown>
  return Array.isArray(o.events) && typeof o.cursor === 'number'
}

export function createPushPoller(deps: PollerDeps, opts: PollerOptions): PushPoller {
  const waitSec = opts.waitSec ?? 25
  const minBackoff = opts.minBackoffMs ?? 2000
  const maxBackoff = opts.maxBackoffMs ?? 30_000
  const minGap = opts.minGapMs ?? 1000
  let cursor = opts.cursor
  let running = false
  let generation = 0
  let backoff = 0
  let inflight: AbortController | null = null
  let wake: (() => void) | null = null
  let timer: unknown = null
  let unVis: (() => void) | null = null

  const emit = (label: string, detail: Record<string, unknown>, o?: { ms?: number; ok?: boolean }) => deps.emit?.(label, detail, o)

  /** İptal edilebilir bekleme: stop() ya da görünürlük değişimi uyandırır. */
  function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
      const done = () => {
        if (timer !== null) deps.clearTimeout(timer)
        timer = null
        wake = null
        resolve()
      }
      wake = done
      timer = deps.setTimeout(done, ms)
    })
  }
  /** Sekme görünür olana (ya da durdurulana) kadar bekler. */
  function untilVisible(): Promise<void> {
    return new Promise((resolve) => {
      wake = () => {
        wake = null
        resolve()
      }
    })
  }

  function onVisibility(): void {
    if (deps.isHidden()) {
      // Gizlenince açık isteği bırak; döngü uyanınca gizli olduğunu görüp bekler.
      if (inflight) {
        emit('yoklama duraklatıldı (sekme gizli)', { cursor })
        inflight.abort()
      }
    } else if (wake) {
      wake()
    }
  }

  async function loop(gen: number): Promise<void> {
    while (running && gen === generation) {
      if (deps.isHidden()) {
        await untilVisible()
        continue
      }
      const initial = cursor === null
      const wait = initial ? 0 : waitSec
      const url = `${opts.route}?cursor=${cursor ?? 0}&wait=${wait}`
      const ctrl = new AbortController()
      inflight = ctrl
      const t0 = deps.now()
      emit(initial ? 'eşitleme başladı' : 'yoklama başladı', { cursor: cursor ?? 0, wait })
      try {
        const res = await deps.fetch(url, { signal: ctrl.signal, credentials: 'same-origin', headers: deps.headers() })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const body = await res.json()
        if (!isPushResponse(body)) throw new Error('beklenmeyen yanıt biçimi')
        if (!running || gen !== generation) return
        inflight = null
        const ms = deps.now() - t0
        cursor = Math.max(cursor ?? 0, body.cursor)
        backoff = 0
        emit(`${body.events.length} bildirim`, { count: body.events.length, cursor, waitMs: Math.round(ms), initial }, { ms })
        if (body.events.length || initial) opts.onEvents(body.events, { initial, cursor })
        if (!body.events.length && ms < minGap && !initial) await sleep(minGap - ms)
      } catch (err) {
        inflight = null
        if (!running || gen !== generation) return
        if (ctrl.signal.aborted) continue // sekme gizlendi: hata değil
        backoff = backoff ? Math.min(backoff * 2, maxBackoff) : minBackoff
        emit('yoklama hatası', { error: String(err), retryInMs: backoff, cursor }, { ms: deps.now() - t0, ok: false })
        await sleep(backoff)
      }
    }
  }

  return {
    start() {
      if (running) return
      running = true
      generation++
      unVis = deps.onVisibilityChange(onVisibility)
      void loop(generation)
    },
    stop() {
      if (!running) return
      running = false
      generation++
      unVis?.()
      unVis = null
      inflight?.abort()
      inflight = null
      wake?.()
    },
    get cursor() {
      return cursor
    },
    get running() {
      return running
    },
    get backoffMs() {
      return backoff
    },
  }
}
