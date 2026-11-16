// Kök: `render(vnode, kap)` ile oluşturulan çizim alanı. Yerleşik ağacın tepesini, kirli (yeniden çizilecek)
// bileşenleri, işlenmeyi bekleyen etkileri ve olay yetkilendirme dinleyicilerini tutar.
// Genişletme: köke özgü yeni bir ayar (ör. hata günlükçüsü) buraya alan olarak eklenir.
import type { EffectHook, Instance } from './instance.ts'
import type { Mounted } from './mounted.ts'

export interface Root {
  container: Element
  mounted: Mounted | undefined
  dirty: Instance[]
  effects: { instance: Instance; hook: EffectHook }[]
  /** Olay türü → kökteki tek dinleyici (yetkilendirme). */
  listeners: Map<string, EventListener>
}

export function createRoot(container: Element): Root {
  return { container, mounted: undefined, dirty: [], effects: [], listeners: new Map() }
}
