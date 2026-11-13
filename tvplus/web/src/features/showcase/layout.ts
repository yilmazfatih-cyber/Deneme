/**
 * Cihaz vitrini yerleşimi: her çerçeve kendi sanal çözünürlüğünde çizilir ve ölçeklenir (en-boy oranları doğru).
 * Geniş pencerede üçü yan yana (TV ve web aynı ekran yüksekliğinde, telefon daha uzun, alt kenarlar hizalı);
 * dar pencerede alt alta. Saf işlev (birim testi: layout.test.ts).
 */
import type { FrameId } from './scenarios'

export interface FrameSpec {
  id: FrameId
  /** Sanal görüntü alanı (iframe'in gerçek boyutu, px) */
  vw: number
  vh: number
}

/** TV 16:9 · Web 16:10 (masaüstü kabuğu ≥ 900 px) · Telefon 9:19.5 (390×845) */
export const FRAMES: readonly FrameSpec[] = [
  { id: 'tv', vw: 960, vh: 540 },
  { id: 'web', vw: 1120, vh: 700 },
  { id: 'telefon', vw: 390, vh: 845 },
]

/** Cihaz çerçevesinin ekran dışı payları (CSS ile aynı): yatay toplam, dikey toplam */
export const CHROME: Record<FrameId, { x: number; y: number }> = {
  tv: { x: 16, y: 16 + 26 }, // ince çerçeve + ayak
  web: { x: 24, y: 24 + 14 }, // ekran kapağı + gövde
  telefon: { x: 20, y: 20 }, // gövde
}

/** Telefon ekranının TV/web ekran yüksekliğine oranı (yan yana düzende) */
export const PHONE_TALLER = 1.45
export const GAP = 28
export const ROW_MIN_WIDTH = 1080

export interface FrameBox {
  id: FrameId
  /** Ekranın çizilen boyutu (px) */
  width: number
  height: number
  scale: number
}

export interface Layout {
  mode: 'row' | 'stack'
  frames: FrameBox[]
}

const spec = (id: FrameId) => FRAMES.find((f) => f.id === id)!

function box(id: FrameId, height: number): FrameBox {
  const s = spec(id)
  const scale = height / s.vh
  return { id, width: Math.round(s.vw * scale), height: Math.round(height), scale }
}

/**
 * Kullanılabilir genişlik ve yükseklikten (sahne alanı, px) çerçeve boyutları.
 * Yan yana: Σ genişlik + paylar + aralıklar ≤ W ve telefonun toplam yüksekliği ≤ H.
 */
export function layoutFrames(width: number, height: number): Layout {
  const W = Math.max(0, width)
  const H = Math.max(0, height)
  if (W >= ROW_MIN_WIDTH) {
    const tv = spec('tv')
    const web = spec('web')
    const ph = spec('telefon')
    const perH = tv.vw / tv.vh + web.vw / web.vh + (ph.vw / ph.vh) * PHONE_TALLER
    const fixed = CHROME.tv.x + CHROME.web.x + CHROME.telefon.x + GAP * 2
    const byWidth = (W - fixed) / perH
    const byHeight = Math.min((H - CHROME.telefon.y) / PHONE_TALLER, H - CHROME.tv.y, H - CHROME.web.y)
    const h = Math.max(120, Math.floor(Math.min(byWidth, byHeight)))
    return { mode: 'row', frames: [box('tv', h), box('web', h), box('telefon', Math.floor(h * PHONE_TALLER))] }
  }
  // Alt alta: TV ve web tam genişlik (en çok 760), telefon en çok 600 yüksek.
  const wide = Math.min(W, 760)
  const tvH = (wide - CHROME.tv.x) * (spec('tv').vh / spec('tv').vw)
  // Dizüstü gövdesi ekranın iki yanından %6 taşar (CSS): genişlik buna göre daraltılır.
  const webH = (wide / 1.12 - CHROME.web.x) * (spec('web').vh / spec('web').vw)
  const phoneH = Math.min(600, ((W - CHROME.telefon.x) * spec('telefon').vh) / spec('telefon').vw)
  return {
    mode: 'stack',
    frames: [box('tv', Math.max(80, tvH)), box('web', Math.max(80, webH)), box('telefon', Math.max(160, phoneH))],
  }
}
