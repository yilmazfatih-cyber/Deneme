// Görünür aralık hesabı (saf işlev): kaydırma konumu ve pencere yüksekliğinden hangi öğelerin çizileceğini,
// üst boşluğun ne kadar olduğunu bulur. Üstte ve altta `overscan` öğe fazladan çizilir (hızlı kaydırmada boş
// alan görünmesin). Kaydırma çapası: görünür alanın üstündeki bir öğe ölçülüp büyüdüyse içerik aşağı kayar;
// `anchorAdjustment` bu farkı kaydırma konumuna ekleyerek kullanıcının baktığı satırı yerinde tutar.
// Genişletme: "sona yapışık" sohbet listesi için `stickToBottom` seçeneği: toplam yükseklik artınca en alta kaydır.
import type { HeightIndex } from './height_index.ts'

export interface VisibleRange {
  start: number
  /** Dahil değil. */
  end: number
  /** İlk çizilen öğenin üst kenarı (piksel). */
  offsetTop: number
  totalHeight: number
}

export function visibleRange(index: HeightIndex, scrollTop: number, viewport: number, overscan = 4): VisibleRange {
  if (index.count === 0) return { start: 0, end: 0, offsetTop: 0, totalHeight: 0 }
  const first = index.indexAt(Math.max(0, scrollTop))
  const last = index.indexAt(Math.max(0, scrollTop + viewport - 1))
  const start = Math.max(0, first - overscan)
  const end = Math.min(index.count, last + 1 + overscan)
  return { start, end, offsetTop: index.offsetOf(start), totalHeight: index.total() }
}

/** Ölçüm sonrası kaydırma düzeltmesi: değişen öğe görünür alanın tamamen üstündeyse fark kadar kaydır. */
export function anchorAdjustment(index: HeightIndex, changed: number, delta: number, scrollTop: number): number {
  return index.offsetOf(changed) + index.heightOf(changed) - delta <= scrollTop ? delta : 0
}
