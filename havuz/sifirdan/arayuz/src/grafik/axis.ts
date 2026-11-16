// Eksenler ve ızgara: çizgiler (tick), etiketler ve yatay ızgara çizgileri SVG dizgisi olarak üretilir.
// Etiket sığmazsa (kategori ekseninde çok sayıda uzun ad) her n'inci etiket gösterilir; tümü veri tablosunda
// ve ipucunda zaten vardır.
// Genişletme: döndürülmüş (45°) etiketler için `bottomAxis`'e `rotate` seçeneği ekleyin.
import { el, text } from './svg.ts'

export interface Tick {
  position: number
  label: string
}

export interface Frame {
  left: number
  top: number
  width: number
  height: number
}

/** Ortalama karakter genişliği (12 px yazı için yaklaşık) — etiket sığdırma hesabında kullanılır. */
export const CHAR_WIDTH = 6.6

export function leftAxis(frame: Frame, ticks: readonly Tick[], label?: string): string {
  const grid = ticks
    .map((t) => el('line', { x1: frame.left, x2: frame.left + frame.width, y1: t.position, y2: t.position }))
    .join('')
  const labels = ticks
    .map((t) =>
      el(
        'text',
        { x: frame.left - 8, y: t.position, 'text-anchor': 'end', 'dominant-baseline': 'middle' },
        text(t.label),
      ),
    )
    .join('')
  const name = label
    ? el('text', { class: 'eksen-ad', x: frame.left, y: frame.top - 8, 'text-anchor': 'start' }, text(label))
    : ''
  return (
    el('g', { class: 'izgara', 'aria-hidden': 'true' }, grid) +
    el('g', { class: 'eksen y', 'aria-hidden': 'true' }, labels) +
    name
  )
}

export function bottomAxis(frame: Frame, ticks: readonly Tick[], label?: string): string {
  const y = frame.top + frame.height
  const widest = Math.max(1, ...ticks.map((t) => t.label.length)) * CHAR_WIDTH + 8
  const room = ticks.length > 1 ? frame.width / ticks.length : frame.width
  const every = Math.max(1, Math.ceil(widest / Math.max(1, room)))
  const marks = ticks
    .map((t, i) => {
      const line = el('line', { x1: t.position, x2: t.position, y1: y, y2: y + 5 })
      return i % every === 0
        ? line + el('text', { x: t.position, y: y + 18, 'text-anchor': 'middle' }, text(t.label))
        : line
    })
    .join('')
  const base = el('line', { x1: frame.left, x2: frame.left + frame.width, y1: y, y2: y })
  const name = label
    ? el('text', { class: 'eksen-ad', x: frame.left + frame.width, y: y + 34, 'text-anchor': 'end' }, text(label))
    : ''
  return el('g', { class: 'eksen x', 'aria-hidden': 'true' }, base + marks) + name
}
