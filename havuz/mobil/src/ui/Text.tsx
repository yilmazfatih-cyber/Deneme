/**
 * Metin bileşenleri: tema renkleri ve yazı boyutlarıyla. Telefonun yazı boyutu ayarına UYAR (allowFontScaling açık);
 * bu yüzden kapsayıcılara sabit yükseklik vermeyin (minHeight kullanın).
 *
 *   <AppText>Gövde</AppText>   <AppText tone="muted" size="small">Açıklama</AppText>   <Heading>Başlık</Heading>
 *
 * Genişletme: yeni bir metin biçimi → `size`/`tone` seçeneği ekleyin; yeni bileşen yazmayın.
 */
import type { ReactNode } from 'react'
import { Text, type TextProps } from 'react-native'
import { FONT, useTheme } from './theme.tsx'

export type TextTone = 'ink' | 'muted' | 'accent' | 'danger' | 'success' | 'warn' | 'onAccent'

export interface AppTextProps extends TextProps {
  readonly size?: keyof typeof FONT
  readonly tone?: TextTone
  readonly weight?: 'regular' | 'medium' | 'bold'
  readonly children?: ReactNode
}

const WEIGHTS = { regular: '400', medium: '600', bold: '700' } as const

export function AppText({ size = 'body', tone = 'ink', weight = 'regular', style, ...rest }: AppTextProps) {
  const { colors } = useTheme()
  const color = {
    ink: colors.ink,
    muted: colors.muted,
    accent: colors.accentInk,
    danger: colors.danger,
    success: colors.success,
    warn: colors.warn,
    onAccent: colors.onAccent,
  }[tone]
  return <Text {...rest} style={[{ color, fontSize: FONT[size], fontWeight: WEIGHTS[weight] }, style]} />
}

/** Ekran ya da bölüm başlığı: ekran okuyucu bunu "başlık" olarak duyurur. */
export function Heading({ level = 1, ...rest }: AppTextProps & { level?: 1 | 2 }) {
  return <AppText accessibilityRole="header" size={level === 1 ? 'display' : 'large'} weight="bold" {...rest} />
}
