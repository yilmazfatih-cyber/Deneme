// Sanallaştırılmış liste (DOM): on binlerce öğeden yalnız görünenleri (+ overscan) çizer. Öğeler doğal
// yüksekliklerinde akar; ResizeObserver her çizilen öğeyi ölçüp yükseklik dizinine yazar. Görünür alanın üstünde
// bir öğe büyüyüp küçülürse kaydırma konumu aynı farkla düzeltilir (çapa): kullanıcının okuduğu satır kaymaz.
// Erişilebilirlik: kaydırılan kap klavyeyle odaklanır (bölge + ad); liste öğeleri aria-setsize/aria-posinset ile
// "10.000 öğeden 5.000." bilgisini taşır.
// Genişletme: öğe yeniden kullanımı (aynı DOM düğümüne başka içerik) için `render`'a eski öğeyi parametre verin.
import { HeightIndex } from './height_index.ts'
import { anchorAdjustment, visibleRange } from './range.ts'

export interface VirtualListOptions {
  count: number
  /** Ölçülmemiş öğe için tahmini yükseklik (piksel). */
  estimate: number
  render: (index: number) => HTMLElement
  /** Kaydırma bölgesinin erişilebilir adı. */
  label: string
  overscan?: number
}

export class VirtualList {
  readonly element: HTMLElement
  readonly index: HeightIndex
  private readonly spacer: HTMLElement
  private readonly list: HTMLElement
  private readonly options: VirtualListOptions
  private readonly rendered = new Map<number, HTMLElement>()
  private readonly observer: ResizeObserver | undefined
  private frame = 0

  constructor(container: HTMLElement, options: VirtualListOptions) {
    this.options = options
    this.index = new HeightIndex(options.count, options.estimate)
    this.element = container
    container.setAttribute('role', 'region')
    container.setAttribute('aria-label', options.label)
    container.tabIndex = 0
    Object.assign(container.style, { position: 'relative', overflowY: 'auto' })
    this.spacer = document.createElement('div')
    this.list = document.createElement('div')
    this.list.setAttribute('role', 'list')
    Object.assign(this.list.style, { position: 'absolute', top: '0', left: '0', right: '0' })
    container.replaceChildren(this.spacer, this.list)
    this.observer =
      typeof ResizeObserver === 'function' ? new ResizeObserver((entries) => this.measure(entries)) : undefined
    container.addEventListener('scroll', () => this.schedule())
    this.update()
  }

  /** Şu an DOM'da kaç öğe var (sanallaştırmanın kanıtı). */
  get renderedCount(): number {
    return this.rendered.size
  }

  private schedule(): void {
    if (this.frame) return
    this.frame = requestAnimationFrame(() => {
      this.frame = 0
      this.update()
    })
  }

  update(): void {
    const range = visibleRange(
      this.index,
      this.element.scrollTop,
      this.element.clientHeight || 600,
      this.options.overscan ?? 4,
    )
    this.spacer.style.height = `${range.totalHeight}px`
    this.list.style.transform = `translateY(${range.offsetTop}px)`
    for (const [i, el] of this.rendered) {
      if (i >= range.start && i < range.end) continue
      this.observer?.unobserve(el)
      el.remove()
      this.rendered.delete(i)
    }
    const nodes: HTMLElement[] = []
    for (let i = range.start; i < range.end; i++) {
      let el = this.rendered.get(i)
      if (!el) {
        el = this.options.render(i)
        el.setAttribute('role', 'listitem')
        el.setAttribute('aria-setsize', String(this.options.count))
        el.setAttribute('aria-posinset', String(i + 1))
        el.dataset.index = String(i)
        this.rendered.set(i, el)
        this.observer?.observe(el)
      }
      nodes.push(el)
    }
    this.list.replaceChildren(...nodes)
  }

  private measure(entries: ResizeObserverEntry[]): void {
    let adjust = 0
    for (const entry of entries) {
      const i = Number((entry.target as HTMLElement).dataset.index)
      if (!this.rendered.has(i)) continue
      const height = entry.borderBoxSize?.[0]?.blockSize ?? entry.target.getBoundingClientRect().height
      const delta = this.index.setHeight(i, height)
      if (delta !== 0) adjust += anchorAdjustment(this.index, i, delta, this.element.scrollTop)
    }
    if (adjust !== 0) this.element.scrollTop += adjust
    this.update()
  }

  /** Öğeyi görünür alana getirir (başa, ortaya ya da sona hizalı). */
  scrollToIndex(index: number, align: 'start' | 'center' | 'end' = 'start'): void {
    const i = Math.max(0, Math.min(this.options.count - 1, index))
    const top = this.index.offsetOf(i)
    const height = this.index.heightOf(i)
    const viewport = this.element.clientHeight
    this.element.scrollTop =
      align === 'start' ? top : align === 'center' ? top - (viewport - height) / 2 : top - viewport + height
    this.update()
  }

  destroy(): void {
    this.observer?.disconnect()
    cancelAnimationFrame(this.frame)
    this.element.replaceChildren()
  }
}
