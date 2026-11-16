// Tarayıcıda grafik yerleştirme ve etkileşim: başlık (figcaption), açıklama listesi, SVG, ipucu, canlı bölge
// ve açılır veri tablosu. Çizim alanı klavyeyle odaklanır: ←/→ aynı serideki noktalar, ↑/↓ seriler arası,
// Home/End uçlar; seçilen nokta vurgulanır, ipucunda görünür ve ekran okuyucuya duyurulur. Fare/dokunma ile
// en yakın nokta seçilir. Kap genişliği değişince grafik yeni genişlikle yeniden çizilir (yazı boyu sabit kalır).
// SVG dizgisi kaçışlanmış metinden kurulduğu için `innerHTML` ile eklenmesi güvenlidir (svg.ts → escapeXml).
// Genişletme: dokunmatikte kaydırarak gezinme için `pointermove`'a hız eşiği ekleyin.
import { escapeXml } from './svg.ts'
import type { ChartOutput, ChartPoint } from './types.ts'

export interface MountOptions {
  title: string
  description?: string
  /** Verilen genişlik için grafiği üretir (ör. width => cartesianChart({ ...spec, width })). */
  build: (width: number) => ChartOutput
  /** Yükseklik/genişlik oranı sınırları için en küçük ve en büyük genişlik. */
  minWidth?: number
}

let mountCounter = 0

export function mountChart(container: HTMLElement, options: MountOptions): { refresh(): void; destroy(): void } {
  const id = `grafik-kap-${++mountCounter}`
  container.innerHTML = `
    <figure class="grafik">
      <figcaption><span class="grafik-baslik">${escapeXml(options.title)}</span>${options.description ? `<span class="grafik-alt">${escapeXml(options.description)}</span>` : ''}</figcaption>
      <div class="grafik-aciklama-kap"></div>
      <div class="grafik-cizim" tabindex="0" role="group" aria-label="${escapeXml(options.title)}. Veri noktaları arasında ok tuşlarıyla gezinin."></div>
      <p class="gizli" id="${id}-canli" aria-live="polite"></p>
      <details class="grafik-veri"><summary>Veri tablosu</summary><div class="grafik-tablo-kap"></div></details>
    </figure>`
  const plot = container.querySelector<HTMLElement>('.grafik-cizim') as HTMLElement
  const live = container.querySelector<HTMLElement>(`#${id}-canli`) as HTMLElement
  const tip = document.createElement('div')
  tip.className = 'grafik-ipucu'
  tip.setAttribute('aria-hidden', 'true')
  tip.hidden = true
  let output: ChartOutput | undefined
  let order: ChartPoint[] = []
  let current = -1
  let lastWidth = 0

  const draw = () => {
    const width = Math.max(options.minWidth ?? 280, Math.round(plot.clientWidth || container.clientWidth || 640))
    if (Math.abs(width - lastWidth) < 4 && output) return
    lastWidth = width
    output = options.build(width)
    plot.innerHTML = output.svg
    plot.append(tip)
    ;(container.querySelector('.grafik-aciklama-kap') as HTMLElement).innerHTML = output.legend
    ;(container.querySelector('.grafik-tablo-kap') as HTMLElement).innerHTML = output.table
    order = [...output.points].sort((a, b) => a.series - b.series || a.x - b.x)
    if (current >= order.length) current = order.length - 1
    if (current >= 0) show(current, false)
  }

  const show = (index: number, announce: boolean) => {
    const point = order[index]
    const svg = plot.querySelector('svg')
    if (!point || !svg || !output) return
    current = index
    const marker = svg.querySelector('.vurgu')
    marker?.setAttribute('cx', String(point.x))
    marker?.setAttribute('cy', String(point.y))
    const scale = svg.getBoundingClientRect().width / output.width || 1
    tip.textContent = point.label
    tip.hidden = false
    tip.style.left = `${Math.round(point.x * scale)}px`
    tip.style.top = `${Math.round(point.y * scale)}px`
    if (announce) live.textContent = point.label
  }

  const hide = () => {
    tip.hidden = true
    plot.querySelector('.vurgu')?.setAttribute('cx', '-100')
  }

  /** Tuşa göre sıradaki noktanın sırası; tuş tanınmazsa undefined. */
  const nextIndex = (key: string): number | undefined => {
    const point = order[current]
    switch (key) {
      case 'ArrowRight':
        return current < 0 ? 0 : Math.min(order.length - 1, current + 1)
      case 'ArrowLeft':
        return Math.max(0, current - 1)
      case 'Home':
        return 0
      case 'End':
        return order.length - 1
      case 'ArrowDown':
      case 'ArrowUp': {
        if (!point) return 0
        const step = key === 'ArrowDown' ? 1 : -1
        const target = order.findIndex((p) => p.series === point.series + step && p.index === point.index)
        return target === -1 ? current : target
      }
      default:
        return undefined
    }
  }

  const onKey = (event: KeyboardEvent) => {
    if (order.length === 0) return
    if (event.key === 'Escape') {
      hide()
      return
    }
    const next = nextIndex(event.key)
    if (next === undefined) return
    event.preventDefault()
    show(next, true)
  }

  const onPointer = (event: PointerEvent) => {
    const svg = plot.querySelector('svg')
    if (!svg || !output || order.length === 0) return
    const rect = svg.getBoundingClientRect()
    const scale = output.width / (rect.width || output.width)
    const x = (event.clientX - rect.left) * scale
    const y = (event.clientY - rect.top) * scale
    let best = 0
    let bestDistance = Infinity
    order.forEach((p, i) => {
      const d = (p.x - x) ** 2 + (p.y - y) ** 2 * 0.25
      if (d < bestDistance) {
        bestDistance = d
        best = i
      }
    })
    show(best, false)
  }

  plot.addEventListener('keydown', onKey)
  plot.addEventListener('pointermove', onPointer)
  plot.addEventListener('pointerleave', hide)
  plot.addEventListener('blur', hide)
  const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(() => draw()) : undefined
  observer?.observe(plot)
  draw()
  return {
    refresh() {
      lastWidth = 0
      draw()
    },
    destroy() {
      observer?.disconnect()
      plot.removeEventListener('keydown', onKey)
      plot.removeEventListener('pointermove', onPointer)
      plot.removeEventListener('pointerleave', hide)
      plot.removeEventListener('blur', hide)
      container.innerHTML = ''
    },
  }
}
