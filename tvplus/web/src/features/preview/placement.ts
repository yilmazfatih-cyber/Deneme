/**
 * Önizleme kartının yerleşimi (Netflix "mini modal") — saf hesap, birim testi preview.test.ts.
 *
 * Kart, altındaki kartın görselinden ~1.5× büyür:
 *   - Ortadaki kartlarda yatayda ortadan, sayfanın ilk tam görünen kartında sola, sonuncusunda sağa yaslanır
 *     (kenar ipucu verilmezse içerik sınırına taşıp taşmadığına bakılır).
 *   - Görsel dikeyde kartın ortasından büyür; bilgi alanı altına sarkar. Kart görünür alanı (üst menünün altı,
 *     pencerenin altı) hiçbir zaman aşmaz.
 *   - Büyüme kartın kendi yerinden başlar: `from` (sol üst kökenli öteleme + ölçek) kartı tam altındaki karta oturtur.
 */

export interface Box {
  left: number
  top: number
  width: number
  height: number
}

export type PreviewAlign = 'left' | 'center' | 'right'

export interface PlacementInput {
  /** Altındaki kartın görsel kutusu (pencere koordinatı) */
  anchor: Box
  viewport: { width: number; height: number }
  /** Bilgi alanının (görselin altı) yüksekliği px */
  bodyHeight: number
  /** Kenar ipucu (satırın ilk / son tam görünen kartı) */
  edge?: 'left' | 'right' | null
  /** Büyüme oranı; varsayılan 1.5 */
  scale?: number
  /** En küçük kart genişliği px; varsayılan 300 (dar ızgaralarda düğmeler sığsın) */
  minWidth?: number
  /** İçerik sınırı: yatay kenar boşluğu ve dikeyde üst menü / alt pay */
  inset?: { left: number; right: number; top: number; bottom: number }
  /** Pencere kenarıyla en az boşluk px; varsayılan 8 */
  margin?: number
}

export interface Placement {
  left: number
  top: number
  width: number
  /** 16:9 görsel yüksekliği */
  mediaHeight: number
  align: PreviewAlign
  /** Başlangıç durumu (sol üst köken): kart bu dönüşümle tam altındaki kartın üstündedir */
  from: { x: number; y: number; scale: number }
}

export const PREVIEW_SCALE = 1.5

export function placePreview(input: PlacementInput): Placement {
  const { anchor, viewport, bodyHeight } = input
  const scale = input.scale ?? PREVIEW_SCALE
  const margin = input.margin ?? 8
  const inset = input.inset ?? { left: margin, right: margin, top: margin, bottom: margin }
  const maxWidth = Math.max(0, viewport.width - margin * 2)
  const width = Math.round(Math.min(maxWidth, Math.max(anchor.width * scale, input.minWidth ?? 300)))
  const mediaHeight = Math.round((width * 9) / 16)

  const cx = anchor.left + anchor.width / 2
  let align: PreviewAlign
  if (input.edge === 'left') align = 'left'
  else if (input.edge === 'right') align = 'right'
  else {
    const centredLeft = cx - width / 2
    // Yarım pikselden küçük taşmalar ortalı sayılır (yuvarlama).
    if (centredLeft < inset.left - 0.5) align = 'left'
    else if (centredLeft + width > viewport.width - inset.right + 0.5) align = 'right'
    else align = 'center'
  }

  let left = align === 'left' ? anchor.left : align === 'right' ? anchor.left + anchor.width - width : cx - width / 2
  left = Math.min(Math.max(margin, left), Math.max(margin, viewport.width - margin - width))

  const total = mediaHeight + bodyHeight
  let top = anchor.top + anchor.height / 2 - mediaHeight / 2
  const maxTop = viewport.height - inset.bottom - total
  if (top > maxTop) top = maxTop
  if (top < inset.top) top = inset.top

  left = Math.round(left)
  top = Math.round(top)
  const s = width > 0 ? anchor.width / width : 1
  return {
    left,
    top,
    width,
    mediaHeight,
    align,
    from: { x: Math.round(anchor.left - left), y: Math.round(anchor.top - top), scale: Number(s.toFixed(4)) },
  }
}
