/**
 * Tema: kullanıcının seçimi (sistem / açık / koyu) + telefonun ayarı → renk belirteçleri ve ölçüler.
 *   const { colors, scheme } = useTheme()
 * Seçim cihaz ayarlarında saklanır (lib/device/deviceStore.ts → `theme`); ThemeProvider'a `choice` olarak gelir.
 *
 * Genişletme: yeni bir ölçü (boşluk, yarıçap) → SPACE / RADIUS; yeni renk → palette.ts.
 */
import { createContext, use, useMemo, type ReactNode } from 'react'
import { useColorScheme } from 'react-native'
import { DARK, LIGHT, type Palette } from './palette.ts'

export const THEME_CHOICES = ['system', 'light', 'dark'] as const
export type ThemeChoice = (typeof THEME_CHOICES)[number]

/** Boşluklar (dp). */
export const SPACE = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const
export const RADIUS = { sm: 8, md: 12, lg: 16, pill: 999 } as const
/** En küçük dokunma hedefi (dp). Android 48dp, iOS 44pt önerir; büyüğü seçildi. */
export const TOUCH = 48
/** Yazı boyutları (dp). Telefonun yazı boyutu ayarıyla büyür (allowFontScaling açık). */
export const FONT = { small: 14, body: 16, large: 18, title: 22, display: 28 } as const

export interface Theme {
  readonly scheme: 'light' | 'dark'
  readonly colors: Palette
}

const ThemeContext = createContext<Theme>({ scheme: 'light', colors: LIGHT })

export function resolveScheme(choice: ThemeChoice, system: string | null | undefined): 'light' | 'dark' {
  if (choice === 'light' || choice === 'dark') return choice
  return system === 'dark' ? 'dark' : 'light'
}

export function ThemeProvider({ choice, children }: { choice: ThemeChoice; children: ReactNode }) {
  const system = useColorScheme()
  const scheme = resolveScheme(choice, system)
  const value = useMemo((): Theme => ({ scheme, colors: scheme === 'dark' ? DARK : LIGHT }), [scheme])
  return <ThemeContext value={value}>{children}</ThemeContext>
}

export function useTheme(): Theme {
  return use(ThemeContext)
}
