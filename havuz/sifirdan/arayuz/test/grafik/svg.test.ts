// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import {
  arcPath,
  cartesianChart,
  mountChart,
  pieChart,
  resetIds,
  standaloneSvg,
  type CartesianSpec,
} from '../../src/grafik/index.ts'

const spec: CartesianSpec = {
  type: 'line',
  title: 'Aylık gelir <script>alert(1)</script>',
  x: { kind: 'category', values: ['Oca', 'Şub', 'Mar', 'Nis'] },
  series: [
    { name: 'Gelir', values: [1200, 1850, null, 2400] },
    { name: 'Gider', values: [900, 1100, 1300, 1250] },
  ],
}

const parse = (svg: string) => new DOMParser().parseFromString(svg, 'image/svg+xml')

beforeEach(() => resetIds())

describe('kartezyen SVG yapısı', () => {
  it('erişilebilir başlık/açıklama bağlantısı, kaçışlanmış metin, iyi biçimli XML', () => {
    const out = cartesianChart(spec)
    const doc = parse(out.svg)
    expect(doc.querySelector('parsererror')).toBeNull()
    const svg = doc.documentElement
    expect(svg.getAttribute('role')).toBe('img')
    const [titleId, descId] = svg.getAttribute('aria-labelledby')!.split(' ')
    expect(doc.getElementById(titleId!)?.textContent).toBe('Aylık gelir <script>alert(1)</script>')
    expect(doc.querySelector('script')).toBeNull()
    expect(doc.getElementById(descId!)?.textContent).toContain('Gelir: en düşük 1.200, en yüksek 2.400')
    expect(out.svg).not.toContain('<script>')
  })

  it('eksik değer çizgide boşluk bırakır; nokta listesi ve tablo veriyle uyumlu', () => {
    const out = cartesianChart(spec)
    const paths = [...parse(out.svg).querySelectorAll('path.seri')].map((p) => p.getAttribute('d')!)
    expect(paths[0]!.match(/M/g)).toHaveLength(2)
    expect(paths[1]!.match(/M/g)).toHaveLength(1)
    expect(out.points).toHaveLength(7)
    expect(out.points[0]!.label).toBe('Gelir — Oca: 1.200')
    const table = new DOMParser().parseFromString(out.table, 'text/html')
    expect([...table.querySelectorAll('thead th')].map((th) => th.textContent)).toEqual(['Değer', 'Gelir', 'Gider'])
    expect([...table.querySelectorAll('tbody tr')][2]!.textContent).toBe('Mar—1.300')
  })

  it('sütun grafikte seri × kategori kadar dikdörtgen; negatif değer sıfır çizgisinin altına iner', () => {
    const out = cartesianChart({ ...spec, type: 'bar', series: [{ name: 'Kâr', values: [5, -3, 2, 0] }] })
    const rects = [...parse(out.svg).querySelectorAll('rect.sutun')]
    expect(rects).toHaveLength(4)
    const negative = rects[1]!
    const positive = rects[0]!
    expect(Number(negative.getAttribute('y'))).toBeGreaterThanOrEqual(
      Number(positive.getAttribute('y')) + Number(positive.getAttribute('height')) - 0.01,
    )
  })

  it('alan, dağılım ve zaman ekseni üretilir', () => {
    const area = cartesianChart({ ...spec, type: 'area' })
    expect(parse(area.svg).querySelectorAll('path.alan')).toHaveLength(2)
    const scatter = cartesianChart({
      type: 'scatter',
      title: 'Boy-kilo',
      x: { kind: 'linear', values: [150, 165, 180] },
      series: [{ name: 'Kişi', values: [50, 62, 80] }],
    })
    expect(parse(scatter.svg).querySelectorAll('circle.nokta')).toHaveLength(3)
    const time = cartesianChart({ ...spec, x: { kind: 'time', values: [0, 1, 2, 3].map((m) => Date.UTC(2026, m, 1)) } })
    expect(parse(time.svg).querySelector('.eksen.x')!.textContent).toContain('Şub')
  })
})

describe('pasta ve halka', () => {
  it('dilim açıları tam çemberi doldurur; %100 dilim iki yayla çizilir', () => {
    const out = pieChart({
      title: 'Bütçe',
      slices: [
        { label: 'Kira', value: 50 },
        { label: 'Gıda', value: 30 },
        { label: 'Diğer', value: 20 },
        { label: 'Boş', value: 0 },
      ],
      donut: 0.6,
    })
    const doc = parse(out.svg)
    expect(doc.querySelectorAll('path.dilim')).toHaveLength(3)
    expect(out.points.map((p) => p.label)).toEqual(['Kira: 50 (%50)', 'Gıda: 30 (%30)', 'Diğer: 20 (%20)'])
    expect(doc.querySelector('.toplam')!.textContent).toBe('100')
    expect(arcPath(50, 50, 40, 0, 0, Math.PI * 2).match(/A/g)).toHaveLength(2)
    expect(out.table).toContain('<td>%50</td>')
  })

  it('tek başına SVG dosyası gömülü stil taşır', () => {
    const svg = standaloneSvg(pieChart({ title: 'x', slices: [{ label: 'a', value: 1 }] }).svg)
    expect(svg.startsWith('<svg')).toBe(true)
    expect(svg).toContain('<style>.grafik-svg{')
    expect(parse(svg).querySelector('parsererror')).toBeNull()
  })
})

describe('etkileşim', () => {
  it('klavyeyle noktalar arasında gezer ve canlı bölgeye duyurur', () => {
    const container = document.createElement('div')
    document.body.append(container)
    const chart = mountChart(container, { title: 'Gelir', build: (width) => cartesianChart({ ...spec, width }) })
    const plot = container.querySelector<HTMLElement>('.grafik-cizim')!
    expect(plot.getAttribute('tabindex')).toBe('0')
    plot.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }))
    plot.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }))
    const live = container.querySelector('[aria-live]')!
    expect(live.textContent).toBe('Gelir — Şub: 1.850')
    plot.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }))
    expect(live.textContent).toBe('Gider — Şub: 1.100')
    expect(container.querySelector('table caption')!.textContent).toBe(
      'Aylık gelir <script>alert(1)</script> (veri tablosu)',
    )
    chart.destroy()
    expect(container.innerHTML).toBe('')
  })
})
