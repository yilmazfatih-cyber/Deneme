// Parçacıklar: sabit kapasiteli havuz (yapıların dizisi değil, dizilerin yapısı: her alan bir Float64Array).
// Yeni parçacık için bellek ayrılmaz; ölü yuvalar yeniden kullanılır. Havuz doluysa en eski parçacığın yeri
// alınır. Rastgelelik dışarıdan (tohumlu) gelir: parçacıklar da tekrar oynatmada aynıdır.
// Genişletme: renk geçişi, boyut eğrisi gibi alanlar yeni bir Float64Array olarak eklenir.
import type { Rng } from './rng.ts'

export interface EmitOptions {
  count: number
  speed: [number, number]
  life: [number, number]
  /** Yayılma açısı aralığı (radyan). Varsayılan tam çember. */
  angle?: [number, number]
  gravity?: number
  size?: number
  color: number
}

export class ParticlePool {
  readonly capacity: number
  readonly x: Float64Array
  readonly y: Float64Array
  readonly vx: Float64Array
  readonly vy: Float64Array
  readonly life: Float64Array
  readonly maxLife: Float64Array
  readonly gravity: Float64Array
  readonly size: Float64Array
  readonly color: Uint32Array
  private cursor = 0

  constructor(capacity: number) {
    this.capacity = capacity
    this.x = new Float64Array(capacity)
    this.y = new Float64Array(capacity)
    this.vx = new Float64Array(capacity)
    this.vy = new Float64Array(capacity)
    this.life = new Float64Array(capacity)
    this.maxLife = new Float64Array(capacity)
    this.gravity = new Float64Array(capacity)
    this.size = new Float64Array(capacity)
    this.color = new Uint32Array(capacity)
  }

  emit(x: number, y: number, options: EmitOptions, rng: Rng): void {
    const [a0, a1] = options.angle ?? [0, Math.PI * 2]
    for (let n = 0; n < options.count; n++) {
      const i = this.cursor
      this.cursor = (this.cursor + 1) % this.capacity
      const angle = rng.range(a0, a1)
      const speed = rng.range(options.speed[0], options.speed[1])
      this.x[i] = x
      this.y[i] = y
      this.vx[i] = Math.cos(angle) * speed
      this.vy[i] = Math.sin(angle) * speed
      this.life[i] = this.maxLife[i] = rng.range(options.life[0], options.life[1])
      this.gravity[i] = options.gravity ?? 0
      this.size[i] = options.size ?? 2
      this.color[i] = options.color
    }
  }

  update(dt: number): void {
    for (let i = 0; i < this.capacity; i++) {
      if ((this.life[i] as number) <= 0) continue
      this.life[i] = (this.life[i] as number) - dt
      this.vy[i] = (this.vy[i] as number) + (this.gravity[i] as number) * dt
      this.x[i] = (this.x[i] as number) + (this.vx[i] as number) * dt
      this.y[i] = (this.y[i] as number) + (this.vy[i] as number) * dt
    }
  }

  get aliveCount(): number {
    let n = 0
    for (let i = 0; i < this.capacity; i++) if ((this.life[i] as number) > 0) n++
    return n
  }

  /** Canlı parçacıkları dolaşır; `fade` 1 (yeni) → 0 (ölmek üzere). */
  forEachAlive(fn: (i: number, fade: number) => void): void {
    for (let i = 0; i < this.capacity; i++) {
      const life = this.life[i] as number
      if (life > 0) fn(i, life / (this.maxLife[i] as number))
    }
  }

  clear(): void {
    this.life.fill(0)
  }
}
