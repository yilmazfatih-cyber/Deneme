/**
 * Kumanda dokunma pedi ve tuş yinelemesi — saf mantık (birim testi: gestures.test.ts).
 *
 *   Dokunma pedi: kısa dokunuş = OK · kaydırma = yön (eşik aşılınca hemen yollanır; parmak kalkmadan tekrar
 *   kaydırmak yeni basış sayılır) · kaydırıp tutmak = o yönde yineleme.
 *   Yön tuşu basılı tutulunca: ilk basış hemen, REPEAT_DELAY_MS sonra REPEAT_INTERVAL_MS aralıkla yineler.
 *   Çift gönderim koruması: aynı tuş DEBOUNCE_MS içinde ikinci kez gelirse (dokunma + tıklama olayı) yok sayılır.
 */
import type { RemoteKey } from '../../../shared/devices'

export type Direction = 'UP' | 'DOWN' | 'LEFT' | 'RIGHT'

/** Kaydırma eşiği (px): bunun altında kalan hareket dokunuş sayılır. */
export const SWIPE_MIN_PX = 28
/** Dokunuş en çok bu kadar sürebilir (ms); daha uzun ve hareketsiz basış hiçbir şey yollamaz. */
export const TAP_MAX_MS = 450
export const REPEAT_DELAY_MS = 420
export const REPEAT_INTERVAL_MS = 140
export const DEBOUNCE_MS = 90

/** Hareketin baskın ekseni ve yönü; eşiğin altındaysa null. */
export function directionOf(dx: number, dy: number, threshold = SWIPE_MIN_PX): Direction | null {
  const ax = Math.abs(dx)
  const ay = Math.abs(dy)
  if (Math.max(ax, ay) < threshold) return null
  // Çapraz hareketlerde baskın eksen en az 1.2 kat olmalı; değilse kararsız sayılır.
  if (ax >= ay * 1.2) return dx > 0 ? 'RIGHT' : 'LEFT'
  if (ay >= ax * 1.2) return dy > 0 ? 'DOWN' : 'UP'
  return null
}

export interface PadEvents {
  /** Bir tuş yolla (ilk basış ya da yineleme) */
  send: (key: RemoteKey, repeat: boolean) => void
}

export interface Timers {
  setTimeout: (fn: () => void, ms: number) => unknown
  clearTimeout: (h: unknown) => void
  setInterval: (fn: () => void, ms: number) => unknown
  clearInterval: (h: unknown) => void
  now: () => number
}

/**
 * Basılı tutulan tuşun yinelemesi. `press` ilk basışı hemen yollar; `release` yinelemeyi bitirir.
 * Aynı anda tek tuş yinelenir (yeni basış eskisini bitirir).
 */
export class KeyRepeater {
  private delayTimer: unknown = null
  private intervalTimer: unknown = null
  private current: RemoteKey | null = null
  private lastKey: RemoteKey | null = null
  private lastAt = Number.NEGATIVE_INFINITY

  private readonly t: Timers
  private readonly send: (key: RemoteKey, repeat: boolean) => void

  constructor(t: Timers, send: (key: RemoteKey, repeat: boolean) => void) {
    this.t = t
    this.send = send
  }

  /** Tek basış (yinelemesiz): çift olay koruması uygulanır. Yollandıysa true. */
  tap(key: RemoteKey): boolean {
    const now = this.t.now()
    if (key === this.lastKey && now - this.lastAt < DEBOUNCE_MS) return false
    this.lastKey = key
    this.lastAt = now
    this.send(key, false)
    return true
  }

  /** Basılı tutmaya başla: hemen bir kez yollar, sonra yineler. */
  press(key: RemoteKey): void {
    this.stop()
    if (!this.tap(key)) return
    this.current = key
    this.delayTimer = this.t.setTimeout(() => {
      this.delayTimer = null
      this.intervalTimer = this.t.setInterval(() => {
        if (this.current) {
          this.lastAt = this.t.now()
          this.send(this.current, true)
        }
      }, REPEAT_INTERVAL_MS)
    }, REPEAT_DELAY_MS)
  }

  release(): void {
    this.stop()
  }

  get holding(): RemoteKey | null {
    return this.current
  }

  private stop(): void {
    if (this.delayTimer !== null) this.t.clearTimeout(this.delayTimer)
    if (this.intervalTimer !== null) this.t.clearInterval(this.intervalTimer)
    this.delayTimer = null
    this.intervalTimer = null
    this.current = null
  }
}

/**
 * Dokunma pedi durum makinesi. İşaretçi olaylarını (koordinat + zaman) alır, tuşları `KeyRepeater` üzerinden yollar.
 * Kaydırma eşiği aşılınca yön yollanır ve parmak kalkana kadar o yönde yinelenir; parmak başka yöne eşik kadar
 * kayarsa yeni yön başlar (çapa yeniden kurulur).
 */
export class TouchPad {
  private start: { x: number; y: number; at: number } | null = null
  private anchor: { x: number; y: number } | null = null
  private dir: Direction | null = null
  private moved = false

  private readonly t: Timers
  private readonly repeater: KeyRepeater

  constructor(t: Timers, repeater: KeyRepeater) {
    this.t = t
    this.repeater = repeater
  }

  down(x: number, y: number): void {
    this.repeater.release()
    this.start = { x, y, at: this.t.now() }
    this.anchor = { x, y }
    this.dir = null
    this.moved = false
  }

  move(x: number, y: number): void {
    if (!this.start || !this.anchor) return
    const d = directionOf(x - this.anchor.x, y - this.anchor.y)
    if (!d) return
    this.moved = true
    if (d !== this.dir) {
      this.dir = d
      this.repeater.press(d)
    }
    this.anchor = { x, y }
  }

  up(x: number, y: number): void {
    if (!this.start) return
    const { at } = this.start
    if (!this.moved) {
      // Hareket eşiğin altında kaldıysa ama son anda eşik aşıldıysa (hızlı fiske) yön say.
      const d = this.anchor ? directionOf(x - this.anchor.x, y - this.anchor.y) : null
      if (d) this.repeater.tap(d)
      else if (this.t.now() - at <= TAP_MAX_MS) this.repeater.tap('OK')
    }
    this.cancel()
  }

  cancel(): void {
    this.repeater.release()
    this.start = null
    this.anchor = null
    this.dir = null
    this.moved = false
  }
}
