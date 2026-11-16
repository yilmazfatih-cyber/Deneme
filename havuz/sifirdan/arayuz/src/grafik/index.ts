// grafik — bağımlılıksız SVG grafik kütüphanesi: ölçekler (doğrusal, zaman, kategorik), güzel eksen adımları,
// çizgi/alan/sütun/dağılım/pasta-halka, eksen ve ızgara, açıklama, ipucu, duyarlı boyut, koyu/açık tema,
// Türkçe sayı/tarih biçimi, erişilebilirlik (başlık/açıklama, veri tablosu, klavye). Tek giriş noktası.
// Ayrıntılı anlatım: README.md.
export { tickStep, ticks, niceDomain, stepDecimals } from './ticks.ts'
export { linearScale, niceLinear, bandScale, type LinearScale, type BandScale } from './scales.ts'
export { timeScale, timeTicks, type TimeScale, type TimeTick } from './time.ts'
export { formatNumber, formatAxis, formatPercent, formatDate, LOCALE } from './format.ts'
export { el, escapeXml, num } from './svg.ts'
export { chartCss, standaloneStyle, standaloneSvg, seriesClass, SERIES_COUNT } from './theme.ts'
export { cartesianChart, summary, resetIds } from './cartesian.ts'
export { pieChart, arcPath } from './pie.ts'
export { legendHtml, tableHtml } from './table.ts'
export { mountChart, type MountOptions } from './interact.ts'
export type { CartesianSpec, PieSpec, Series, XAxis, ChartType, ChartPoint, ChartOutput } from './types.ts'
