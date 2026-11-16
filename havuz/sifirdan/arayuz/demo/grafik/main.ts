// Grafik gösterimi: beş grafik türü, Türkçe biçimler, tema değiştirme ve SVG indirme. Veriler tohumlu sahte
// verilerdir (her açılışta aynı). Grafik yüksekliği genişliğe göre ayarlanır; kap daralınca yeniden çizilir.
// Genişletme: yeni grafik = HTML'de bir <section id> + burada bir `mountChart` çağrısı.
import {
  cartesianChart,
  chartCss,
  mountChart,
  pieChart,
  standaloneSvg,
  type CartesianSpec,
} from '../../src/grafik/index.ts'
import { metin } from '../metin.ts'

document.head.append(Object.assign(document.createElement('style'), { textContent: chartCss }))
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T
const lira = new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 })
const height = (width: number) => Math.round(Math.min(340, Math.max(220, width * 0.55)))

let seed = 7
const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647

const months = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara']
const line: CartesianSpec = {
  type: 'line',
  title: 'Aylık gelir ve gider',
  description: 'Gelir yıl boyunca artıyor; Haziran verisi eksik. Gider yaz aylarında yükseliyor.',
  x: { kind: 'category', values: months },
  series: [
    {
      name: 'Gelir',
      values: [42, 45, 47, 51, 50, null, 58, 61, 60, 64, 68, 72].map((v) => (v === null ? null : v * 1000)),
    },
    { name: 'Gider', values: [38, 37, 40, 41, 45, 49, 53, 52, 47, 46, 49, 55].map((v) => v * 1000) },
  ],
  yLabel: 'Tutar (₺)',
  format: (n) => lira.format(n),
}
const bar: CartesianSpec = {
  type: 'bar',
  title: 'Şehirlere göre şube sayısı',
  x: { kind: 'category', values: ['İstanbul', 'Ankara', 'İzmir', 'Iğdır', 'Şanlıurfa'] },
  series: [
    { name: '2025', values: [48, 21, 17, 3, 6] },
    { name: '2026', values: [53, 24, 19, 4, 9] },
  ],
}
const day = 86_400_000
const start = Date.UTC(2026, 8, 1)
const area: CartesianSpec = {
  type: 'area',
  title: 'Günlük ziyaretçi',
  x: { kind: 'time', values: Array.from({ length: 75 }, (_, i) => start + i * day) },
  series: [
    {
      name: 'Ziyaretçi',
      values: Array.from({ length: 75 }, (_, i) =>
        Math.round(9000 + 4000 * Math.sin(i / 6) + random() * 3000 + i * 80),
      ),
    },
  ],
}
const scatter: CartesianSpec = {
  type: 'scatter',
  title: 'Boy ve kilo',
  x: { kind: 'linear', values: Array.from({ length: 40 }, () => Math.round(150 + random() * 45)) },
  series: [{ name: 'Kişi', values: [] }],
  xLabel: 'Boy (cm)',
  yLabel: 'Kilo (kg)',
}
scatter.series[0]!.values = (scatter.x.values as number[]).map((h) => Math.round((h - 100) * (0.85 + random() * 0.35)))

const mount = (id: string, spec: CartesianSpec) =>
  mountChart($(id), {
    title: spec.title,
    description: spec.description,
    build: (width) => cartesianChart({ ...spec, width, height: height(width) }),
  })
mount('cizgi', line)
mount('sutun', bar)
mount('alan', area)
mount('dagilim', scatter)
const donut = {
  title: 'Aylık bütçe dağılımı',
  slices: [
    { label: 'Kira', value: 15000 },
    { label: 'Market', value: 7100 },
    { label: 'Fatura', value: 2650 },
    { label: 'Ulaşım', value: 1650 },
    { label: 'Birikim', value: 4000 },
  ],
  donut: 0.62,
  format: (n: number) => lira.format(n),
}
mountChart($('halka'), {
  title: donut.title,
  build: (width) => pieChart({ ...donut, width: Math.min(width, 360), height: 260 }),
})

const themeButton = $<HTMLButtonElement>('tema')
const isDark = () => {
  const forced = document.documentElement.dataset.tema
  return forced ? forced === 'koyu' : !matchMedia('(prefers-color-scheme: light)').matches
}
const syncThemeButton = () => (themeButton.textContent = metin.grafik.tema(isDark()))
themeButton.addEventListener('click', () => {
  document.documentElement.dataset.tema = isDark() ? 'acik' : 'koyu'
  syncThemeButton()
})
syncThemeButton()

$('svg-indir').addEventListener('click', () => {
  const svg = standaloneSvg(cartesianChart({ ...bar, width: 640, height: 360 }).svg)
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }))
  Object.assign(document.createElement('a'), { href: url, download: 'sube-sayisi.svg' }).click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
})
