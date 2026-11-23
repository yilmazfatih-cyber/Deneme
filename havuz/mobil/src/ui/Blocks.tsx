/**
 * Küçük yapı taşları: kart (`Card`), boş durum (`EmptyState`), bilgi kutusu (`Banner`), yükleniyor (`Loading`).
 *
 *   <EmptyState icon="checkbox-outline" title={t('tasks.empty.title')} message={t('tasks.empty.message')} />
 *   <Banner tone="warn" message={t('workspace.viewerNotice')} />
 *
 * Genişletme: yeni bir yapı taşı → bu dosyaya küçük bir bileşen ekleyin ve ui/index.ts'ten dışa aktarın.
 */
import type { ReactNode } from 'react'
import { ActivityIndicator, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native'
import { Icon, type IconName } from './Icon.tsx'
import { AppText } from './Text.tsx'
import { RADIUS, SPACE, useTheme } from './theme.tsx'

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const { colors } = useTheme()
  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.line }, style]}>{children}</View>
  )
}

export function EmptyState({
  icon,
  title,
  message,
  action,
}: {
  icon: IconName
  title: string
  message: string
  action?: ReactNode
}) {
  const { colors } = useTheme()
  return (
    <View style={styles.empty}>
      <Icon name={icon} size={40} color={colors.muted} />
      <AppText size="large" weight="bold" style={styles.center}>
        {title}
      </AppText>
      <AppText tone="muted" style={styles.center}>
        {message}
      </AppText>
      {action}
    </View>
  )
}

export type BannerTone = 'info' | 'warn' | 'danger' | 'success'

export function Banner({ tone = 'info', message, action }: { tone?: BannerTone; message: string; action?: ReactNode }) {
  const { colors } = useTheme()
  const look = {
    info: { bg: colors.accentSoft, fg: 'accent', icon: 'information-circle-outline' },
    warn: { bg: colors.warnSoft, fg: 'warn', icon: 'alert-circle-outline' },
    danger: { bg: colors.dangerSoft, fg: 'danger', icon: 'alert-circle-outline' },
    success: { bg: colors.successSoft, fg: 'success', icon: 'checkmark-circle' },
  } as const
  const style = look[tone]
  const color = { accent: colors.accentInk, warn: colors.warn, danger: colors.danger, success: colors.success }[
    style.fg
  ]
  return (
    <View style={[styles.banner, { backgroundColor: style.bg }]} accessibilityLiveRegion="polite">
      <View style={styles.bannerRow}>
        <Icon name={style.icon} color={color} />
        <AppText tone={style.fg} weight="medium" style={styles.grow}>
          {message}
        </AppText>
      </View>
      {action}
    </View>
  )
}

export function Loading({ label }: { label: string }) {
  const { colors } = useTheme()
  return (
    <View style={styles.loading} accessibilityRole="progressbar" accessibilityLabel={label} {...{ 'aria-busy': true }}>
      <ActivityIndicator color={colors.accent} size="large" />
      <AppText tone="muted">{label}</AppText>
    </View>
  )
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: RADIUS.lg, padding: SPACE.lg, gap: SPACE.md },
  empty: { alignItems: 'center', gap: SPACE.sm, paddingVertical: SPACE.xxl, paddingHorizontal: SPACE.lg },
  center: { textAlign: 'center' },
  banner: { borderRadius: RADIUS.md, padding: SPACE.md, gap: SPACE.sm },
  bannerRow: { flexDirection: 'row', gap: SPACE.sm, alignItems: 'flex-start' },
  grow: { flex: 1 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: SPACE.md, padding: SPACE.xl },
})
