// Ortak grafik türleri: veri tanımı (spec) ve çizim çıktısı. Çizim saf bir işlevdir: aynı tanım → aynı SVG
// dizgisi (Node'da da çalışır, testler dizgiyi çözümleyip yapısını denetler). Etkileşim interact.ts'tedir.
// Genişletme: yeni grafik türü = `ChartType`'a üye + cartesian.ts'te `draw…` işlevi (ya da yeni dosya).

export type ChartType = 'line' | 'area' | 'bar' | 'scatter'

export interface Series {
  name: string
  /** x değerleriyle aynı sırada; eksik veri için null (çizgide boşluk olur). */
  values: (number | null)[]
}

export type XAxis =
  | { kind: 'category'; values: string[] }
  | { kind: 'time'; values: (Date | number)[] }
  | { kind: 'linear'; values: number[] }

export interface CartesianSpec {
  type: ChartType
  title: string
  description?: string
  x: XAxis
  series: Series[]
  width?: number
  height?: number
  xLabel?: string
  yLabel?: string
  /** Değer biçimi (ipucu ve tablo). Varsayılan Türkçe sayı. */
  format?: (value: number) => string
}

export interface PieSpec {
  title: string
  description?: string
  slices: { label: string; value: number }[]
  /** Halka için iç yarıçap oranı (0 = pasta, 0,6 = halka). */
  donut?: number
  width?: number
  height?: number
  format?: (value: number) => string
}

export interface ChartPoint {
  series: number
  index: number
  /** SVG koordinatı. */
  x: number
  y: number
  /** Ekran okuyucu ve ipucu metni: "Gelir — Ocak: 1.234". */
  label: string
}

export interface ChartOutput {
  svg: string
  /** HTML açıklama (renk + ad listesi). */
  legend: string
  /** HTML veri tablosu (grafiği göremeyenler için yedek). */
  table: string
  points: ChartPoint[]
  width: number
  height: number
}
