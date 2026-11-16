// Kartezyen grafikler: çizgi, alan, sütun (gruplu) ve dağılım. Ortak düzen: kenar boşlukları (y etiketlerinin
// genişliğine göre), y ölçeği (güzel sınırlı, 0 dahil), x ölçeği (kategori → bant, zaman → takvim, sayı →
// doğrusal), eksenler, seriler. Eksik değer (null) çizgide boşluk bırakır.
// Çıktı: SVG + açıklama + veri tablosu + nokta listesi (klavye ve ipucu için). SVG `role="img"` ve
// başlık/açıklamaya `aria-labelledby` ile bağlıdır; içinde odaklanılabilir öğe yoktur (etkileşim dışarıda).
// Genişletme: yığılmış sütun için `drawBars`'ta her seriyi öncekinin üstüne koyan bir `stacked` dalı yazın.
import { bottomAxis, CHAR_WIDTH, leftAxis, type Frame, type Tick } from './axis.ts'
import { formatAxis, formatDate, formatNumber } from './format.ts'
import { bandScale, linearScale, niceLinear, type LinearScale } from './scales.ts'
import { el, escapeXml, num } from './svg.ts'
import { legendHtml, tableHtml } from './table.ts'
import { seriesClass } from './theme.ts'
import { timeTicks } from './time.ts'
import { niceDomain } from './ticks.ts'
import type { CartesianSpec, ChartOutput, ChartPoint } from './types.ts'

let idCounter = 0
/** Sayfada benzersiz kimlik (title/desc bağlantısı için). Testlerde sıfırlanabilir. */
export function resetIds(): void {
  idCounter = 0
}

function xPositions(
  spec: CartesianSpec,
  frame: Frame,
): { at: (i: number) => number; ticks: Tick[]; labels: string[]; band?: ReturnType<typeof bandScale> } {
  const x = spec.x
  const range: [number, number] = [frame.left, frame.left + frame.width]
  if (x.kind === 'category') {
    const band = bandScale(x.values.length, range, spec.type === 'bar' ? 0.25 : 0, spec.type === 'bar' ? 0.15 : 0.5)
    const at = (i: number) => band(i) + band.bandwidth / 2
    return { at, ticks: x.values.map((label, i) => ({ position: at(i), label })), labels: x.values, band }
  }
  const raw = x.values.map((v) => +v)
  const min = Math.min(...raw)
  const max = Math.max(...raw)
  if (x.kind === 'time') {
    const scale = linearScale([min, max], range)
    return {
      at: (i) => scale(raw[i] as number),
      ticks: timeTicks(min, max, Math.max(2, Math.floor(frame.width / 80))).map((t) => ({
        position: scale(t.value),
        label: t.label,
      })),
      labels: raw.map(formatDate),
    }
  }
  const scale = linearScale(niceDomain(min, max, 5), range)
  return {
    at: (i) => scale(raw[i] as number),
    ticks: scale
      .ticks(Math.max(2, Math.floor(frame.width / 70)))
      .map((v) => ({ position: scale(v), label: formatAxis(v) })),
    labels: raw.map(formatNumber),
  }
}

function linePath(points: (readonly [number, number] | null)[]): string {
  let d = ''
  let pen = false
  for (const p of points) {
    if (!p) {
      pen = false
      continue
    }
    d += `${pen ? 'L' : 'M'}${num(p[0])} ${num(p[1])}`
    pen = true
  }
  return d
}

function areaPath(points: (readonly [number, number] | null)[], baseline: number): string {
  const segments: (readonly [number, number])[][] = [[]]
  for (const p of points) {
    if (p) segments[segments.length - 1]?.push(p)
    else segments.push([])
  }
  return segments
    .filter((s) => s.length > 0)
    .map(
      (s) =>
        `M${num(s[0]![0])} ${num(baseline)}${s.map((p) => `L${num(p[0])} ${num(p[1])}`).join('')}L${num(s[s.length - 1]![0])} ${num(baseline)}Z`,
    )
    .join('')
}

export function cartesianChart(spec: CartesianSpec): ChartOutput {
  const width = spec.width ?? 640
  const height = spec.height ?? 320
  const format = spec.format ?? formatNumber
  const all = spec.series.flatMap((s) => s.values.filter((v): v is number => v !== null))
  const probe = niceLinear(all, [0, 1], 5, spec.type !== 'scatter')
  const yLabels = probe.ticks(5).map(formatAxis)
  const left = Math.max(...yLabels.map((l) => l.length)) * CHAR_WIDTH + 14
  const frame: Frame = {
    left,
    top: spec.yLabel ? 26 : 12,
    width: width - left - 14,
    height: height - (spec.yLabel ? 26 : 12) - (spec.xLabel ? 42 : 30),
  }
  const y: LinearScale = niceLinear(all, [frame.top + frame.height, frame.top], 5, spec.type !== 'scatter')
  const xs = xPositions(spec, frame)
  const id = `grafik-${++idCounter}`
  const points: ChartPoint[] = []
  const layers: string[] = []
  const baseline = y(Math.max(y.domain[0], Math.min(0, y.domain[1])))

  spec.series.forEach((series, s) => {
    const coords = series.values.map((v, i) => (v === null ? null : ([xs.at(i), y(v)] as const)))
    series.values.forEach((v, i) => {
      const c = coords[i]
      if (v === null || !c) return
      let px = c[0]
      if (spec.type === 'bar' && xs.band) px = xs.band(i) + (xs.band.bandwidth / spec.series.length) * (s + 0.5)
      points.push({
        series: s,
        index: i,
        x: px,
        y: c[1],
        label: `${series.name} — ${xs.labels[i] ?? ''}: ${format(v)}`,
      })
    })
    const cls = seriesClass(s)
    if (spec.type === 'bar' && xs.band) {
      const band = xs.band
      const w = band.bandwidth / spec.series.length
      const bars = series.values
        .map((v, i) =>
          v === null
            ? ''
            : el('rect', {
                class: 'sutun',
                x: band(i) + w * s + 1,
                y: Math.min(y(v), baseline),
                width: Math.max(1, w - 2),
                height: Math.abs(baseline - y(v)),
              }),
        )
        .join('')
      layers.push(el('g', { class: cls }, bars))
    } else if (spec.type === 'scatter') {
      layers.push(
        el(
          'g',
          { class: cls },
          coords
            .map((c) => (c ? el('circle', { class: 'nokta', cx: c[0], cy: c[1], r: 3.5, 'fill-opacity': 0.75 }) : ''))
            .join(''),
        ),
      )
    } else {
      const area = spec.type === 'area' ? el('path', { class: 'alan', d: areaPath(coords, baseline) }) : ''
      layers.push(el('g', { class: cls }, area + el('path', { class: 'seri', d: linePath(coords) })))
    }
  })

  const yTicks = y.ticks(5).map((v) => ({ position: y(v), label: formatAxis(v) }))
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
    el('desc', { id: `${id}-aciklama` }, escapeXml(spec.description ?? summary(spec))),
    leftAxis(frame, yTicks, spec.yLabel),
    bottomAxis(frame, xs.ticks, spec.xLabel),
    el('g', { class: 'veri' }, ...layers),
    el('circle', { class: 'vurgu', r: 6, cx: -100, cy: -100, 'aria-hidden': 'true' }),
  )
  const header = [spec.xLabel ?? (spec.x.kind === 'time' ? 'Tarih' : 'Değer'), ...spec.series.map((s) => s.name)]
  const rows = xs.labels.map((label, i) => [
    label,
    ...spec.series.map((s) => (s.values[i] === null ? '—' : format(s.values[i] as number))),
  ])
  return {
    svg,
    legend: legendHtml(spec.series.map((s) => s.name)),
    table: tableHtml(`${spec.title} (veri tablosu)`, header, rows),
    points,
    width,
    height,
  }
}

/** Açıklama verilmediyse otomatik özet: seri sayısı ve her serinin en küçük/en büyük değeri. */
export function summary(spec: CartesianSpec): string {
  const parts = spec.series.map((s) => {
    const values = s.values.filter((v): v is number => v !== null)
    return values.length
      ? `${s.name}: en düşük ${formatNumber(Math.min(...values))}, en yüksek ${formatNumber(Math.max(...values))}`
      : `${s.name}: veri yok`
  })
  return `${spec.series.length} seri, ${spec.x.values.length} nokta. ${parts.join('; ')}.`
}
