/**
 * ManagedMediaSource (iOS 17.1+ Safari) akış kapısı. Tarayıcı ne zaman veri istediğini `startstreaming` /
 * `endstreaming` olaylarıyla bildirir; `endstreaming` sonrası yeni parça istenmez (pil/ağ tasarrufu, tarayıcının
 * kuralı), `startstreaming` gelince indirme sürer. Klasik MediaSource'ta kapı hep açıktır (davranış değişmez).
 */
export interface StreamingSource {
  addEventListener(type: string, fn: () => void): void
  removeEventListener(type: string, fn: () => void): void
  /** ManagedMediaSource.streaming (yalnız yönetilen sınıfta vardır) */
  readonly streaming?: boolean
}

export class StreamingGate {
  private open: boolean
  private readonly src: StreamingSource | null
  private readonly onStart = () => this.set(true)
  private readonly onEnd = () => this.set(false)
  private readonly onChange: (open: boolean) => void

  constructor(src: StreamingSource, managed: boolean, onChange: (open: boolean) => void = () => undefined) {
    this.onChange = onChange
    this.src = managed ? src : null
    // Yönetilen sınıfta başlangıç durumu `streaming` özelliğinden; özellik yoksa açık kabul edilir
    this.open = managed ? src.streaming !== false : true
    if (this.src) {
      this.src.addEventListener('startstreaming', this.onStart)
      this.src.addEventListener('endstreaming', this.onEnd)
    }
  }

  /** Yeni parça istenebilir mi */
  allowed(): boolean {
    return this.open
  }

  private set(open: boolean): void {
    if (open === this.open) return
    this.open = open
    this.onChange(open)
  }

  dispose(): void {
    if (!this.src) return
    this.src.removeEventListener('startstreaming', this.onStart)
    this.src.removeEventListener('endstreaming', this.onEnd)
  }
}
