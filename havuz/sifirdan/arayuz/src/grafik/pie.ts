// Pasta ve halka grafik: dilim açısı = değer / toplam × 360°. Saat 12'den başlayıp saat yönünde ilerler.
// SVG yay komutu (A) tam çember çizemez; tek dilim %100 ise iki yarım yayla çizilir. Sıfır ve negatif
// değerler dilim olmaz (tabloda yine görünür). Etiketler dilim üstüne değil açıklamaya yazılır (küçük dilimde
// okunmaz ve renk karşıtlığı garanti edilemez); halkanın ortasında toplam görünür.
// Genişletme: dilimi tıklayınca dışa kaydırma için `points`'teki açıyı kullanan bir etkileşim ekleyin.
import { formatNumber, formatPercent } from './format.ts'
import { el, escapeXml, num, text } from './svg.ts'
import { legendHtml, tableHtml } from './table.ts'
import { seriesClass } from './theme.ts'
import type { ChartOutput, ChartPoint, PieSpec } from './types.ts'

let pieId = 0

const polar = (cx: number, cy: number, r: number, angle: number) =>
  [cx + r * Math.sin(angle), cy - r * Math.cos(angle)] as const

/** Halka dilimi yolu: dış yay, iç yay (iç yarıçap 0 ise merkezden pasta dilimi). */
export function arcPath(cx: number, cy: number, outer: number, inner: number, start: number, end: number): string {
  if (end - start >= Math.PI * 2 - 1e-9) {
    const mid = start + Math.PI
    return arcPath(cx, cy, outer, inner, start, mid) + arcPath(cx, cy, outer, inner, mid, end)
  }
  const large = end - start > Math.PI ? 1 : 0
  const [x0, y0] = polar(cx, cy, outer, start)
  const [x1, y1] = polar(cx, cy, outer, end)
  if (inner <= 0)
    return `M${num(cx)} ${num(cy)}L${num(x0)} ${num(y0)}A${num(outer)} ${num(outer)} 0 ${large} 1 ${num(x1)} ${num(y1)}Z`
  const [x2, y2] = polar(cx, cy, inner, end)
  const [x3, y3] = polar(cx, cy, inner, start)
  return `M${num(x0)} ${num(y0)}A${num(outer)} ${num(outer)} 0 ${large} 1 ${num(x1)} ${num(y1)}L${num(x2)} ${num(y2)}A${num(inner)} ${num(inner)} 0 ${large} 0 ${num(x3)} ${num(y3)}Z`
}

export function pieChart(spec: PieSpec): ChartOutput {
  const width = spec.width ?? 320
  const height = spec.height ?? 260
  const format = spec.format ?? formatNumber
  const total = spec.slices.reduce((sum, s) => sum + Math.max(0, s.value), 0)
  const cx = width / 2
  const cy = height / 2
  const outer = Math.min(width, height) / 2 - 6
  const inner = outer * Math.min(0.9, Math.max(0, spec.donut ?? 0))
  const id = `pasta-${++pieId}`
  const points: ChartPoint[] = []
  let angle = 0
  const slices = spec.slices.map((slice, i) => {
    if (slice.value <= 0 || total === 0) return ''
    const sweep = (slice.value / total) * Math.PI * 2
    const [px, py] = polar(cx, cy, (outer + inner) / 2 || outer / 2, angle + sweep / 2)
    points.push({
      series: i,
      index: i,
      x: px,
      y: py,
      label: `${slice.label}: ${format(slice.value)} (${formatPercent(slice.value / total)})`,
    })
    const path = el('path', {
      class: `dilim ${seriesClass(i)}`,
      d: arcPath(cx, cy, outer, inner, angle, angle + sweep),
    })
    angle += sweep
    return path
  })
  const center =
    inner > 0
      ? el(
          'text',
          { x: cx, y: cy, 'text-anchor': 'middle', 'dominant-baseline': 'middle', class: 'toplam' },
          text(format(total)),
        )
      : ''
  const svg = el(
    'svg',
    {
      xmlns: 'http://www.w3.org/2000/svg',
      viewBox: `0 0 ${width} ${height}`,
      role: 'img',
      'aria-labelledby': `${id}-baslik ${id}-aciklama`,
      class: 'grafik-svg',
    },
    el('title', { id: `${id}-baslik` }, escapeXml(spec.title)),
    el('desc', { id: `${id}-aciklama` }, escapeXml(spec.description ?? points.map((p) => p.label).join('; '))),
    el('g', { class: 'veri' }, ...slices),
    center,
    el('circle', { class: 'vurgu', r: 6, cx: -100, cy: -100, 'aria-hidden': 'true' }),
  )
  const shares = spec.slices.map((s) => (total > 0 && s.value > 0 ? formatPercent(s.value / total) : '—'))
  return {
    svg,
    legend: legendHtml(
      spec.slices.map((s) => s.label),
      shares,
    ),
    table: tableHtml(
      `${spec.title} (veri tablosu)`,
      ['Dilim', 'Değer', 'Pay'],
      spec.slices.map((s, i) => [s.label, format(s.value), shares[i] as string]),
    ),
    points,
    width,
    height,
  }
}
