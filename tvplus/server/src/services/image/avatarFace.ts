/**
 * Üretilen profil avatarları (`Avatar:yuz-01` … `yuz-10`): düz, köşeleri yuvarlatılmış bir renk alanı üstünde iki
 * basit göz ve bir gülümseme. Hepsi aynı çizgi kalınlığı ve aynı mürekkep mantığıyla çizilir (rengin koyu tonu),
 * böylece on yüz bir set gibi durur; her birinin göz biçimi, ağız eğrisi ve hafif başı yana eğişi farklıdır.
 * Yazı yok. 100×100 görünüm kutusunda tanımlanır, istenen boyuta vektörden çizilir (belirlenimci).
 */

type EyeKind = 'dot' | 'oval' | 'happy' | 'wink' | 'pill' | 'sleepy'
type MouthKind = 'smile' | 'wide' | 'open' | 'smirk' | 'grin' | 'small'

export interface FaceSpec {
  /** Zemin rengi */
  bg: string
  /** Yüz çizgilerinin rengi (zeminin koyu tonu) */
  ink: string
  eyes: EyeKind
  mouth: MouthKind
  /** Derece; yüz grubunun eğimi */
  tilt: number
  /** Yüzün merkezden kayması (görünüm kutusu birimi) */
  dx: number
  dy: number
  /** Gözler arası yarım mesafe */
  eyeGap: number
  /** Yanak lekeleri */
  cheeks: boolean
}

/** On yüz: renkler ton çemberinde aralıklı, doygun ama cırtlak değil */
export const FACES: readonly FaceSpec[] = [
  { bg: '#2F6FDE', ink: '#0C2357', eyes: 'dot', mouth: 'smile', tilt: -6, dx: 0, dy: 0, eyeGap: 15, cheeks: false },
  { bg: '#159A8A', ink: '#053B35', eyes: 'happy', mouth: 'wide', tilt: 4, dx: 2, dy: 1, eyeGap: 16, cheeks: true },
  { bg: '#EE8A2A', ink: '#5A2A05', eyes: 'oval', mouth: 'open', tilt: 0, dx: -2, dy: -1, eyeGap: 14, cheeks: false },
  { bg: '#7A4FD4', ink: '#261052', eyes: 'wink', mouth: 'smirk', tilt: -8, dx: 1, dy: 0, eyeGap: 15, cheeks: false },
  { bg: '#D6488E', ink: '#4E0C2C', eyes: 'pill', mouth: 'grin', tilt: 6, dx: 0, dy: 2, eyeGap: 16, cheeks: false },
  { bg: '#3FA246', ink: '#103B13', eyes: 'sleepy', mouth: 'small', tilt: -3, dx: -1, dy: 1, eyeGap: 14, cheeks: true },
  { bg: '#F0C232', ink: '#5C4305', eyes: 'dot', mouth: 'wide', tilt: 8, dx: 2, dy: -1, eyeGap: 17, cheeks: false },
  { bg: '#E3563D', ink: '#56160A', eyes: 'happy', mouth: 'open', tilt: -5, dx: -2, dy: 0, eyeGap: 15, cheeks: false },
  { bg: '#1DA3D6', ink: '#06374B', eyes: 'oval', mouth: 'smirk', tilt: 3, dx: 1, dy: 2, eyeGap: 13, cheeks: false },
  { bg: '#93B42A', ink: '#28330A', eyes: 'pill', mouth: 'smile', tilt: -4, dx: 0, dy: -1, eyeGap: 16, cheeks: true },
]

const STROKE = 5.2

/** 'Avatar:yuz-07' → 6 (dizin); tanınmazsa null */
export function faceIndexOf(seed: string): number | null {
  const m = /^Avatar:yuz-(\d{2})$/.exec(seed)
  if (!m) return null
  const n = Number(m[1]) - 1
  return n >= 0 && n < FACES.length ? n : null
}

function eye(kind: EyeKind, x: number, y: number, ink: string, right: boolean): string {
  const line = `fill="none" stroke="${ink}" stroke-width="${STROKE}" stroke-linecap="round" stroke-linejoin="round"`
  switch (kind) {
    case 'dot':
      return `<circle cx="${x}" cy="${y}" r="5.4" fill="${ink}"/>`
    case 'oval':
      return `<ellipse cx="${x}" cy="${y}" rx="4.3" ry="7" fill="${ink}"/>`
    case 'pill':
      return `<rect x="${x - 3.6}" y="${y - 7}" width="7.2" height="14" rx="3.6" fill="${ink}"/>`
    case 'happy':
      // Gülen göz: yukarı kavis
      return `<path d="M ${x - 6} ${y + 2.5} Q ${x} ${y - 6} ${x + 6} ${y + 2.5}" ${line}/>`
    case 'sleepy':
      // Yarı kapalı: aşağı kavis
      return `<path d="M ${x - 6} ${y - 1.5} Q ${x} ${y + 5.5} ${x + 6} ${y - 1.5}" ${line}/>`
    case 'wink':
      return right
        ? `<path d="M ${x - 6.5} ${y + 1} L ${x + 6} ${y + 1}" ${line}/>`
        : `<circle cx="${x}" cy="${y}" r="5.4" fill="${ink}"/>`
  }
}

function mouth(kind: MouthKind, y: number, ink: string, bg: string): string {
  const line = `fill="none" stroke="${ink}" stroke-width="${STROKE}" stroke-linecap="round" stroke-linejoin="round"`
  switch (kind) {
    case 'smile':
      return `<path d="M 36 ${y} Q 50 ${y + 12} 64 ${y}" ${line}/>`
    case 'wide':
      return `<path d="M 30 ${y - 2} Q 50 ${y + 15} 70 ${y - 2}" ${line}/>`
    case 'small':
      return `<path d="M 42 ${y + 1} Q 50 ${y + 7} 58 ${y + 1}" ${line}/>`
    case 'smirk':
      return `<path d="M 38 ${y + 3} Q 52 ${y + 9} 63 ${y - 3}" ${line}/>`
    case 'open':
      // Açık gülüş: dolu yarım ay, içinde açık tonlu dil
      return (
        `<path d="M 35 ${y - 2} Q 50 ${y - 1} 65 ${y - 2} Q 64 ${y + 15} 50 ${y + 15} Q 36 ${y + 15} 35 ${y - 2} Z" fill="${ink}" stroke="${ink}" stroke-width="2" stroke-linejoin="round"/>` +
        `<path d="M 43 ${y + 11} Q 50 ${y + 6} 57 ${y + 11} Q 50 ${y + 14.5} 43 ${y + 11} Z" fill="${bg}" fill-opacity="0.55"/>`
      )
    case 'grin':
      // Geniş, dişleri gösteren gülüş: dolu şerit + açık tonlu diş çizgisi
      return (
        `<path d="M 32 ${y - 3} Q 50 ${y + 2} 68 ${y - 3} Q 63 ${y + 13} 50 ${y + 13} Q 37 ${y + 13} 32 ${y - 3} Z" fill="${ink}" stroke="${ink}" stroke-width="2" stroke-linejoin="round"/>` +
        `<path d="M 37 ${y + 1.6} Q 50 ${y + 5.2} 63 ${y + 1.6}" fill="none" stroke="#FFFFFF" stroke-opacity="0.9" stroke-width="2.6" stroke-linecap="round"/>`
      )
  }
}

/** Avatar SVG'si (görünüm kutusu 100×100, istenen piksel boyutunda) */
export function faceAvatarSvg(index: number, size: number): string {
  const f = FACES[((index % FACES.length) + FACES.length) % FACES.length]!
  const cx = 50 + f.dx
  const eyeY = 43 + f.dy
  const mouthY = 61 + f.dy
  const cheeks = f.cheeks
    ? `<circle cx="${50 - f.eyeGap - 8}" cy="${eyeY + 11}" r="4.6" fill="#FFFFFF" fill-opacity="0.2"/>` +
      `<circle cx="${50 + f.eyeGap + 8}" cy="${eyeY + 11}" r="4.6" fill="#FFFFFF" fill-opacity="0.2"/>`
    : ''
  const face =
    cheeks +
    eye(f.eyes, 50 - f.eyeGap, eyeY, f.ink, false) +
    eye(f.eyes, 50 + f.eyeGap, eyeY, f.ink, true) +
    mouth(f.mouth, mouthY, f.ink, f.bg)
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 100 100">` +
    `<rect width="100" height="100" rx="7" fill="${f.bg}"/>` +
    // Hafif ışık: sol üstten çok yumuşak açılma (düz renk hissini bozmadan derinlik)
    `<defs><radialGradient id="l" cx="0.25" cy="0.15" r="0.9"><stop offset="0" stop-color="#FFFFFF" stop-opacity="0.12"/>` +
    `<stop offset="1" stop-color="#FFFFFF" stop-opacity="0"/></radialGradient></defs>` +
    `<rect width="100" height="100" rx="7" fill="url(#l)"/>` +
    // Yüz karonun ~%60'ını kaplasın: küçük boyutlarda (32 px menü avatarı) da okunur
    `<g transform="translate(${cx - 50} 0) rotate(${f.tilt} 50 52) translate(50 52) scale(1.22) translate(-50 -52)">${face}</g>` +
    `</svg>`
  )
}
