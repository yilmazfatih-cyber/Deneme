/**
 * Kanal önizleme kartının yerleşimi (saf; birim testi liveRows.test.ts). Netflix önizleme kartı gibi kart yerinde
 * ~1.5× büyür: ortadaki kartlarda ortadan, satırın ilk / son tam görünen kartında içe doğru; görsel dikeyde kartın
 * ortasından büyür, bilgi alanı altına sarkar; kart görünür alanı (üst menünün altı, pencerenin altı) aşmaz.
 * `origin` büyümenin başladığı nokta (CSS transform-origin, kartın kendi koordinatında).
 */
export interface Rect {
  left: number
  top: number
  width: number
  height: number
}

export interface HoverPlacement {
  left: number
  top: number
  width: number
  mediaHeight: number
  /** Başlangıç ölçeği (kart tam altındaki kartın boyundadır) */
  scale: number
  /** transform-origin px (kartın sol üstüne göre) */
  originX: number
  originY: number
}

export function placeHoverCard(input: {
  anchor: Rect
  viewport: { width: number; height: number }
  /** Görselin altındaki bilgi alanı px */
  bodyHeight: number
  edge?: 'left' | 'right' | null
  /** Üst menü yüksekliği (kart altına inmez) */
  topInset?: number
  scale?: number
  minWidth?: number
  margin?: number
}): HoverPlacement {
  const { anchor, viewport, bodyHeight } = input
  const margin = input.margin ?? 8
  const topInset = input.topInset ?? margin
  const width = Math.round(
    Math.min(viewport.width - margin * 2, Math.max(anchor.width * (input.scale ?? 1.5), input.minWidth ?? 320)),
  )
  const mediaHeight = Math.round((width * 9) / 16)
  let left =
    input.edge === 'left'
      ? anchor.left
      : input.edge === 'right'
        ? anchor.left + anchor.width - width
        : anchor.left + anchor.width / 2 - width / 2
  left = Math.min(Math.max(margin, left), viewport.width - margin - width)
  const anchorMediaH = (anchor.width * 9) / 16
  let top = anchor.top + anchorMediaH / 2 - mediaHeight / 2
  top = Math.min(top, viewport.height - margin - mediaHeight - bodyHeight)
  top = Math.max(top, topInset + margin)
  left = Math.round(left)
  top = Math.round(top)
  const scale = width > 0 ? anchor.width / width : 1
  // Ölçeklenmiş kartın sol üstü kartın sol üstüne denk gelsin: origin = (anchor - box) / (1 - scale)
  const k = 1 - scale
  const originX = k > 0.001 ? (anchor.left - left) / k : width / 2
  const originY = k > 0.001 ? (anchor.top - top) / k : mediaHeight / 2
  return {
    left,
    top,
    width,
    mediaHeight,
    scale: Number(scale.toFixed(4)),
    originX: Math.round(originX),
    originY: Math.round(originY),
  }
}
