/**
 * Renk belirteçleri: açık ve koyu tema. Bileşenler renk kodu YAZMAZ; `useTheme().colors.<ad>` kullanır.
 * Her metin/zemin çifti WCAG AA karşıtlığını (≥ 4,5:1) sağlar; kenarlıklar ≥ 3:1. Korur: test/rules/contrast.test.ts.
 *
 * Genişletme: yeni bir renk → iki temaya da aynı adla ekleyin ve kullanılacağı zeminle çiftini kural testine yazın.
 */
import type { ListColor } from '@uygulama/shared'

export interface Palette {
  /** Ekran zemini. */
  readonly background: string
  /** Kart, satır, alan zemini. */
  readonly surface: string
  /** İkincil zemin (seçili sekme, arama kutusu). */
  readonly surfaceAlt: string
  /** Ana metin. */
  readonly ink: string
  /** İkincil metin (açıklama, tarih). */
  readonly muted: string
  /** İnce ayraç çizgisi (yalnız süs; anlam taşımaz). */
  readonly line: string
  /** Form alanı ve onay kutusu kenarı (≥ 3:1). */
  readonly lineStrong: string
  /** Birincil düğme zemini ve vurgu. */
  readonly accent: string
  /** `accent` üstündeki metin. */
  readonly onAccent: string
  readonly accentSoft: string
  /** `accentSoft` ve `surface` üstünde vurgulu metin (bağlantı, seçili). */
  readonly accentInk: string
  readonly danger: string
  readonly dangerSoft: string
  readonly success: string
  readonly successSoft: string
  readonly warn: string
  readonly warnSoft: string
  /** Bildirim (toast) zemini ve metni. */
  readonly toast: string
  readonly onToast: string
  readonly toastAction: string
  /** Liste renkleri (görev listelerinin noktası). */
  readonly list: Readonly<Record<ListColor, string>>
}

export const LIGHT: Palette = {
  background: '#f4f6f9',
  surface: '#ffffff',
  surfaceAlt: '#e9edf3',
  ink: '#151a22',
  muted: '#4b5565',
  line: '#dde2e9',
  lineStrong: '#7d8797',
  accent: '#1d5bd0',
  onAccent: '#ffffff',
  accentSoft: '#e1eafb',
  accentInk: '#174ba9',
  danger: '#b3261e',
  dangerSoft: '#fdeceb',
  success: '#146c43',
  successSoft: '#e3f4ea',
  warn: '#855400',
  warnSoft: '#fff3d6',
  toast: '#1f2530',
  onToast: '#f3f5f8',
  toastAction: '#a9c4ff',
  list: { blue: '#2563eb', green: '#16a34a', amber: '#d97706', red: '#dc2626', violet: '#7c3aed', gray: '#6b7280' },
}

export const DARK: Palette = {
  background: '#0e1116',
  surface: '#171b22',
  surfaceAlt: '#212731',
  ink: '#e8ecf1',
  muted: '#a9b2bf',
  line: '#2b323c',
  lineStrong: '#6b7686',
  accent: '#8ab0ff',
  onAccent: '#0b1220',
  accentSoft: '#1c2b47',
  accentInk: '#a9c4ff',
  danger: '#ff8d85',
  dangerSoft: '#3b1d1b',
  success: '#6fd3a2',
  successSoft: '#15301f',
  warn: '#f2c46a',
  warnSoft: '#33290f',
  toast: '#e8ecf1',
  onToast: '#151a22',
  toastAction: '#174ba9',
  list: { blue: '#60a5fa', green: '#4ade80', amber: '#fbbf24', red: '#f87171', violet: '#a78bfa', gray: '#9ca3af' },
}
