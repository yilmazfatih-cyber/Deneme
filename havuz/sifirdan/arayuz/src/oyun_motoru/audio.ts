// Ses için ince sarmalayıcı: Web Audio ile programla üretilen kısa sesler (osilatör + zarf). Ses dosyası yok.
// Tarayıcılar sesi ancak bir kullanıcı hareketinden sonra açar: `unlock()` ilk dokunuş/tuşta çağrılır.
// Ortamda AudioContext yoksa (Node, testler) her çağrı sessizce hiçbir şey yapmaz.
// Genişletme: ses efektlerini önceden "AudioBuffer" olarak üretip `playBuffer` ile çalmak daha ucuzdur.

export interface ToneOptions {
  frequency: number
  duration: number
  type?: OscillatorType
  volume?: number
  /** Bitişte ulaşılacak frekans (kayan ses). */
  slideTo?: number
}

export class Sound {
  muted = false
  private context: AudioContext | undefined
  private readonly create: () => AudioContext | undefined

  constructor(create?: () => AudioContext | undefined) {
    this.create = create ?? (() => (typeof AudioContext === 'function' ? new AudioContext() : undefined))
  }

  /** Bir kullanıcı hareketinin içinden çağrılmalı. */
  unlock(): void {
    this.context ??= this.create()
    void this.context?.resume()
  }

  tone(options: ToneOptions): void {
    const ctx = this.context
    if (this.muted || !ctx || ctx.state !== 'running') return
    const start = ctx.currentTime
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = options.type ?? 'sine'
    osc.frequency.setValueAtTime(options.frequency, start)
    if (options.slideTo) osc.frequency.exponentialRampToValueAtTime(options.slideTo, start + options.duration)
    gain.gain.setValueAtTime(options.volume ?? 0.15, start)
    gain.gain.exponentialRampToValueAtTime(0.0001, start + options.duration)
    osc.connect(gain).connect(ctx.destination)
    osc.start(start)
    osc.stop(start + options.duration + 0.02)
  }
}
