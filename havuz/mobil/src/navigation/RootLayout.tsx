/**
 * Kök yerleşim: sağlayıcılar (oturum → tema → gezinme teması → bildirim → onay penceresi) ve en dış yığın (Stack).
 * Rotaların kendisi dosya tabanlıdır (src/app/); başlıklar ve seçenekler burada ve alt yerleşimlerde verilir.
 *
 *   src/app/_layout.tsx          → bu dosya
 *   src/app/(app)/_layout.tsx    → AppLayout.tsx (depo kapısı + iç yığın)
 *   src/app/(app)/(tabs)/_layout → TabsLayout.tsx (Görevler · Listeler · Ayarlar)
 *
 * Genişletme: yeni bir küresel sağlayıcı → `ThemedApp` içine; yeni bir kök ekran seçeneği → `Stack.Screen`.
 */
import { DarkTheme, DefaultTheme, Stack, ThemeProvider as NavigationThemeProvider } from 'expo-router'
import * as SplashScreen from 'expo-splash-screen'
import { StatusBar } from 'expo-status-bar'
import { useEffect, useMemo } from 'react'
import { SyncNotices } from '../features/session/SyncNotices.tsx'
import { SessionProvider } from '../lib/session/SessionProvider.tsx'
import { useSession } from '../lib/session/context.ts'
import { ConfirmProvider, ThemeProvider, ToastProvider, useTheme } from '../ui/index.ts'
import { FatalScreen } from './FatalScreen.tsx'
import { useStackOptions } from './stackOptions.ts'

SplashScreen.preventAutoHideAsync().catch(() => undefined)

export function RootLayout() {
  return (
    <SessionProvider>
      <ThemedApp />
    </SessionProvider>
  )
}

function ThemedApp() {
  const { theme } = useSession()
  return (
    <ThemeProvider choice={theme}>
      <NavigationTheme>
        <ToastProvider>
          <ConfirmProvider>
            <Root />
          </ConfirmProvider>
        </ToastProvider>
      </NavigationTheme>
    </ThemeProvider>
  )
}

/** Gezinme kütüphanesinin renklerini temaya bağlar (başlık çubuğu, sekme çubuğu, arka plan). */
function NavigationTheme({ children }: { children: React.ReactNode }) {
  const { colors, scheme } = useTheme()
  const value = useMemo(() => {
    const base = scheme === 'dark' ? DarkTheme : DefaultTheme
    return {
      ...base,
      colors: {
        ...base.colors,
        primary: colors.accentInk,
        background: colors.background,
        card: colors.surface,
        text: colors.ink,
        border: colors.line,
      },
    }
  }, [colors, scheme])
  return <NavigationThemeProvider value={value}>{children}</NavigationThemeProvider>
}

function Root() {
  const session = useSession()
  const { scheme } = useTheme()
  const stackOptions = useStackOptions()
  const ready = session.state.status !== 'loading' || session.fatal !== null
  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => undefined)
  }, [ready])
  if (session.fatal) return <FatalScreen error={session.fatal} />
  return (
    <>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <SyncNotices />
      <Stack screenOptions={stackOptions}>
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="welcome" options={{ headerShown: false }} />
        <Stack.Screen name="(app)" options={{ headerShown: false }} />
      </Stack>
    </>
  )
}
