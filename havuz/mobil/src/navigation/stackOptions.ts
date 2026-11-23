/**
 * Yığın (Stack) ekranlarının ortak görünüşü: başlık çubuğu ve içerik rengi temadan gelir.
 * Genişletme: bütün yığınlara uygulanacak yeni bir seçenek (ör. geçiş canlandırması) buraya.
 */
import { useMemo } from 'react'
import { useTheme } from '../ui/index.ts'

export function useStackOptions() {
  const { colors } = useTheme()
  return useMemo(
    () => ({
      headerStyle: { backgroundColor: colors.surface },
      headerTintColor: colors.ink,
      headerTitleStyle: { color: colors.ink },
      contentStyle: { backgroundColor: colors.background },
    }),
    [colors],
  )
}
