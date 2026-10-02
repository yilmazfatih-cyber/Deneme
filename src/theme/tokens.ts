/**
 * Tasarım token'ları — tek kaynak. Tasarımcı ajanın dosyası.
 * Kontrast oranları zemin (#FAF8F5) ya da beyaz yazı üzerinde hesaplandı; tests/unit/tokens.test.ts doğrular.
 */

export const color = {
  /** Sıcak kırık beyaz; saf beyazdan daha az parlar. */
  background: '#FAF8F5',
  surface: '#FFFFFF',
  /** 14,9:1 zemin üzerinde */
  text: '#1F2328',
  /** 7,5:1 zemin üzerinde */
  textSecondary: '#4A5160',
  /** 7,9:1 beyaz yazıyla — Söyle, Devam */
  primary: '#1B4F9C',
  /** 5,3:1 beyaz yazıyla — her zaman ✓ simgesi ve "Evet" yazısıyla */
  yes: '#1E7B3C',
  /** 6,5:1 beyaz yazıyla — yalnızca Hayır ve acil durum; hata mesajında kullanılmaz */
  no: '#B3261E',
  onColor: '#FFFFFF',
  /** Kart kenarı ve ayraçlar; 3:1 (UI bileşeni) */
  border: '#8A8F98',
  /** Odak halkası */
  focus: '#0B57D0',
  /** Seçili kart zemini; nötr, başarı/başarısızlık çağrışımı yok */
  selected: '#E8EEF8',
  /** Sakin bilgi kutusu (uyarı değil) */
  note: '#F1ECE4',
} as const

/**
 * Kategori renkleri Fitzgerald anahtarından uyarlandı; yalnızca kart kenarlığına uygulanır.
 * Hepsi zemine karşı ≥ 3:1 (WCAG 1.4.11). Renk tek başına anlam taşımaz.
 */
export const fitzColor = {
  kisiler: '#A07800', // sarı
  eylemler: '#2E7D32', // yeşil
  nesneler: '#B85A00', // turuncu
  yerler: '#6F42C1', // mor
  duygular: '#C2185B', // pembe
  sorular: '#1565C0', // mavi
  sosyal: '#C2185B', // sosyal sözcükler duygularla aynı (pembe)
} as const

/** Yüksek kontrast modu: zemin beyaz, metin siyah, kenarlar kalın. */
export const highContrast = {
  background: '#FFFFFF',
  surface: '#FFFFFF',
  text: '#000000',
  textSecondary: '#1F2328',
  border: '#000000',
  selected: '#DCE6F7',
  note: '#F1F1F1',
} as const

export const font = {
  family: "'Atkinson Hyperlegible Next', 'Noto Sans', system-ui, sans-serif",
  /**
   * Kart etiketi en az 22 pt. Mobil tasarımda pt (iOS noktası) = CSS px,
   * bu yüzden 22px kullanılır. "Büyük yazı" ayarı tüm boyutları %30 büyütür.
   */
  cardLabel: 22,
  body: 18,
  small: 16,
  heading: 26,
  display: 34,
  partner: 44,
  largeScale: 1.3,
} as const

export const size = {
  /** Dokunma alanı en az 72 px (≈ 11 mm) */
  touch: 72,
  gap: 12,
  gapLarge: 16,
  gutter: 16,
  radius: 14,
  borderCard: 4,
  borderSelected: 6,
  focusRing: 4,
} as const

export const motion = {
  /** Animasyon en aza indirilir; "Hareketi azalt" açıksa 0. */
  fast: '120ms',
} as const

export const speech = {
  /** Sesli okuma hızı varsayılanı (yavaş) */
  defaultRate: 0.8,
} as const

/** Token'ları CSS değişkeni olarak köke uygular. */
export function applyTokens(root: HTMLElement, opts: { highContrast: boolean; largeText: boolean }): void {
  const palette = { ...color, ...(opts.highContrast ? highContrast : {}) }
  for (const [k, v] of Object.entries(palette)) root.style.setProperty(`--c-${kebab(k)}`, v)
  for (const [k, v] of Object.entries(fitzColor)) root.style.setProperty(`--fitz-${k}`, v)
  const scale = opts.largeText ? font.largeScale : 1
  root.style.setProperty('--font-family', font.family)
  for (const key of ['cardLabel', 'body', 'small', 'heading', 'display', 'partner'] as const) {
    root.style.setProperty(`--fs-${kebab(key)}`, `${Math.round(font[key] * scale)}px`)
  }
  for (const [k, v] of Object.entries(size)) root.style.setProperty(`--${kebab(k)}`, `${v}px`)
  root.style.setProperty('--motion-fast', motion.fast)
}

function kebab(s: string): string {
  return s.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)
}
