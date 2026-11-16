// Kamera: dünyanın hangi dikdörtgeninin ekranda görüneceğini belirler. Hedefi yumuşak izler (her adımda
// aradaki farkın bir kısmını kapatır), dünya sınırlarının dışını göstermez ve sarsıntı (ekran titremesi)
// uygular. Sarsıntı tohumlu RNG ile yapılır: tekrar oynatmada da aynıdır.
// Genişletme: "ölü bölge" (hedef ortada bir kutudan çıkmadıkça kamera kıpırdamaz) `follow` içine eklenebilir.
import type { Aabb } from './collision.ts'
import type { Rng } from './rng.ts'

export class Camera {
  x = 0
  y = 0
  readonly width: number
  readonly height: number
  bounds: Aabb | undefined
  private shakeTime = 0
  private shakeAmount = 0
  offsetX = 0
  offsetY = 0

  constructor(width: number, height: number, bounds?: Aabb) {
    this.width = width
    this.height = height
    this.bounds = bounds
  }

  /** Hedefi görüntünün ortasına doğru yumuşak çeker; `rate` saniyede kapatılan farkın oranıdır. */
  follow(targetX: number, targetY: number, dt: number, rate = 8): void {
    const t = Math.min(1, rate * dt)
    this.x += (targetX - this.width / 2 - this.x) * t
    this.y += (targetY - this.height / 2 - this.y) * t
    this.clamp()
  }

  /** Kamerayı hemen hedefe getirir (bölüm başı). */
  snapTo(targetX: number, targetY: number): void {
    this.x = targetX - this.width / 2
    this.y = targetY - this.height / 2
    this.clamp()
  }

  clamp(): void {
    if (!this.bounds) return
    this.x = Math.max(this.bounds.x, Math.min(this.x, this.bounds.x + this.bounds.w - this.width))
    this.y = Math.max(this.bounds.y, Math.min(this.y, this.bounds.y + this.bounds.h - this.height))
  }

  shake(amount: number, duration: number): void {
    this.shakeAmount = Math.max(this.shakeAmount, amount)
    this.shakeTime = Math.max(this.shakeTime, duration)
  }

  update(dt: number, rng: Rng): void {
    if (this.shakeTime <= 0) {
      this.offsetX = 0
      this.offsetY = 0
      return
    }
    this.shakeTime -= dt
    const strength = this.shakeAmount * Math.max(0, this.shakeTime)
    this.offsetX = rng.range(-strength, strength)
    this.offsetY = rng.range(-strength, strength)
    if (this.shakeTime <= 0) this.shakeAmount = 0
  }

  view(): Aabb {
    return { x: this.x, y: this.y, w: this.width, h: this.height }
  }

  worldToScreen(x: number, y: number): { x: number; y: number } {
    return { x: x - this.x + this.offsetX, y: y - this.y + this.offsetY }
  }

  screenToWorld(x: number, y: number): { x: number; y: number } {
    return { x: x + this.x - this.offsetX, y: y + this.y - this.offsetY }
  }
}
