// FLIP düzen geçişi (First, Last, Invert, Play): öğelerin konumunu ölç (First), DOM'u değiştir, yeniden ölç
// (Last), aradaki farkı transform ile geri al (Invert: öğe eski yerinde görünür), sonra transform'u sıfıra
// doğru oynat (Play). Pahalı düzen (layout) hesabı yalnız iki kez yapılır; animasyon yalnız transform ile
// yürür (GPU dostu). Ölçüm işlevi dışarıdan verilebilir (testler sahte dikdörtgen kullanır).
// Genişletme: boyut değişen öğelerde içerik basıklığını önlemek için iç öğeye ters ölçek uygulayın.
import { cubic, type Easing } from './easing.ts'
import { shouldReduceMotion } from './motion.ts'
import type { Ticker } from './ticker.ts'
import { Tween } from './tween.ts'

export interface Rect {
  left: number
  top: number
  width: number
  height: number
}

export interface FlipOptions {
  duration?: number
  easing?: Easing
  ticker?: Ticker
  measure?: (element: HTMLElement) => Rect
}

/** Değişiklik sonrası öğeleri eski yerlerinden yenilerine kaydırır. Hareket azaltmada yalnız değişiklik yapılır. */
export function flip(
  elements: HTMLElement[],
  mutate: () => void,
  options: FlipOptions = {},
): Tween<number> | undefined {
  const measure = options.measure ?? ((el: HTMLElement) => el.getBoundingClientRect())
  const first = elements.map(measure)
  mutate()
  if (shouldReduceMotion()) return undefined
  const last = elements.map(measure)
  const deltas = elements.map((_, i) => {
    const a = first[i] as Rect
    const b = last[i] as Rect
    return {
      dx: a.left - b.left,
      dy: a.top - b.top,
      sx: b.width ? a.width / b.width : 1,
      sy: b.height ? a.height / b.height : 1,
    }
  })
  const apply = (p: number) =>
    elements.forEach((el, i) => {
      const d = deltas[i] as (typeof deltas)[number]
      const q = 1 - p
      el.style.transformOrigin = '0 0'
      el.style.transform =
        p >= 1 ? '' : `translate(${d.dx * q}px, ${d.dy * q}px) scale(${1 + (d.sx - 1) * q}, ${1 + (d.sy - 1) * q})`
    })
  apply(0)
  return new Tween({
    from: 0,
    to: 1,
    duration: options.duration ?? 300,
    easing: options.easing ?? cubic.out,
    ticker: options.ticker,
    onUpdate: apply,
  })
}
