/**
 * Ekran iskeleti: her ekran bununla sarılır. Başlığı gezinme çubuğuna yazar (web'de sekme başlığı da olur), içeriği
 * erişilebilir bir "ana bölge" yapar, klavye açılınca içeriği yukarı iter, çentik/alt çubuk boşluklarını bırakır.
 *
 *   <Screen title={t('tasks.title')}>…</Screen>                    gezinme çubuğu olan ekran
 *   <Screen title={t('welcome.title')} heading edges={['top', 'bottom']}>…</Screen>   çubuksuz ekran (başlık görünür)
 *
 * KURAL (test/rules/screens.test.ts): her `…Screen.tsx` bu bileşeni `title={t('…')}` ile kullanır.
 * Genişletme: ekranlara ortak yeni bir davranış (ör. aşağı çekip yenile) gerekiyorsa buraya seçenek ekleyin.
 */
import { useNavigation } from 'expo-router'
import { useEffect, type ReactNode } from 'react'
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Heading } from './Text.tsx'
import { SPACE, useTheme } from './theme.tsx'

export interface ScreenProps {
  /** Ekranın adı: gezinme çubuğunda, ekran okuyucuda ve web sekmesinde görünür. */
  readonly title: string
  readonly children: ReactNode
  /** Başlık ekranın içinde de büyük yazılsın mı (gezinme çubuğu olmayan ekranlar için). */
  readonly heading?: boolean
  /** İçerik kaydırılsın mı (uzun liste FlatList kullanıyorsa `false`). */
  readonly scroll?: boolean
  /** Güvenli alan boşluğu bırakılacak kenarlar (gezinme çubuğu/sekme çubuğu yoksa). */
  readonly edges?: readonly ('top' | 'bottom')[]
  /** Kaydırılmayan alt bölüm (ör. kaydet düğmesi). */
  readonly footer?: ReactNode
}

export function Screen({ title, children, heading = false, scroll = true, edges = [], footer }: ScreenProps) {
  const navigation = useNavigation()
  const insets = useSafeAreaInsets()
  const { colors } = useTheme()

  useEffect(() => {
    navigation.setOptions({ title })
  }, [navigation, title])

  const padding = {
    paddingTop: edges.includes('top') ? insets.top : 0,
    paddingBottom: edges.includes('bottom') ? insets.bottom : 0,
  }
  const body = (
    <>
      {heading ? <Heading>{title}</Heading> : null}
      {children}
    </>
  )
  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={[styles.fill, { backgroundColor: colors.background }]}
    >
      <View role="main" aria-label={title} style={[styles.fill, padding]}>
        {scroll ? (
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
            {body}
          </ScrollView>
        ) : (
          <View style={[styles.fill, styles.content]}>{body}</View>
        )}
        {footer ? <View style={[styles.footer, { borderTopColor: colors.line }]}>{footer}</View> : null}
      </View>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { padding: SPACE.lg, gap: SPACE.lg, maxWidth: 720, width: '100%', alignSelf: 'center' },
  footer: { padding: SPACE.lg, borderTopWidth: StyleSheet.hairlineWidth, gap: SPACE.sm },
})
