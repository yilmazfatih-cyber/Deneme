/**
 * Kaynağı olmayan varlıklar için tohumdan (seed) belirlenimci kapak üretimi. Aynı tohum her zaman aynı görseli verir;
 * farklı tohumlar farklı renk çifti, ışık konumu ve doku seçer. Ürün paletinin havasında kalır: çok koyu zemin,
 * beyaz yazı, marka sarısı dolgu olarak kullanılmaz.
 */
import { createHash } from 'node:crypto'

export const BG = '#0D0E12'
export const TEXT_1 = '#FFFFFF'
export const TEXT_2 = '#B6B7BC'

export interface Palette {
  /** 0–360 */
  hue1: number
  hue2: number
  sat: number
  /** Doku türü 0–3 */
  texture: number
  /** Işık (parlama) merkezi, 0–1 */
  glowX: number
  glowY: number
  /** Degrade yönü: true → sol üstten sağ alta */
  diagonalDown: boolean
  /** Dokuya özgü ek değişkenler (0–1) */
  r1: number
  r2: number
  r3: number
}

export function paletteFromSeed(seed: string): Palette {
  const h = createHash('sha256').update(`tvplus-art|${seed}`).digest()
  const u16 = (i: number) => ((h[i] ?? 0) * 256 + (h[i + 1] ?? 0)) / 65535
  const hue1 = Math.round(u16(0) * 360)
  // İkinci ton birinciden 35–150° uzakta: ne tek renk ne de cırtlak tamamlayıcı.
  const hue2 = Math.round((hue1 + 35 + u16(2) * 115) % 360)
  return {
    hue1,
    hue2,
    sat: Math.round(42 + u16(4) * 22),
    texture: (h[6] ?? 0) % 4,
    glowX: 0.2 + u16(7) * 0.6,
    glowY: 0.12 + u16(9) * 0.4,
    diagonalDown: ((h[11] ?? 0) & 1) === 0,
    r1: u16(12),
    r2: u16(14),
    r3: u16(16),
  }
}

export const hsl = (h: number, s: number, l: number) => `hsl(${Math.round(h)}, ${Math.round(s)}%, ${Math.round(l)}%)`

/**
 * Arka plan: koyu yumuşak çapraz degrade + tek yumuşak ışık + ince geometrik doku + okunabilirlik için alta doğru
 * zemine kararan perde. `shade` alt perdenin gücüdür (yazının oturacağı kısım).
 */
export function generatedBackgroundSvg(
  w: number,
  h: number,
  p: Palette,
  opts: { shade: 'bottom' | 'left' | 'none' },
): string {
  const minSide = Math.min(w, h)
  const [x1, y1, x2, y2] = p.diagonalDown ? [0, 0, 1, 1] : [1, 0, 0, 1]
  const c1 = hsl(p.hue1, p.sat, 22)
  const c2 = hsl(p.hue2, p.sat - 8, 11)
  const glow = hsl(p.hue1, Math.min(80, p.sat + 18), 52)
  const glow2 = hsl(p.hue2, Math.min(75, p.sat + 10), 40)
  const gx = p.glowX * w
  const gy = p.glowY * h
  const gr = Math.max(w, h) * 0.75

  const defs =
    `<linearGradient id="base" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}">` +
    `<stop offset="0" stop-color="${c1}"/><stop offset="0.55" stop-color="${c2}"/><stop offset="1" stop-color="${BG}"/></linearGradient>` +
    `<radialGradient id="glow" cx="${gx.toFixed(1)}" cy="${gy.toFixed(1)}" r="${gr.toFixed(1)}" gradientUnits="userSpaceOnUse">` +
    `<stop offset="0" stop-color="${glow}" stop-opacity="0.5"/><stop offset="0.45" stop-color="${glow}" stop-opacity="0.14"/>` +
    `<stop offset="1" stop-color="${glow}" stop-opacity="0"/></radialGradient>` +
    `<radialGradient id="glow2" cx="${((1 - p.glowX) * w).toFixed(1)}" cy="${(h * (0.75 + p.r3 * 0.2)).toFixed(1)}" r="${(gr * 0.6).toFixed(1)}" gradientUnits="userSpaceOnUse">` +
    `<stop offset="0" stop-color="${glow2}" stop-opacity="0.22"/><stop offset="1" stop-color="${glow2}" stop-opacity="0"/></radialGradient>` +
    shadeGradient(opts.shade)

  const texture = textureSvg(w, h, p, minSide)
  const shade = opts.shade === 'none' ? '' : `<rect width="${w}" height="${h}" fill="url(#shade)"/>`
  return (
    `<defs>${defs}</defs>` +
    `<rect width="${w}" height="${h}" fill="${BG}"/>` +
    `<rect width="${w}" height="${h}" fill="url(#base)"/>` +
    `<rect width="${w}" height="${h}" fill="url(#glow2)"/>` +
    `<rect width="${w}" height="${h}" fill="url(#glow)"/>` +
    texture +
    shade
  )
}

function shadeGradient(shade: 'bottom' | 'left' | 'none'): string {
  if (shade === 'bottom')
    return (
      `<linearGradient id="shade" x1="0" y1="0" x2="0" y2="1">` +
      `<stop offset="0.35" stop-color="${BG}" stop-opacity="0"/><stop offset="0.72" stop-color="${BG}" stop-opacity="0.55"/>` +
      `<stop offset="1" stop-color="${BG}" stop-opacity="0.9"/></linearGradient>`
    )
  if (shade === 'left')
    return (
      `<linearGradient id="shade" x1="0" y1="0" x2="1" y2="0.35">` +
      `<stop offset="0" stop-color="${BG}" stop-opacity="0.78"/><stop offset="0.5" stop-color="${BG}" stop-opacity="0.35"/>` +
      `<stop offset="1" stop-color="${BG}" stop-opacity="0"/></linearGradient>`
    )
  return ''
}

/** Dört doku: halkalar, çapraz çizgiler, nokta ızgarası, iç içe döndürülmüş kareler. Hepsi çok düşük opaklıkta. */
function textureSvg(w: number, h: number, p: Palette, minSide: number): string {
  const stroke = Math.max(1, minSide / 260)
  const gx = p.glowX * w
  const gy = p.glowY * h
  const parts: string[] = []
  switch (p.texture) {
    case 0: {
      // Işık merkezinden yayılan eş merkezli halkalar
      const step = minSide * (0.07 + p.r1 * 0.05)
      const count = Math.ceil(Math.hypot(w, h) / step)
      for (let i = 1; i <= count; i++) {
        const op = Math.max(0, 0.15 - i * 0.008)
        if (op <= 0) break
        parts.push(
          `<circle cx="${gx.toFixed(1)}" cy="${gy.toFixed(1)}" r="${(i * step).toFixed(1)}" fill="none" stroke="#fff" stroke-opacity="${op.toFixed(3)}" stroke-width="${stroke.toFixed(2)}"/>`,
        )
      }
      break
    }
    case 1: {
      // Eğik ince çizgiler, ışığa yakın yerde daha belirgin
      const step = minSide * (0.045 + p.r1 * 0.035)
      const slope = p.diagonalDown ? 1 : -1
      const span = w + h
      for (let s = -span; s <= span; s += step) {
        const xA = s
        const xB = s + slope * h
        const mid = (xA + xB) / 2
        const near = 1 - Math.min(1, Math.abs(mid - gx) / w)
        const op = 0.035 + near * 0.08
        parts.push(
          `<line x1="${xA.toFixed(1)}" y1="0" x2="${xB.toFixed(1)}" y2="${h}" stroke="#fff" stroke-opacity="${op.toFixed(3)}" stroke-width="${stroke.toFixed(2)}"/>`,
        )
      }
      break
    }
    case 2: {
      // Nokta ızgarası; ışık merkezinden uzaklaştıkça söner
      const step = minSide * (0.05 + p.r1 * 0.03)
      const r = Math.max(0.8, minSide / 320)
      const reach = Math.max(w, h) * 0.8
      for (let y = step / 2; y < h; y += step)
        for (let x = step / 2; x < w; x += step) {
          const d = Math.hypot(x - gx, y - gy) / reach
          const op = 0.24 * Math.max(0, 1 - d)
          if (op > 0.01)
            parts.push(
              `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(2)}" fill="#fff" fill-opacity="${op.toFixed(3)}"/>`,
            )
        }
      break
    }
    default: {
      // İç içe, döndürülmüş kareler (çerçeve) — mimari bir his
      const angle = 12 + p.r1 * 30
      const base = minSide * (0.22 + p.r2 * 0.12)
      for (let i = 0; i < 7; i++) {
        const s = base * (1 + i * 0.42)
        const op = Math.max(0, 0.14 - i * 0.016)
        parts.push(
          `<rect x="${(gx - s / 2).toFixed(1)}" y="${(gy - s / 2).toFixed(1)}" width="${s.toFixed(1)}" height="${s.toFixed(1)}" ` +
            `transform="rotate(${angle.toFixed(1)} ${gx.toFixed(1)} ${gy.toFixed(1)})" fill="none" stroke="#fff" stroke-opacity="${op.toFixed(3)}" stroke-width="${stroke.toFixed(2)}"/>`,
        )
      }
      break
    }
  }
  return `<g>${parts.join('')}</g>`
}

/** Kanal adından baş harfler: "TRT Haber" → "TRT", "TRT 1" → "TRT 1", "Kanal D" → "KD", "Show TV" → "ST". */
export function initialsOf(name: string): string {
  const words = name
    .replace(/[^\p{L}\p{N}\s+]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean)
  const first = words[0]
  if (!first) return '?'
  const isAcronym = (w: string) =>
    w.length >= 2 && w.length <= 4 && w === w.toLocaleUpperCase('tr-TR') && /\p{L}/u.test(w)
  if (isAcronym(first)) {
    const second = words[1]
    return second && /^[\p{N}+]{1,3}$/u.test(second) ? `${first} ${second}` : first
  }
  if (words.length === 1) return first.slice(0, 2).toLocaleUpperCase('tr-TR')
  return words
    .slice(0, 2)
    .map((w) => w[0] ?? '')
    .join('')
    .toLocaleUpperCase('tr-TR')
}
