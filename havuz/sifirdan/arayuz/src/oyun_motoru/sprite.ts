// Hareketli resim (sprite) animasyonu: kare dizisi + her karenin süresi. Mantık (hangi kare gösterilecek)
// başsız sınanabilir; kareler resim dosyası yerine programla çizilir (`bakeFrames`): bu depoda lisanslı
// görsel yoktur, her şey kodla üretilir.
// Genişletme: sprite sayfası (tek resimde ızgara) için `drawFrame`'e kaynak dikdörtgeni parametresi ekleyin.

export class Animation {
  readonly durations: readonly number[]
  readonly loop: boolean
  private time = 0
  frame = 0
  finished = false

  constructor(durations: readonly number[], loop = true) {
    if (durations.length === 0 || durations.some((d) => d <= 0))
      throw new Error('Animasyon en az bir kare ve pozitif süreler ister.')
    this.durations = durations
    this.loop = loop
  }

  update(dt: number): void {
    if (this.finished) return
    this.time += dt
    for (;;) {
      const duration = this.durations[this.frame] as number
      if (this.time < duration) return
      this.time -= duration
      if (this.frame + 1 < this.durations.length) this.frame++
      else if (this.loop) this.frame = 0
      else {
        this.finished = true
        this.time = 0
        return
      }
    }
  }

  reset(): void {
    this.time = 0
    this.frame = 0
    this.finished = false
  }
}

export type FrameCanvas = HTMLCanvasElement | OffscreenCanvas

/** Kareleri bir kez çizip saklar (her karede yeniden çizmek yerine `drawImage` ile kopyalanır). */
export function bakeFrames(
  width: number,
  height: number,
  count: number,
  draw: (ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, frame: number) => void,
): FrameCanvas[] {
  const frames: FrameCanvas[] = []
  for (let i = 0; i < count; i++) {
    const canvas: FrameCanvas =
      typeof OffscreenCanvas === 'function'
        ? new OffscreenCanvas(width, height)
        : Object.assign(document.createElement('canvas'), { width, height })
    const ctx = canvas.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null
    if (!ctx) throw new Error('Tuval (canvas) 2B bağlamı alınamadı.')
    draw(ctx, i)
    frames.push(canvas)
  }
  return frames
}
